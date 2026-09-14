import { and, eq, ne } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { getClientIP, isRateLimitingEnabled, webhookRateLimiter } from '@/libs/RateLimit';
import { verifySquareWebhookSignature } from '@/libs/Square';
import { runWithTenant } from '@/libs/TenantContext';
import { memberMembershipSchema, memberSchema, transactionSchema } from '@/models/Schema';
import { resolvePaymentProviderConfig } from '@/services/PaymentProviderConfigService';
import { getDbForOrg } from '@/services/TenantDirectoryService';
import { REF_TYPE, resolveOrgByExternalRef } from '@/services/TenantExternalRefService';
import { MEMBER_STATUS } from '@/types/MemberStatus';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';

/**
 * Square webhooks.
 *
 * ⚠️ Verification order is INVERTED compared with the IQPro handler. IQPro
 * validates against ONE global env secret before it knows which org an event
 * belongs to. Square's signature key is PER-ORG (inside the encrypted config
 * blob), so this handler must:
 *
 *   1. parse enough of the payload to find a provider id,
 *   2. resolve the owning org from `tenant_external_ref`,
 *   3. load THAT org's key,
 *   4. only then verify the signature.
 *
 * Nothing is written before step 4 succeeds.
 *
 * Routing deliberately reuses `tenant_external_ref` rather than
 * `tenant.square_merchant_id`: the merchant-id column exists but has no writer
 * anywhere, while PROVIDER_SUBSCRIPTION / PROVIDER_TRANSACTION refs are already
 * recorded for Square on the shared payment path.
 */

type SquareWebhookPayload = {
  type?: string;
  event_id?: string;
  merchant_id?: string;
  data?: {
    type?: string;
    id?: string;
    object?: Record<string, unknown>;
  };
};

async function applyWebhookRateLimit(request: Request): Promise<NextResponse | null> {
  if (!isRateLimitingEnabled()) {
    return null;
  }

  const clientIP = getClientIP(request);
  const result = await webhookRateLimiter.limit(clientIP);

  if (!result.success) {
    logger.warn('[Square Webhook] Rate limit exceeded', { ip: clientIP });
    return NextResponse.json(
      { error: 'Too Many Requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((result.reset - Date.now()) / 1000)) },
      },
    );
  }

  return null;
}

/**
 * The id this event can be routed by, and which ref type it is.
 *
 * Square has no direct "subscription charge succeeded" event — recurring
 * billing surfaces as INVOICE events, and an invoice carries the
 * `subscription_id` that generated it. That id is what was recorded when the
 * subscription was created.
 */
function extractRoutingRef(payload: SquareWebhookPayload): { refType: typeof REF_TYPE[keyof typeof REF_TYPE]; refId: string } | null {
  const object = payload.data?.object ?? {};
  const type = payload.type ?? '';

  if (type.startsWith('invoice.')) {
    const invoice = object.invoice as { subscription_id?: string } | undefined;
    return invoice?.subscription_id
      ? { refType: REF_TYPE.PROVIDER_SUBSCRIPTION, refId: invoice.subscription_id }
      : null;
  }

  if (type.startsWith('subscription.')) {
    const subscription = object.subscription as { id?: string } | undefined;
    return subscription?.id
      ? { refType: REF_TYPE.PROVIDER_SUBSCRIPTION, refId: subscription.id }
      : null;
  }

  if (type.startsWith('payment.')) {
    const payment = object.payment as { id?: string } | undefined;
    return payment?.id
      ? { refType: REF_TYPE.PROVIDER_TRANSACTION, refId: payment.id }
      : null;
  }

  return null;
}

/** The subscription id an invoice event belongs to. */
function invoiceSubscriptionId(payload: SquareWebhookPayload): string | null {
  const invoice = payload.data?.object?.invoice as { subscription_id?: string } | undefined;
  return invoice?.subscription_id ?? null;
}

