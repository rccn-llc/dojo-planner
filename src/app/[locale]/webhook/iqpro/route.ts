import type { IQProConfig, PaymentProviderConfig } from '@/services/PaymentProviderConfigService';
import type { RefType } from '@/services/TenantExternalRefService';
import { and, eq, ne } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { runAfterResponse } from '@/libs/AfterResponse';
import { controlOrganizationDb } from '@/libs/ControlPlaneReads';
import { db } from '@/libs/DB';
import { resolveWebhookPublicKey, verifyIQProWebhookSignature } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import { getClientIP, isRateLimitingEnabled, webhookRateLimiter } from '@/libs/RateLimit';
import { runWithTenant } from '@/libs/TenantContext';
import { organizationSchema, transactionSchema } from '@/models/Schema';
import { syncMemberQuietly } from '@/services/PaymentMethodSyncService';
import { openUpdateRequestAfterDecline } from '@/services/PaymentMethodUpdateRequestService';
import { resolvePaymentProviderConfig, resolvePlatformIQProConfig } from '@/services/PaymentProviderConfigService';
import { recordRecurringCharge } from '@/services/RecurringChargeWebhookService';
import { getDbForOrg } from '@/services/TenantDirectoryService';
import { REF_TYPE, resolveOrgByExternalRef } from '@/services/TenantExternalRefService';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';

/**
 * iQ Pro+ webhooks.
 *
 * ── Payload ("iQ Pro+ Webhook API Guide" §3) ───────────────────────────────
 *
 *   { resourceType, subType, resource, traceId, actionDateTime,
 *     hashAlg: 'SHA256', signatureAlg: 'RSA', signature }
 *
 * The signature is in the BODY (not a header) and covers ONLY `resource`:
 * RSA-SHA256, PKCS#1 v1.5, verified with the GATEWAY's public key. This
 * replaced an HMAC/header scheme that depended on a package that was never
 * installed, so every delivery used to fail before reaching a handler.
 *
 * ── Verification order is inverted, like Square ────────────────────────────
 *
 * The key is per gateway, i.e. per org. So the handler resolves the org from
 * `tenant_external_ref` first, loads that org's config, and only then
 * verifies. NOTHING is written before verification passes.
 *
 * ── Subscription charges ("Subscription Decline Webhooks") ─────────────────
 *
 * Each billing attempt is a `TRANSACTION` / `Sale` carrying
 * `resource.subscriptionId`; one-time Sales carry none. `DECLINED` is a failed
 * attempt; IQPro retries up to 3 times per cycle, then marks the subscription
 * overdue. Any other status (e.g. PENDINGSETTLEMENT) is an approved charge.
 */

type IQProWebhook = {
  resourceType?: string;
  subType?: string;
  resource?: Record<string, unknown>;
  traceId?: string;
  actionDateTime?: string;
  signature?: string;
};

/** Statuses recorded as a failed attempt. The guide documents DECLINED. */
const DECLINED_STATUSES = new Set(['DECLINED', 'FAILED', 'ERROR']);

/** Reversals belong to the refund flow, which already updated our rows. */
const IGNORED_STATUSES = new Set(['VOIDED', 'REFUNDED']);

async function applyWebhookRateLimit(request: Request): Promise<NextResponse | null> {
  if (!isRateLimitingEnabled()) {
    return null;
  }

  const clientIP = getClientIP(request);
  const result = await webhookRateLimiter.limit(clientIP);

  if (!result.success) {
    logger.warn('[IQPro Webhook] Rate limit exceeded', { ip: clientIP });
    return NextResponse.json(
      { error: 'Too Many Requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((result.reset - Date.now()) / 1000)),
        },
      },
    );
  }

  return null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** The fields this handler reads from `resource`. Card data is never read. */
function readResource(resource: Record<string, unknown>) {
  const customer = resource.customer as Record<string, unknown> | undefined;
  const remit = resource.transactionRemit as Record<string, unknown> | undefined;
  const amount = Number(remit?.amount ?? 0);
  return {
    transactionId: str(resource.transactionId),
    subscriptionId: str(resource.subscriptionId),
    invoiceId: str(resource.invoiceId),
    customerId: str(customer?.customerId),
    status: String(resource.status ?? '').toUpperCase(),
    amount: Number.isFinite(amount) ? amount : 0,
    reason: str(resource.processorResponseText) ?? str(resource.response),
    createdAt: str(resource.createdDateTime),
  };
}

type ResourceFields = ReturnType<typeof readResource>;

/** Verify against the key, refetching it once in case it rotated. */
async function verifyWithKey(
  config: IQProConfig,
  rawBody: string,
  event: IQProWebhook,
): Promise<boolean> {
  const attempt = (publicKeyPem: string | null) => verifyIQProWebhookSignature({
    rawBody,
    resource: event.resource,
    signature: event.signature,
    publicKeyPem,
  });

  if (attempt(await resolveWebhookPublicKey(config))) {
    return true;
  }
  return attempt(await resolveWebhookPublicKey(config, { force: true }));
}

