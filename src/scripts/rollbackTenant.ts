/**
 * Put ONE organization back on the shared database.
 *
 * The counterpart to `cutoverTenant`. Because the copy never deletes from the
 * source, the shared rows are still there and still current up to the moment
 * of the freeze — so rolling back is a directory change, not a data restore.
 *
 * ⚠️ ONLY rolls back to the SHARED database.
 *
 * If an org's fallback is ANOTHER TENANT DATABASE — moving between Neon
 * projects, or off a branch onto a project — this is the WRONG tool. It writes
 * the shared-database sentinel, and the shared database may never have held
 * that org's data. Use instead:
 *
 *   npm run db:provision-tenant  -- --orgId=<org> --repoint=<org> \
 *                                   --connection-string=<the OLD database>
 *   npm run db:cutover-tenant    -- --orgId=<org> --target=<the OLD database> \
 *                                   --activate-only
 *
 * `--activate-only`'s emptiness guard proves the old database still holds the
 * org's rows before it is served again.
 *
 * ── What this does NOT do ───────────────────────────────────────────────────
 *
 * It does not move rows written to the tenant database AFTER the cutover back
 * into the shared one. Those rows are stranded, and this script reports how
 * many there are per table so the decision is informed rather than blind:
 *
 *   - Rolling back minutes after a cutover typically strands nothing.
 *   - Rolling back after a day of live traffic strands a day of it.
 *
 * That is why the plan calls for a soak before source deletion: until the
 * source rows are deleted, rollback stays cheap.
 *
 * Usage:
 *   CONTROL_DATABASE_URL=<control> \
 *   npx tsx src/scripts/rollbackTenant.ts --orgId=org_xxx [--target=<tenant db>] [--force]
 */

import process from 'node:process';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { argValue, loadEnvFiles } from '../libs/EnvFiles';
import { SHARED_DATABASE_SENTINEL } from '../libs/TenantCrypto';
import * as controlSchema from '../models/ControlSchema';
import { TENANT_STATUS, tenantSchema } from '../models/ControlSchema';
import { orgScopePredicate, TENANT_TABLES } from '../services/TenantDataMap';

/**
 * Count what lives in the tenant database, so the operator sees what a
 * rollback would strand before it happens.
 */
async function countStranded(target: string, orgId: string): Promise<{ table: string; rows: number }[]> {
  const pool = new Pool({ connectionString: target, max: 1 });
  const found: { table: string; rows: number }[] = [];

  try {
    for (const entry of TENANT_TABLES) {
      const { rows } = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM "${entry.table}" WHERE ${orgScopePredicate(entry)}`,
        [orgId],
      );
      const n = Number(rows[0]?.n ?? 0);
      if (n > 0) {
        found.push({ table: entry.table, rows: n });
      }
    }
  } finally {
    await pool.end();
  }

  return found;
}

async function main(): Promise<void> {
  loadEnvFiles();

  const orgId = argValue('orgId');
  const target = argValue('target');
  const force = process.argv.includes('--force');

  if (!orgId) {
    console.error('Usage: rollbackTenant.ts --orgId=org_xxx [--target=<tenant db>] [--force]');
    process.exit(1);
  }

  const controlConnectionString = process.env.CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!controlConnectionString) {
    console.error('Neither CONTROL_DATABASE_URL nor DATABASE_URL is set.');
    process.exit(1);
  }

  console.info(`[rollbackTenant] org: ${orgId}`);

  // Report what would be stranded. Advisory unless --target is omitted, in
  // which case we simply cannot know — say so rather than implying zero.
  if (target) {
    const stranded = await countStranded(target, orgId);
    if (stranded.length === 0) {
      console.info('[rollbackTenant] tenant database holds no rows for this org — nothing stranded.');
    } else {
      const total = stranded.reduce((sum, s) => sum + s.rows, 0);
      console.warn(`\n[rollbackTenant] ⚠️  ${total} row(s) live ONLY in the tenant database:`);
      for (const s of stranded) {
        console.warn(`    ${s.table.padEnd(28)} ${String(s.rows).padStart(7)}`);
      }
      console.warn('\nRolling back leaves these behind. They are not deleted — the tenant');
      console.warn('database is untouched — but the app will stop reading them.');

      if (!force) {
        console.error('\nRefusing without --force. Re-run with --force once that is acceptable.');
        process.exit(1);
      }
    }
  } else {
    console.warn('[rollbackTenant] no --target given, so stranded rows cannot be counted.');
    console.warn('Pass --target=<tenant connection string> to see what rollback would leave behind.');
  }

  const controlPool = new Pool({ connectionString: controlConnectionString, max: 1 });
  const controlDb = drizzle(controlPool, { schema: controlSchema });

  try {
    // Point the row back at the shared database via the sentinel, which
    // `resolveConnectionString` maps to DATABASE_URL. Writing the sentinel
    // rather than an encryption of DATABASE_URL keeps the row's intent legible
    // — "this org is not cut over" — instead of ciphertext that only decrypts
    // to the same answer.
    const updated = await controlDb
      .update(tenantSchema)
      .set({
        connectionStringEncrypted: SHARED_DATABASE_SENTINEL,
        status: TENANT_STATUS.ACTIVE,
        updatedAt: new Date(),
      })
      .where(eq(tenantSchema.orgId, orgId))
      .returning({ orgId: tenantSchema.orgId });

    if (updated.length === 0) {
      throw new Error(`No tenant row for ${orgId}.`);
    }

    console.info(`\n[rollbackTenant] ${orgId} is back on the shared database.`);
    console.info('The tenant database is untouched; deprovision it separately once you are sure.');
    console.info('Note: both apps cache the directory for 60s, so allow a minute to take effect.');
  } finally {
    await controlPool.end();
  }
}

const isDirectRun = process.argv[1]?.includes('rollbackTenant');

if (isDirectRun) {
  main().catch((error) => {
    console.error('[rollbackTenant] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export { countStranded };
