/**
 * Report how much data one organization actually holds.
 *
 * ── Why this ships before the copy ──────────────────────────────────────────
 *
 * Nothing in this repo can currently answer "how big is an org?". The only
 * numeric hint is `DEFAULT_TRANSACTION_LIMIT = 500` in TransactionsService,
 * which implies the UI expects a full transaction history to fit in one page —
 * hundreds to low thousands. The seed is a 14-member fixture, not a scale
 * model, so sizing the copy off it would be guessing.
 *
 * Measure first, then choose a copy strategy with evidence.
 *
 * Read-only. Safe against production.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx src/scripts/measureTenant.ts --orgId=org_xxx
 *   ... --all     measure every organization
 */

import process from 'node:process';
import { Pool } from 'pg';
import { argValue, loadEnvFiles } from '../libs/EnvFiles';
import { orgScopePredicate, TENANT_TABLES } from '../services/TenantDataMap';

type TableMeasurement = {
  table: string;
  rows: number;
  bytes: number;
};

async function measureOrg(pool: Pool, orgId: string): Promise<TableMeasurement[]> {
  const out: TableMeasurement[] = [];

  for (const entry of TENANT_TABLES) {
    const predicate = orgScopePredicate(entry);
    // pg_column_size sums the on-disk width of each row, which is what makes
    // the fat columns visible: signed_waiver carries base64 signature images
    // and full rendered waiver text, so its BYTES dominate long before its row
    // count does.
    const { rows } = await pool.query<{ n: string; bytes: string }>(
      `SELECT count(*)::text AS n,
              COALESCE(sum(pg_column_size(t.*)), 0)::text AS bytes
       FROM "${entry.table}" t
       WHERE ${predicate}`,
      [orgId],
    );
    out.push({
      table: entry.table,
      rows: Number(rows[0]?.n ?? 0),
      bytes: Number(rows[0]?.bytes ?? 0),
    });
  }

  return out;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function report(orgId: string, measurements: TableMeasurement[]): void {
  const nonEmpty = measurements.filter(m => m.rows > 0).sort((a, b) => b.rows - a.rows);
  const totalRows = measurements.reduce((sum, m) => sum + m.rows, 0);
  const totalBytes = measurements.reduce((sum, m) => sum + m.bytes, 0);

  console.info(`\n${orgId}`);
  console.info(`  ${'table'.padEnd(28)} ${'rows'.padStart(8)}  ${'size'.padStart(9)}`);
  console.info(`  ${'-'.repeat(28)} ${'-'.repeat(8)}  ${'-'.repeat(9)}`);
  for (const m of nonEmpty) {
    console.info(`  ${m.table.padEnd(28)} ${String(m.rows).padStart(8)}  ${formatBytes(m.bytes).padStart(9)}`);
  }
  const empty = measurements.length - nonEmpty.length;
  if (empty > 0) {
    console.info(`  (${empty} table(s) empty)`);
  }
  console.info(`  ${'-'.repeat(28)} ${'-'.repeat(8)}  ${'-'.repeat(9)}`);
  console.info(`  ${'TOTAL'.padEnd(28)} ${String(totalRows).padStart(8)}  ${formatBytes(totalBytes).padStart(9)}`);
}

async function main(): Promise<void> {
  loadEnvFiles();

  const orgArg = argValue('orgId');
  const all = process.argv.includes('--all');

  if (!orgArg && !all) {
    console.error('Usage: measureTenant.ts --orgId=org_xxx   (or --all)');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, max: 1 });

  try {
    const orgIds = orgArg
      ? [orgArg]
      : (await pool.query<{ id: string }>('SELECT id FROM organization ORDER BY id')).rows.map(r => r.id);

    if (orgIds.length === 0) {
      console.info('No organizations found.');
      return;
    }

    for (const orgId of orgIds) {
      report(orgId, await measureOrg(pool, orgId));
    }

    console.info(
      '\nThe copy opens source and destination at once, so it cannot run on '
      + 'pglite-server (one connection). Use two Neon branches to test it.',
    );
  } finally {
    await pool.end();
  }
}

const isDirectRun = process.argv[1]?.includes('measureTenant');
if (isDirectRun) {
  main().catch((error) => {
    console.error('[measureTenant] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export { measureOrg };
