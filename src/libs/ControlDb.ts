import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as controlSchema from '@/models/ControlSchema';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as fullControlSchema from '@/models/ControlSchema';
import { getControlPool } from './ControlPool';
import { Env } from './Env';

/**
 * The CONTROL-plane database handle.
 *
 * Unlike `@/libs/DB`, this is a plain eager singleton and NOT tenant-scoped —
 * by definition. It holds the `tenant` directory that must be read before any
 * tenant database can be opened, so it cannot itself require a tenant scope.
 *
 * It is deliberately typed against `ControlSchema` alone. Reaching for a
 * tenant-plane table through this handle should be a type error, not a runtime
 * surprise about which database a query landed in.
 *
 * During the no-op phase `CONTROL_DATABASE_URL` is unset and this falls back to
 * `DATABASE_URL` — control and tenant data share one physical database until
 * tenants are split out.
 */
export type ControlDb = NodePgDatabase<typeof controlSchema>;

const globalForControl = globalThis as unknown as { controlDb?: ControlDb };

function createControlConnection(): ControlDb {
  // Draws on the SHARED control pool rather than opening its own — see
  // ControlPool for why (pglite-server accepts a single connection locally).
  return drizzle({ client: getControlPool(), schema: fullControlSchema });
}

export const controlDb: ControlDb = globalForControl.controlDb ?? createControlConnection();

if (Env.NODE_ENV !== 'production') {
  globalForControl.controlDb = controlDb;
}
