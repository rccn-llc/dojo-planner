/**
 * Preflight: is a database ready for the tenant-connection-seam code?
 *
 * READ-ONLY. Safe to run against production at any time, including before the
 * new code is deployed.
 *
 * The seam needs two things that a pre-existing database does NOT have:
 *
 *   1. The control-plane tables (`tenant`, `tenant_external_ref`). These were
 *      appended to migrations/0000_baseline.sql, but drizzle records the
 *      baseline as applied by index and will never re-run it — so they must be
 *      applied by hand to any database that already existed.
 *   2. A `tenant` row per organization. Without one, every request for that org
 *      fails with TenantNotProvisionedError (HTTP 409).
 *
 * Run this BEFORE deploying, and again after remediating, until it reports
 * READY.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npm run db:check-tenants
 */

import { Buffer } from 'node:buffer';
import { createDecipheriv } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Pool } from 'pg';

/**
 * Decrypt exactly as TenantDirectoryService does — same AES-256-GCM layout,
 * same key fallback. If this succeeds, the deployed app can read the row;
 * if it throws, every request for that organization would 500.
 *
 * Checking that rows EXIST is not enough: rows written with a different key
 * than the deployed app reads are undecryptable, and that failure is invisible
 * until traffic hits it.
 */
function tryDecrypt(ciphertextB64: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const buf = Buffer.from(ciphertextB64, 'base64');
  if (buf.length < 12 + 16 + 1) {
    throw new Error('ciphertext too short');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

/** Load .env.local then .env; values already in the environment win. */
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
        continue;
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

function describeTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return '(unparseable connection string)';
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set, and no .env.local or .env supplied one.\n'
      + '  DATABASE_URL="postgresql://..." npm run db:check-tenants',
    );
  }

  const target = describeTarget(connectionString);
  console.info(`[check] target: ${target}\n`);

  const pool = new Pool({ connectionString, max: 1 });
  const problems: string[] = [];

  try {
    const tables = await pool
      .query<{ table_name: string }>(
        `select table_name from information_schema.tables
         where table_schema = 'public'
           and table_name in ('organization', 'tenant', 'tenant_external_ref')`,
      )
      .catch((error) => {
        const code = (error as { code?: string }).code;
        if (code === 'ECONNREFUSED') {
          throw new Error(
            `Cannot connect to ${target}.\n`
            + 'For the local database, start it first: npm run db-server:file',
          );
        }
        throw error;
      });

    const present = new Set(tables.rows.map(row => row.table_name));
    const mark = (ok: boolean) => (ok ? 'OK  ' : 'MISS');

    console.info('Schema:');
    console.info(`  ${mark(present.has('organization'))} organization`);
    console.info(`  ${mark(present.has('tenant'))} tenant`);
    console.info(`  ${mark(present.has('tenant_external_ref'))} tenant_external_ref`);

    if (!present.has('organization')) {
      problems.push(
        'No `organization` table — this database has never had migrations applied.\n'
        + '     Is DATABASE_URL pointing where you think it is?',
      );
    }

    if (!present.has('tenant') || !present.has('tenant_external_ref')) {
      problems.push(
        'Control-plane tables missing. Apply the DDL at the end of\n'
        + '     migrations/0000_baseline.sql to this database by hand — drizzle records\n'
        + '     the baseline as applied and will not re-run it.',
      );
    }

    if (present.has('organization') && present.has('tenant')) {
      const orgCount = await pool.query<{ n: number }>('select count(*)::int as n from organization');
      const tenantCount = await pool.query<{ n: number; active: number }>(
        `select count(*)::int as n,
                count(*) filter (where status = 'active')::int as active
         from tenant`,
      );

      console.info('\nData:');
      console.info(`  organizations : ${orgCount.rows[0]?.n ?? 0}`);
      console.info(`  tenant rows   : ${tenantCount.rows[0]?.n ?? 0} (${tenantCount.rows[0]?.active ?? 0} active)`);

      const unregistered = await pool.query<{ id: string }>(
        `select o.id from organization o
         left join tenant t on t.org_id = o.id
         where t.org_id is null
         order by o.id`,
      );

      if (unregistered.rows.length > 0) {
        console.info(`\n  ${unregistered.rows.length} organization(s) with NO tenant row:`);
        for (const row of unregistered.rows.slice(0, 10)) {
          console.info(`    ${row.id}`);
        }
        if (unregistered.rows.length > 10) {
          console.info(`    … and ${unregistered.rows.length - 10} more`);
        }
        problems.push(
          `${unregistered.rows.length} organization(s) have no tenant row and would fail\n`
          + '     with HTTP 409. Fix: npm run db:register-tenants',
        );
      }

      // The decisive check: can the stored rows actually be decrypted with the
      // key this environment resolves? Existence alone proves nothing — a row
      // written under a different key looks identical here and fails only when
      // real traffic arrives.
      const keyHex = process.env.CONTROL_PLANE_ENCRYPTION_KEY ?? process.env.IQPRO_CONFIG_ENCRYPTION_KEY;
      const rows = await pool.query<{ id: string; enc: string }>(
        'select org_id as id, connection_string_enc as enc from tenant order by org_id',
      );

      if (rows.rows.length > 0) {
        console.info('\nDecryption:');
        if (!keyHex) {
          console.info('  SKIP  no encryption key in this environment');
          problems.push(
            'Could not verify decryption: no CONTROL_PLANE_ENCRYPTION_KEY or\n'
            + '     IQPRO_CONFIG_ENCRYPTION_KEY set here. Re-run with the SAME key the\n'
            + '     deployed app uses, or rows may be unreadable in production.',
          );
        } else {
          const failed: string[] = [];
          for (const row of rows.rows) {
            try {
              const plain = tryDecrypt(row.enc, keyHex);
              if (!plain.startsWith('postgres')) {
                failed.push(`${row.id} (decrypted to something that is not a connection string)`);
              }
            } catch {
              failed.push(row.id);
            }
          }
          if (failed.length === 0) {
            console.info(`  OK    all ${rows.rows.length} row(s) decrypt with this key`);
          } else {
            console.info(`  FAIL  ${failed.length} of ${rows.rows.length} row(s) do NOT decrypt`);
            for (const id of failed.slice(0, 5)) {
              console.info(`          ${id}`);
            }
            problems.push(
              `${failed.length} tenant row(s) cannot be decrypted with the key in this\n`
              + '     environment. They were written under a DIFFERENT key. Re-run\n'
              + '     `npm run db:register-tenants` with the key the deployed app uses,\n'
              + '     or every request for those orgs will 500.',
            );
          }
        }
      }

      const inactive = await pool.query<{ id: string; status: string }>(
        `select org_id as id, status from tenant where status <> 'active' order by org_id`,
      );
      if (inactive.rows.length > 0) {
        console.info(`\n  ${inactive.rows.length} tenant row(s) not active:`);
        for (const row of inactive.rows.slice(0, 10)) {
          console.info(`    ${row.id} (${row.status})`);
        }
        problems.push(
          `${inactive.rows.length} tenant row(s) are not 'active' and would fail with\n`
          + '     HTTP 503 until their status is corrected.',
        );
      }
    }

    console.info('');
    if (problems.length === 0) {
      console.info('READY — this database can serve the tenant-seam code.');
      return;
    }

    console.info(`NOT READY — ${problems.length} problem(s):\n`);
    problems.forEach((problem, index) => {
      console.info(`  ${index + 1}. ${problem}\n`);
    });
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[check] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
