/**
 * Onboard a new organization end to end: `npm run org:create`.
 *
 *   Clerk org + slug → owner access → tenant database → provision (schema)
 *   → seed reference data → IQPro credentials → activate → verify
 *
 * Every step already existed as its own script or a manual click; this file
 * exists because the manual path has a dozen ways to go quietly wrong (see the
 * checks in `onboarding/preflight.ts`). Each step is idempotent and detected on
 * re-run, so after a failure the same command resumes where it stopped.
 *
 * Configuration comes from `.env.onboard.<target>` (git-ignored), then the
 * shell (which wins), then a no-echo prompt for anything still missing. It is
 * NEVER read from `.env.local`: that file configures `npm run dev`, and a
 * remote CONTROL_DATABASE_URL there would point the local app at a real
 * control plane. The only exception is NEON_API_KEY / NEON_ORG_ID, which are
 * account-level and already live there.
 *
 * Usage:
 *   npm run org:create [-- --target=production|preview] [--slug=<slug>]
 *                      [--connection-string=<pooled>] [--dry-run]
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Pool } from 'pg';
import { parseKeyHex } from '../libs/CryptoCore';
import { argValue, hostOf, loadEnvFile } from '../libs/EnvFiles';
import { decryptConnectionString, SHARED_DATABASE_SENTINEL } from '../libs/TenantCrypto';
import { ORG_ROLE } from '../types/Auth';
import { createClerkAdmin } from './onboarding/clerkAdmin';
import { buildStoreMetadata, createDatabaseProvisioner } from './onboarding/databaseProvisioner';
import { buildIqproConfigBlob, buildSquareConfigBlob, verifyIqproCredentials, verifySquareCredentials } from './onboarding/paymentConfig';
import {
  checkClerkKeyForTarget,
  checkControlPlaneMatchesClerk,
  checkEncryptionKeyAgainstTenants,
  checkIqproEnvironment,
  checkSquareCredentials,
  checkSquareEnvironment,
  checkTenantConnectionString,
  shellOverrides,
  slugify,
  validateEmail,
  validateSlug,
} from './onboarding/preflight';
import { createPrompter } from './onboarding/prompt';
import { buildChildEnv, runScript } from './onboarding/runScript';
import { countOrgRows, ensureControlTrial, hasPaymentConfig, planSteps, readAllTenantRows, readConfiguredProvider, readTenantRow, writePaymentConfig } from './onboarding/steps';
import { APP_URL, iqproWebhookReminder, squareWebhookReminder } from './onboarding/webhookReminders';

const prompt = createPrompter();
const REQUIRED_ROLES = [ORG_ROLE.ACADEMY_OWNER, ORG_ROLE.ADMIN];
const KIOSK_URL = 'https://kiosk.dojoplanner.com';

/**
 * Metadata for the Vercel → Neon store. `region` is required with no default;
 * iad1 (US East) matches the existing tenant projects and the app's functions.
 * `auth` defaults to TRUE in the product schema, which enables Neon Auth — its
 * own user tables, synced into the database. This app authenticates with Clerk,
 * so tenant databases must not get it.
 */
const NEON_STORE_METADATA = {
  region: process.env.ONBOARD_NEON_REGION || 'iad1',
  auth: false,
};

