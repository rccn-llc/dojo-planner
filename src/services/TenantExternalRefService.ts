import { and, eq } from 'drizzle-orm';
import { controlDb } from '@/libs/ControlDb';
import { logger } from '@/libs/Logger';
import { tenantExternalRefSchema } from '@/models/ControlSchema';

/**
 * Maps provider-issued identifiers to the organization that owns them.
 *
 * ── Why this is needed ──────────────────────────────────────────────────────
 *
 * Webhooks arrive with no session, and provider payloads carry no organization
 * id. Handlers recover the org by reverse-lookup on a provider id — but once
 * each org has its own database that is circular: you cannot query for the
 * owner until you know which database to query.
 *
 * These rows live in the CONTROL plane, which is always reachable without a
 * tenant scope, breaking the circularity.
 *
 * IQPro needs this. Square does not — its payloads carry `merchant_id`, which
 * maps directly via `tenant.square_merchant_id`.
 */

export const REF_TYPE = {
  /** A member-membership subscription at the payment provider. */
  PROVIDER_SUBSCRIPTION: 'provider_subscription',
  /** A single provider transaction / Sale. */
  PROVIDER_TRANSACTION: 'provider_transaction',
  /** A provider-side customer record for a member. */
  PROVIDER_CUSTOMER: 'provider_customer',
  /** The org's own SaaS subscription (platform billing). */
  SAAS_SUBSCRIPTION: 'saas_subscription',
  /** The org's Stripe customer (legacy platform billing). */
  STRIPE_CUSTOMER: 'stripe_customer',
} as const;

export type RefType = (typeof REF_TYPE)[keyof typeof REF_TYPE];

/**
 * Record that `refId` belongs to `orgId`.
 *
 * ⚠️ ON CONFLICT DO NOTHING is load-bearing, not defensive tidiness. One Sale
 * produces TWO `transaction` rows sharing a single provider transaction id (the
 * signup-fee split in MemberPaymentService). A plain insert throws on the
 * second — inside a `db.transaction` — which would turn a successful payment
 * into a rolled-back one. First writer wins; both rows belong to the same org
 * anyway, so the mapping is identical either way.
 *
 * Best-effort by design: a failure here must never fail the payment that
 * triggered it. A missing ref degrades to "this webhook cannot be routed",
 * which is recoverable, whereas a thrown error mid-charge is not.
 */
export async function recordExternalRef(
  refType: RefType,
  refId: string | null | undefined,
  orgId: string,
): Promise<void> {
  if (!refId) {
    return;
  }

  try {
    await controlDb
      .insert(tenantExternalRefSchema)
      .values({ refType, refId, orgId })
      .onConflictDoNothing();
  } catch (error) {
    logger.error('[TenantExternalRef] failed to record reference', {
      refType,
      refId,
      orgId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Resolve the organization that owns a provider id, or null when unknown.
 *
 * Null is an expected outcome, not an error: refs written before this table
 * existed are absent, and a provider can deliver a webhook for an object we
 * never recorded. Callers decide whether that is fatal.
 */
export async function resolveOrgByExternalRef(
  refType: RefType,
  refId: string,
): Promise<string | null> {
  const row = await controlDb.query.tenantExternalRefSchema.findFirst({
    where: and(
      eq(tenantExternalRefSchema.refType, refType),
      eq(tenantExternalRefSchema.refId, refId),
    ),
    columns: { orgId: true },
  });
  return row?.orgId ?? null;
}
