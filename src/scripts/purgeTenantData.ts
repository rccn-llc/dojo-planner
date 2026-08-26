/**
 * Delete ONE organization's rows from ONE database. Nothing else.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `seed.ts --reset` clears an org AND re-seeds it. There was no way to simply
 * remove an organization, and improvising one with hand-written DELETEs risks
 * both a missed table (orphaned rows) and a wrong order (FK violation).
 *
 * ── Safety ──────────────────────────────────────────────────────────────────
 *
 *  1. DRY RUN BY DEFAULT. It reports what it would delete and exits. Deleting
 *     requires `--confirm`, and the org id must be repeated via
 *     `--yes-delete=<orgId>` so a wrong id in scrollback cannot be re-run into
 *     a different organization.
 *  2. Row selection comes from `TenantDataMap` — the same authoritative map the
 *     copy tooling uses — walked in REVERSE (insert order reversed is FK-safe
 *     delete order), so no table is missed and nothing violates a constraint.
 *  3. ONE transaction. A failure part-way rolls back rather than leaving an
 *     organization half-deleted.
 *  4. It prints the target HOST before doing anything. Running this against the
 *     wrong database is the failure mode that matters.
 *
 * It does NOT touch the `tenant` directory row (control plane) — see the note
 * printed on completion.
 *
 * Usage:
 *   DATABASE_URL=<target> npx tsx src/scripts/purgeTenantData.ts --orgId=org_xxx
 *   DATABASE_URL=<target> npx tsx src/scripts/purgeTenantData.ts --orgId=org_xxx \
 *     --confirm --yes-delete=org_xxx
 */

import process from 'node:process';
import { Pool } from 'pg';
import { argValue, loadEnvFiles } from '../libs/EnvFiles';
import { orgScopePredicate, TENANT_TABLES } from '../services/TenantDataMap';

type TableCount = { table: string; rows: number };

/** Per-table row counts for this org, in the order they would be deleted. */
export async function countOrgRows(pool: Pool, orgId: string): Promise<TableCount[]> {
  const found: TableCount[] = [];

  // Reverse of insert order: children before parents.
  for (const entry of [...TENANT_TABLES].reverse()) {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "${entry.table}" WHERE ${orgScopePredicate(entry)}`,
      [orgId],
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) {
      found.push({ table: entry.table, rows: n });
    }
  }

  return found;
}

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).host;
  } catch {
    return '(unparseable connection string)';
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  const orgId = argValue('orgId');
  const confirm = process.argv.includes('--confirm');
  const yesDelete = argValue('yes-delete');

  if (!orgId) {
    console.error('Usage: purgeTenantData.ts --orgId=org_xxx [--confirm --yes-delete=org_xxx]');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. It must point at the database to purge.');
    process.exit(1);
  }

  console.info(`[purgeTenantData] org:    ${orgId}`);
  console.info(`[purgeTenantData] target: ${hostOf(connectionString)}`);
  console.info(`[purgeTenantData] mode:   ${confirm ? 'DELETE' : 'DRY RUN'}\n`);

  const pool = new Pool({ connectionString, max: 1 });

  try {
    const counts = await countOrgRows(pool, orgId);
    const total = counts.reduce((sum, c) => sum + c.rows, 0);

    if (total === 0) {
      console.info('[purgeTenantData] nothing to delete — this org holds no rows here.');
      return;
    }

    for (const c of counts) {
      console.info(`  ${c.table.padEnd(28)} ${String(c.rows).padStart(7)}`);
    }
    console.info(`  ${'-'.repeat(28)} ${'-'.repeat(7)}`);
    console.info(`  ${'TOTAL'.padEnd(28)} ${String(total).padStart(7)}\n`);

    if (!confirm) {
      console.info('[purgeTenantData] DRY RUN — nothing deleted.');
      console.info('To delete, re-run with BOTH flags:');
      console.info(`  --confirm --yes-delete=${orgId}`);
      return;
    }

    // The org id must be repeated. A --confirm recalled from shell history
    // cannot then delete a DIFFERENT organization than the one it was reviewed
    // against.
    if (yesDelete !== orgId) {
      console.error(
        `Refusing: --yes-delete must repeat the org id exactly.\n`
        + `  --orgId=${orgId}\n`
        + `  --yes-delete=${yesDelete ?? '(missing)'}`,
      );
      process.exit(1);
    }

    const client = await pool.connect();
    const startedAt = Date.now();

    try {
      // One transaction: a failure part-way rolls back rather than leaving the
      // organization half-deleted.
      await client.query('BEGIN');

      let deleted = 0;
      for (const entry of [...TENANT_TABLES].reverse()) {
        const result = await client.query(
          `DELETE FROM "${entry.table}" WHERE ${orgScopePredicate(entry)}`,
          [orgId],
        );
        deleted += result.rowCount ?? 0;
      }

      await client.query('COMMIT');
      console.info(`[purgeTenantData] deleted ${deleted} row(s) in ${Date.now() - startedAt}ms`);
      console.info('\nThe `organization` row and the control-plane `tenant` row are NOT touched.');
      console.info('The app auto-registers an unknown org against the shared database, so');
      console.info('leaving the tenant row is harmless — it will simply resolve to an org with no data.');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

const isDirectRun = process.argv[1]?.includes('purgeTenantData');

if (isDirectRun) {
  main().catch((error) => {
    console.error('[purgeTenantData] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
