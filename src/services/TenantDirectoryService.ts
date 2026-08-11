import type { TenantDb } from '@/libs/TenantDb';
import { Buffer } from 'node:buffer';
import { createDecipheriv } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { controlDb } from '@/libs/ControlDb';
import { Env } from '@/libs/Env';
import { getTenantDb, invalidateTenantPool } from '@/libs/TenantDb';
import { TENANT_STATUS, tenantSchema } from '@/models/ControlSchema';

/**
 * Resolves a Clerk organization id to that organization's database.
 *
 * Caching mirrors `IQProConfigService` deliberately — bounded Map, 60s TTL,
 * FIFO eviction, explicit invalidation on write, reset hook for tests — so
 * there is one caching idiom in this codebase rather than two.
 *
 * What is cached here is a CONNECTION STRING, not a pooled connection; the
 * pools live in `libs/TenantDb` and are bounded separately.
 */

const CACHE_TTL_MS = 60_000;
const TENANT_CACHE_MAX = 200;

export type TenantRecord = {
  orgId: string;
  connectionString: string;
  region: string;
  status: string;
  schemaVersion: string | null;
};

type CacheEntry = { record: TenantRecord; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/** No `tenant` row, or the row is not yet provisioned. Routers map this to 409. */
export class TenantNotProvisionedError extends Error {
  constructor(orgId: string) {
    super(`No provisioned tenant database for organization ${orgId}`);
    this.name = 'TenantNotProvisionedError';
  }
}

/** Tenant exists but must not be served right now (migrating/suspended). → 503. */
export class TenantUnavailableError extends Error {
  constructor(orgId: string, status: string) {
    super(`Tenant ${orgId} is currently unavailable (status: ${status})`);
    this.name = 'TenantUnavailableError';
  }
}

/**
 * The control plane is missing its own tables — the directory cannot be read at
 * all. Distinct from "this org has no row": that is a data problem, this is a
 * deployment problem.
 */
export class ControlPlaneNotMigratedError extends Error {
  constructor(cause: unknown) {
    super(
      '[Tenancy] The control-plane `tenant` table does not exist. The database '
      + 'predates the control-plane DDL in migrations/0000_baseline.sql.\n'
      + '  Local dev:  rm -rf local.db && npm run dev   (then reseed)\n'
      + '  Deployed:   apply the CREATE TABLE statements at the end of\n'
      + '              migrations/0000_baseline.sql, since drizzle records the\n'
      + '              baseline as applied and will not re-run it.',
    );
    this.name = 'ControlPlaneNotMigratedError';
    this.cause = cause;
  }
}

/** Postgres "undefined_table". */
const PG_UNDEFINED_TABLE = '42P01';

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && ('code' in error
      ? (error as { code?: string }).code === PG_UNDEFINED_TABLE
      // pg nests the driver error under `cause` when drizzle re-wraps it.
      : (error as { cause?: { code?: string } }).cause?.code === PG_UNDEFINED_TABLE)
  );
}

// ---------- cache ----------

function cacheGet(orgId: string): TenantRecord | null {
  const entry = cache.get(orgId);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(orgId);
    return null;
  }
  return entry.record;
}

function cacheSet(orgId: string, record: TenantRecord): void {
  if (cache.size >= TENANT_CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
  cache.set(orgId, { record, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Drop cached tenant records (and their pools). Pass an orgId to target one,
 * or omit to clear everything — the latter is for tests.
 */
export function resetTenantDirectoryCache(orgId?: string): void {
  if (orgId) {
    cache.delete(orgId);
    invalidateTenantPool(orgId);
    return;
  }
  cache.clear();
}

// ---------- decryption ----------

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Decrypt a stored connection string.
 *
 * Mirrors `libs/Crypto.ts` byte-for-byte (same AES-256-GCM layout:
 * base64(iv || authTag || ciphertext)) but reads a DIFFERENT key: a database
 * connection string is a higher trust tier than a payment gateway id, so the
 * two secret domains are kept under separate keys. Falls back to the IQPro key
 * when `CONTROL_PLANE_ENCRYPTION_KEY` is unset so local dev keeps working.
 */
function decryptConnectionString(ciphertextB64: string): string {
  const hex = Env.CONTROL_PLANE_ENCRYPTION_KEY ?? Env.IQPRO_CONFIG_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'CONTROL_PLANE_ENCRYPTION_KEY is not set; cannot decrypt tenant connection strings',
    );
  }
  const key = Buffer.from(hex, 'hex');
  const buf = Buffer.from(ciphertextB64, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('encrypted connection string is too short');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// ---------- resolution ----------

/**
 * The local/dev single-tenant escape hatch.
 *
 * SECURITY: the NODE_ENV check is load-bearing. Without it, a production deploy
 * that happened to have DEFAULT_TENANT_DATABASE_URL set would silently route
 * EVERY organization to one database — exactly the cross-tenant leak this
 * architecture exists to prevent. Covered by an explicit unit test.
 */
function defaultTenantRecord(orgId: string): TenantRecord | null {
  if (Env.NODE_ENV === 'production') {
    return null;
  }
  const connectionString = Env.DEFAULT_TENANT_DATABASE_URL;
  if (!connectionString) {
    return null;
  }
  return {
    orgId,
    connectionString,
    region: 'local',
    status: TENANT_STATUS.ACTIVE,
    schemaVersion: null,
  };
}

/**
 * Look up one organization's tenant record.
 *
 * @throws TenantNotProvisionedError when no active row exists.
 * @throws TenantUnavailableError when the tenant is migrating or suspended.
 */
export async function resolveTenant(orgId: string): Promise<TenantRecord> {
  const escapeHatch = defaultTenantRecord(orgId);
  if (escapeHatch) {
    return escapeHatch;
  }

  const cached = cacheGet(orgId);
  if (cached) {
    return cached;
  }

  let row;
  try {
    row = await controlDb.query.tenantSchema.findFirst({
      where: eq(tenantSchema.orgId, orgId),
    });
  } catch (error) {
    // A missing `tenant` table is a deployment problem, not a data one. Raise
    // something that names the fix instead of letting a raw Postgres 42P01
    // surface as an opaque 500 on every RPC call.
    if (isMissingTableError(error)) {
      throw new ControlPlaneNotMigratedError(error);
    }
    throw error;
  }

  if (!row) {
    throw new TenantNotProvisionedError(orgId);
  }
  if (row.status !== TENANT_STATUS.ACTIVE) {
    // Not cached: a migrating tenant flips back to active shortly, and caching
    // the failure would extend the outage by up to the TTL.
    throw new TenantUnavailableError(orgId, row.status);
  }

  const record: TenantRecord = {
    orgId: row.orgId,
    connectionString: decryptConnectionString(row.connectionStringEncrypted),
    region: row.region,
    status: row.status,
    schemaVersion: row.schemaVersion,
  };

  cacheSet(orgId, record);
  return record;
}

/** Resolve an organization straight to a usable database handle. */
export async function getDbForOrg(orgId: string): Promise<TenantDb> {
  const tenant = await resolveTenant(orgId);
  return getTenantDb(orgId, tenant.connectionString);
}
