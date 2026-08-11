import type { TenantDb } from './TenantDb';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request tenant scope.
 *
 * The database handle exported from `@/libs/DB` is a Proxy that resolves the
 * CURRENT request's tenant database from this AsyncLocalStorage. That is what
 * lets ~20 service modules keep their plain `import { db } from '@/libs/DB'`
 * while the underlying connection becomes per-organization.
 *
 * Node runtime only — `node:async_hooks` does not exist on the Edge runtime.
 * That is fine here: no route in this app declares `export const runtime =
 * 'edge'`, and the only Edge-ish surface (`src/proxy.ts`) never touches the
 * database. If that ever changes, this constraint must be revisited.
 */
export type TenantScope = {
  /** Clerk organization id this request is operating on. */
  orgId: string;
  /** The resolved database handle for that organization. */
  db: TenantDb;
  /** Where the scope was established. Diagnostics only. */
  source: 'rpc' | 'rsc' | 'webhook' | 'script' | 'test';
};

const storage = new AsyncLocalStorage<TenantScope>();

/**
 * Run `fn` with `scope` active. The scope follows the promise chain, so any
 * `await`ed work inside `fn` — however deep — sees it.
 */
export function runWithTenant<T>(scope: TenantScope, fn: () => T): T {
  return storage.run(scope, fn);
}

/**
 * Establish `scope` for the REMAINDER of the current async context, without
 * wrapping a callback.
 *
 * Needed where there is nothing to wrap — notably a React Server Component
 * layout, which cannot enclose its children's render. Prefer `runWithTenant`
 * wherever a callback boundary exists; `enterWith` leaks into sibling async
 * work that shares the same context.
 */
export function enterTenantScope(scope: TenantScope): void {
  storage.enterWith(scope);
}

/** The active scope, or `undefined` outside one. */
export function getTenantScope(): TenantScope | undefined {
  return storage.getStore();
}

/**
 * The active scope, or throw.
 *
 * Fail-closed by design: a database access with no tenant scope must be loud,
 * never a silent fall-back to some default connection. A silent fallback is
 * precisely the cross-tenant leak this architecture exists to prevent.
 */
export function requireTenantScope(): TenantScope {
  const scope = storage.getStore();
  if (!scope) {
    throw new Error(
      '[Tenancy] No tenant scope. A database access happened outside '
      + 'runWithTenant()/enterTenantScope(). Entry points (RPC route, webhooks, '
      + 'scripts) must establish a scope before touching the database — see '
      + 'src/libs/TenantContext.ts.',
    );
  }
  return scope;
}
