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
 *
 * Unattended (see onboarding/unattended.ts):
 *   npm run org:create -- --target=production --fromRequest=<sign-up id> --ci [--attempt=2]
 *     --fromRequest  takes name, slug and owner from `org_signup_request`, forces
 *                    provider=skip, reports progress to that row, and invites the
 *                    owner only AFTER activation (so no one is invited into an org
 *                    that then fails to provision)
 *     --ci           implies --nonInteractive and --envFromShell, masks every
 *                    customer value in the (PUBLIC) Actions log, captures child
 *                    output, and records failure detail on the request row only
 *   Also: --name, --ownerEmail, --ownerName, --provider=iqpro|square|skip, --operator
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
import { buildChildEnv, runScript, ScriptFailedError } from './onboarding/runScript';
import {
  markSignupProvisioned,
  markSignupProvisioning,
  readSignupRequest,
  recordSignupClerkOrg,
  recordSignupFailure,
  reportSignupStep,
} from './onboarding/signupRequests';
import { countOrgRows, ensureControlTrial, hasPaymentConfig, isReferenceSeedComplete, needsProvision, planSteps, readAllTenantRows, readConfiguredProvider, readTenantRow, writePaymentConfig } from './onboarding/steps';
import { createFailingPrompter, githubRunUrl, maskForCi, parseOnboardFlags, splitOwnerName } from './onboarding/unattended';

const flags = parseOnboardFlags();
const unattended = flags.nonInteractive;
const prompt = unattended ? createFailingPrompter() : createPrompter();
/** Child scripts print hosts and other orgs' ids; in --ci their output is kept out of the public log. */
const capture = { capture: flags.ci };
const REQUIRED_ROLES = [ORG_ROLE.ACADEMY_OWNER, ORG_ROLE.ADMIN];
const KIOSK_URL = 'https://kiosk.dojoplanner.com';

/**
 * Metadata for the Vercel → Neon store. `region` is required with no default;
 * iad1 (US East) matches the existing tenant projects and the app's functions.
 * `auth` defaults to TRUE in the product schema, which enables Neon Auth — its
 * own user tables, synced into the database. This app authenticates with Clerk,
 * so tenant databases must not get it.
 */
function neonStoreMetadata() {
  // Read when called, not at import: `.env.onboard.<target>` is loaded after
  // this module is, so a region set there was silently ignored.
  return {
    region: process.env.ONBOARD_NEON_REGION || 'iad1',
    auth: false,
  };
}
const APP_URL = 'https://app.dojoplanner.com';

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

/**
 * Square only sends status changes (paid invoices, failed charges, cancelled
 * subscriptions, captured payments) if a webhook subscription exists — and its
 * URL is an HMAC input, so it must match exactly.
 */
function squareWebhookReminder(target: 'production' | 'preview'): string {
  const url = target === 'production' ? `${APP_URL}/webhook/square` : '<Preview URL>/webhook/square';
  return `
   ⚠️  Square webhooks — Square Developer Dashboard → Webhooks → Add subscription:
       URL:     ${url}   (exactly; it is part of the signature)
       Events:  invoice.payment_made, invoice.scheduled_charge_failed, subscription.updated, payment.updated
       Its signature key must be the Webhook Signature Key entered above.`;
}

async function secret(name: string, label: string): Promise<string> {
  return process.env[name] || await prompt.askSecret(`${label} (${name})`);
}

function fail(message: string): never {
  throw new Error(message);
}

/** Set once a sign-up request is claimed, so a failure can be recorded on it. */
let failureSink: ((error: unknown) => Promise<void>) | null = null;
let failureRecorded = false;

