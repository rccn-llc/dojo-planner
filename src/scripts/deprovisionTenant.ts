/**
 * Stop serving ONE organization and hand back what to delete by hand.
 *
 * ── What this does NOT do ───────────────────────────────────────────────────
 *
 * It does not delete the database. Two reasons, both structural:
 *
 *  1. Neon refuses project deletion on a Vercel-managed organization, the same
 *     restriction that blocks creation.
 *  2. `provisionTenant` no longer records `neon_project_id` / `neon_branch_id`
 *     — databases are created by hand, so there is no id to delete by.
 *
 * Pretending otherwise would be worse than not trying: a script that reports
 * success while the data still exists is exactly the kind of thing a
 * data-deletion request must never rely on.
 *
 * ── What it DOES ────────────────────────────────────────────────────────────
 *
 *  1. Flips the tenant row to `archived` — which `resolveTenant` refuses, so
 *     the organization stops being served immediately.
 *  2. Reports the row count and the database HOST, so the operator knows
 *     exactly what to delete in the console and can confirm it was the right
 *     one.
 *
 * The row is retained rather than deleted: an archived tenant is the audit
 * record that the deprovisioning happened.
 *
 * Usage:
 *   CONTROL_DATABASE_URL=<control> \
 *   npx tsx src/scripts/deprovisionTenant.ts --orgId=org_xxx [--confirm]
 */

import process from 'node:process';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { argValue, loadEnvFiles } from '../libs/EnvFiles';
import { decryptConnectionString, SHARED_DATABASE_SENTINEL, tenantEncryptionKey } from '../libs/TenantCrypto';
import * as controlSchema from '../models/ControlSchema';
import { TENANT_STATUS, tenantSchema } from '../models/ControlSchema';
import { orgScopePredicate, TENANT_TABLES } from '../services/TenantDataMap';

/** Host of a connection string. NEVER the credentials. */
function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).host;
  } catch {
    return '(unparseable connection string)';
  }
}

/**
 * Total rows this org holds in `connectionString`.
 *
 * Accepts an optional existing pool: locally the control plane and the tenant
 * database are the same pglite-server, which allows exactly ONE connection, so
 * opening a second here fails with `read ECONNRESET`.
 */
export async function countOrgRowsIn(connectionString: string, orgId: string, existingPool?: Pool): Promise<number> {
  const pool = existingPool ?? new Pool({ connectionString, max: 1 });

  try {
    let total = 0;
    for (const entry of TENANT_TABLES) {
      const { rows } = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM "${entry.table}" WHERE ${orgScopePredicate(entry)}`,
        [orgId],
      );
      total += Number(rows[0]?.n ?? 0);
    }
    return total;
  } finally {
    // Only close a pool this function opened; the caller owns theirs.
    if (!existingPool) {
      await pool.end().catch(() => {});
    }
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  const orgId = argValue('orgId');
  const confirm = process.argv.includes('--confirm');

  if (!orgId) {
    console.error('Usage: deprovisionTenant.ts --orgId=org_xxx [--confirm]');
    process.exit(1);
  }

  const controlConnectionString = process.env.CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!controlConnectionString) {
    console.error('Neither CONTROL_DATABASE_URL nor DATABASE_URL is set.');
    process.exit(1);
  }

  console.info(`[deprovisionTenant] org:  ${orgId}`);
  console.info(`[deprovisionTenant] mode: ${confirm ? 'ARCHIVE' : 'DRY RUN'}\n`);

  const controlPool = new Pool({ connectionString: controlConnectionString, max: 1 });
  const controlDb = drizzle(controlPool, { schema: controlSchema });

  try {
    const rows = await controlDb
      .select({
        status: tenantSchema.status,
        displayName: tenantSchema.displayName,
        encrypted: tenantSchema.connectionStringEncrypted,
      })
      .from(tenantSchema)
      .where(eq(tenantSchema.orgId, orgId));

    const row = rows[0];
    if (!row) {
      throw new Error(`No tenant row for ${orgId}.`);
    }

    if (row.status === TENANT_STATUS.ARCHIVED) {
      console.info(`[deprovisionTenant] ${orgId} is already archived. Nothing to do.`);
      return;
    }

    console.info(`  organization: ${row.displayName ?? '(no display name)'}`);
    console.info(`  status:       ${row.status}`);

    // Resolve the database so the operator is told exactly what to delete.
    let database = '(shared database)';
    let rowCount: number | null = null;

    if (row.encrypted !== SHARED_DATABASE_SENTINEL) {
      const key = tenantEncryptionKey();
      if (key) {
        const connectionString = decryptConnectionString(row.encrypted, key);
        database = hostOf(connectionString);
        // Reuse the control pool when it is the same database (local dev).
        const samePool = connectionString === controlConnectionString ? controlPool : undefined;
        rowCount = await countOrgRowsIn(connectionString, orgId, samePool).catch((error) => {
          // Report rather than swallow: "(could not count)" with no reason sent
          // me chasing a phantom once already.
          console.warn(`  (row count failed: ${error instanceof Error ? error.message : error})`);
          return null;
        });
      } else {
        database = '(no encryption key — cannot resolve)';
      }
    }

    console.info(`  database:     ${database}`);
    console.info(`  rows:         ${rowCount ?? '(could not count)'}\n`);

    if (!confirm) {
      console.info('[deprovisionTenant] DRY RUN — nothing changed. Re-run with --confirm.');
      return;
    }

    await controlDb
      .update(tenantSchema)
      .set({ status: TENANT_STATUS.ARCHIVED, updatedAt: new Date() })
      .where(eq(tenantSchema.orgId, orgId));

    console.info(`[deprovisionTenant] ${orgId} is ARCHIVED — the app no longer serves it.`);
    console.info('\n⚠️  THE DATA STILL EXISTS. This script does not delete databases.');
    console.info(`    Delete it by hand in the Neon/Vercel console: ${database}`);
    console.info('    The tenant row is kept, archived, as the audit record.');
  } finally {
    await controlPool.end().catch(() => {});
  }
}

const isDirectRun = process.argv[1]?.includes('deprovisionTenant');

if (isDirectRun) {
  main().catch((error) => {
    console.error('[deprovisionTenant] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