/** First external ref that maps to an org: subscription, then transaction, then customer. */
async function resolveOrg(fields: ResourceFields): Promise<{ orgId: string; refType: RefType; refId: string } | null> {
  const candidates: Array<[RefType, string | undefined]> = [
    [REF_TYPE.PROVIDER_SUBSCRIPTION, fields.subscriptionId],
    [REF_TYPE.PROVIDER_TRANSACTION, fields.transactionId],
    [REF_TYPE.PROVIDER_CUSTOMER, fields.customerId],
  ];

  for (const [refType, refId] of candidates) {
    if (!refId) {
      continue;
    }
    const orgId = await resolveOrgByExternalRef(refType, refId);
    if (orgId) {
      return { orgId, refType, refId };
    }
  }
  return null;
}

/**
 * The org's OWN SaaS subscription (billed through the platform's gateway),
 * not a member's. saas_* columns are control-plane.
 */
async function handleSaasCharge(orgId: string, saasBillingCycle: string | null, fields: ResourceFields): Promise<void> {
  if (DECLINED_STATUSES.has(fields.status)) {
    await controlOrganizationDb()
      .update(organizationSchema)
      .set({ saasSubscriptionStatus: 'past_due' })
      .where(eq(organizationSchema.id, orgId));
    logger.info('[IQPro Webhook] SaaS subscription payment declined', { orgId });
    return;
  }

  const days = saasBillingCycle === 'annual' ? 365 : 30;
  await controlOrganizationDb()
    .update(organizationSchema)
    .set({
      saasSubscriptionStatus: 'active',
      // Milliseconds, like every other writer of this column.
      saasCurrentPeriodEnd: Date.now() + days * 24 * 60 * 60 * 1000,
    })
    .where(eq(organizationSchema.id, orgId));
  logger.info('[IQPro Webhook] SaaS subscription payment succeeded', { orgId });
}

/**
 * A charge with no subscriptionId: one we initiated (a one-time payment, fee,
 * or manual retry). Update our row only — never insert, so a webhook that
 * beats our own insert cannot create a duplicate.
 */
async function updateExistingTransaction(orgId: string, fields: ResourceFields, declined: boolean): Promise<void> {
  if (!fields.transactionId) {
    return;
  }

  await db
    .update(transactionSchema)
    .set(declined
      ? { status: 'declined', failureReason: fields.reason ?? 'Declined' }
      : { status: 'paid', processedAt: new Date() })
    .where(and(
      eq(transactionSchema.providerTransactionId, fields.transactionId),
      // A provider id is unique per merchant, not globally.
      eq(transactionSchema.organizationId, orgId),
      // A refunded row stays refunded.
      ne(transactionSchema.status, 'refunded'),
    ));
}

type TenantHandle = Awaited<ReturnType<typeof getDbForOrg>>;

async function handleVerifiedEvent(
  orgId: string,
  event: IQProWebhook,
  fields: ResourceFields,
  config: PaymentProviderConfig,
  tenantDb: TenantHandle,
): Promise<void> {
  const resourceType = String(event.resourceType ?? '').toUpperCase();
  const subType = String(event.subType ?? '').toUpperCase();

  if (resourceType !== 'TRANSACTION' || subType !== 'SALE') {
    logger.info('[IQPro Webhook] Ignoring non-Sale event', { resourceType, subType, traceId: event.traceId });
    return;
  }
  if (IGNORED_STATUSES.has(fields.status)) {
    logger.info('[IQPro Webhook] Ignoring reversal status', { status: fields.status, transactionId: fields.transactionId });
    return;
  }

  const declined = DECLINED_STATUSES.has(fields.status);

  if (!fields.subscriptionId) {
    await updateExistingTransaction(orgId, fields, declined);
    return;
  }

  if (!fields.transactionId) {
    logger.warn('[IQPro Webhook] Subscription Sale without transactionId — cannot dedupe, ignoring', {
      subscriptionId: fields.subscriptionId,
      traceId: event.traceId,
    });
    return;
  }

  const occurredAt = fields.createdAt ? new Date(fields.createdAt) : undefined;

  const result = await recordRecurringCharge({
    provider: PAYMENT_PROVIDER.IQPRO,
    // transactionId is unique per attempt; the status keeps a later
    // PENDINGSETTLEMENT → SETTLED delivery from being dropped (it updates the
    // existing row rather than inserting).
    eventKey: `${fields.transactionId}:${fields.status}`,
    organizationId: orgId,
    providerSubscriptionId: fields.subscriptionId,
    providerTransactionId: fields.transactionId,
    providerInvoiceId: fields.invoiceId ?? null,
    amount: fields.amount,
    outcome: declined ? 'declined' : 'paid',
    failureReason: declined ? (fields.reason ?? 'Declined') : null,
    occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : undefined,
  });

  // IQPro sends no webhook when a member updates their card through its
  // failed-payment email, so read the subscription's card back after every
  // recorded charge. After the response: it is a provider round-trip, and the
  // tenant scope is re-entered because the request's scope has ended by then.
  if (result.status === 'recorded') {
    const memberId = result.memberId;
    runAfterResponse('IQPro payment-method sync', () => runWithTenant(
      { orgId, db: tenantDb, source: 'webhook' },
      async () => {
        // A decline: watch for the card the member adds through IQPro's
        // post-decline email (it lands on the customer, not the subscription).
        if (declined) {
          await openUpdateRequestAfterDecline(memberId, orgId, config);
        }
        await syncMemberQuietly(memberId, orgId, config);
      },
    ));
  }
}

