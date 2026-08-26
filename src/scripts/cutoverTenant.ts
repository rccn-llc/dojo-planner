/**
 * Move ONE organization onto its own database, end to end.
 *
 * This is the orchestrator. Every step it runs already exists as its own
 * script; this file exists because running them by hand means threading a
 * connection string between four commands and remembering the order — and the
 * order is the safety property.
 *
 *     provision → freeze+copy → verify → activate
 *
 * ── --activate-only ─────────────────────────────────────────────────────────
 *
 * A second mode for a tenant whose database was FILLED WITHOUT A COPY — seeded
 * straight into place, which is how an organization with no data worth moving
 * reaches its own database. There is nothing to freeze and nothing to verify
 * against a source, so the flip to `active` IS the whole operation.
 *
 * It lives here rather than as a line of hand-written SQL so that exactly one
 * script owns the flip. An activation performed by hand is an activation with
 * no emptiness guard, no logging, and no test — and it becomes folklore.
 *
 * ── Why activation lives HERE and not in provisionTenant ────────────────────
 *
 * A freshly provisioned database is EMPTY. If provisioning flipped the row to
 * `active`, `resolveTenant` would serve the org from that empty database as
 * soon as the 60s directory cache expired — a blank dashboard, with no flag
 * change and no error to explain it. So provisioning leaves the row
 * non-servable and this script performs the only flip to `active`, after the
 * copy has been VERIFIED.
 *
 * ── Rollback ────────────────────────────────────────────────────────────────
 *
 * Nothing here deletes from the source. The shared rows remain the rollback
 * until a soak has passed; `rollbackTenant.ts` repoints the row back.
 *
 * Usage:
 *   # copy an existing org's data onto its own database
 *   DATABASE_URL=<shared/source> CONTROL_DATABASE_URL=<control> \
 *   npx tsx src/scripts/cutoverTenant.ts --orgId=org_xxx --target=<dest> [--dry-run]
 *
 *   # activate a database that was seeded into place (no copy)
 *   CONTROL_DATABASE_URL=<control> \
 *   npx tsx src/scripts/cutoverTenant.ts --orgId=org_xxx --target=<dest> --activate-only
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { argValue, loadEnvFiles } from '../libs/EnvFiles';
import * as controlSchema from '../models/ControlSchema';
import { TENANT_STATUS, tenantSchema } from '../models/ControlSchema';
import { orgScopePredicate, TENANT_TABLES } from '../services/TenantDataMap';

/**
 * Run one step as a child process and abort the cutover if it fails.
 *
 * Deliberately shells out rather than importing each script's `main`: the
 * scripts own their own argument parsing, env loading, and non-zero exit
 * contract, and duplicating that here is how the two drift apart.
 */
function runStep(label: string, script: string, args: string[]): void {
  console.info(`\n──── ${label} ────`);
  const result = spawnSync('npx', ['tsx', script, ...args], { stdio: 'inherit' });

  if (result.status !== 0) {
    // Stop at the first failure. A later step running against a half-copied
    // database is exactly the state this ordering exists to prevent.
    throw new Error(`${label} failed (exit ${result.status ?? 'signal'}). Cutover aborted; the org is NOT active.`);
  }
}

/**
 * Refuse to activate a destination that holds nothing for this organization.
 *
 * Activating an empty database is silent: `resolveTenant` starts serving the
 * org from it as soon as the 60s directory cache expires, and every read comes
 * back empty with no error to explain it. The same failure that made
 * provisioning leave rows non-servable in the first place.
 *
 * Counts only the ORG's rows — a branch inherits its parent's schema, so
 * "tables exist" proves nothing about whether anyone seeded it.
 */
