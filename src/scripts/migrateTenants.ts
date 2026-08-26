/**
 * Apply pending migrations to tenant databases.
 *
 * Replaces the `runMigrations()` call that used to sit in the root layout. That
 * mechanism was wrong for a multi-tenant world in three independent ways:
 *
 *   1. It ran during page render, so it had no tenant in scope.
 *   2. It SWALLOWED failures — logged a warning and let the app serve traffic
 *      against a stale schema.
 *   3. It raced across concurrent serverless instances.
 *
 * This script is the replacement. It belongs in the deploy pipeline BEFORE the
 * new version serves traffic, not inside the app.
 *
 * ── Phase A1 (now) ──────────────────────────────────────────────────────────
 * Every organization still resolves to one shared database, so this migrates
 * that single database. Behaviour is equivalent to the old `npm run db:migrate`.
 *
 * ── Phase A3 (later) ────────────────────────────────────────────────────────
 * A4 WILL read `tenant` rows with status='active' from the control plane and
 * loop, taking a pg advisory lock per tenant, connecting on each one's DIRECT
 * (non-pooled) URI — DDL under PgBouncer transaction pooling is unreliable —
 * and recording `schema_version` on success. The per-tenant result table and
 * non-zero exit below are already shaped for that.
 *
 * The fan-out is REAL as of A5: `resolveTenantTargets` enumerates every
 * `active` tenant row from the control plane and migrates each cut-over
 * database, then records the applied `schema_version` back onto its row. A
 * cut-over org that this script skipped would silently miss every future
 * migration, and nothing else in the system detects that.
 *
 * ⚠️ DDL runs over a DIRECT connection, not a pooled one. `provisionTenant`
 * stores the POOLED string (right for the app, wrong for DDL — PgBouncer
 * transaction pooling breaks multi-statement DDL), so `directUri` strips
 * Neon's `-pooler` host suffix before migrating.
 *
 * Usage:
 *   npx tsx src/scripts/migrateTenants.ts [--dry-run]
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { decryptConnectionString, tenantEncryptionKey } from '../libs/TenantCrypto';
import * as controlSchema from '../models/ControlSchema';
import { TENANT_STATUS, tenantSchema } from '../models/ControlSchema';

const MIGRATIONS_FOLDER = 'migrations';

type TenantTarget = {
  /** Label for output. The sentinel below during the shared-database phase. */
  orgId: string;
  connectionString: string;
};

type MigrationResult = {
  orgId: string;
  ok: boolean;
  error?: string;
  durationMs: number;
};

/** Label used while every organization shares one database. */
const SHARED_DATABASE_LABEL = '(shared database)';
const CONTROL_DATABASE_LABEL = '(control plane)';

function parseArgs(): { dryRun: boolean } {
  return { dryRun: process.argv.includes('--dry-run') };
}

/**
 * Targets to migrate.
 *
 * ── The control plane is a target too ───────────────────────────────────────
 *
 * It was previously omitted entirely, so a deployment that set
 * CONTROL_DATABASE_URL got an UNMIGRATED control database — no `tenant` table,
 * no `platform_config`, no `organization`. The first request would then fail on
 * a missing relation, and only at runtime.
 *
 * Both planes share `0000_baseline.sql`: every table exists in both, and each
 * plane simply ignores the ones it does not own. That keeps one migration
 * artifact rather than two divergent ones, which is what makes provisioning a
 * new tenant a copy of the same baseline.
 *
 * Phase A3 extends the tenant half of this with a control-plane query over
 * `tenant`. Keeping the shape (an array of targets) means the loop below does
 * not change.
 */
export function resolveTargets(): TenantTarget[] {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const targets: TenantTarget[] = [
    { orgId: SHARED_DATABASE_LABEL, connectionString },
  ];

  // Migrate the control plane FIRST when it is a distinct database: the tenant
  // directory lives there, and A3's fan-out will read it to discover the rest.
  const controlConnectionString = process.env.CONTROL_DATABASE_URL;
  if (controlConnectionString && controlConnectionString !== connectionString) {
    targets.unshift({ orgId: CONTROL_DATABASE_LABEL, connectionString: controlConnectionString });
  }

  return targets;
}

/**
 * Strip Neon's `-pooler` host suffix to get a DIRECT connection.
 *
 * DDL must not run through PgBouncer transaction pooling — multi-statement
 * migrations behave unreliably there. `provisionTenant` deliberately stores
 * the POOLED string because that is what the app should use, so the migrator
 * converts at the point of use rather than persisting a second column.
 *
 * A string with no `-pooler` is returned unchanged (already direct, or not a
 * Neon host at all).
 */
export function directUri(connectionString: string): string {
  return connectionString.replace('-pooler.', '.');
}

/**
 * Every cut-over tenant database, read from the control plane.
 *
 * Only `active` rows: a row still `provisioning` has no data and is not yet
 * servable, and a row in `migrating` is mid-copy — migrating either would race
 * the very operation that owns it.
 *
 * Returns an empty list (not an error) when there is no control plane or no
 * encryption key: that is the single-database phase, where the shared target
 * already covers everything.
 */
