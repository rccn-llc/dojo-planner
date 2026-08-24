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
 * ⚠️ NONE of that happens yet. Today `resolveTargets` returns the control plane
 * plus the shared database, and `migrateOne` writes nothing back to `tenant`.
 * `provisionTenant.ts` is currently the only writer of `schema_version`, which
 * it sets for the one tenant it provisions. Read this paragraph as a design
 * note, not as a description of current behaviour.
 *
 * Usage:
 *   npx tsx src/scripts/migrateTenants.ts [--dry-run]
 */

import process from 'node:process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

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
  const targets = resolveTargets();

  console.info(`[migrateTenants] ${targets.length} target(s)${dryRun ? ' (dry run)' : ''}`);

  if (dryRun) {
    for (const target of targets) {
      console.info(`  would migrate: ${target.orgId}`);
    }
    return;
  }

  const results: MigrationResult[] = [];
  for (const target of targets) {
    console.info(`[migrateTenants] migrating ${target.orgId}…`);
    results.push(await migrateOne(target));
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
