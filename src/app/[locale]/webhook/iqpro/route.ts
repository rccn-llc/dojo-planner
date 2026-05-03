import { and, eq, ne } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { getClientIP, isRateLimitingEnabled, webhookRateLimiter } from '@/libs/RateLimit';
import { memberMembershipSchema, memberSchema, organizationSchema, transactionSchema } from '@/models/Schema';

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
    await handleWebhookEvent(event);
  } catch (error) {
    logger.error('[IQPro Webhook] Event processing error', { eventType: event.type, error });
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
};

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

  await db
    .update(transactionSchema)
    .set({ status: 'paid', processedAt: new Date() })
    .where(eq(transactionSchema.iqproTransactionId, transactionId));

  logger.info('[IQPro Webhook] Payment completed', { transactionId });
}

async function handlePaymentFailed(data: Record<string, unknown>): Promise<void> {
  const transactionId = data.id as string | undefined;
  if (!transactionId) {
    return;
  }

  await db
    .update(transactionSchema)
    .set({ status: 'declined' })
    .where(eq(transactionSchema.iqproTransactionId, transactionId));

  logger.info('[IQPro Webhook] Payment failed', { transactionId });
}

async function handleSubscriptionPaymentSucceeded(data: Record<string, unknown>): Promise<void> {
  const subscriptionId = data.subscriptionId as string | undefined;
  if (!subscriptionId) {
    return;
  }

  // Check if this is a SaaS org subscription first
  const org = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.iqproSubscriptionId, subscriptionId),
    columns: { id: true },
  });

  if (org) {
    const now = new Date();
    // Estimate next period end based on billing cycle
    const orgRecord = await db.query.organizationSchema.findFirst({
      where: eq(organizationSchema.id, org.id),
      columns: { iqproBillingCycle: true },
    });
    const isAnnual = orgRecord?.iqproBillingCycle === 'annual';
    const nextPeriodEnd = isAnnual
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db
      .update(organizationSchema)
      .set({
        iqproSubscriptionStatus: 'active',
        iqproCurrentPeriodEnd: nextPeriodEnd.getTime(),
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
  const membership = await db.query.memberMembershipSchema.findFirst({
    where: eq(memberMembershipSchema.iqproSubscriptionId, subscriptionId),
    columns: { memberId: true },
  });

  await db
    .update(memberMembershipSchema)
    .set({
      status: 'active',
      ...(nextPaymentDate && { nextPaymentDate }),
    })
    .where(eq(memberMembershipSchema.iqproSubscriptionId, subscriptionId));

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
}

async function handleSubscriptionPaymentFailed(data: Record<string, unknown>): Promise<void> {
  const subscriptionId = data.subscriptionId as string | undefined;
  if (!subscriptionId) {
    return;
  }

  // Check if this is a SaaS org subscription first
  const org = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.iqproSubscriptionId, subscriptionId),
    columns: { id: true },
  });

  if (org) {
    await db
      .update(organizationSchema)
      .set({ iqproSubscriptionStatus: 'past_due' })
      .where(eq(organizationSchema.id, org.id));

    logger.info('[IQPro Webhook] SaaS subscription payment failed', { subscriptionId, orgId: org.id });
    return;
  }

  // Fall back to member membership subscription
  const membership = await db.query.memberMembershipSchema.findFirst({
    where: eq(memberMembershipSchema.iqproSubscriptionId, subscriptionId),
    columns: { memberId: true },
  });

  await db
    .update(memberMembershipSchema)
    .set({ status: 'past_due' })
    .where(eq(memberMembershipSchema.iqproSubscriptionId, subscriptionId));

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
}

async function handleSubscriptionCancelled(data: Record<string, unknown>): Promise<void> {
  const subscriptionId = data.id as string | undefined;
  if (!subscriptionId) {
    return;
  }

  // Check if this is a SaaS org subscription first
  const org = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.iqproSubscriptionId, subscriptionId),
    columns: { id: true },
  });

  if (org) {
    await db
      .update(organizationSchema)
      .set({ iqproSubscriptionStatus: 'cancelled' })
      .where(eq(organizationSchema.id, org.id));

    logger.info('[IQPro Webhook] SaaS subscription cancelled', { subscriptionId, orgId: org.id });
    return;
  }

  // Fall back to member membership subscription
  const membership = await db.query.memberMembershipSchema.findFirst({
    where: eq(memberMembershipSchema.iqproSubscriptionId, subscriptionId),
    columns: { memberId: true },
  });

  await db
    .update(memberMembershipSchema)
    .set({ status: 'cancelled' })
    .where(eq(memberMembershipSchema.iqproSubscriptionId, subscriptionId));

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
}
