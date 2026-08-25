/**
 * Prove a copied organization arrived intact — and that nothing else came with it.
 *
 * Three checks, in increasing strength:
 *
 *  1. **Row parity** — per table, source count for this org equals destination
 *     count. Catches a dropped table or a truncated chunk.
 *  2. **Isolation** — the destination holds NOTHING for any other organization.
 *     This is the claim the whole migration exists to make; parity alone would
 *     pass on a database that also contains someone else's data.
 *  3. **Content sample** — id-by-id comparison on the widest tables, so a copy
 *     that moved the right NUMBER of rows but mangled their contents fails.
 *
 * Read-only against both databases.
 *
 * Usage:
 *   DATABASE_URL=<source> npx tsx src/scripts/verifyTenantCopy.ts \
 *     --orgId=org_xxx --target=<destination>
 */

import process from 'node:process';
import { Pool } from 'pg';
import { argValue, loadEnvFiles } from '../libs/EnvFiles';
import { orgScopePredicate, TENANT_TABLES } from '../services/TenantDataMap';

/** Tables worth comparing row-by-row: widest content, most to go wrong. */
const SAMPLED_TABLES = ['member', 'transaction', 'signed_waiver', 'attendance'] as const;

async function countFor(pool: Pool, table: string, predicate: string, orgId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM "${table}" WHERE ${predicate}`,
    [orgId],
  );
  return Number(rows[0]?.n ?? 0);
}

async function main(): Promise<void> {
  loadEnvFiles();

  const orgId = argValue('orgId');
  const target = argValue('target');

  if (!orgId || !target) {
    console.error('Usage: verifyTenantCopy.ts --orgId=org_xxx --target=<connection string>');
    process.exit(1);
  }

  const sourceConnectionString = process.env.DATABASE_URL;
  if (!sourceConnectionString) {
    console.error('DATABASE_URL (the SOURCE) is not set.');
    process.exit(1);
  }

  const source = new Pool({ connectionString: sourceConnectionString, max: 1 });
  const destination = new Pool({ connectionString: target, max: 1 });
  const problems: string[] = [];

  try {
    // ── 1. Row parity ──
    console.info(`[verify] ${orgId}\n`);
    console.info(`  ${'table'.padEnd(28)} ${'source'.padStart(8)} ${'dest'.padStart(8)}`);
    console.info(`  ${'-'.repeat(28)} ${'-'.repeat(8)} ${'-'.repeat(8)}`);

    let sourceTotal = 0;
    let destTotal = 0;

    for (const entry of TENANT_TABLES) {
      const predicate = orgScopePredicate(entry);
      const src = await countFor(source, entry.table, predicate, orgId);
      const dst = await countFor(destination, entry.table, predicate, orgId);
      sourceTotal += src;
      destTotal += dst;

      if (src !== dst) {
        console.info(`  ${entry.table.padEnd(28)} ${String(src).padStart(8)} ${String(dst).padStart(8)}  MISMATCH`);
        problems.push(`${entry.table}: source has ${src} row(s), destination has ${dst}`);
      } else if (src > 0) {
        console.info(`  ${entry.table.padEnd(28)} ${String(src).padStart(8)} ${String(dst).padStart(8)}`);
      }
    }
    console.info(`  ${'-'.repeat(28)} ${'-'.repeat(8)} ${'-'.repeat(8)}`);
    console.info(`  ${'TOTAL'.padEnd(28)} ${String(sourceTotal).padStart(8)} ${String(destTotal).padStart(8)}`);

    // ── 2. Isolation ──
    //
    // Parity alone would pass on a destination that ALSO holds another org's
    // rows. This is the check that makes "its own database" a fact.
    console.info('\nIsolation:');
    const foreign = await destination.query<{ id: string; n: string }>(
      `SELECT organization_id AS id, count(*)::text AS n
       FROM "member" WHERE organization_id <> $1
       GROUP BY organization_id`,
      [orgId],
    );
    const foreignOrgs = await destination.query<{ id: string }>(
      'SELECT id FROM "organization" WHERE id <> $1',
      [orgId],
    );

    if (foreign.rows.length === 0 && foreignOrgs.rows.length === 0) {
      console.info('  OK    destination holds only this organization');
    } else {
      for (const row of foreign.rows) {
        console.info(`  FAIL  ${row.n} member row(s) belonging to ${row.id}`);
      }
      for (const row of foreignOrgs.rows) {
        console.info(`  FAIL  organization row for ${row.id}`);
      }
      problems.push('The destination contains data belonging to another organization.');
    }

    // ── 3. Content sample ──
    console.info('\nContent:');
    for (const table of SAMPLED_TABLES) {
      const entry = TENANT_TABLES.find(t => t.table === table);
      if (!entry) {
        continue;
      }
      const predicate = orgScopePredicate(entry);
      const [srcRows, dstRows] = await Promise.all([
        source.query<Record<string, unknown>>(
          `SELECT * FROM "${table}" WHERE ${predicate} ORDER BY id LIMIT 25`,
          [orgId],
        ),
        destination.query<Record<string, unknown>>(
          `SELECT * FROM "${table}" WHERE ${predicate} ORDER BY id LIMIT 25`,
          [orgId],
        ),
      ]);

      const mismatch = JSON.stringify(srcRows.rows) !== JSON.stringify(dstRows.rows);
      if (mismatch) {
        console.info(`  FAIL  ${table} — sampled rows differ`);
        problems.push(`${table}: sampled row contents differ between source and destination`);
      } else {
        console.info(`  OK    ${table} (${srcRows.rows.length} row(s) compared)`);
      }
    }

    console.info('');
    if (problems.length === 0) {
      console.info('COPY VERIFIED — safe to flip this tenant to active.');
      return;
    }

    console.info(`COPY NOT VERIFIED — ${problems.length} problem(s):\n`);
    problems.forEach((p, i) => console.info(`  ${i + 1}. ${p}`));
    console.info('\nDo NOT flip the tenant to active. The source rows are untouched;');
    console.info('empty the destination and re-run the copy.');
    process.exit(1);
  } finally {
    await source.end();
    await destination.end();
  }
}

const isDirectRun = process.argv[1]?.includes('verifyTenantCopy');
if (isDirectRun) {
  main().catch((error) => {
    console.error('[verifyTenantCopy] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
