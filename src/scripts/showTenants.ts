/**
 * Print the tenant directory: which database each organization resolves to.
 *
 * Read-only. Prints the HOST only — never credentials.
 *
 * Usage:
 *   CONTROL_DATABASE_URL=<control> npx tsx src/scripts/showTenants.ts
 */

import process from 'node:process';
import { Pool } from 'pg';
import { loadEnvFiles } from '../libs/EnvFiles';
import { decryptConnectionString, SHARED_DATABASE_SENTINEL, tenantEncryptionKey } from '../libs/TenantCrypto';

async function main(): Promise<void> {
  loadEnvFiles();

  const connectionString = process.env.CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Neither CONTROL_DATABASE_URL nor DATABASE_URL is set.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, max: 1 });

  try {
    const { rows } = await pool.query<{
      org_id: string;
      display_name: string | null;
      status: string;
      region: string;
      connection_string_enc: string;
    }>('SELECT org_id, display_name, status, region, connection_string_enc FROM tenant ORDER BY org_id');

    if (rows.length === 0) {
      console.info('No tenant rows.');
      return;
    }

    const key = tenantEncryptionKey();

    for (const row of rows) {
      let host: string;
      if (row.connection_string_enc === SHARED_DATABASE_SENTINEL) {
        host = '(sentinel → shared database)';
      } else if (!key) {
        host = '(no encryption key configured)';
      } else {
        try {
          host = new URL(decryptConnectionString(row.connection_string_enc, key)).host;
        } catch {
          host = '(UNDECRYPTABLE — key mismatch?)';
        }
      }

      console.info(
        `${row.org_id}  |  ${(row.display_name ?? '(null)').padEnd(12)}  |  `
        + `${row.status.padEnd(12)}  |  ${row.region.padEnd(14)}  |  ${host}`,
      );
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

const isDirectRun = process.argv[1]?.includes('showTenants');

if (isDirectRun) {
  main().catch((error) => {
    console.error('[showTenants] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