export async function assertDestinationHasData(target: string, orgId: string): Promise<void> {
  const pool = new Pool({ connectionString: target, max: 1 });

  try {
    let total = 0;
    for (const entry of TENANT_TABLES) {
      const { rows } = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM "${entry.table}" WHERE ${orgScopePredicate(entry)}`,
        [orgId],
      );
      total += Number(rows[0]?.n ?? 0);
    }

    if (total === 0) {
      throw new Error(
        `The destination holds NO rows for ${orgId}.\n`
        + 'Activating it would serve that organization from an empty database — a blank\n'
        + 'dashboard with no error, once the 60s directory cache expires.\n'
        + 'Seed it first:\n'
        + `  DATABASE_URL=<target> CONTROL_DATABASE_URL=<control> npx tsx src/scripts/seed.ts --orgId=${orgId}`,
      );
    }

    console.info(`[cutoverTenant] destination holds ${total} row(s) for ${orgId}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  const orgId = argValue('orgId');
  const target = argValue('target');
  const dryRun = process.argv.includes('--dry-run');
  const activateOnly = process.argv.includes('--activate-only');

  if (!orgId || !target) {
    console.error(
      'Usage: cutoverTenant.ts --orgId=org_xxx --target=<connection string> [--dry-run]\n'
      + '       cutoverTenant.ts --orgId=org_xxx --target=<connection string> --activate-only',
    );
    process.exit(1);
  }

  // `--target` is required in BOTH modes. Activation without it could not
  // check that the destination actually holds data, and activating an empty
  // database is the failure this guard exists to prevent: the org's dashboard
  // goes blank the moment the 60s directory cache expires, with no error.
  if (activateOnly && dryRun) {
    console.error('--activate-only and --dry-run are mutually exclusive.');
    process.exit(1);
  }

  const controlConnectionString = process.env.CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!controlConnectionString) {
    console.error('Neither CONTROL_DATABASE_URL nor DATABASE_URL is set.');
    process.exit(1);
  }

  const mode = activateOnly ? 'ACTIVATE ONLY' : (dryRun ? 'DRY RUN' : 'LIVE');
  console.info(`[cutoverTenant] org:    ${orgId}`);
  console.info(`[cutoverTenant] mode:   ${mode}`);

  if (activateOnly) {
    // Seeded into place: no source to freeze, no copy to verify against. The
    // emptiness guard is the ONLY safety check standing between this and
    // serving an organization from a database nobody filled.
    await assertDestinationHasData(target, orgId);
  } else {
    const copyArgs = [`--orgId=${orgId}`, `--target=${target}`, ...(dryRun ? ['--dry-run'] : [])];

    // 1. Copy, under the write freeze the copy script owns.
    runStep('copy', 'src/scripts/copyTenantData.ts', copyArgs);

    if (dryRun) {
      console.info('\n[cutoverTenant] dry run — nothing copied, nothing activated.');
      return;
    }

    // 2. Verify. Exits non-zero on any parity, isolation, or content mismatch,
    //    which runStep turns into an aborted cutover.
    runStep('verify', 'src/scripts/verifyTenantCopy.ts', [`--orgId=${orgId}`, `--target=${target}`]);
  }

  // 3. Activate — the ONLY flip to `active` in the codebase for a cut-over org.
  const controlPool = new Pool({ connectionString: controlConnectionString, max: 1 });
  const controlDb = drizzle(controlPool, { schema: controlSchema });

  try {
    const updated = await controlDb
      .update(tenantSchema)
      .set({ status: TENANT_STATUS.ACTIVE, updatedAt: new Date() })
      .where(eq(tenantSchema.orgId, orgId))
      .returning({ orgId: tenantSchema.orgId });

    if (updated.length === 0) {
      throw new Error(`No tenant row for ${orgId} — provision it before cutting over.`);
    }

    console.info(`\n[cutoverTenant] ${orgId} is ACTIVE on its own database.`);

    if (activateOnly) {
      // Say this plainly: there is no copy, so there are no source rows to
      // fall back to. Rolling back would point the org at a shared database
      // that never held its data — an EMPTY result, not a restore.
      console.info('⚠️  Seeded into place — there are NO source rows, so rollback is NOT a restore.');
      console.info(`    db:rollback-tenant would point ${orgId} at a database that never held its data.`);
    } else {
      console.info('The source rows are UNTOUCHED and remain the rollback until the soak passes.');
    }

    console.info('Next:');
    console.info('  - soak: dashboard, a payment, a webhook delivery, and a kiosk check-in');
    if (!activateOnly) {
      console.info(`  - roll back if needed: npm run db:rollback-tenant -- --orgId=${orgId}`);
    }
  } finally {
    await controlPool.end();
  }
}

const isDirectRun = process.argv[1]?.includes('cutoverTenant');

if (isDirectRun) {
  main().catch((error) => {
    console.error('[cutoverTenant] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export { runStep };
