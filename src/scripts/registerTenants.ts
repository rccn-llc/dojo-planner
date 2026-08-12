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

import { Buffer } from 'node:buffer';
import { createCipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
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

/** Mirrors libs/Crypto.ts: base64(iv(12) || authTag(16) || ciphertext). */
function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `Encryption key must be 32 bytes (64 hex chars); got ${key.length} bytes. `
      + 'Generate one with: openssl rand -hex 32',
    );
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
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

  // Which database this is about to write to matters a great deal — print the
  // host (never the password) so a production run is unmistakable.
  const target = (() => {
    try {
      const url = new URL(connectionString);
      return `${url.hostname}${url.pathname}`;
    } catch {
      return '(unparseable connection string)';
    }
  })();
  console.info(`[registerTenants] target: ${target}`);

  const keyHex = process.env.CONTROL_PLANE_ENCRYPTION_KEY ?? process.env.IQPRO_CONFIG_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      'No encryption key. Set CONTROL_PLANE_ENCRYPTION_KEY (preferred) or '
      + 'IQPRO_CONFIG_ENCRYPTION_KEY.\n'
      + 'It MUST match what the deployed app reads, or it cannot decrypt these rows.',
    );
  }

  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle({ client: pool, schema: { organizationSchema, tenantSchema } });

  try {
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
    const existing = await db.select({ orgId: tenantSchema.orgId }).from(tenantSchema).catch((error) => {
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
      const encrypted = encrypt(connectionString, keyHex);

      await db
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
  }
}

main().catch((error) => {
  console.error('[registerTenants] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