export const POST = async (request: Request) => {
  const rateLimitResponse = await applyWebhookRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Raw body kept verbatim: verification slices `resource` out of it.
  const rawBody = await request.text();

  let event: IQProWebhook;
  try {
    event = JSON.parse(rawBody) as IQProWebhook;
  } catch {
    logger.error('[IQPro Webhook] Invalid JSON payload');
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (!event.resource || typeof event.resource !== 'object' || !event.signature) {
    logger.error('[IQPro Webhook] Missing resource or signature', { traceId: event.traceId });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Logged without `transactionPaymentMethod` (masked card) — the guide asks
  // integrations to keep card details out of logs.
  const fields = readResource(event.resource);
  logger.info('[IQPro Webhook] Received', {
    resourceType: event.resourceType,
    subType: event.subType,
    traceId: event.traceId,
    transactionId: fields.transactionId,
    subscriptionId: fields.subscriptionId,
    status: fields.status,
  });

  // ── The org's own SaaS subscription: platform gateway, platform key ──
  if (fields.subscriptionId) {
    const saasOrg = await controlOrganizationDb().query.organizationSchema.findFirst({
      where: eq(organizationSchema.saasProviderSubscriptionId, fields.subscriptionId),
      columns: { id: true, saasBillingCycle: true },
    });

    if (saasOrg) {
      const platformConfig = await resolvePlatformIQProConfig();
      if (!platformConfig || !(await verifyWithKey(platformConfig, rawBody, event))) {
        logger.error('[IQPro Webhook] Invalid signature (SaaS)', { orgId: saasOrg.id, traceId: event.traceId });
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
      if (String(event.resourceType ?? '').toUpperCase() === 'TRANSACTION' && !IGNORED_STATUSES.has(fields.status)) {
        await handleSaasCharge(saasOrg.id, saasOrg.saasBillingCycle ?? null, fields);
      }
      return NextResponse.json({ received: true });
    }
  }

  // ── A member payment: route to the owning org, then verify with its key ──
  const routed = await resolveOrg(fields);
  if (!routed) {
    // REFUSE rather than process against the wrong database. 200 so IQPro
    // does not retry an event we structurally cannot place; the log is the
    // actionable signal.
    logger.error('[IQPro Webhook] No tenant mapping for external id — REFUSING to process', {
      subscriptionId: fields.subscriptionId,
      transactionId: fields.transactionId,
      customerId: fields.customerId,
      remedy: 'Add a tenant_external_ref row for this id (or run backfillExternalRefs), then let the provider retry.',
    });
    return NextResponse.json({ received: true });
  }

  const { orgId } = routed;
  const tenantDb = await getDbForOrg(orgId);

  const config = await runWithTenant(
    { orgId, db: tenantDb, source: 'webhook' },
    () => resolvePaymentProviderConfig(orgId),
  );

  if (!config || config.provider !== PAYMENT_PROVIDER.IQPRO) {
    logger.error('[IQPro Webhook] Event routed to an org that is not on IQPro — REFUSING', {
      orgId,
      provider: config?.provider ?? 'none',
    });
    return NextResponse.json({ received: true });
  }

  if (!(await verifyWithKey(config, rawBody, event))) {
    // Non-200, per the guide: a failed verification must not be acknowledged.
    logger.error('[IQPro Webhook] Invalid signature', { orgId, traceId: event.traceId });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    await runWithTenant(
      { orgId, db: tenantDb, source: 'webhook' },
      () => handleVerifiedEvent(orgId, event, fields, config, tenantDb),
    );
  } catch (error) {
    // 500 so IQPro redelivers; the dedup table makes the retry safe.
    logger.error('[IQPro Webhook] Event processing error', {
      orgId,
      traceId: event.traceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
};
