import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '@/models/Schema';
import { requireTenantScope } from './TenantContext';

export type AppDb = NodePgDatabase<typeof schema>;

/**
 * The tenant-scoped database handle.
 *
 * This is a Proxy, not a connection. Every property access resolves the CURRENT
 * request's tenant database from AsyncLocalStorage (see `TenantContext`), which
 * is what allows the ~20 service modules to keep their unchanged
 * `import { db } from '@/libs/DB'` while the underlying connection became
 * per-organization.
 *
 * Accessing it outside a tenant scope THROWS. That is deliberate: a database
 * access with no tenant must be loud, never a silent fall-back to some default
 * connection — a silent fallback is the cross-tenant leak this design exists to
 * prevent.
 *
 * Two behaviours the traps must preserve, both load-bearing:
 *
 *   - `db.query.memberSchema.findFirst(...)` is a three-level property chain, so
 *     `get('query')` has to return the real nested object rather than a function.
 *     Forwarding via Reflect.get on the resolved instance gives that for free.
 *   - Methods must be bound to the resolved drizzle instance, or `this` is lost
 *     the moment a caller destructures or passes one along.
 *
 * NOTE: drizzle's `migrate()` reaches into undocumented internals
 * (`db.dialect`, `db.session`, `db._`). Do not pass this Proxy to it — the
 * migration path builds its own raw connection; see `src/scripts/migrateTenants.ts`.
 */
export const db: AppDb = new Proxy({} as AppDb, {
  get(_target, prop, receiver) {
    const real = requireTenantScope().db as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },

  set(_target, prop, value) {
    const real = requireTenantScope().db as unknown as Record<PropertyKey, unknown>;
    return Reflect.set(real, prop, value);
  },

  has(_target, prop) {
    return Reflect.has(requireTenantScope().db as object, prop);
  },

  ownKeys(_target) {
    return Reflect.ownKeys(requireTenantScope().db as object);
  },

  getOwnPropertyDescriptor(_target, prop) {
    const descriptor = Reflect.getOwnPropertyDescriptor(
      requireTenantScope().db as object,
      prop,
    );
    // A Proxy may only report a property as configurable:false if the target
    // agrees. The target here is an empty object, so force configurable:true to
    // satisfy the invariant.
    return descriptor ? { ...descriptor, configurable: true } : undefined;
  },
});
