import type { TenantDb } from '@/libs/TenantDb';
import { and, eq, inArray } from 'drizzle-orm';
import { controlDb } from '@/libs/ControlDb';
import { Env } from '@/libs/Env';
import {
  decryptConnectionString as decryptStored,
  SHARED_DATABASE_SENTINEL,
  tenantEncryptionKey,
} from '@/libs/TenantCrypto';
import { getTenantDb, invalidateTenantPool } from '@/libs/TenantDb';
import { TENANT_STATUS, tenantSchema } from '@/models/ControlSchema';

/**
 * Resolves a Clerk organization id to that organization's database.
 *
 * Caching mirrors `PaymentProviderConfigService` deliberately — bounded Map, 60s TTL,
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

/**
 * Marker stored in place of ciphertext when an organization was auto-registered
 * without an encryption key available.
 *
 * ⚠️ HISTORICAL. It meant "this tenant uses the shared database", which no
 * longer exists as a concept — every organization has its own. Nothing writes
 * it any more, and `resolveConnectionString` REFUSES a row still carrying it
 * rather than guessing. Kept only to recognise such a row and fail clearly.
 */

/**
 * Decrypt a stored connection string.
 *
 * Wraps the shared helper to keep the "no key configured" case as a clear,
 * actionable error on the read path, where a missing key is always fatal: a
 * row that cannot be decrypted cannot be served.
 */
function decryptConnectionString(ciphertextB64: string): string {
  const key = tenantEncryptionKey();
  if (!key) {
    throw new Error(
      'CONTROL_PLANE_ENCRYPTION_KEY is not set; cannot decrypt tenant connection strings',
    );
  }
  return decryptStored(ciphertextB64, key);
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
 * @throws TenantNotProvisionedError when no active row exists and the
 *   organization cannot be auto-registered.
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
    // FAIL CLOSED. An organization is provisioned deliberately — its database
    // is created and its `tenant` row written before anyone can sign in — so a
    // missing row means something is wrong, not that a default should be
    // guessed at.
    //
    // This used to auto-register the org against a shared database. That was
    // right while every org lived in one database; now it would silently route
    // an organization at a database nobody chose, which is the exact class of
    // fault this architecture exists to make impossible.
    throw new TenantNotProvisionedError(orgId);
  }
  if (row.status !== TENANT_STATUS.ACTIVE) {
    // Not cached: a migrating tenant flips back to active shortly, and caching
    // the failure would extend the outage by up to the TTL.
    throw new TenantUnavailableError(orgId, row.status);
  }

  // This org's own database. There is no shared fallback any more.
  const connectionString = resolveConnectionString(row.connectionStringEncrypted);

  const record: TenantRecord = {
    orgId: row.orgId,
    connectionString,
    region: row.region,
    status: row.status,
    schemaVersion: row.schemaVersion,
  };

  cacheSet(orgId, record);
  return record;
}

/**
 * Refuse a row that does not point at a database of its own.
 *
 * Split mode means one database per organization. A row whose connection string
 * resolves to the SHARED database is not a provisioned tenant — it is leftover
 * data from the shared-database era, and serving it routes that organization
 * into everyone else's data.
 *
 * Checks the decrypted string rather than the `region` label because the label
 * is written inconsistently by three different code paths (see SHARED_REGIONS)
 * and is trivially wrong. `registerTenants.ts` in particular writes a plausible
 * real region onto rows that all share one connection string.
 */

/**
 * Turn a stored `connection_string_enc` value into a usable connection string.
 *
 * Handles the sentinel written by key-less auto-registration, which means
 * "this tenant uses DATABASE_URL". Honouring it is refused once the planes are
 * separated: at that point a sentinel row is stale data from the shared-database
 * era, and silently routing that organization to the control database would be
 * a cross-tenant leak.
 */
/**
 * The connection string for a tenant row, or the shared database when the row
 * has not been cut over yet.
 *
 * Returning the shared string for a not-yet-migrated org is the whole point of
 * the per-org model: those organizations keep working, untouched, while others
 * move one at a time.
 */
function resolveConnectionString(stored: string): string {
  // No shared-database fallback. Every organization is provisioned onto its
  // own database before anyone can sign in, so a row that does not name a real
  // per-tenant database is a fault to surface, not a case to accommodate.
  //
  // The sentinel and the `pointsAtSharedDatabase` check both existed for the
  // migration window, when orgs lived in one database and moved out one at a
  // time. That window is closed.
  if (stored === SHARED_DATABASE_SENTINEL) {
    throw new TenantNotProvisionedError(stored);
  }

  return decryptConnectionString(stored);
}

/** Resolve an organization straight to a usable database handle. */
/**
 * Host of a connection string, for logging. NEVER the credentials.
 *
 * If an org is served from the wrong database the symptom is empty reads and
 * successful-looking writes — silent divergence with nothing in the logs to
 * catch it. One host per resolution is the cheapest possible detector.
 */
export function connectionHost(connectionString: string): string {
  try {
    return new URL(connectionString).host || 'unknown';
  } catch {
    // Never let a logging concern break a database resolution.
    return 'unparseable';
  }
}

export async function getDbForOrg(orgId: string): Promise<TenantDb> {
  const tenant = await resolveTenant(orgId);

  console.info('[Tenancy] resolved', { orgId, dbHost: connectionHost(tenant.connectionString) });

  return getTenantDb(orgId, tenant.connectionString);
}

/**
 * Which of `orgIds` have a servable database of their own.
 *
 * The organization switcher lists Clerk memberships, but a Clerk organization
 * is not usable until it has been provisioned: `resolveTenant` fails closed on
 * an unknown org, so selecting one would 409 the whole dashboard. Filtering the
 * list is how that dead end is kept off the screen.
 *
 * Returns only orgs whose row is `active` — one still `provisioning`, or frozen
 * `migrating` mid-copy, is deliberately excluded: both would refuse to serve.
 *
 * Reads the CONTROL plane, so it needs no tenant scope and works during an RSC
 * render.
 */
export async function filterProvisionedOrgs(orgIds: string[]): Promise<string[]> {
  if (orgIds.length === 0) {
    return [];
  }

  const rows = await controlDb
    .select({ orgId: tenantSchema.orgId })
    .from(tenantSchema)
    .where(and(inArray(tenantSchema.orgId, orgIds), eq(tenantSchema.status, TENANT_STATUS.ACTIVE)));

  return rows.map(row => row.orgId);
}
