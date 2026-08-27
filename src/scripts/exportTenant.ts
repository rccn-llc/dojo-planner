/**
 * Export ONE organization's data — for a portability or deletion request.
 *
 * ── Why this is a whole-database dump ───────────────────────────────────────
 *
 * Once an org is on its own database, "everything belonging to this customer"
 * is simply that database. No org-scoped predicates, no 38-table walk, no risk
 * of missing a table that lacks `organization_id`. That is one of the reasons
 * the per-org split exists, and this script is where the benefit is cashed in.
 *
 * For an org still on the SHARED database that is not true — its rows sit
 * beside every other org's — so this refuses rather than dumping the shared
 * database and handing one customer everybody's data.
 *
 * ── The dump ────────────────────────────────────────────────────────────────
 *
 * Uses `pg_dump` in custom format (-Fc), restorable with `pg_restore`. Neon
 * recommends an UNPOOLED connection for dumps, so the `-pooler` host suffix is
 * stripped — the same conversion `migrateTenants` does for DDL.
 *
 * Usage:
 *   CONTROL_DATABASE_URL=<control> \
 *   npx tsx src/scripts/exportTenant.ts --orgId=org_xxx [--out=./export.dump]
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { argValue, loadEnvFiles } from '../libs/EnvFiles';
import { decryptConnectionString, SHARED_DATABASE_SENTINEL, tenantEncryptionKey } from '../libs/TenantCrypto';
import * as controlSchema from '../models/ControlSchema';
import { tenantSchema } from '../models/ControlSchema';

/**
 * Strip Neon's `-pooler` suffix.
 *
 * Neon recommends an unpooled connection for dump/restore; the same conversion
 * `migrateTenants.directUri` applies to DDL, and for the same reason —
 * transaction pooling interferes with long single-session work.
 */
export function unpooledUri(connectionString: string): string {
  return connectionString.replace('-pooler.', '.');
}

async function main(): Promise<void> {
  loadEnvFiles();

  const orgId = argValue('orgId');
  const out = argValue('out') ?? `./${orgId}.dump`;

  if (!orgId) {
    console.error('Usage: exportTenant.ts --orgId=org_xxx [--out=./export.dump]');
    process.exit(1);
  }

  const controlConnectionString = process.env.CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!controlConnectionString) {
    console.error('Neither CONTROL_DATABASE_URL nor DATABASE_URL is set.');
    process.exit(1);
  }

  // Fail on the missing tool BEFORE resolving anything, so the error is about
  // the actual problem rather than a cryptic spawn failure later.
  if (spawnSync('pg_dump', ['--version'], { stdio: 'ignore' }).status !== 0) {
    console.error(
      'pg_dump is not on PATH.\n'
      + 'Install the Postgres client tools (macOS: `brew install libpq` then add it to PATH).',
    );
    process.exit(1);
  }

  const controlPool = new Pool({ connectionString: controlConnectionString, max: 1 });
  const controlDb = drizzle(controlPool, { schema: controlSchema });

  let connectionString: string;

  try {
    const rows = await controlDb
      .select({ encrypted: tenantSchema.connectionStringEncrypted })
      .from(tenantSchema)
      .where(eq(tenantSchema.orgId, orgId));

    const stored = rows[0]?.encrypted;
    if (!stored) {
      throw new Error(`No tenant row for ${orgId}.`);
    }

    if (stored === SHARED_DATABASE_SENTINEL) {
      throw new Error(
        `${orgId} is still on the SHARED database.\n`
        + 'A whole-database dump would hand this customer every other organization\'s data.\n'
        + 'Cut the org over to its own database first.',
      );
    }

    const key = tenantEncryptionKey();
    if (!key) {
      throw new Error('No encryption key, so the tenant database cannot be resolved.');
    }

    connectionString = decryptConnectionString(stored, key);

    const shared = process.env.DATABASE_URL;
    if (shared && connectionString === shared) {
      throw new Error(
        `${orgId}'s tenant row points at the SHARED database.\n`
        + 'Dumping it would expose every other organization. Cut the org over first.',
      );
    }
  } finally {
    await controlPool.end().catch(() => {});
  }

  console.info(`[exportTenant] org: ${orgId}`);
  console.info(`[exportTenant] out: ${out}\n`);

  // Credentials go in the environment, never argv — argv is visible to any
  // other process on the machine via `ps`.
  const result = spawnSync(
    'pg_dump',
    ['--format=custom', '--no-owner', '--no-privileges', `--file=${out}`, '--dbname', unpooledUri(connectionString)],
    { stdio: 'inherit' },
  );

  if (result.status !== 0) {
    console.error(`[exportTenant] pg_dump exited ${result.status}`);
    process.exit(1);
  }

  console.info(`\n[exportTenant] wrote ${out}`);
  console.info(`Restore with: pg_restore --dbname=<target> --no-owner --no-privileges ${out}`);
}

const isDirectRun = process.argv[1]?.includes('exportTenant');

if (isDirectRun) {
  main().catch((error) => {
    console.error('[exportTenant] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
