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
import { argValue, hostOf, loadEnvFiles } from '../libs/EnvFiles';
import { decryptConnectionString, SHARED_DATABASE_SENTINEL, tenantEncryptionKey } from '../libs/TenantCrypto';
import { orgScopePredicate, TENANT_TABLES } from '../services/TenantDataMap';
import { assertDestinationHasData } from './cutoverTenant';

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

/**
 * Refuse to delete an organization's ONLY copy.
 *
 * Purging the SHARED database is only safe once the org is genuinely cut over
 * AND its own database holds the data. Without both, this deletes the single
 * remaining copy — the exact failure the un-deleted source rows exist to
 * prevent (they are the rollback until a soak passes).
 *
 * Purging a TENANT database is a different operation and stays allowed: that
 * is removing one org from its own database, which destroys nothing else.
 *
 * Reuses `assertDestinationHasData` (cutoverTenant) to confirm the org's own
 * database actually holds rows before this copy is removed.
 */
export async function assertSafeToPurgeShared(
  orgId: string,
  targetConnectionString: string,
  targetPool: Pool,
): Promise<void> {
  const controlConnectionString = process.env.CONTROL_DATABASE_URL ?? targetConnectionString;

  // ⚠️ Reuse the caller's pool when the control plane IS the target database.
  //
  // Locally both resolve to the same pglite-server, which accepts exactly ONE
  // connection — opening a second here killed the run with `read ECONNRESET`
  // after the row counts had already printed. Same class of bug as the
  // ControlPool sizing fix in A2: connection count is a property of the
  // deployment, not of what the code is logically doing.
  const sharesTargetDatabase = controlConnectionString === targetConnectionString;
  const controlPool = sharesTargetDatabase
    ? targetPool
    : new Pool({ connectionString: controlConnectionString, max: 1 });

  try {
    const { rows } = await controlPool.query<{ connection_string_enc: string }>(
      'SELECT connection_string_enc FROM tenant WHERE org_id = $1 LIMIT 1',
      [orgId],
    );

    const stored = rows[0]?.connection_string_enc;
    if (!stored) {
      throw new Error(
        `No tenant row for ${orgId} in the control database.\n`
        + 'Without one there is no way to prove this org has a database of its own,\n'
        + 'so purging here could delete its only copy.',
      );
    }

    // Where does this org's data actually live? The sentinel means "the shared
    // database", which is DATABASE_URL from the app's point of view.
    const key = tenantEncryptionKey();
    if (stored === SHARED_DATABASE_SENTINEL) {
      throw new Error(
        `${orgId} is NOT cut over — its tenant row names the shared database.\n`
        + 'Purging would delete the only copy of this organization\'s data.\n'
        + 'Cut it over first, or pass --i-know-this-is-the-only-copy if that is intended.',
      );
    }
    if (!key) {
      throw new Error('No encryption key, so the org\'s own database cannot be identified.');
    }

    const ownDatabase = decryptConnectionString(stored, key);

    // ONE question decides safety: is the database we are about to empty the
    // same one the org is served from? If so, this is its only copy — whether
    // that is because it was never cut over (row points at the shared database,
    // which is the target) or because the target IS its tenant database.
    if (ownDatabase === targetConnectionString) {
      throw new Error(
        `The target IS the database ${orgId} is served from.\n`
        + 'Purging it would delete the only copy of this organization\'s data.\n'
        + 'Pass --i-know-this-is-the-only-copy if you intend to wipe the org entirely.',
      );
    }

    // Different database. Prove the org's own copy exists before removing this
    // one — a cut-over row pointing at an EMPTY database would otherwise let
    // the source be deleted with nothing to fall back on.
    await assertDestinationHasData(ownDatabase, orgId);
  } finally {
    // Only close a pool this function opened; the caller owns theirs.
    if (!sharesTargetDatabase) {
      await controlPool.end().catch(() => {});
    }
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  const orgId = argValue('orgId');
  const confirm = process.argv.includes('--confirm');
  const yesDelete = argValue('yes-delete');
  // Deliberately verbose: an override that deletes an org's only copy should
  // be impossible to type by accident or to mistake in shell history.
  const onlyCopyOverride = process.argv.includes('--i-know-this-is-the-only-copy');

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

    // The guard runs BEFORE the confirmation gate, so a dry run reports the
    // refusal too — an operator should learn this is unsafe while reviewing,
    // not after typing --confirm.
    //
    // Runs for EVERY target. The guard itself decides whether this database is
    // the org's only copy: it refuses when the tenant row still points here,
    // and passes when the org owns a different, populated database. Purging a
    // TENANT database is therefore allowed — that row does not point at the
    // shared database, so the check clears.
    if (!onlyCopyOverride) {
      await assertSafeToPurgeShared(orgId, connectionString, pool);
    } else {
      console.warn('[purgeTenantData] ⚠️  --i-know-this-is-the-only-copy: safety guard BYPASSED.\n');
    }

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
