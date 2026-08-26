/**
 * Register `tenant` directory rows for existing organizations.
 *
 * Phase A1 introduced a tenant directory: every request resolves its
 * organization to a database via `tenant.connection_string_enc`. Existing
 * deployments have organizations but no directory rows, so without this every
 * request fails with `TenantNotProvisionedError` (HTTP 409).
 *
 * This script points every organization at the CURRENT database — correct for
 * the no-op phase, where the control plane and the tenant plane are one
 * physical database. Phase A3's `provisionTenant.ts` supersedes it, creating a
 * real Neon project per organization and storing its own connection string.
 *
 * The connection string is encrypted with the same AES-256-GCM layout
 * `TenantDirectoryService.decryptConnectionString` expects —
 * base64(iv || authTag || ciphertext) — which is why this cannot be done with
 * hand-written SQL.
 *
 * Usage:
 *   DATABASE_URL=... CONTROL_PLANE_ENCRYPTION_KEY=... \
 *     npx tsx src/scripts/registerTenants.ts [--dry-run] [--region=<id>]
 *
 * Falls back to IQPRO_CONFIG_ENCRYPTION_KEY when CONTROL_PLANE_ENCRYPTION_KEY
 * is unset, matching the resolver's own fallback.
 *
 * Idempotent: re-running refreshes the stored connection string and leaves
 * everything else untouched.
 */

