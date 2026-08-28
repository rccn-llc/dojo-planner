import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '@/models/Schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as fullSchema from '@/models/Schema';
import { getControlPool, isControlPlaneConnection } from './ControlPool';

/** A database handle scoped to one organization. Same type as the old global. */
export type TenantDb = NodePgDatabase<typeof schema>;

type PoolEntry = {
  db: TenantDb;
  pool: Pool;
  lastUsedAt: number;
  /** Kept so entries pointing at the same database can share one socket. */
  connectionString: string;
};

/**
 * Per-organization connection pools, bounded and LRU-evicted.
 *
 * Each pool keeps `max: 1`, matching the single-connection posture the app has
 * always had: on serverless each
 * instance handles one request at a time, and Neon's PgBouncer endpoint does
 * the real pooling upstream. The cache bound is therefore what keeps total
 * connections predictable — at most MAX_POOLS sockets per Node process,
 * regardless of how many organizations that process has served.
 */
const MAX_POOLS = Number(process.env.TENANT_POOL_MAX ?? 12);
const IDLE_CLOSE_MS = 5 * 60_000;

// Survive Next.js hot-module reloads in development, exactly as the previous
// global `db` singleton did — otherwise every HMR cycle leaks a pool.
const globalForPools = globalThis as unknown as { tenantPools?: Map<string, PoolEntry> };
const pools: Map<string, PoolEntry> = (globalForPools.tenantPools ??= new Map<string, PoolEntry>());

/** An existing entry already connected to `connectionString`, if any. */
function findPoolByConnectionString(connectionString: string): PoolEntry | undefined {
  for (const entry of pools.values()) {
    if (entry.connectionString === connectionString) {
      return entry;
    }
  }
  return undefined;
}

/** How many cached entries share this pool instance. */
function refCount(pool: Pool): number {
  let count = 0;
  for (const entry of pools.values()) {
    if (entry.pool === pool) {
      count++;
    }
  }
  return count;
}

function evictIfNeeded(): void {
  while (pools.size >= MAX_POOLS) {
    // Map preserves insertion order, and `getTenantDb` re-inserts on hit, so
    // the first key is the least-recently-used.
    const oldestKey = pools.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }
    const entry = pools.get(oldestKey);
    pools.delete(oldestKey);
    // Only close the socket when no other organization still points at it —
    // several orgs share one pool while they share one database.
    if (entry && refCount(entry.pool) === 0 && entry.pool !== getControlPool()) {
      void entry.pool.end().catch(() => {
        // Closing an already-broken pool is not actionable.
      });
    }
  }
}

/**
 * Get (or open) the pooled connection for one organization.
 *
 * `connectionString` is supplied by the caller rather than looked up here so
 * this module stays free of database and cache concerns — see
 * `TenantDirectoryService.getDbForOrg`, which is the intended entry point.
 */
export function getTenantDb(orgId: string, connectionString: string): TenantDb {
  const existing = pools.get(orgId);
  if (existing) {
    existing.lastUsedAt = Date.now();
    // Re-insert to move this key to the end (most-recently-used).
    pools.delete(orgId);
    pools.set(orgId, existing);
    return existing.db;
  }

  // While every organization still resolves to the SAME database, opening a
  // fresh pool per org would multiply connections against one server for no
  // benefit — and pglite-server (local dev) accepts exactly one connection, so
  // the second is refused mid-query as `read ECONNRESET`. Reuse whichever pool
  // already targets this connection string.
  //
  // Once tenants are genuinely separate databases their connection strings
  // differ, so this lookup naturally stops matching and each org gets its own
  // pool.
  const shared = findPoolByConnectionString(connectionString);
  if (shared) {
    evictIfNeeded();
    const entry: PoolEntry = { db: shared.db, pool: shared.pool, lastUsedAt: Date.now(), connectionString };
    pools.set(orgId, entry);
    return entry.db;
  }

  evictIfNeeded();

  // When the tenant database IS the control-plane database — true throughout
  // local development — reuse the control pool instead of opening a second
  // socket. pglite-server accepts one connection total, so a separate tenant
  // pool would be refused mid-query.
  const pool = isControlPlaneConnection(connectionString)
    ? getControlPool()
    : new Pool({
        connectionString,
        max: 1,
        idleTimeoutMillis: IDLE_CLOSE_MS,
        // Neon terminates idle connections; let pg reap them rather than
        // discovering a dead socket mid-query.
        allowExitOnIdle: true,
      });

  // An idle-pool error must never take down the process. pg emits these when
  // the far end closes a connection that is sitting in the pool.
  pool.on('error', (error) => {
    console.error('[Tenancy] idle pool error', { orgId, error: error.message });
  });

  const db = drizzle({ client: pool, schema: fullSchema });
  pools.set(orgId, { db, pool, lastUsedAt: Date.now(), connectionString });
  return db;
}

/**
 * Drop one organization's pool, closing its socket.
 * Call after changing that tenant's connection string.
 */
export function invalidateTenantPool(orgId: string): void {
  const entry = pools.get(orgId);
  if (!entry) {
    return;
  }
  pools.delete(orgId);
  // Leave the socket open if another organization still shares it, and never
  // close the control pool — it is not ours to close.
  if (refCount(entry.pool) === 0 && entry.pool !== getControlPool()) {
    void entry.pool.end().catch(() => {});
  }
}

/** Close every pool. For scripts and test teardown. */
export async function closeAllTenantPools(): Promise<void> {
  // Dedupe: several entries may reference one shared pool, and calling end()
  // twice on the same pool rejects. The control pool is excluded — it has its
  // own lifecycle and other callers.
  const controlPool = getControlPool();
  const uniquePools = new Set(
    [...pools.values()].map(entry => entry.pool).filter(pool => pool !== controlPool),
  );
  pools.clear();
  await Promise.allSettled([...uniquePools].map(pool => pool.end()));
}

/** Number of currently-open tenant pools. Diagnostics and tests. */
export function tenantPoolCount(): number {
  return pools.size;
}