export async function resolveTenantTargets(): Promise<TenantTarget[]> {
  const controlConnectionString = process.env.CONTROL_DATABASE_URL;
  const sharedConnectionString = process.env.DATABASE_URL;

  if (!controlConnectionString || controlConnectionString === sharedConnectionString) {
    return [];
  }

  const key = tenantEncryptionKey();
  if (!key) {
    return [];
  }

  const pool = new Pool({ connectionString: controlConnectionString, max: 1 });

  try {
    const controlDb = drizzle(pool, { schema: controlSchema });
    const rows = await controlDb
      .select({ orgId: tenantSchema.orgId, encrypted: tenantSchema.connectionStringEncrypted })
      .from(tenantSchema)
      .where(eq(tenantSchema.status, TENANT_STATUS.ACTIVE));

    const targets: TenantTarget[] = [];

    for (const row of rows) {
      let decrypted: string;
      try {
        decrypted = decryptConnectionString(row.encrypted, key);
      } catch {
        // A row we cannot decrypt is either the shared-database sentinel or a
        // key mismatch. Skipping is correct for the former; for the latter the
        // readiness check is the right place to fail loudly, not the migrator.
        continue;
      }

      // Not cut over — the shared target already migrates this database, and
      // migrating it twice is wasted work rather than a hazard.
      if (decrypted === sharedConnectionString || decrypted === controlConnectionString) {
        continue;
      }

      targets.push({ orgId: row.orgId, connectionString: directUri(decrypted) });
    }

    return targets;
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * The newest migration tag, from the journal — the same source
 * `provisionTenant` uses, so the two always agree on what "current" means.
 */
function latestSchemaVersion(): string {
  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string }> };

  const latest = journal.entries.at(-1)?.tag;
  if (!latest) {
    throw new Error('migrations/meta/_journal.json has no entries.');
  }
  return latest;
}

/**
 * Record which migration a tenant database now holds.
 *
 * Without this, `schema_version` is read into `TenantRecord` and compared to
 * nothing, so the drift check the plan calls for has no writer.
 */
async function recordSchemaVersion(orgId: string, version: string): Promise<void> {
  const controlConnectionString = process.env.CONTROL_DATABASE_URL;
  if (!controlConnectionString) {
    return;
  }

  const pool = new Pool({ connectionString: controlConnectionString, max: 1 });

  try {
    const controlDb = drizzle(pool, { schema: controlSchema });
    await controlDb
      .update(tenantSchema)
      .set({ schemaVersion: version, schemaVersionAppliedAt: new Date(), updatedAt: new Date() })
      .where(eq(tenantSchema.orgId, orgId));
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * Migrate one database.
 *
 * Builds its OWN raw connection rather than importing `@/libs/DB`. That is
 * load-bearing: `db` is a Proxy that forwards a fixed set of properties, while
 * drizzle's `migrate()` reaches into undocumented internals (`dialect`,
 * `session`, `_`). Passing the Proxy would fail. The migrator must always hold
 * a real handle.
 */
async function migrateOne(target: TenantTarget): Promise<MigrationResult> {
  const startedAt = Date.now();
  const pool = new Pool({ connectionString: target.connectionString, max: 1 });

  try {
    const db = drizzle({ client: pool });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return { orgId: target.orgId, ok: true, durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      orgId: target.orgId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  // Control plane and shared database first, then every cut-over tenant. The
  // control plane must lead: the directory the fan-out reads lives there.
  const targets = [...resolveTargets(), ...await resolveTenantTargets()];

  console.info(`[migrateTenants] ${targets.length} target(s)${dryRun ? ' (dry run)' : ''}`);

  if (dryRun) {
    for (const target of targets) {
      console.info(`  would migrate: ${target.orgId}`);
    }
    return;
  }

  const version = latestSchemaVersion();
  const results: MigrationResult[] = [];

  for (const target of targets) {
    console.info(`[migrateTenants] migrating ${target.orgId}…`);
    const result = await migrateOne(target);
    results.push(result);

    // Record only for real tenants (the two labels are not orgIds), and only
    // on success — stamping a version onto a database that failed to migrate
    // would make the drift check assert something false.
    const isTenant = target.orgId !== SHARED_DATABASE_LABEL && target.orgId !== CONTROL_DATABASE_LABEL;
    if (result.ok && isTenant) {
      await recordSchemaVersion(target.orgId, version);
    }
  }

  console.info('\n[migrateTenants] results');
  for (const result of results) {
    const status = result.ok ? 'ok  ' : 'FAIL';
    console.info(`  ${status}  ${result.orgId}  (${result.durationMs}ms)`);
    if (!result.ok) {
      console.error(`        ${result.error}`);
    }
  }

  const failed = results.filter(result => !result.ok);
  if (failed.length > 0) {
    // Never swallow. A partial failure must fail the deploy, unlike the
    // log-and-continue behaviour this script replaces.
    console.error(`\n[migrateTenants] ${failed.length} of ${results.length} target(s) FAILED`);
    process.exit(1);
  }

  console.info(`\n[migrateTenants] all ${results.length} target(s) migrated`);
}

/**
 * Only run when invoked as a script.
 *
 * `resolveTargets` is exported for tests, and importing this module used to
 * execute `main()` as a side effect — which called `process.exit(1)` when it
 * could not reach a database. Vitest surfaced that as an unhandled rejection
 * that could have masked a real failure elsewhere in the run.
 */
const isDirectRun = process.argv[1]?.includes('migrateTenants');

if (isDirectRun) {
  main().catch((error) => {
    console.error('[migrateTenants] fatal', error);
    process.exit(1);
  });
}