/** Read ONE account-level key from `.env.local` — never environment-specific config. */
function accountLevelValue(name: string): string | undefined {
  if (process.env[name]) {
    return process.env[name];
  }
  const file = path.join(process.cwd(), '.env.local');
  if (!existsSync(file)) {
    return undefined;
  }
  const line = readFileSync(file, 'utf8').split('\n').find(l => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') || undefined;
}

function vercelTeamIdFromProject(): string | undefined {
  try {
    return (JSON.parse(readFileSync(path.join(process.cwd(), '.vercel', 'project.json'), 'utf8')) as { orgId?: string }).orgId;
  } catch {
    return undefined;
  }
}

async function secret(name: string, label: string): Promise<string> {
  return process.env[name] || await prompt.askSecret(`${label} (${name})`);
}

function fail(message: string): never {
  throw new Error(message);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.info(`\n🥋 Onboard a new organization${dryRun ? ' (dry run — nothing is written)' : ''}\n`);

  // ── Target + secrets ────────────────────────────────────────────────────
  const target = (argValue('target') as 'production' | 'preview' | undefined)
    ?? await prompt.choose('Target environment', ['production', 'preview'] as const, 'production');

  // One file per target, so a preview run can never read a production value.
  const envFile = `.env.onboard.${target}`;
  const fromShell = shellOverrides(process.env);
  if (loadEnvFile(path.join(process.cwd(), envFile))) {
    console.info(`✓ Loaded ${envFile}`);
  } else {
    console.info(`(no ${envFile} — anything not exported in the shell will be prompted for)`);
  }
  // A value left exported from an earlier session silently beats the file —
  // that is how a preview run once wrote to the PRODUCTION control plane.
  if (fromShell.length > 0) {
    console.info(`⚠️  From your SHELL, overriding ${envFile}: ${fromShell.join(', ')}`);
    if (!await prompt.confirm(`   Use these shell values for a ${target} run?`, false)) {
      fail(`Stopped. Run \`unset ${fromShell.join(' ')}\` to use ${envFile}, then re-run.`);
    }
  }

  const clerkKey = await secret('CLERK_SECRET_KEY', `Clerk ${target === 'production' ? 'PRODUCTION (sk_live_)' : 'DEVELOPMENT (sk_test_)'} secret key`);
  const clerkProblem = checkClerkKeyForTarget(clerkKey, target);
  if (clerkProblem) {
    fail(clerkProblem);
  }

  const controlUrl = await secret('CONTROL_DATABASE_URL', `Control database pooled URL for ${target}`);
  const tenantKeyHex = process.env.CONTROL_PLANE_ENCRYPTION_KEY
    || await secret('IQPRO_CONFIG_ENCRYPTION_KEY', `Encryption key for ${target} (Vercel → ${target})`);
  const tenantKey = parseKeyHex(tenantKeyHex, 'encryption key');
  // Payment blobs use IQPRO_CONFIG_ENCRYPTION_KEY; tenant rows prefer
  // CONTROL_PLANE_ENCRYPTION_KEY. In a deployment without the latter they are
  // the same key.
  const paymentKey = parseKeyHex(process.env.IQPRO_CONFIG_ENCRYPTION_KEY || tenantKeyHex, 'IQPRO_CONFIG_ENCRYPTION_KEY');

  const control = new Pool({ connectionString: controlUrl, max: 1 });
  let tenant: Pool | undefined;

  try {
    // ── Preflight: control plane + key ───────────────────────────────────
    const existingRows = await readAllTenantRows(control).catch((err: Error) =>
      fail(`Cannot read the control database's tenant table at ${hostOf(controlUrl)}: ${err.message}`));
    const keyProblem = checkEncryptionKeyAgainstTenants(existingRows, tenantKey, SHARED_DATABASE_SENTINEL);
    if (keyProblem) {
      fail(keyProblem);
    }
    console.info(`✓ Control plane ${hostOf(controlUrl)} — ${existingRows.length} tenant(s), key verified`);

    const clerk = createClerkAdmin(clerkKey);
    const roles = await clerk.listRoleKeys();
    const missingRoles = REQUIRED_ROLES.filter(r => !roles.includes(r));
    if (missingRoles.length > 0) {
      fail(`The Clerk ${target} instance is missing role(s) ${missingRoles.join(', ')}. Create them in the Clerk dashboard first.`);
    }
    console.info('✓ Clerk instance has the required roles');

    const sampled = existingRows.map(r => r.orgId).filter(id => id.startsWith('org_')).slice(0, 5);
    const found = (await Promise.all(sampled.map(async id => (await clerk.getOrganization(id)) ? id : null)))
      .filter((id): id is string => id !== null);
    const pairingProblem = checkControlPlaneMatchesClerk(sampled, found, target);
    if (pairingProblem) {
      fail(pairingProblem);
    }
    if (sampled.length > 0) {
      console.info(`✓ Control plane and Clerk ${target} instance belong together (${found.length}/${sampled.length} orgs found)`);
    }

    // ── The organization ─────────────────────────────────────────────────
    const name = await prompt.askValid('Dojo name', v => (v ? null : 'Required.'));
    const slug = argValue('slug') ?? await prompt.askValid('Slug (kiosk URL ?org=…)', validateSlug, slugify(name));
    const slugProblem = validateSlug(slug);
    if (slugProblem) {
      fail(slugProblem);
    }

    let clerkOrg = await clerk.getOrganization(slug);
    if (clerkOrg && !await prompt.confirm(`Clerk org "${clerkOrg.name}" (${clerkOrg.id}) already uses slug "${slug}". Resume onboarding it?`, true)) {
      fail('Choose a different slug.');
    }

    const ownerEmail = await prompt.askValid('Academy owner email', validateEmail);
    const operatorUsername = clerkOrg ? '' : await prompt.ask('Your Clerk username (creates the org)', process.env.ONBOARD_OPERATOR_USERNAME);
    const operator = clerkOrg ? null : await clerk.findUserByUsername(operatorUsername);
    if (!clerkOrg && !operator) {
      fail(`No Clerk user "${operatorUsername}" in the ${target} instance.`);
    }

    // ── Payment ──────────────────────────────────────────────────────────
    let payment: { provider: 'iqpro' | 'square'; blob: string } | null = null;
    const providerChoice = await prompt.choose('Payment provider', ['iqpro', 'square', 'skip'] as const, 'iqpro');

    if (providerChoice === 'iqpro') {
      const credentials = {
        clientId: await prompt.askValid('IQPro Client ID', v => (v ? null : 'Required.')),
        clientSecret: await prompt.askSecret('IQPro Client Secret'),
        gatewayId: await prompt.askValid('IQPro Gateway ID', v => (v ? null : 'Required.')),
      };
      if (!credentials.clientSecret) {
        fail('The Client Secret is required — saving without one leaves the org unable to charge.');
      }
      const platform = {
        scope: process.env.IQPRO_SCOPE || await prompt.ask(`IQPRO_SCOPE for ${target}`),
        oauthUrl: process.env.IQPRO_OAUTH_URL || await prompt.ask(`IQPRO_OAUTH_URL for ${target}`),
        baseUrl: process.env.IQPRO_BASE_URL || await prompt.ask(`IQPRO_BASE_URL for ${target}`),
      };
      const envWarning = checkIqproEnvironment(platform.baseUrl, platform.oauthUrl, target);
      if (envWarning && !await prompt.confirm(`⚠️  ${envWarning} Continue anyway?`)) {
        fail('Stopped on the IQPro environment warning.');
      }
      const verified = await verifyIqproCredentials(credentials, platform);
      if (!verified.ok) {
        fail(verified.reason);
      }
      console.info('✓ IQPro credentials verified (OAuth + gateway)');
      payment = { provider: 'iqpro', blob: buildIqproConfigBlob(credentials, paymentKey) };
    }

    if (providerChoice === 'square') {
      const environment = await prompt.choose(
        'Square environment',
        ['sandbox', 'production'] as const,
        target === 'production' ? 'production' : 'sandbox',
      );
      const credentials = {
        applicationId: await prompt.askValid('Square Application ID', v => (v ? null : 'Required.')),
        locationId: await prompt.askValid('Square Location ID', v => (v ? null : 'Required.')),
        accessToken: await prompt.askSecret('Square Access Token'),
        webhookSignatureKey: await prompt.askSecret('Square Webhook Signature Key'),
        environment,
      };
      const problems = checkSquareCredentials(credentials);
      if (problems.length > 0) {
        fail(problems.join('\n'));
      }
      const envWarning = checkSquareEnvironment(environment, target);
      if (envWarning && !await prompt.confirm(`⚠️  ${envWarning} Continue anyway?`)) {
        fail('Stopped on the Square environment warning.');
      }
      const verified = await verifySquareCredentials(credentials);
      if (!verified.ok) {
        fail(verified.reason);
      }
      console.info(`✓ Square credentials verified (location "${verified.locationName}", ${environment})`);
      payment = { provider: 'square', blob: buildSquareConfigBlob(credentials, paymentKey) };
    }

    // ── Database source ──────────────────────────────────────────────────
    const tenantRow = clerkOrg ? await readTenantRow(control, clerkOrg.id) : null;
    const suppliedUrl = argValue('connection-string');
    if (suppliedUrl) {
      // Checked in PREFLIGHT, not after the Clerk org exists: a bad string
      // must stop the run before anything is created (and be caught by --dry-run).
      const suppliedProblems = checkTenantConnectionString(suppliedUrl, controlUrl);
      if (suppliedProblems.length > 0) {
        fail(suppliedProblems.join('\n'));
      }
    }
    const provisioner = tenantRow || suppliedUrl
      ? null
      : createDatabaseProvisioner({
          vercelToken: await secret('VERCEL_TOKEN', 'Vercel token'),
          vercelTeamId: process.env.VERCEL_TEAM_ID || vercelTeamIdFromProject() || fail('Set VERCEL_TEAM_ID.'),
          neonApiKey: accountLevelValue('NEON_API_KEY') || fail('Set NEON_API_KEY.'),
          neonOrgId: accountLevelValue('NEON_ORG_ID'),
          metadataOverrides: NEON_STORE_METADATA,
        });
    const existingProject = provisioner ? await provisioner.findNeonProject(slug) : null;
    if (provisioner && !existingProject) {
      // Prove the token can create stores, and that we supply every field the
      // product requires, BEFORE anything else is written.
      const { product } = await provisioner.resolveNeonProduct();
      const { missing } = buildStoreMetadata(product, NEON_STORE_METADATA);
      if (missing.length > 0) {
        fail(`The Vercel Neon product requires ${missing.join(', ')}, which org:create does not set. Update NEON_STORE_METADATA in onboardOrg.ts.`);
      }
      console.info(`✓ Vercel Neon integration reachable (region ${NEON_STORE_METADATA.region})`);
    }

    // ── Plan ─────────────────────────────────────────────────────────────
    let tenantUrl = tenantRow
      ? decryptConnectionString(tenantRow.connectionStringEncrypted, tenantKey)
      : suppliedUrl ?? (existingProject && provisioner ? await provisioner.getPooledConnectionString(existingProject.id) : undefined);
    if (tenantUrl) {
      tenant = new Pool({ connectionString: tenantUrl, max: 1 });
    }

    const state = {
      clerkOrgExists: Boolean(clerkOrg),
      ownerAccessGranted: clerkOrg ? await clerk.hasOwnerAccess(clerkOrg.id, ownerEmail, ORG_ROLE.ACADEMY_OWNER) : false,
      databaseExists: Boolean(tenantUrl),
      tenantStatus: tenantRow?.status ?? null,
      orgRowCount: tenant && clerkOrg && tenantRow ? await countOrgRows(tenant, clerkOrg.id) : 0,
      paymentSaved: tenant && clerkOrg && tenantRow ? await hasPaymentConfig(tenant, clerkOrg.id) : false,
      paymentRequested: Boolean(payment),
    };

    console.info(`\nPlan for "${name}" (${slug}) → ${target}`);
    for (const step of planSteps(state)) {
      console.info(`  ${step.done ? '✓' : '•'} ${step.label}${step.done ? ' (already done)' : ''}`);
    }
    if (dryRun) {
      console.info('\nDry run complete — preflight passed, nothing written.');
      return;
    }
    if (!await prompt.confirm('\nProceed?', true)) {
      return;
    }

    // ── 1. Clerk org ─────────────────────────────────────────────────────
    if (!clerkOrg) {
      clerkOrg = await clerk.createOrganization(name, slug, operator!.id);
      console.info(`✓ Created Clerk org ${clerkOrg.id}`);
    }
    const orgId = clerkOrg.id;

    // ── 2. Owner ─────────────────────────────────────────────────────────
    const owner = await clerk.ensureOwnerAccess(orgId, ownerEmail, ORG_ROLE.ACADEMY_OWNER);
    console.info(owner.kind === 'member'
      ? `✓ ${ownerEmail} is the academy owner (${owner.userId})`
      : `✓ Invitation ${owner.alreadyDone ? 'already pending' : 'sent'} to ${ownerEmail}`);

    // ── 3. Database ──────────────────────────────────────────────────────
    if (!tenantUrl) {
      const { projectId, created } = await provisioner!.createDatabase(slug, orgId);
      console.info(`✓ ${created ? 'Created' : 'Reusing'} Neon project ${projectId}`);
      tenantUrl = await provisioner!.getPooledConnectionString(projectId);
      tenant = new Pool({ connectionString: tenantUrl, max: 1 });
    }
    const urlProblems = checkTenantConnectionString(tenantUrl, controlUrl);
    if (urlProblems.length > 0) {
      fail(urlProblems.join('\n'));
    }

    const childEnv = buildChildEnv({
      CONTROL_DATABASE_URL: controlUrl,
      CONTROL_PLANE_ENCRYPTION_KEY: tenantKeyHex,
      CLERK_SECRET_KEY: clerkKey,
    });

    // ── 4. Provision ─────────────────────────────────────────────────────
    if (!await readTenantRow(control, orgId)) {
      runScript('Provision', 'src/scripts/provisionTenant.ts', [`--orgId=${orgId}`, `--connection-string=${tenantUrl}`], childEnv);
    }

    // ── 5. Seed ──────────────────────────────────────────────────────────
    if (await countOrgRows(tenant!, orgId) === 0) {
      const ownerArg = owner.kind === 'member' ? [`--ownerClerkId=${owner.userId}`] : [];
      runScript(
        'Seed reference data',
        'src/scripts/seed.ts',
        [`--orgId=${orgId}`, '--referenceDataOnly', ...ownerArg],
        // seed.ts reads env at import and never loads .env files; no Clerk or
        // IQPro creds, so its SaaS trial stays synthetic.
        buildChildEnv({ DATABASE_URL: tenantUrl, CONTROL_DATABASE_URL: controlUrl, CONTROL_PLANE_ENCRYPTION_KEY: tenantKeyHex }),
      );
    }

    // Always, not only when seed ran: a resumed run that skipped seeding must
    // still leave the org with its control-plane billing row.
    const trial = await ensureControlTrial(control, orgId, owner.kind === 'member' ? owner.userId : undefined);
    console.info(trial.written
      ? '✓ 30-day trial written to the control plane'
      : `✓ Control-plane subscription already present (${trial.status})`);

    // ── 6. Payment ───────────────────────────────────────────────────────
    if (payment) {
      await writePaymentConfig(tenant!, orgId, payment.provider, payment.blob);
      console.info(`✓ ${payment.provider === 'square' ? 'Square' : 'IQPro'} credentials saved`);
    }

    // ── 7. Activate ──────────────────────────────────────────────────────
    if ((await readTenantRow(control, orgId))?.status !== 'active') {
      runScript('Activate', 'src/scripts/cutoverTenant.ts', [`--orgId=${orgId}`, `--target=${tenantUrl}`, '--activate-only'], childEnv);
    }

    // ── 8. Verify ────────────────────────────────────────────────────────
    runScript('Tenant directory', 'src/scripts/showTenants.ts', [], childEnv);
    // checkTenantReadiness treats DATABASE_URL as the legacy SHARED database
    // and flags any tenant pointing at it. With every org on its own database
    // there is no shared one, so give it the control plane — passing the new
    // tenant's URL would report the org we just activated as misrouted.
    runScript('Readiness', 'src/scripts/checkTenantReadiness.ts', [], { ...childEnv, DATABASE_URL: controlUrl });

    // Report what the database HOLDS, not what this run did — a resumed run
    // that answered "no" to payment must not claim the org has none.
    const paymentProvider = await readConfiguredProvider(tenant!, orgId);
    const paymentConfigured = paymentProvider !== null;
    let kioskStatus = target === 'production' ? 'skipped (no payment credentials)' : 'skipped (preview run)';
    if (target === 'production' && paymentConfigured) {
      const res = await fetch(`${KIOSK_URL}/api/payment/tokenization-config?org=${encodeURIComponent(slug)}`).catch(() => null);
      kioskStatus = res?.ok ? '200 ✓' : `${res?.status ?? 'unreachable'} ✗ — check the kiosk's IQPRO_* variables`;
    }

    // Never offered when the operator IS the owner — removing "yourself" would
    // remove the academy owner the org was just given.
    const operatorIsOwner = owner.kind === 'member' && owner.userId === operator?.id;
    if (operator && !operatorIsOwner && await prompt.confirm(`Remove yourself (${operatorUsername}) from the new org?`, false)) {
      await clerk.removeMembership(orgId, operator.id);
    }

    console.info(`\n✅ ${name} is live.
   Org id:     ${orgId}
   Dashboard:  ${target === 'production' ? APP_URL : 'your Preview URL'}/dashboard
   Kiosk:      ${target === 'production' ? `${KIOSK_URL}/?org=${slug}` : `<Preview kiosk URL>/?org=${slug}`}
   Owner:      ${owner.kind === 'member' ? 'added' : 'invited — they get access when they accept'}
   Billing:    ${trial.written ? '30-day trial started; the owner subscribes from the dashboard' : `existing subscription status: ${trial.status}`}
   Payments:   ${paymentProvider === 'square' ? 'Square configured' : paymentProvider ? 'IQPro configured' : 'not configured — set on Location Settings'}; kiosk probe ${kioskStatus}${paymentProvider === 'square' ? squareWebhookReminder(target) : paymentProvider ? iqproWebhookReminder(target) : ''}
   Internal org that should never be billed? Add ${orgId} to EXEMPT_ORG_IDS in src/utils/SuperAdmins.ts.`);
  } finally {
    await control.end();
    await tenant?.end();
  }
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  console.error('Nothing after the failed step ran. Fix the problem and re-run the same command — completed steps are skipped.');
  process.exit(1);
});
