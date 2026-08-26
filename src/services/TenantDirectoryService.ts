import type { TenantDb } from '@/libs/TenantDb';
import { eq } from 'drizzle-orm';
import { controlDb } from '@/libs/ControlDb';
import { Env } from '@/libs/Env';
import {
  decryptConnectionString as decryptStored,
  encryptConnectionString as encryptStored,
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
 * It means "this tenant uses DATABASE_URL", never a real connection string, so
 * nothing sensitive is stored unencrypted. It is only ever written, and only
 * ever honoured, while all organizations share one database — see
 * `autoRegisterTenant`.
 */

/**
 * `region` values used by the writers that point a row at the shared database.
 *
 * ⚠️ These are a CHEAP FIRST FILTER, not the guarantee. A2 shipped a guard that
 * trusted `region` alone, and it did not hold: the three writers disagree —
 * `autoRegisterTenant` writes 'shared', `registerTenants.ts` defaults to
 * 'aws-us-east-1', and `seed.ts` writes 'local'. So the rows the production
 * backfill actually created sailed straight past it.
 *
 * The real check is `pointsAtSharedDatabase` below, which inspects the
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
 * ⚠️ That guard is DEFERRED to A7, when source rows are deleted after a soak.
 * Until then, registering a brand-new org against the shared database is
 * correct: it has no data, nothing to migrate, and is indistinguishable from
 * any other org that has not been cut over. A global mode flag cannot express
 * this — under one, the first cutover made every NEW org 409 until an operator
 * intervened.
 */
async function autoRegisterTenant(orgId: string): Promise<TenantRecord | null> {
  // Registers against the SHARED database, deliberately.
  //
  // A new Clerk organization has no data yet and nothing to migrate, so the
  // shared database is the correct home for it until someone cuts it over. It
  // is then indistinguishable from any other not-yet-migrated org.
  //
  // This used to bail out whenever TENANCY_MODE was 'split', which meant that
  // once ANY organization had been cut over, every newly created organization
  // 409'd until an operator ran a script by hand. With a per-org split signal
  // there is no such mode, and no such cliff.
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

  // Resolves to this org's OWN database once it has been cut over, and to the
  // shared database until then. Per-org, so organizations move one at a time.
  const connectionString = resolveConnectionString(row.connectionStringEncrypted, row.region);

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
 * Whether a tenant row still points at the shared database.
 *
 * ── This is the split signal, and it is PER-ORG ─────────────────────────────
 *
 * A5 retired the global `TENANCY_MODE` from this decision. That flag made
 * "one organization at a time" impossible: flipping it to `split` made EVERY
 * organization not yet cut over fail with 409, because their rows still
 * pointed at the shared database. Migrating fifty dojos then meant one
 * simultaneous all-or-nothing switch with a single rollback point.
 *
 * The row already carries everything needed to decide. An organization is
 * "split" precisely when its own connection string names a database that is
 * neither the shared one nor the control plane. So cut-over orgs resolve to
 * their own databases while every other org keeps resolving to the shared one,
 * with no coordinated flag flip and no window where both apps must agree.
 *
 * ⚠️ The decision is made on the DECRYPTED CONNECTION STRING, never on
 * `region`. A2 shipped a guard that trusted the label and it silently failed:
 * `registerTenants` writes 'aws-us-east-1', which no shared-region set
 * contains, so production rows pointing straight at the shared database sailed
 * through. A label can be wrong; where the string actually points cannot.
 */
function pointsAtSharedDatabase(connectionString: string, region: string): boolean {
  if (connectionString === Env.DATABASE_URL || connectionString === Env.CONTROL_DATABASE_URL) {
    return true;
  }

  // Cheap secondary filter only — see the SHARED_REGIONS note above for why
  // this can never be the primary check.
  return SHARED_REGIONS.has(region);
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
/**
 * The connection string for a tenant row, or the shared database when the row
 * has not been cut over yet.
 *
 * Returning the shared string for a not-yet-migrated org is the whole point of
 * the per-org model: those organizations keep working, untouched, while others
 * move one at a time.
 */
function resolveConnectionString(stored: string, region: string): string {
  if (stored === SHARED_DATABASE_SENTINEL) {
    return Env.DATABASE_URL;
  }

  const decrypted = decryptConnectionString(stored);

  // A row whose string still names the shared database is not yet cut over.
  // Serve it from there rather than refusing — refusing is what forced the
  // all-or-nothing flip this replaced.
  return pointsAtSharedDatabase(decrypted, region) ? Env.DATABASE_URL : decrypted;
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