async function main(): Promise<void> {
  const dryRun = flags.dryRun;
  console.info(`\n🥋 Onboard a new organization${dryRun ? ' (dry run — nothing is written)' : ''}\n`);

  // ── Target + secrets ────────────────────────────────────────────────────
  const target = flags.target
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
    if (flags.envFromShell) {
      // CI supplies everything as secrets in the shell, on purpose.
      console.info('   --envFromShell: the shell is the intended source.');
    } else if (!await prompt.confirm(`   Use these shell values for a ${target} run?`, false)) {
      fail(`Stopped. Run \`unset ${fromShell.join(' ')}\` to use ${envFile}, then re-run.`);
    }
  }

  const clerkKey = await secret('CLERK_SECRET_KEY', `Clerk ${target === 'production' ? 'PRODUCTION (sk_live_)' : 'DEVELOPMENT (sk_test_)'} secret key`);
  const clerkProblem = checkClerkKeyForTarget(clerkKey, target);
  if (clerkProblem) {
    fail(clerkProblem);
  }

  const controlUrl = await secret('CONTROL_DATABASE_URL', `Control database pooled URL for ${target}`);
  maskForCi(flags.ci, [controlUrl]);
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
    // ── Sign-up request (unattended runs from the public form) ──────────
    const request = flags.fromRequest ? await readSignupRequest(control, flags.fromRequest) : null;
    if (flags.fromRequest) {
      if (!request) {
        fail(`No sign-up request ${flags.fromRequest} in the ${target} control database.`);
      }
      // Before ANYTHING about the request can reach the log.
      maskForCi(flags.ci, [request.academyName, request.slug, request.ownerName, request.ownerEmail, request.ownerPhone, request.clerkOrgId]);
      if (flags.name || flags.slug || flags.ownerEmail || flags.ownerName) {
        fail('--fromRequest takes the name, slug and owner from the request; drop --name/--slug/--ownerEmail/--ownerName.');
      }
      if (flags.provider && flags.provider !== 'skip') {
        fail('--fromRequest never configures a payment provider; the owner connects one in the app.');
      }
      if (!request.slug) {
        fail(`Sign-up request ${request.id} has no slug — it was never confirmed.`);
      }
      if (!['dispatched', 'provisioning', 'failed'].includes(request.status)) {
        fail(`Sign-up request ${request.id} is "${request.status}", which org:create cannot start from.`);
      }
      if (!dryRun) {
        if (!await markSignupProvisioning(control, request.id, flags.attempt, githubRunUrl())) {
          fail(`Sign-up request ${request.id} changed status before it could be claimed.`);
        }
        const requestId = request.id;
        failureSink = async (error) => {
          // The detail stays in the control database: it can name hosts and
          // customers, and the Actions log is public.
          const detail = error instanceof ScriptFailedError && error.output
            ? `${error.message}\n${error.output}`
            : error instanceof Error ? error.message : String(error);
          await recordSignupFailure(control, requestId, detail, { final: flags.attempt >= 2, workflowRunUrl: githubRunUrl() });
        };
      }
      console.info(`✓ Sign-up request ${request.id} (attempt ${flags.attempt})`);
    }
    const step = async (id: string) => {
      if (request && !dryRun) {
        await reportSignupStep(control, request.id, id);
      }
    };

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
    const name = request?.academyName ?? flags.name ?? await prompt.askValid('Dojo name', v => (v ? null : 'Required.'));
    const slug = request?.slug ?? flags.slug ?? await prompt.askValid('Slug (kiosk URL ?org=…)', validateSlug, slugify(name));
    const slugProblem = validateSlug(slug);
    if (slugProblem) {
      fail(slugProblem);
    }

    let clerkOrg = await clerk.getOrganization(slug);
    if (clerkOrg) {
      if (request) {
        // Resume only an org THIS request created — never someone else's that
        // happens to hold the slug.
        if (request.clerkOrgId !== clerkOrg.id) {
          fail(`The slug for sign-up request ${request.id} is already used by a different Clerk organization.`);
        }
      } else if (unattended) {
        fail(`Clerk org ${clerkOrg.id} already uses this slug; resuming is only confirmed interactively or with --fromRequest.`);
      } else if (!await prompt.confirm(`Clerk org "${clerkOrg.name}" (${clerkOrg.id}) already uses slug "${slug}". Resume onboarding it?`, true)) {
        fail('Choose a different slug.');
      }
    }

    const ownerEmail = request?.ownerEmail ?? flags.ownerEmail ?? await prompt.askValid('Academy owner email', validateEmail);
    const ownerEmailProblem = validateEmail(ownerEmail);
    if (ownerEmailProblem) {
      fail(ownerEmailProblem);
    }
    const ownerName = request?.ownerName ?? flags.ownerName;
    const operatorUsername = clerkOrg
      ? ''
      : flags.operator
        ?? (unattended ? process.env.ONBOARD_OPERATOR_USERNAME : undefined)
        ?? await prompt.ask('Your Clerk username (creates the org)', process.env.ONBOARD_OPERATOR_USERNAME);
    if (!clerkOrg && !operatorUsername) {
      fail('Set ONBOARD_OPERATOR_USERNAME or pass --operator: a Clerk user must create the org.');
    }
    const operator = clerkOrg ? null : await clerk.findUserByUsername(operatorUsername);
    if (!clerkOrg && !operator) {
      fail(`No Clerk user "${operatorUsername}" in the ${target} instance.`);
    }

    // ── Payment ──────────────────────────────────────────────────────────
    let payment: { provider: 'iqpro' | 'square'; blob: string } | null = null;
    const providerChoice = request
      ? 'skip'
      : flags.provider ?? await prompt.choose('Payment provider', ['iqpro', 'square', 'skip'] as const, 'iqpro');

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
    const suppliedUrl = flags.connectionString ?? argValue('connection-string');
    maskForCi(flags.ci, [suppliedUrl]);
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
          metadataOverrides: neonStoreMetadata(),
        });
    const existingProject = provisioner ? await provisioner.findNeonProject(slug) : null;
    if (provisioner && !existingProject) {
      // Prove the token can create stores, and that we supply every field the
      // product requires, BEFORE anything else is written.
      const { product } = await provisioner.resolveNeonProduct();
      const { missing } = buildStoreMetadata(product, neonStoreMetadata());
      if (missing.length > 0) {
        fail(`The Vercel Neon product requires ${missing.join(', ')}, which org:create does not set. Update neonStoreMetadata() in onboardOrg.ts.`);
      }
      console.info(`✓ Vercel Neon integration reachable (region ${neonStoreMetadata().region})`);
    }

    // ── Plan ─────────────────────────────────────────────────────────────
    let tenantUrl = tenantRow
      ? decryptConnectionString(tenantRow.connectionStringEncrypted, tenantKey)
      : suppliedUrl ?? (existingProject && provisioner ? await provisioner.getPooledConnectionString(existingProject.id) : undefined);
    if (tenantUrl) {
      maskForCi(flags.ci, [tenantUrl]);
      tenant = new Pool({ connectionString: tenantUrl, max: 1 });
    }

    const tenantRowCount = tenant && clerkOrg && tenantRow ? await countOrgRows(tenant, clerkOrg.id) : 0;
    const state = {
      clerkOrgExists: Boolean(clerkOrg),
      ownerAccessGranted: clerkOrg ? await clerk.hasOwnerAccess(clerkOrg.id, ownerEmail, ORG_ROLE.ACADEMY_OWNER) : false,
      databaseExists: Boolean(tenantUrl),
      tenantStatus: tenantRow?.status ?? null,
      schemaApplied: Boolean(tenantRow?.schemaVersion),
      orgRowCount: tenantRowCount,
      seedComplete: tenant && clerkOrg && tenantRowCount > 0 ? await isReferenceSeedComplete(tenant, clerkOrg.id) : false,
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
    if (!unattended && !await prompt.confirm('\nProceed?', true)) {
      return;
    }

    // A public sign-up invites its owner only once the org is live (step 7b):
    // an invitation into an org that then fails to provision would land the
    // owner on an error page.
    const deferOwner = Boolean(request);
    const invitationMetadata = ownerName
      ? (() => {
          const { firstName, lastName } = splitOwnerName(ownerName);
          return { invitedFirstName: firstName, ...(lastName && { invitedLastName: lastName }) };
        })()
      : undefined;
    const reportOwner = (result: Awaited<ReturnType<typeof clerk.ensureOwnerAccess>>) =>
      console.info(result.kind === 'member'
        ? `✓ ${ownerEmail} is the academy owner (${result.userId})`
        : `✓ Invitation ${result.alreadyDone ? 'already pending' : 'sent'} to ${ownerEmail}`);

    // ── 1. Clerk org ─────────────────────────────────────────────────────
    await step('clerk-org');
    if (!clerkOrg) {
      clerkOrg = await clerk.createOrganization(name, slug, operator!.id);
      maskForCi(flags.ci, [clerkOrg.id]);
      if (request) {
        await recordSignupClerkOrg(control, request.id, clerkOrg.id);
      }
      console.info(`✓ Created Clerk org ${clerkOrg.id}`);
    }
    const orgId = clerkOrg.id;
    maskForCi(flags.ci, [orgId]);

    // ── 2. Owner ─────────────────────────────────────────────────────────
    let owner: Awaited<ReturnType<typeof clerk.ensureOwnerAccess>> | null = null;
    if (!deferOwner) {
      await step('owner');
      owner = await clerk.ensureOwnerAccess(orgId, ownerEmail, ORG_ROLE.ACADEMY_OWNER);
      reportOwner(owner);
    }

    // ── 3. Database ──────────────────────────────────────────────────────
    await step('database');
    if (!tenantUrl) {
      const { projectId, created } = await provisioner!.createDatabase(slug, orgId);
      maskForCi(flags.ci, [projectId]);
      console.info(`✓ ${created ? 'Created' : 'Reusing'} Neon project ${projectId}`);
      tenantUrl = await provisioner!.getPooledConnectionString(projectId);
      maskForCi(flags.ci, [tenantUrl]);
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
    // Also when the row exists without a schema version: a provision that died
    // after inserting its row would otherwise be skipped forever.
    await step('provision');
    if (needsProvision(await readTenantRow(control, orgId))) {
      // provisionTenant compares the row against DATABASE_URL (the legacy
      // shared database). There is none any more; pass the control plane
      // explicitly, as for the readiness check below, rather than let the
      // child fill it from whatever `.env` the checkout holds.
      runScript('Provision', 'src/scripts/provisionTenant.ts', [`--orgId=${orgId}`, `--connection-string=${tenantUrl}`], { ...childEnv, DATABASE_URL: controlUrl }, undefined, capture);
    }

    // ── 5. Seed ──────────────────────────────────────────────────────────
    await step('seed');
    const seedEnv = buildChildEnv({ DATABASE_URL: tenantUrl, CONTROL_DATABASE_URL: controlUrl, CONTROL_PLANE_ENCRYPTION_KEY: tenantKeyHex });
    const seededRows = await countOrgRows(tenant!, orgId);
    const seedComplete = seededRows > 0 && await isReferenceSeedComplete(tenant!, orgId);
    if (seededRows > 0 && !seedComplete) {
      // The seed is not transactional and uses random ids, so a run that
      // stopped part-way can be neither skipped nor re-run on top. Clearing is
      // automatic ONLY for a brand-new org from a sign-up that has never been
      // served; anything else is a person's call.
      const status = (await readTenantRow(control, orgId))?.status;
      if (!request || status === 'active') {
        fail(`A previous seed stopped part-way (${seededRows} rows, no merge fields). Review, then clear with \`npm run db:purge-tenant -- --orgId=${orgId}\` against this database and re-run.`);
      }
      runScript(
        'Clear partial seed',
        'src/scripts/purgeTenantData.ts',
        [`--orgId=${orgId}`, '--confirm', `--yes-delete=${orgId}`, '--i-know-this-is-the-only-copy'],
        seedEnv,
        undefined,
        capture,
      );
    }
    if (!seedComplete) {
      const ownerArg = owner?.kind === 'member' ? [`--ownerClerkId=${owner.userId}`] : [];
      runScript(
        'Seed reference data',
        'src/scripts/seed.ts',
        [`--orgId=${orgId}`, '--referenceDataOnly', ...ownerArg],
        // seed.ts reads env at import and never loads .env files; no Clerk or
        // IQPro creds, so its SaaS trial stays synthetic.
        seedEnv,
        undefined,
        capture,
      );
    }

    // Always, not only when seed ran: a resumed run that skipped seeding must
    // still leave the org with its control-plane billing row.
    const trial = await ensureControlTrial(control, orgId, owner?.kind === 'member' ? owner.userId : undefined);
    console.info(trial.written
      ? '✓ 30-day trial written to the control plane'
      : `✓ Control-plane subscription already present (${trial.status})`);

    // ── 6. Payment ───────────────────────────────────────────────────────
    if (payment) {
      await step('payment');
      await writePaymentConfig(tenant!, orgId, payment.provider, payment.blob);
      console.info(`✓ ${payment.provider === 'square' ? 'Square' : 'IQPro'} credentials saved`);
    }

    // ── 7. Activate ──────────────────────────────────────────────────────
    await step('activate');
    if ((await readTenantRow(control, orgId))?.status !== 'active') {
      runScript('Activate', 'src/scripts/cutoverTenant.ts', [`--orgId=${orgId}`, `--target=${tenantUrl}`, '--activate-only'], childEnv, undefined, capture);
    }

    // ── 7b. Owner, for a public sign-up: now that the org is live ───────
    if (deferOwner) {
      await step('owner');
      // Always an invitation: its email is how the owner learns the academy
      // is ready, even when they already have a Clerk account.
      owner = await clerk.ensureOwnerAccess(orgId, ownerEmail, ORG_ROLE.ACADEMY_OWNER, {
        alwaysInvite: true,
        publicMetadata: invitationMetadata,
      });
      reportOwner(owner);
    }
    if (!owner) {
      fail('Owner access was never granted.');
    }

    // ── 8. Verify ────────────────────────────────────────────────────────
    await step('verify');
    // showTenants lists EVERY org's name and database host — never into the
    // public Actions log.
    if (!flags.ci) {
      runScript('Tenant directory', 'src/scripts/showTenants.ts', [], childEnv);
    }
    // checkTenantReadiness treats DATABASE_URL as the legacy SHARED database
    // and flags any tenant pointing at it. With every org on its own database
    // there is no shared one, so give it the control plane — passing the new
    // tenant's URL would report the org we just activated as misrouted.
    let readinessWarning: string | null = null;
    try {
      runScript('Readiness', 'src/scripts/checkTenantReadiness.ts', [], { ...childEnv, DATABASE_URL: controlUrl }, undefined, capture);
    } catch (error) {
      // Readiness checks EVERY tenant. For a sign-up, drift on some other org
      // must not fail this one, which is already live and invited: record it
      // for the team instead.
      if (!request || !(error instanceof ScriptFailedError)) {
        throw error;
      }
      readinessWarning = `Provisioned, but the readiness check reported problems:\n${error.output ?? error.message}`;
      console.info('⚠️  Readiness reported problems — recorded on the sign-up request.');
    }

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
    // Unattended: the operator is a service account and never stays in a customer org.
    if (operator && !operatorIsOwner && (unattended || await prompt.confirm(`Remove yourself (${operatorUsername}) from the new org?`, false))) {
      await clerk.removeMembership(orgId, operator.id);
    }

    if (request) {
      await markSignupProvisioned(control, request.id, readinessWarning);
      failureSink = null;
    }

    console.info(`\n✅ ${name} is live.
   Org id:     ${orgId}
   Dashboard:  ${target === 'production' ? APP_URL : 'your Preview URL'}/dashboard
   Kiosk:      ${target === 'production' ? `${KIOSK_URL}/?org=${slug}` : `<Preview kiosk URL>/?org=${slug}`}
   Owner:      ${owner.kind === 'member' ? 'added' : 'invited — they get access when they accept'}
   Billing:    ${trial.written ? '30-day trial started; the owner subscribes from the dashboard' : `existing subscription status: ${trial.status}`}
   Payments:   ${paymentProvider === 'square' ? 'Square configured' : paymentProvider ? 'IQPro configured' : 'not configured — set on Location Settings'}; kiosk probe ${kioskStatus}${paymentProvider === 'square' ? squareWebhookReminder(target) : ''}
   Internal org that should never be billed? Add ${orgId} to EXEMPT_ORG_IDS in src/utils/SuperAdmins.ts.`);
  } catch (error) {
    // Record on the request while the control connection is still open.
    if (failureSink) {
      failureRecorded = await failureSink(error).then(() => true, () => false);
    }
    throw error;
  } finally {
    await control.end();
    await tenant?.end();
  }
}

main().catch((error) => {
  if (flags.ci) {
    // The message can name hosts or customers; the Actions log is public.
    console.error(`\n✗ org:create failed.${failureRecorded ? ' The detail is recorded on the sign-up request (last_error).' : ''}`);
  } else {
    console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
    if (error instanceof ScriptFailedError && error.output) {
      console.error(error.output);
    }
  }
  console.error('Nothing after the failed step ran. Fix the problem and re-run the same command — completed steps are skipped.');
  process.exit(1);
});
