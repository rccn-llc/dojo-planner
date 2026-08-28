import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '@/models/Schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as fullSchema from '@/models/Schema';
import { getControlPool } from './ControlPool';

/**
 * Reads of the `organization` row that must NOT require a tenant scope.
 *
 * ── Why this is separate from both `db` and `controlDb` ──────────────────────
 *
 * `organization` straddles the two planes. Its SaaS-billing columns
 * (stripe_*, iqpro*Subscription*, the responsible academy owner) are
 * control-plane: the subscription gate reads them during React Server Component
 * render, where there is no tenant scope, and it must keep working even when an
 * org's own database is unreachable or not yet provisioned. Its location and
 * merchant-credential columns are tenant-plane and stay with `db`.
 *
 * `controlDb` cannot serve these reads because it is typed against
 * `ControlSchema` alone — deliberately, so reaching for a tenant table through
 * it is a type error. This handle points at the same control connection but is
 * typed against the full schema, which is what lets `organizationSchema`
 * queries compile.
 *
 * ── Phase A2 ────────────────────────────────────────────────────────────────
 *
 * When `organization`'s control-plane columns physically move, the callers here
 * (Auth.ts's `orgExists`, SaasSubscriptionService's `hasActiveSubscription`)
 * are already pointed at the right connection — only the column list changes.
 * Keep new control-plane organization reads going through this helper rather
 * than reintroducing `db` in an RSC path.
 *
 * In local development `CONTROL_DATABASE_URL` is unset, so this resolves to
 * the same physical database as everything else.
 */
type OrganizationReadDb = NodePgDatabase<typeof schema>;

const globalForControlReads = globalThis as unknown as {
  controlOrganizationDb?: OrganizationReadDb;
};

function create(): OrganizationReadDb {
  // Same SHARED pool as `ControlDb` — this is a second drizzle typing over one
  // connection, not a second connection. See ControlPool.
  return drizzle({ client: getControlPool(), schema: fullSchema });
}

/**
 * Lazily-created handle for control-plane `organization` reads.
 *
 * Lazy rather than eager so importing this module does not open a connection —
 * it is pulled in by `Auth.ts`, which the middleware and every dashboard render
 * touch.
 */
export function controlOrganizationDb(): OrganizationReadDb {
  globalForControlReads.controlOrganizationDb ??= create();
  return globalForControlReads.controlOrganizationDb;
}
