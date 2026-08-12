import { Pool } from 'pg';
import { Env } from './Env';

/**
 * The single shared control-plane connection pool.
 *
 * Both control-plane handles — `ControlDb` (typed against ControlSchema) and
 * `ControlPlaneReads` (typed against the full schema, for `organization` reads
 * that must not require a tenant scope) — draw on THIS pool rather than opening
 * their own. They are two different drizzle typings over one connection, not
 * two connections.
 *
 * ── Why this matters ────────────────────────────────────────────────────────
 *
 * Local development runs against pglite-server, which accepts exactly ONE
 * connection (the same constraint that makes `max: 1` deliberate in
 * `utils/DBConnection.ts` and in the kiosk's `lib/database.ts`). Two
 * control-plane pools plus a tenant pool means three sockets, and the second
 * and third are refused — surfacing as `read ECONNRESET` mid-query.
 *
 * During the no-op phase the control plane and the tenant database are the same
 * physical database, so a single connection has to serve both. `max` is
 * therefore 1 while they coincide, and can rise once the control plane is a
 * genuinely separate database with its own connection budget.
 */

function controlConnectionString(): string {
  return Env.CONTROL_DATABASE_URL ?? Env.DATABASE_URL;
}

/**
 * Whether the control plane currently shares a database with tenant data.
 * True during the no-op phase; false once `CONTROL_DATABASE_URL` points
 * somewhere of its own.
 */
function sharesTenantDatabase(): boolean {
  return !Env.CONTROL_DATABASE_URL || Env.CONTROL_DATABASE_URL === Env.DATABASE_URL;
}

const globalForControlPool = globalThis as unknown as { controlPool?: Pool };

function createControlPool(): Pool {
  const pool = new Pool({
    connectionString: controlConnectionString(),
    // 1 while the control plane shares the tenant database — pglite-server
    // allows a single connection, and a tenant pool is already holding one.
    max: sharesTenantDatabase() ? 1 : 2,
  });

  pool.on('error', (error) => {
    console.error('[Tenancy] control-plane idle pool error', { error: error.message });
  });

  return pool;
}

/** The shared control-plane pool, created on first use. */
export function getControlPool(): Pool {
  globalForControlPool.controlPool ??= createControlPool();
  return globalForControlPool.controlPool;
}

/**
 * Whether `connectionString` targets the same database as the control plane.
 *
 * True for every organization during the no-op phase, which lets `TenantDb`
 * reuse the control pool rather than opening a second socket against a server
 * that may only accept one. Goes false per-tenant as organizations move to
 * their own databases.
 */
export function isControlPlaneConnection(connectionString: string): boolean {
  return connectionString === controlConnectionString();
}