import type { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { decryptConnectionString, encryptConnectionString, SHARED_DATABASE_SENTINEL, tenantEncryptionKey } from '../libs/TenantCrypto';
import { TENANT_STATUS, tenantSchema } from '../models/ControlSchema';
import { organizationSchema } from '../models/Schema';

/**
 * Load `.env.local` then `.env` into `process.env` for convenience, so the
 * script can be run as a bare `npm run db:register-tenants` locally.
 *
 * Values already in the environment always win, which keeps the documented
 * usage — `DATABASE_URL=... npm run db:register-tenants` — authoritative. That
 * matters: pointing this at production while a local `.env` sits on disk must
 * target production, not silently fall back to the local database.
 *
 * Minimal parser rather than a `dotenv` dependency (the project has none).
 */
function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    const fullPath = path.join(process.cwd(), file);
    if (!existsSync(fullPath)) {
      continue;
    }
    for (const rawLine of readFileSync(fullPath, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eq = line.indexOf('=');
      if (eq === -1) {
        continue;
      }
      const key = line.slice(0, eq).trim();
      if (process.env[key] !== undefined) {
        continue; // Explicit environment wins.
      }
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith('\'') && value.endsWith('\''))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function parseArgs(): { dryRun: boolean; region: string } {
  const region = process.argv.find(arg => arg.startsWith('--region='))?.split('=')[1];
  return {
    dryRun: process.argv.includes('--dry-run'),
    region: region ?? 'aws-us-east-1',
  };
}

/**
 * Refuse to run once ANY organization has been cut over.
 *
 * This script encrypts ONE connection string as EVERY tenant's. That is
 * correct while all orgs share a database and catastrophic afterwards: it
 * would overwrite each cut-over org's real per-tenant string with the shared
 * one and force status='active', routing every organization into everyone
 * else's data. The rows would look legitimate — plausible region, ciphertext
 * that decrypts cleanly — which is why it has to be blocked here rather than
 * detected later.
 *
 * ⚠️ This used to test `TENANCY_MODE !== 'shared'`. A5 retired that flag from
 * the read path, so nothing sets it any more and the guard silently stopped
 * guarding. The check now inspects the DATA — a row whose decrypted string is
 * neither the sentinel nor the shared database is a cut-over org — which is
 * the same predicate the app itself routes on, and cannot drift out of sync
 * with a flag nobody maintains.
 */
export async function assertNoTenantCutOver(
  db: ReturnType<typeof drizzle>,
  sharedConnectionString: string,
  key: Buffer,
): Promise<void> {
  const rows = await db
    .select({ orgId: tenantSchema.orgId, encrypted: tenantSchema.connectionStringEncrypted })
    .from(tenantSchema);

  const cutOver = rows.filter((row) => {
    if (row.encrypted === SHARED_DATABASE_SENTINEL) {
      return false;
    }
    try {
      return decryptConnectionString(row.encrypted, key) !== sharedConnectionString;
    } catch {
      // Undecryptable rows are a key mismatch, not evidence of a cutover.
      // checkTenantReadiness is the right place to surface that.
      return false;
    }
  });

  if (cutOver.length > 0) {
    throw new Error(
      `[registerTenants] ${cutOver.length} organization(s) are already on their own database `
      + `(${cutOver.map(r => r.orgId).join(', ')}).\n`
      + 'This script assigns the SAME connection string to every organization and '
      + 'would overwrite those, routing every org into shared data.\n'
      + 'To provision an organization once tenants are split, use:\n'
      + '  npx tsx src/scripts/provisionTenant.ts --orgId=org_xxx',
    );
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  const { dryRun, region } = parseArgs();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set, and no .env.local or .env supplied one.\n'
      + 'Pass it explicitly:\n'
      + '  DATABASE_URL="postgresql://..." npm run db:register-tenants',
    );
  }

  // TWO PLANES.
  //
  // Organizations live in the TENANT database; the `tenant` directory lives in
  // the CONTROL database. This script used to use one connection for both,
  // which wrote directory rows into the tenant database — where the app never
  // reads them. Falls back to DATABASE_URL so single-database deployments are
  // unaffected.
  const controlConnectionString = process.env.CONTROL_DATABASE_URL ?? connectionString;

  // Which database this is about to write to matters a great deal — print the
  // host (never the password) so a production run is unmistakable.
  const hostOf = (cs: string): string => {
    try {
      const url = new URL(cs);
      return `${url.hostname}${url.pathname}`;
    } catch {
      return '(unparseable connection string)';
    }
  };
  const target = hostOf(connectionString);
  console.info(`[registerTenants] orgs read from:      ${target}`);
  console.info(`[registerTenants] tenant rows written: ${hostOf(controlConnectionString)}`);

  const key = tenantEncryptionKey();
  if (!key) {
    throw new Error(
      'No encryption key. Set CONTROL_PLANE_ENCRYPTION_KEY (preferred) or '
      + 'IQPRO_CONFIG_ENCRYPTION_KEY.\n'
      + 'It MUST match what the deployed app reads, or it cannot decrypt these rows.',
    );
  }

  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle({ client: pool, schema: { organizationSchema, tenantSchema } });

  // Separate handle for the directory. Same connection when the planes are not
  // split, so the pool is only opened twice when it genuinely differs.
  const controlPool = controlConnectionString === connectionString
    ? pool
    : new Pool({ connectionString: controlConnectionString, max: 1 });
  const controlDb = controlConnectionString === connectionString
    ? db
    : drizzle({ client: controlPool, schema: { tenantSchema } });

  try {
    // Before touching anything: prove no organization has been cut over.
    await assertNoTenantCutOver(controlDb, connectionString, key);

    const orgs = await db
      .select({ id: organizationSchema.id })
      .from(organizationSchema)
      .catch((error) => {
        const code = (error as { code?: string; cause?: { code?: string } }).code
          ?? (error as { cause?: { code?: string } }).cause?.code;
        if (code === 'ECONNREFUSED') {
          throw new Error(
            `Cannot connect to ${target}.\n`
            + 'If this is the local database, start it first: npm run db-server:file\n'
            + '(or run `npm run dev`, which starts it for you).',
          );
        }
        if (code === '42P01') {
          throw new Error(
            `The \`organization\` table does not exist in ${target}.\n`
            + 'Wrong database, or migrations have never been applied here.',
          );
        }
        throw error;
      });
    console.info(`[registerTenants] found ${orgs.length} organization(s)`);

    if (orgs.length === 0) {
      console.info('[registerTenants] nothing to do');
      return;
    }

    // Verify the directory table exists before attempting writes, so a missing
    // table produces a clear message rather than a raw Postgres error.
    const existing = await controlDb.select({ orgId: tenantSchema.orgId }).from(tenantSchema).catch((error) => {
      const code = (error as { code?: string; cause?: { code?: string } }).code
        ?? (error as { cause?: { code?: string } }).cause?.code;
      if (code === '42P01') {
        throw new Error(
          'The `tenant` table does not exist in this database.\n'
          + 'Apply the control-plane DDL at the end of migrations/0000_baseline.sql first —\n'
          + 'drizzle records the baseline as applied and will not re-run it.',
        );
      }
      throw error;
    });
    const alreadyRegistered = new Set(existing.map(row => row.orgId));

    if (dryRun) {
      for (const org of orgs) {
        const verb = alreadyRegistered.has(org.id) ? 'refresh' : 'create ';
        console.info(`  would ${verb}  ${org.id}`);
      }
      console.info(`\n[registerTenants] dry run — no changes made (region would be "${region}")`);
      return;
    }

    for (const org of orgs) {
      // A fresh IV per row: never reuse an IV with the same key under GCM.
      const encrypted = encryptConnectionString(connectionString, key);

      await controlDb
        .insert(tenantSchema)
        .values({
          orgId: org.id,
          displayName: null,
          connectionStringEncrypted: encrypted,
          region,
          status: TENANT_STATUS.ACTIVE,
          schemaVersion: '0000_baseline',
          schemaVersionAppliedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: tenantSchema.orgId,
          set: {
            connectionStringEncrypted: encrypted,
            status: TENANT_STATUS.ACTIVE,
            updatedAt: new Date(),
          },
        });

      console.info(`  ${alreadyRegistered.has(org.id) ? 'refreshed' : 'created  '}  ${org.id}`);
    }

    console.info(`\n[registerTenants] ${orgs.length} organization(s) registered, all active`);
    console.info('[registerTenants] every org now resolves to the current database.');
  } finally {
    await pool.end().catch(() => {});
    if (controlPool !== pool) {
      await controlPool.end().catch(() => {});
    }
  }
}

/**
 * Only run when invoked as a script.
 *
 * Without this, importing the module (as a test does, to reach the cutover
 * guard) executes `main()` as a side effect — which tries to open a database
 * and calls `process.exit(1)` when it cannot, surfacing in vitest as an
 * unhandled rejection that can mask a real failure elsewhere in the run.
 */
const isDirectRun = process.argv[1]?.includes('registerTenants');

if (isDirectRun) {
  main().catch((error) => {
    console.error('[registerTenants] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