/**
 * A recurring charge succeeded.
 *
 * Mirrors the IQPro handler: the membership goes active, and the member is
 * lifted out of past_due — but ONLY out of past_due, so this can never
 * resurrect someone who was cancelled or is on hold.
 */
async function handleInvoicePaid(orgId: string, subscriptionId: string): Promise<void> {
  const membership = await db.query.memberMembershipSchema.findFirst({
    where: eq(memberMembershipSchema.providerSubscriptionId, subscriptionId),
    columns: { memberId: true },
  });

  await db
    .update(memberMembershipSchema)
    .set({ status: 'active', updatedAt: new Date() })
    // The org predicate is required: a provider id is unique per MERCHANT,
    // not globally, so without it one merchant's id could match another
    // org's row.
    // No org predicate here: `member_membership` carries no organization_id —
    // it is org-scoped by the tenant DATABASE this runs against, which
    // `runWithTenant` selected from the resolved org.
    .where(eq(memberMembershipSchema.providerSubscriptionId, subscriptionId));

  if (membership?.memberId) {
    await db
      .update(memberSchema)
      .set({ status: MEMBER_STATUS.ACTIVE, statusChangedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(memberSchema.id, membership.memberId),
        eq(memberSchema.organizationId, orgId),
        eq(memberSchema.status, MEMBER_STATUS.PAST_DUE),
      ));
  }
}

/** A scheduled charge failed. */
async function handleInvoiceFailed(orgId: string, subscriptionId: string): Promise<void> {
  const membership = await db.query.memberMembershipSchema.findFirst({
    where: eq(memberMembershipSchema.providerSubscriptionId, subscriptionId),
    columns: { memberId: true },
  });

  await db
    .update(memberMembershipSchema)
    .set({ status: MEMBER_STATUS.PAST_DUE, updatedAt: new Date() })
    // No org predicate here: `member_membership` carries no organization_id —
    // it is org-scoped by the tenant DATABASE this runs against, which
    // `runWithTenant` selected from the resolved org.
    .where(eq(memberMembershipSchema.providerSubscriptionId, subscriptionId));

  if (membership?.memberId) {
    // Do not drag a cancelled or held member back into past_due — their
    // membership is not being collected on.
    await db
      .update(memberSchema)
      .set({ status: MEMBER_STATUS.PAST_DUE, statusChangedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(memberSchema.id, membership.memberId),
        eq(memberSchema.organizationId, orgId),
        ne(memberSchema.status, MEMBER_STATUS.CANCELLED),
        ne(memberSchema.status, MEMBER_STATUS.HOLD),
      ));
  }
}

/**
 * A subscription was cancelled at Square.
 *
 * `subscription.updated` fires for every status change, so only CANCELED and
 * DEACTIVATED are acted on — treating any update as a cancellation would
 * cancel memberships that merely paused.
 */
async function handleSubscriptionUpdated(orgId: string, payload: SquareWebhookPayload): Promise<void> {
  const subscription = payload.data?.object?.subscription as { id?: string; status?: string } | undefined;
  const subscriptionId = subscription?.id;
  const status = subscription?.status;

  if (!subscriptionId) {
    return;
  }
  if (status !== 'CANCELED' && status !== 'DEACTIVATED') {
    logger.info('[Square Webhook] subscription.updated ignored', { subscriptionId, status });
    return;
  }

  const membership = await db.query.memberMembershipSchema.findFirst({
    where: eq(memberMembershipSchema.providerSubscriptionId, subscriptionId),
    columns: { memberId: true },
  });

  await db
    .update(memberMembershipSchema)
    .set({ status: 'cancelled', endDate: new Date(), updatedAt: new Date() })
    // No org predicate here: `member_membership` carries no organization_id —
    // it is org-scoped by the tenant DATABASE this runs against, which
    // `runWithTenant` selected from the resolved org.
    .where(eq(memberMembershipSchema.providerSubscriptionId, subscriptionId));

  if (membership?.memberId) {
    // Only mirror onto the member when this was their LAST active membership —
    // someone on two plans who cancels one is still an active member.
    const stillActive = await db.query.memberMembershipSchema.findFirst({
      where: and(
        eq(memberMembershipSchema.memberId, membership.memberId),
        eq(memberMembershipSchema.status, 'active'),
      ),
      columns: { id: true },
    });

    if (!stillActive) {
      await db
        .update(memberSchema)
        .set({ status: MEMBER_STATUS.CANCELLED, statusChangedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(memberSchema.id, membership.memberId),
          eq(memberSchema.organizationId, orgId),
        ));
    }
  }
}

