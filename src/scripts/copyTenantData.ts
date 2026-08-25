/**
 * Copy one organization's rows from the shared database into its own.
 *
 * ── Safety properties ───────────────────────────────────────────────────────
 *
 *  1. COPY ONLY — never deletes from the source. The shared rows ARE the
 *     rollback: if the copy or the soak goes wrong, repoint the tenant row back
 *     at the shared database and nothing has been lost. Source deletion is a
 *     later phase, after a soak has passed.
 *  2. The tenant row is flipped to `migrating` for the duration, which
 *     `resolveTenant` refuses (503). Both apps stop serving that org rather
 *     than reading a half-populated database.
 *  3. The destination writes run in ONE transaction. A failure rolls back to an
 *     empty database rather than leaving a partial org.
 *  4. Ids are preserved verbatim. Every PK is a text UUID with no sequence, so
 *     the copy is idempotent and the unenforced self-references
 *     (`waiver_template.parent_id`, `catalog_category.parent_id`) stay intact.
 *
 * ── What it does NOT copy ───────────────────────────────────────────────────
 *
 * `tenant`, `tenant_external_ref`, `platform_config` — see TenantDataMap. And
 * `organization` moves only its tenant-plane columns; the SaaS/Stripe columns
 * stay control-plane.
 *
 * Usage:
 *   DATABASE_URL=<source> CONTROL_DATABASE_URL=<control> \
 *   npx tsx src/scripts/copyTenantData.ts --orgId=org_xxx --target=<dest> [--dry-run]
 */

import process from 'node:process';
import { Pool } from 'pg';
import { argValue, loadEnvFiles } from '../libs/EnvFiles';
import { ORGANIZATION_TENANT_COLUMNS, orgScopePredicate, TENANT_TABLES } from '../services/TenantDataMap';

/** Rows per INSERT. Keeps parameter counts under Postgres's 65535 limit. */
const CHUNK_SIZE = 500;

type CopyResult = { table: string; rows: number };

/** Column names of `table`, in ordinal order, from the DESTINATION schema. */
async function columnsOf(pool: Pool, table: string): Promise<string[]> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return rows.map(r => r.column_name);
}

/**
 * Insert `values` into `table` in chunks.
 *
 * Postgres caps a statement at 65535 bytes-of-parameters; a wide table like
 * `signed_waiver` (base64 signature images) reaches that quickly, so the chunk
 * size is deliberately conservative rather than tuned.
 */
async function insertChunked(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  table: string,
  columns: string[],
  values: Record<string, unknown>[],
): Promise<void> {
  const quoted = columns.map(c => `"${c}"`).join(', ');

  for (let offset = 0; offset < values.length; offset += CHUNK_SIZE) {
    const chunk = values.slice(offset, offset + CHUNK_SIZE);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = columns.map((col) => {
        params.push(row[col] ?? null);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    await client.query(
      `INSERT INTO "${table}" (${quoted}) VALUES ${tuples.join(', ')}`,
      params,
    );
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  const orgId = argValue('orgId');
  const target = argValue('target');
  const dryRun = process.argv.includes('--dry-run');

  if (!orgId || !target) {
    console.error('Usage: copyTenantData.ts --orgId=org_xxx --target=<connection string> [--dry-run]');
    process.exit(1);
  }

  const sourceConnectionString = process.env.DATABASE_URL;
  if (!sourceConnectionString) {
    console.error('DATABASE_URL (the SOURCE) is not set.');
    process.exit(1);
  }

  // Refusing this is not pedantry: copying a database into itself would
  // duplicate every row and violate the PKs halfway through.
  if (target === sourceConnectionString) {
    console.error('--target is the same as DATABASE_URL. The destination must be a different database.');
    process.exit(1);
  }

  const source = new Pool({ connectionString: sourceConnectionString, max: 1 });
  const destination = new Pool({ connectionString: target, max: 1 });

  try {
    console.info(`[copyTenantData] org: ${orgId}`);
    console.info(`[copyTenantData] mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

    // Read everything from the source FIRST, before opening a destination
    // transaction. A read failure then costs nothing, and the transaction stays
    // as short as possible.
    const plan: Array<{ table: string; columns: string[]; values: Record<string, unknown>[] }> = [];

    // `organization` is special: only its tenant-plane columns may cross.
    const orgColumns = [...ORGANIZATION_TENANT_COLUMNS];
    const orgRows = await source.query<Record<string, unknown>>(
      `SELECT ${orgColumns.map(c => `"${c}"`).join(', ')} FROM "organization" WHERE id = $1`,
      [orgId],
    );
    if (orgRows.rows.length === 0) {
      console.error(`No organization row for ${orgId} in the source database.`);
      process.exit(1);
    }
    plan.push({ table: 'organization', columns: orgColumns, values: orgRows.rows });

    for (const entry of TENANT_TABLES) {
      const columns = await columnsOf(destination, entry.table);
      if (columns.length === 0) {
        console.error(`Destination has no "${entry.table}" table — apply the baseline first.`);
        process.exit(1);
      }
      const { rows } = await source.query<Record<string, unknown>>(
        `SELECT ${columns.map(c => `"${c}"`).join(', ')} FROM "${entry.table}" WHERE ${orgScopePredicate(entry)}`,
        [orgId],
      );
      plan.push({ table: entry.table, columns, values: rows });
    }

    const total = plan.reduce((sum, p) => sum + p.values.length, 0);
    for (const step of plan.filter(p => p.values.length > 0)) {
      console.info(`  ${step.table.padEnd(28)} ${String(step.values.length).padStart(7)}`);
    }
    console.info(`  ${'-'.repeat(28)} ${'-'.repeat(7)}`);
    console.info(`  ${'TOTAL'.padEnd(28)} ${String(total).padStart(7)}\n`);

    if (dryRun) {
      console.info('[copyTenantData] dry run — nothing written.');
      return;
    }

    // One transaction: a failure leaves an EMPTY destination, never a partial
    // organization. Insert order comes from TENANT_TABLES, which lists parents
    // before children (every FK is ON DELETE no action, so it is load-bearing).
    const client = await destination.connect();
    const startedAt = Date.now();
    try {
      await client.query('BEGIN');
      const results: CopyResult[] = [];
      for (const step of plan) {
        if (step.values.length > 0) {
          await insertChunked(client, step.table, step.columns, step.values);
        }
        results.push({ table: step.table, rows: step.values.length });
      }
      await client.query('COMMIT');
      console.info(`[copyTenantData] copied ${total} row(s) in ${Date.now() - startedAt}ms`);
      console.info('Next: verify the copy before flipping the tenant to active.');
      console.info(`  npm run db:verify-copy -- --orgId=${orgId} --target=<same target>`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await source.end();
    await destination.end();
  }
}

const isDirectRun = process.argv[1]?.includes('copyTenantData');
if (isDirectRun) {
  main().catch((error) => {
    console.error('[copyTenantData] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export { insertChunked };
