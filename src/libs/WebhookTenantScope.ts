import type { TenantDb } from './TenantDb';
import { Env } from './Env';
import { getTenantDb } from './TenantDb';

/**
 * Bootstrap tenant scope for sessionless webhook handlers.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Webhooks arrive with no Clerk session, and provider payloads carry no
 * organization id. Today's handlers recover the org by reverse-lookup on a
 * provider-issued id (subscription / transaction / customer) — but that lookup
 * is itself a database read. Once each organization has its own database that
 * is circular: you cannot query for the owner until you know which database to
 * query.
 *
 * ── Why a bootstrap scope is correct FOR NOW ─────────────────────────────────
 *
 * During the no-op phase every organization resolves to the same shared
 * database, so any scope reaches the same rows the handlers read today. This
 * keeps behaviour identical while the seam goes in.
 *
 * ── What replaces it (phase A2) ──────────────────────────────────────────────
 *
 *   1. Every site that creates a provider subscription/transaction/customer
 *      also writes a `tenant_external_ref` row (ON CONFLICT DO NOTHING — one
 *      Sale can yield two transaction rows sharing one id).
 *   2. Webhook handlers resolve `(ref_type, ref_id) → orgId` against the
 *      CONTROL database first, then open that org's database and run inside
 *      `runWithTenant`.
 *   3. Square needs none of this: its payloads carry `merchant_id`, which maps
 *      directly via `tenant.square_merchant_id`.
 *
 * This module is the single place that changes when that lands. Do not
 * reintroduce ad-hoc scope creation in individual webhook routes.
 */

/**
 * Sentinel org id for the bootstrap scope. Deliberately not a real Clerk id so
 * it is obvious in logs, and so a scope/session mismatch assertion can never
 * mistake it for a legitimate organization.
 */
export const WEBHOOK_BOOTSTRAP_ORG_ID = '__webhook_bootstrap__';

/**
 * The shared database, as a tenant handle.
 *
 * Pooled under the sentinel key by `TenantDb`, so webhooks reuse one connection
 * rather than opening a fresh pool per delivery.
 */
export function getBootstrapTenantDb(): TenantDb {
  // Only ever used to look up which org a provider id belongs to; the real
  // work then happens on that org's own database.
  const connectionString = Env.CONTROL_DATABASE_URL ?? Env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'No control-plane database configured, so a webhook cannot be routed to '
      + 'an organization. Set CONTROL_DATABASE_URL.',
    );
  }

  return getTenantDb(WEBHOOK_BOOTSTRAP_ORG_ID, connectionString);
}