/** A one-time payment settled or failed. */
async function handlePaymentUpdated(orgId: string, payload: SquareWebhookPayload): Promise<void> {
  const payment = payload.data?.object?.payment as { id?: string; status?: string } | undefined;
  if (!payment?.id) {
    return;
  }

  // COMPLETED is the only settled state. APPROVED means authorised but not
  // captured, so it must not be recorded as paid.
  const paid = payment.status === 'COMPLETED';
  const failed = payment.status === 'FAILED' || payment.status === 'CANCELED';
  if (!paid && !failed) {
    logger.info('[Square Webhook] payment.updated in a non-terminal state', { id: payment.id, status: payment.status });
    return;
  }

  await db
    .update(transactionSchema)
    .set({
      status: paid ? 'paid' : 'declined',
      ...(paid ? { processedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(transactionSchema.providerTransactionId, payment.id),
      eq(transactionSchema.organizationId, orgId),
    ));
}

async function handleWebhookEvent(orgId: string, payload: SquareWebhookPayload): Promise<void> {
  const type = payload.type ?? '';
  logger.info('[Square Webhook] Processing event', { type, id: payload.event_id, orgId });

  switch (type) {
    case 'invoice.payment_made': {
      const subscriptionId = invoiceSubscriptionId(payload);
      if (subscriptionId) {
        await handleInvoicePaid(orgId, subscriptionId);
      }
      break;
    }
    case 'invoice.scheduled_charge_failed': {
      const subscriptionId = invoiceSubscriptionId(payload);
      if (subscriptionId) {
        await handleInvoiceFailed(orgId, subscriptionId);
      }
      break;
    }
    case 'subscription.updated':
      await handleSubscriptionUpdated(orgId, payload);
      break;
    case 'payment.updated':
      await handlePaymentUpdated(orgId, payload);
      break;
    default:
      logger.info('[Square Webhook] Unhandled event type', { type });
  }
}

/** The locale-less form of this route's path. */
const UNPREFIXED_PATH = '/webhook/square';

/**
 * The URLs this request could have been signed against, most-likely first.
 *
 * ⚠️ The notification URL is an HMAC INPUT, so it must match what Square was
 * configured with character for character. Two things made a single derived URL
 * wrong:
 *
 *  1. **The locale prefix.** This route lives at `/[locale]/webhook/square`
 *     and `localePrefix` is `as-needed`, so `/webhook/square` (default locale)
 *     AND `/en|fr|ja/webhook/square` all reach it. The old code always appended
 *     a bare `/webhook/square` to `NEXT_PUBLIC_APP_URL`, so an org whose Square
 *     dashboard pointed at `/en/webhook/square` failed EVERY signature — the
 *     handler resolved the org and the key correctly, then rejected the event.
 *
 *  2. **The origin.** `request.url` behind Vercel can carry the internal host
 *     rather than the public one Square was given, which is why
 *     `NEXT_PUBLIC_APP_URL` was used at all.
 *
 * So the path comes from the REQUEST (preserving whatever locale prefix Square
 * actually calls) while the origin prefers the configured public URL. The bare
 * `/webhook/square` form is kept as a second candidate so deployments already
 * signing successfully against it are not broken by this change.
 *
 * Trying more than one candidate does NOT weaken verification: each is checked
 * against the same per-org key with the same constant-time comparison, and an
 * attacker who cannot produce a valid HMAC for one URL cannot produce one for
 * another.
 */
function notificationUrlCandidates(
  request: Request,
  headersList: Headers,
): string[] {
  const requestUrl = new URL(request.url);

  // Strip query and hash: Square signs the notification URL as configured.
  const path = requestUrl.pathname;

  const origins: string[] = [];
  const configured = Env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configured) {
    origins.push(configured);
  }

  // Forwarded host, for a deployment where the public origin is not configured.
  const forwardedHost = headersList.get('x-forwarded-host');
  if (forwardedHost) {
    const proto = headersList.get('x-forwarded-proto') ?? 'https';
    const forwarded = `${proto}://${forwardedHost}`;
    if (!origins.includes(forwarded)) {
      origins.push(forwarded);
    }
  }

  if (!origins.includes(requestUrl.origin)) {
    origins.push(requestUrl.origin);
  }

  // The path as called (locale-prefixed or not), then the un-prefixed form —
  // which is what a deployment configured before this fix will be signing.
  const paths = path === UNPREFIXED_PATH ? [path] : [path, UNPREFIXED_PATH];

  const candidates: string[] = [];
  for (const origin of origins) {
    for (const p of paths) {
      const candidate = `${origin}${p}`;
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

export const POST = async (request: Request) => {
  const rateLimitResponse = await applyWebhookRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // The RAW body, kept verbatim. Re-serializing parsed JSON changes the bytes
  // and every signature check would fail.
  const rawBody = await request.text();

  let payload: SquareWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as SquareWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const ref = extractRoutingRef(payload);
  if (!ref) {
    // Nothing to route by. Answering 200 stops Square retrying an event we
    // structurally cannot place; the log is the actionable signal.
    logger.warn('[Square Webhook] No routable id on event — ignoring', {
      type: payload.type,
      id: payload.event_id,
    });
    return NextResponse.json({ received: true });
  }

  const orgId = await resolveOrgByExternalRef(ref.refType, ref.refId);
  if (!orgId) {
    logger.error('[Square Webhook] No tenant mapping for external id — REFUSING to process', {
      refType: ref.refType,
      refId: ref.refId,
      remedy: 'Add a tenant_external_ref row for this id, then let Square retry.',
    });
    return NextResponse.json({ received: true });
  }

  const tenantDb = await getDbForOrg(orgId);

  // Resolving config needs a tenant scope, so this runs inside one — but
  // NOTHING is written until the signature verifies below.
  const config = await runWithTenant(
    { orgId, db: tenantDb, source: 'webhook' },
    () => resolvePaymentProviderConfig(orgId),
  );

  if (!config || config.provider !== PAYMENT_PROVIDER.SQUARE) {
    logger.error('[Square Webhook] Event routed to an org that is not on Square — REFUSING', {
      orgId,
      provider: config?.provider ?? 'none',
    });
    return NextResponse.json({ received: true });
  }

  const headersList = await headers();
  const signatureHeader = headersList.get('x-square-hmacsha256-signature');
  const candidates = notificationUrlCandidates(request, headersList);

  const valid = candidates.some(notificationUrl => verifySquareWebhookSignature({
    signatureKey: config.webhookSignatureKey,
    notificationUrl,
    rawBody,
    signatureHeader,
  }));

  if (!valid) {
    // 401, not 200: a failed signature is either a forgery or a genuine
    // misconfiguration, and both deserve to be visible rather than absorbed.
    // The candidates are logged because a URL mismatch is indistinguishable
    // from a forgery, and is by far the likelier cause — this line is what
    // turns "Square says invalid" into "the dashboard URL says /en/...".
    logger.error('[Square Webhook] Invalid signature', { orgId, candidates });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    await runWithTenant(
      { orgId, db: tenantDb, source: 'webhook' },
      () => handleWebhookEvent(orgId, payload),
    );
  } catch (error) {
    logger.error('[Square Webhook] Processing error', {
      orgId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
};
