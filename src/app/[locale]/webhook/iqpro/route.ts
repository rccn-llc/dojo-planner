import type { RefType } from '@/services/TenantExternalRefService';
import { and, eq, ne } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { controlOrganizationDb } from '@/libs/ControlPlaneReads';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { getClientIP, isRateLimitingEnabled, webhookRateLimiter } from '@/libs/RateLimit';
import { requireTenantScope, runWithTenant } from '@/libs/TenantContext';
import { getBootstrapTenantDb, WEBHOOK_BOOTSTRAP_ORG_ID } from '@/libs/WebhookTenantScope';
import { memberMembershipSchema, memberSchema, organizationSchema, transactionSchema } from '@/models/Schema';
import { getDbForOrg } from '@/services/TenantDirectoryService';
import { REF_TYPE, resolveOrgByExternalRef } from '@/services/TenantExternalRefService';

// Inline type to avoid top-level import from the optional @dojo-planner/iqpro-client package
type WebhookPayload = { type: string; id?: string; data: Record<string, unknown> };

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

export const POST = async (request: Request) => {
  const rateLimitResponse = await applyWebhookRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!Env.IQPRO_WEBHOOK_SECRET) {
    logger.error('[IQPro Webhook] IQPRO_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const body = await request.text();
  const reqHeaders = await headers();

  const iqproModule = '@dojo-planner/iqpro-client';
  const { WebhookValidator } = await import(/* webpackIgnore: true */ iqproModule);
  const validator = new WebhookValidator({ secret: Env.IQPRO_WEBHOOK_SECRET });
  const validation = validator.validateWebhook(body, {
    'x-iqpro-signature': reqHeaders.get('x-iqpro-signature') ?? undefined,
    'x-iqpro-timestamp': reqHeaders.get('x-iqpro-timestamp') ?? undefined,
    'content-type': reqHeaders.get('content-type') ?? undefined,
  });

  if (!validation.isValid) {
    logger.error('[IQPro Webhook] Signature validation failed', { errors: validation.errors });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: WebhookPayload;
  try {
    event = JSON.parse(body) as WebhookPayload;
  } catch {
    logger.error('[IQPro Webhook] Invalid JSON payload');
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    await withWebhookTenantScope(() => handleWebhookEvent(event));
  } catch (error) {
    logger.error('[IQPro Webhook] Event processing error', { eventType: event.type, error });
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
};

/**
 * Establish a tenant scope for webhook processing.
 *
 * IQPro payloads carry no organization discriminator — the handlers below
 * recover the org by reverse-lookup on a subscription or transaction id, which
 * is itself a database read. That is circular once each org has its own
 * database: you cannot query for the owner until you know which database to
 * query.
 *
 * A2 breaks the circularity: `tenant_external_ref` lives in the CONTROL plane,
 * which is always reachable without a tenant scope, so the org is resolved from
 * the external id BEFORE any tenant connection is opened.
 *
 * `withResolvedTenantScope` is the path that matters. The bootstrap scope
 * remains only as a fallback for events whose id was minted before refs were
 * written — in `shared` mode that still reaches the right rows, and in `split`
 * mode it is where an unroutable event surfaces as a loud warning rather than a
 * silent no-op.
 */
async function withWebhookTenantScope<T>(fn: () => Promise<T>): Promise<T> {
  const bootstrapDb = getBootstrapTenantDb();
  return runWithTenant(
    { orgId: WEBHOOK_BOOTSTRAP_ORG_ID, db: bootstrapDb, source: 'webhook' },
    fn,
  );
}

/**
 * Run `fn` inside the scope of the org that owns `refId`.
 *
 * Returns false when the ref is unknown, so the caller can decide whether that
 * is benign (an event for an object we never recorded) or a problem.
 *
 * ⚠️ Falling back to the bootstrap scope in `split` mode would be the silent
 * failure this whole phase exists to remove: the handler would run against the
 * CONTROL database, every tenant-table UPDATE would match zero rows, and a
 * payment would be captured at the gateway while the member's status never
 * changed — with nothing logged. So an unresolved ref logs loudly instead.
 */
async function withResolvedTenantScope(
  refType: RefType,
  refId: string,
  fn: () => Promise<void>,
): Promise<boolean> {
  const orgId = await resolveOrgByExternalRef(refType, refId);

  if (!orgId) {
    // REFUSE. This used to process against the shared database, which was
    // correct while unmapped ids could only belong to an org that had not
    // moved — their rows were still there.
    //
    // Every organization now has its own database and the shared one holds no
    // tenant data, so an unmapped id has nowhere valid to be applied. Running
    // `fn()` against the control plane would update NOTHING while reporting
    // success: a payment recorded at the gateway and lost here, silently.
    //
    // ⚠️ The callers DISCARD this return value, so the endpoint still answers
    // 200 and IQPro will NOT retry. Refusing therefore turns a silent no-op
    // into a loud, actionable log line — not an automatic recovery. Making the
    // response non-2xx so the provider retries is a deliberate change to the
    // handler's contract and belongs in its own piece of work.
    logger.error('[IQPro Webhook] No tenant mapping for external id — REFUSING to process', {
      refType,
      refId,
      remedy: 'Add a tenant_external_ref row for this id, then let the provider retry.',
    });

    return false;
  }

  const tenantDb = await getDbForOrg(orgId);
  await runWithTenant({ orgId, db: tenantDb, source: 'webhook' }, fn);
  return true;
}

async function handleWebhookEvent(event: WebhookPayload): Promise<void> {
  logger.info('[IQPro Webhook] Processing event', { type: event.type, id: event.id });

  switch (event.type) {
    case 'payment.completed':
      await handlePaymentCompleted(event.data);
      break;
    case 'payment.failed':
      await handlePaymentFailed(event.data);
      break;
    case 'subscription.payment_succeeded':
      await handleSubscriptionPaymentSucceeded(event.data);
      break;
    case 'subscription.payment_failed':
      await handleSubscriptionPaymentFailed(event.data);
      break;
    case 'subscription.cancelled':
      await handleSubscriptionCancelled(event.data);
      break;
    default:
      logger.info('[IQPro Webhook] Unhandled event type', { type: event.type });
  }
}

async function handlePaymentCompleted(data: Record<string, unknown>): Promise<void> {
  const transactionId = data.id as string | undefined;
  if (!transactionId) {
    return;
  }

  await withResolvedTenantScope(REF_TYPE.PROVIDER_TRANSACTION, transactionId, async () => {
    const orgId = requireTenantScope().orgId;
    await db
      .update(transactionSchema)
      .set({ status: 'paid', processedAt: new Date() })
      // Org predicate added with the scope: a provider id is unique per
      // merchant, not globally, so keying on it alone could cross tenants.
      .where(and(
        eq(transactionSchema.providerTransactionId, transactionId),
        eq(transactionSchema.organizationId, orgId),
      ));

    logger.info('[IQPro Webhook] Payment completed', { transactionId, orgId });
  });
}

async function handlePaymentFailed(data: Record<string, unknown>): Promise<void> {
  const transactionId = data.id as string | undefined;
  if (!transactionId) {
    return;
  }

  await withResolvedTenantScope(REF_TYPE.PROVIDER_TRANSACTION, transactionId, async () => {
    const orgId = requireTenantScope().orgId;
    await db
      .update(transactionSchema)
      .set({ status: 'declined' })
      .where(and(
        eq(transactionSchema.providerTransactionId, transactionId),
        eq(transactionSchema.organizationId, orgId),
      ));

    logger.info('[IQPro Webhook] Payment failed', { transactionId, orgId });
  });
}

async function handleSubscriptionPaymentSucceeded(data: Record<string, unknown>): Promise<void> {
  const subscriptionId = data.subscriptionId as string | undefined;
  if (!subscriptionId) {
    return;
  }

  // Check if this is a SaaS org subscription first. Select the billing cycle in
  // the same query so we don't re-read the same org row below.
  // saas_* columns are CONTROL-plane. Reading them through the tenant handle
  // worked only while both planes were one database; post-split it would query
  // the wrong database entirely.
  const org = await controlOrganizationDb().query.organizationSchema.findFirst({
    where: eq(organizationSchema.saasProviderSubscriptionId, subscriptionId),
    columns: { id: true, saasBillingCycle: true },
  });

  if (org) {
    const now = new Date();
    // Estimate next period end based on billing cycle
    const isAnnual = org.saasBillingCycle === 'annual';
    const nextPeriodEnd = isAnnual
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await controlOrganizationDb()
      .update(organizationSchema)
      .set({
        saasSubscriptionStatus: 'active',
        saasCurrentPeriodEnd: nextPeriodEnd.getTime(),
      })
      .where(eq(organizationSchema.id, org.id));

    logger.info('[IQPro Webhook] SaaS subscription payment succeeded', { subscriptionId, orgId: org.id });
    return;
  }

  // Fall back to member membership subscription
  const nextPaymentDate = data.nextPaymentDate
    ? new Date(data.nextPaymentDate as string)
    : undefined;

  // Look up the member that owns this membership BEFORE the update so we can
  // mirror the membership status onto memberSchema.status (#138). Without
  // this, the member-detail UI keeps showing the old status.
  await withResolvedTenantScope(REF_TYPE.PROVIDER_SUBSCRIPTION, subscriptionId, async () => {
    const membership = await db.query.memberMembershipSchema.findFirst({
      where: eq(memberMembershipSchema.providerSubscriptionId, subscriptionId),
      columns: { memberId: true },
    });

    await db
      .update(memberMembershipSchema)
      .set({
        status: 'active',
        ...(nextPaymentDate && { nextPaymentDate }),
      })
      .where(eq(memberMembershipSchema.providerSubscriptionId, subscriptionId));

    // Mirror onto member.status — only flip past_due → active. We deliberately
    // leave 'archived' / 'cancelled' / 'hold' / 'trial' alone so that a stray
    // payment-success webhook doesn't reactivate a member the operator
    // explicitly archived or put on hold.
    if (membership?.memberId) {
      await db
        .update(memberSchema)
        .set({ status: 'active', statusChangedAt: new Date() })
        .where(and(
          eq(memberSchema.id, membership.memberId),
          eq(memberSchema.status, 'past_due'),
        ));
    }

    logger.info('[IQPro Webhook] Subscription payment succeeded', { subscriptionId });
  });
}

async function handleSubscriptionPaymentFailed(data: Record<string, unknown>): Promise<void> {
  const subscriptionId = data.subscriptionId as string | undefined;
  if (!subscriptionId) {
    return;
  }

  // Check if this is a SaaS org subscription first
  const org = await controlOrganizationDb().query.organizationSchema.findFirst({
    where: eq(organizationSchema.saasProviderSubscriptionId, subscriptionId),
    columns: { id: true },
  });

  if (org) {
    await controlOrganizationDb()
      .update(organizationSchema)
      .set({ saasSubscriptionStatus: 'past_due' })
      .where(eq(organizationSchema.id, org.id));

    logger.info('[IQPro Webhook] SaaS subscription payment failed', { subscriptionId, orgId: org.id });
    return;
  }

  // Fall back to member membership subscription
  await withResolvedTenantScope(REF_TYPE.PROVIDER_SUBSCRIPTION, subscriptionId, async () => {
    const membership = await db.query.memberMembershipSchema.findFirst({
      where: eq(memberMembershipSchema.providerSubscriptionId, subscriptionId),
      columns: { memberId: true },
    });

    await db
      .update(memberMembershipSchema)
      .set({ status: 'past_due' })
      .where(eq(memberMembershipSchema.providerSubscriptionId, subscriptionId));

    // Mirror onto member.status (#138). Only flip if the member is currently
    // 'active' or 'trial' — leaves archived / cancelled / hold rows alone so a
    // stray webhook can't escalate a member the operator already finalised.
    if (membership?.memberId) {
      await db
        .update(memberSchema)
        .set({ status: 'past_due', statusChangedAt: new Date() })
        .where(and(
          eq(memberSchema.id, membership.memberId),
          ne(memberSchema.status, 'archived'),
          ne(memberSchema.status, 'cancelled'),
          ne(memberSchema.status, 'hold'),
        ));
    }

    logger.info('[IQPro Webhook] Subscription payment failed', { subscriptionId });
  });
}

async function handleSubscriptionCancelled(data: Record<string, unknown>): Promise<void> {
  const subscriptionId = data.id as string | undefined;
  if (!subscriptionId) {
    return;
  }

  // Check if this is a SaaS org subscription first
  const org = await controlOrganizationDb().query.organizationSchema.findFirst({
    where: eq(organizationSchema.saasProviderSubscriptionId, subscriptionId),
    columns: { id: true },
  });

  if (org) {
    await controlOrganizationDb()
      .update(organizationSchema)
      .set({ saasSubscriptionStatus: 'cancelled' })
      .where(eq(organizationSchema.id, org.id));

    logger.info('[IQPro Webhook] SaaS subscription cancelled', { subscriptionId, orgId: org.id });
    return;
  }

  // Fall back to member membership subscription
  await withResolvedTenantScope(REF_TYPE.PROVIDER_SUBSCRIPTION, subscriptionId, async () => {
    const membership = await db.query.memberMembershipSchema.findFirst({
      where: eq(memberMembershipSchema.providerSubscriptionId, subscriptionId),
      columns: { memberId: true },
    });

    await db
      .update(memberMembershipSchema)
      .set({ status: 'cancelled' })
      .where(eq(memberMembershipSchema.providerSubscriptionId, subscriptionId));

    // Mirror onto member.status (#138) only if the cancelled membership was the
    // member's last active one. We don't want to cancel a member who still has
    // a different active membership in the same org.
    if (membership?.memberId) {
      const activeOther = await db.query.memberMembershipSchema.findFirst({
        where: and(
          eq(memberMembershipSchema.memberId, membership.memberId),
          eq(memberMembershipSchema.status, 'active'),
        ),
        columns: { id: true },
      });
      if (!activeOther) {
        await db
          .update(memberSchema)
          .set({ status: 'cancelled', statusChangedAt: new Date() })
          .where(and(
            eq(memberSchema.id, membership.memberId),
            ne(memberSchema.status, 'archived'),
          ));
      }
    }

    logger.info('[IQPro Webhook] Subscription cancelled', { subscriptionId });
  });
}
