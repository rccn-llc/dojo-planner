import type { TenantDb } from '@/libs/TenantDb';
import { eq } from 'drizzle-orm';
import { controlDb } from '@/libs/ControlDb';
import { Env } from '@/libs/Env';
import { sharesTenantDatabase } from '@/libs/TenancyMode';
import {
  decryptConnectionString as decryptStored,
  encryptConnectionString as encryptStored,
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

/**
 * A tenant row predates the split: it still carries the shared-database
 * sentinel, so there is no real per-org connection string to open. → 409.
 *
 * Typed rather than a bare Error because the RPC layer maps only known tenancy
 * errors; an untyped throw became an unexplained 500 with nothing logged, which
 * is the opposite of the loud failure this mode is supposed to produce.
 */
export class TenantNotMigratedError extends Error {
  constructor() {
    super(
      '[Tenancy] A tenant row still carries the shared-database marker, but '
      + 'TENANCY_MODE is "split". That row predates the split and must be '
      + 're-provisioned with a real connection string before this '
      + 'organization can be served.',
    );
    this.name = 'TenantNotMigratedError';
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
 * It means "this tenant uses DATABASE_URL", never a real connection string, so
 * nothing sensitive is stored unencrypted. It is only ever written, and only
 * ever honoured, while all organizations share one database — see
 * `autoRegisterTenant`.
 */
const SHARED_DATABASE_SENTINEL = '__shared_database__';

/**
 * `region` values used by the writers that point a row at the shared database.
 *
 * ⚠️ These are a CHEAP FIRST FILTER, not the guarantee. A2 shipped a guard that
 * trusted `region` alone, and it did not hold: the three writers disagree —
 * `autoRegisterTenant` writes 'shared', `registerTenants.ts` defaults to
 * 'aws-us-east-1', and `seed.ts` writes 'local'. So the rows the production
 * backfill actually created sailed straight past it.
 *
 * The real check is `assertNotSharedDatabase` below, which inspects the
 * DECRYPTED connection string. A label can be wrong; where the string actually
 * points cannot.
 */
const SHARED_REGIONS = new Set(['shared', 'local']);

/**
 * Decrypt a stored connection string.
 *
 * Wraps the shared helper to keep the "no key configured" case as a clear,
 * actionable error on the read path — where a missing key is always fatal,
 * unlike in `autoRegisterTenant`, which degrades to a sentinel.
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
 * Auto-register an organization against the CURRENT shared database.
 *
 * A Clerk organization can be created at any moment — self-serve signup, an
 * admin in the Clerk dashboard, an E2E fixture — and none of those paths know
 * about this app's tenant directory. Without auto-registration the dashboard is
 * simply dead for a new organization until someone runs a script by hand.
 *
 * This mirrors what the app already does for the `organization` row itself,
 * which several services create lazily by upsert.
 *
 * ── Why this is safe during the no-op phase ─────────────────────────────────
 *
 * Every organization currently resolves to one shared database, so registering
 * a new one against that same database grants no access it did not already
 * have — before this phase, an org simply used the shared connection directly.
 *
 * ── Why it must be REMOVED before tenants are split (phase A3/A4) ───────────
 *
 * Once organizations have their own databases, silently pointing an unknown org
 * at the shared one would be a cross-tenant leak. From A3, provisioning becomes
 * explicit (`provisionTenant.ts` creates a real Neon project) and a missing row
 * must once again be a hard `TenantNotProvisionedError`.
 *
 * The mode guard enforces exactly that: auto-registration is disabled the
 * moment TENANCY_MODE is 'split', which is the explicit signal that the planes
 * have been separated. It is deliberately NOT derived from the connection
 * strings — during a staged rollout CONTROL_DATABASE_URL is populated and
 * migrated while the deployment still serves traffic in 'shared' mode.
 */
async function autoRegisterTenant(orgId: string): Promise<TenantRecord | null> {
  const sharesOneDatabase = sharesTenantDatabase();

  if (!sharesOneDatabase) {
    // The planes are separate: provisioning is explicit from here on.
    return null;
  }

  const connectionString = Env.DATABASE_URL;
  const key = tenantEncryptionKey();

  // Encrypt when a key is available, but do NOT require one. While every
  // organization resolves to `DATABASE_URL`, the stored string is a value the
  // process already holds in plaintext — encrypting it protects nothing, and
  // demanding a key would make the app unusable in any environment that has
  // not configured one (CI being the obvious case).
  //
  // The sentinel below is recognised by the read path. It cannot leak a real
  // per-tenant connection string, because auto-registration is disabled the
  // moment the planes are separated.
  const stored = key
    ? encryptStored(connectionString, key)
    : SHARED_DATABASE_SENTINEL;

  await controlDb
    .insert(tenantSchema)
    .values({
      orgId,
      displayName: null,
      connectionStringEncrypted: stored,
      region: 'shared',
      status: TENANT_STATUS.ACTIVE,
      schemaVersion: null,
    })
    // Concurrent first requests race here; last write wins and both proceed.
    .onConflictDoNothing({ target: tenantSchema.orgId });

  console.info('[Tenancy] auto-registered organization against the shared database', { orgId });

  return {
    orgId,
    connectionString,
    region: 'shared',
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
    // A Clerk organization that this app has never seen. While all
    // organizations share one database, register it rather than failing — see
    // autoRegisterTenant for why this is safe now and must go in phase A3.
    const registered = await autoRegisterTenant(orgId);
    if (registered) {
      cacheSet(orgId, registered);
      return registered;
    }
    throw new TenantNotProvisionedError(orgId);
  }
  if (row.status !== TENANT_STATUS.ACTIVE) {
    // Not cached: a migrating tenant flips back to active shortly, and caching
    // the failure would extend the outage by up to the TTL.
    throw new TenantUnavailableError(orgId, row.status);
  }

  const connectionString = resolveConnectionString(row.connectionStringEncrypted);

  // Structural check, AFTER decryption: does this row actually point somewhere
  // of its own? A region label cannot answer that; the string itself can.
  assertNotSharedDatabase(connectionString, row.region);

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
 * In shared mode (`sharesTenantDatabase() === true`) this is a no-op and returns
 * immediately: shared-era rows are expected and accepted in that deployment
 * mode.
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
function assertNotSharedDatabase(connectionString: string, region: string): void {
  if (sharesTenantDatabase()) {
    return;
  }

  if (connectionString === Env.DATABASE_URL || connectionString === Env.CONTROL_DATABASE_URL) {
    throw new TenantNotMigratedError();
  }

  // Belt and braces: a row still carrying a shared-era region label has not
  // been re-provisioned even if its string happens to differ.
  if (SHARED_REGIONS.has(region)) {
    throw new TenantNotMigratedError();
  }
}

/**
 * Turn a stored `connection_string_enc` value into a usable connection string.
 *
 * Handles the sentinel written by key-less auto-registration, which means
 * "this tenant uses DATABASE_URL". Honouring it is refused once the planes are
 * separated: at that point a sentinel row is stale data from the shared-database
 * era, and silently routing that organization to the control database would be
 * a cross-tenant leak.
 */
function resolveConnectionString(stored: string): string {
  if (stored !== SHARED_DATABASE_SENTINEL) {
    return decryptConnectionString(stored);
  }

  if (!sharesTenantDatabase()) {
    throw new TenantNotMigratedError();
  }

  return Env.DATABASE_URL;
}

/** Resolve an organization straight to a usable database handle. */
export async function getDbForOrg(orgId: string): Promise<TenantDb> {
  const tenant = await resolveTenant(orgId);
  return getTenantDb(orgId, tenant.connectionString);
}
