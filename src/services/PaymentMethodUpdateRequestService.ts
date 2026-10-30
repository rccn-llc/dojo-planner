/**
 * Card-update requests: notice when a member ADDS a card at IQPro, and put it
 * on their subscription.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * IQPro's add-payment-method link — the one staff can send, and the one IQPro
 * emails after a declined subscription charge — adds a card to the member's
 * IQPro CUSTOMER. It does not change the card on any subscription, and IQPro
 * sends no webhook for it. Left alone, the subscription (and IQPro's own
 * retries, and the app's retry) keep charging the card that declined.
 *
 * Basys's recommended pattern: record a pending request with the customer's
 * card ids at that moment, poll only customers with a pending request, and
 * treat a NEW payment-method id as the member's added card. On one, every live
 * subscription is switched onto it; the regular card sync then records the
 * change locally (old card `replaced`, new card active, note, audit, "Card
 * updated — ready to retry").
 *
 * Opened automatically when a decline is recorded, or by staff sending the
 * link. IQPro only: Square reports card changes by webhook.
 */
import type { PaymentProviderConfig } from './PaymentProviderConfigService';
import type { AuditContext } from '@/types/Audit';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, isNotNull, lt, ne } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { memberMembershipSchema, memberSchema, paymentMethodSchema, paymentMethodUpdateRequestSchema } from '@/models/Schema';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';
import { audit } from './AuditService';
import { MemberNotFoundError } from './MembersService';
import { getPaymentProvider } from './PaymentProviderService';

/** A request older than this stops being polled. */
export const UPDATE_REQUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type UpdateRequestReason = 'decline' | 'staff';

/** The org's provider has no card-update requests (Square). */
export class PaymentMethodUpdateNotSupportedError extends Error {
  constructor(message = 'Card-update links are only available for IQPro.') {
    super(message);
    this.name = 'PaymentMethodUpdateNotSupportedError';
  }
}

/** The member has no IQPro customer yet, so there is nothing to add a card to. */
export class NoProviderCustomerError extends Error {
  constructor(message = 'This member has no customer record at the payment provider yet.') {
    super(message);
    this.name = 'NoProviderCustomerError';
  }
}

export class MemberEmailMissingError extends Error {
  constructor(message = 'This member has no email address to send the link to.') {
    super(message);
    this.name = 'MemberEmailMissingError';
  }
}

/** The provider refused to send the link. */
export class PaymentMethodUpdateLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentMethodUpdateLinkError';
  }
}

export type OpenUpdateRequest = {
  id: string;
  reason: string;
  linkSentAt: Date | null;
  createdAt: Date;
};

function parseIds(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** The member's open (pending, not expired) request, if any. */
async function findOpen(memberId: string): Promise<(OpenUpdateRequest & { baseline: string; providerCustomerId: string }) | null> {
  const [row] = await db
    .select({
      id: paymentMethodUpdateRequestSchema.id,
      reason: paymentMethodUpdateRequestSchema.reason,
      linkSentAt: paymentMethodUpdateRequestSchema.linkSentAt,
      createdAt: paymentMethodUpdateRequestSchema.createdAt,
      baseline: paymentMethodUpdateRequestSchema.baselinePaymentMethodIds,
      providerCustomerId: paymentMethodUpdateRequestSchema.providerCustomerId,
    })
    .from(paymentMethodUpdateRequestSchema)
    .where(and(
      eq(paymentMethodUpdateRequestSchema.memberId, memberId),
      eq(paymentMethodUpdateRequestSchema.status, 'pending'),
      gte(paymentMethodUpdateRequestSchema.createdAt, new Date(Date.now() - UPDATE_REQUEST_TTL_MS)),
    ))
    .orderBy(desc(paymentMethodUpdateRequestSchema.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Mark the member's pending requests older than the window `expired`. They
 * are no longer polled, and the one-pending-per-member unique index must not
 * let a stale row block a new request.
 */
async function expireStale(memberId: string): Promise<void> {
  await db
    .update(paymentMethodUpdateRequestSchema)
    .set({ status: 'expired' })
    .where(and(
      eq(paymentMethodUpdateRequestSchema.memberId, memberId),
      eq(paymentMethodUpdateRequestSchema.status, 'pending'),
      lt(paymentMethodUpdateRequestSchema.createdAt, new Date(Date.now() - UPDATE_REQUEST_TTL_MS)),
    ));
}

/**
 * For the UI: whether a card-update link can be sent for this member (IQPro
 * org, member has an IQPro customer and an email), and the open request.
 */
export async function getPaymentMethodUpdateStatus(
  memberId: string,
  organizationId: string,
  config: PaymentProviderConfig | null,
): Promise<{ supported: boolean; request: OpenUpdateRequest | null }> {
  const [member] = await db
    .select({ email: memberSchema.email, providerCustomerId: memberSchema.providerCustomerId })
    .from(memberSchema)
    .where(and(eq(memberSchema.id, memberId), eq(memberSchema.organizationId, organizationId)))
    .limit(1);
  if (!member) {
    throw new MemberNotFoundError();
  }
  const supported = config?.provider === PAYMENT_PROVIDER.IQPRO
    && !!member.email
    && !!member.providerCustomerId
    && !member.providerCustomerId.startsWith('seed_');
  const open = await findOpen(memberId);
  return {
    supported,
    request: open ? { id: open.id, reason: open.reason, linkSentAt: open.linkSentAt, createdAt: open.createdAt } : null,
  };
}

/**
 * Open a card-update request (or reuse the open one), optionally emailing the
 * member IQPro's add-payment-method link.
 *
 * The baseline is the customer's card ids at IQPro right now; if IQPro cannot
 * be read, the ids the app already knows for the member stand in, so a card
 * added later is still detected.
 */
export async function openPaymentMethodUpdateRequest(
  memberId: string,
  organizationId: string,
  config: PaymentProviderConfig | null,
  opts: { reason: UpdateRequestReason; sendLink: boolean; actor?: AuditContext },
): Promise<{ requestId: string; created: boolean; linkSent: boolean }> {
  const [member] = await db
    .select({ id: memberSchema.id, email: memberSchema.email, providerCustomerId: memberSchema.providerCustomerId })
    .from(memberSchema)
    .where(and(eq(memberSchema.id, memberId), eq(memberSchema.organizationId, organizationId)))
    .limit(1);
  if (!member) {
    throw new MemberNotFoundError();
  }
  if (!config || config.provider !== PAYMENT_PROVIDER.IQPRO) {
    throw new PaymentMethodUpdateNotSupportedError();
  }
  if (!member.providerCustomerId || member.providerCustomerId.startsWith('seed_')) {
    throw new NoProviderCustomerError();
  }
  if (opts.sendLink && !member.email) {
    throw new MemberEmailMissingError();
  }

  const provider = await getPaymentProvider(config);
  let requestId: string;
  let created = false;

  await expireStale(memberId);
  const open = await findOpen(memberId);
  if (open) {
    requestId = open.id;
  } else {
    const remote = await provider.listCustomerPaymentMethods(config, member.providerCustomerId);
    const baseline = remote
      ? remote.map(pm => pm.paymentMethodId)
      : (await db
          .select({ id: paymentMethodSchema.providerPaymentMethodId })
          .from(paymentMethodSchema)
          .where(and(eq(paymentMethodSchema.memberId, memberId), isNotNull(paymentMethodSchema.providerPaymentMethodId))))
          .map(r => r.id as string);

    // The unique index allows one pending request per member. A concurrent
    // open that got here first wins: this insert does nothing, and its row
    // (with its baseline) is reused.
    const inserted = await db
      .insert(paymentMethodUpdateRequestSchema)
      .values({
        id: randomUUID(),
        organizationId,
        memberId,
        provider: config.provider,
        providerCustomerId: member.providerCustomerId,
        reason: opts.reason,
        baselinePaymentMethodIds: JSON.stringify(baseline),
      })
      .onConflictDoNothing()
      .returning({ id: paymentMethodUpdateRequestSchema.id });
    if (inserted[0]) {
      requestId = inserted[0].id;
      created = true;
    } else {
      const winner = await findOpen(memberId);
      if (!winner) {
        throw new Error('A card-update request conflicted but no open request was found.');
      }
      requestId = winner.id;
    }
  }

  let linkSent = false;
  if (opts.sendLink) {
    const result = await provider.sendPaymentMethodUpdateLink(config, {
      providerCustomerId: member.providerCustomerId,
      email: member.email!,
    });
    if (!result.success) {
      throw new PaymentMethodUpdateLinkError(result.error ?? 'The payment provider could not send the link.');
    }
    await db
      .update(paymentMethodUpdateRequestSchema)
      .set({ linkSentAt: new Date() })
      .where(eq(paymentMethodUpdateRequestSchema.id, requestId));
    linkSent = true;
  }

  if (opts.actor) {
    await audit(opts.actor, AUDIT_ACTION.PAYMENT_METHOD_UPDATE_REQUEST, AUDIT_ENTITY_TYPE.MEMBER, {
      entityId: memberId,
      status: 'success',
      changes: { request: { before: created ? null : 'pending', after: `${opts.reason}${linkSent ? ', link emailed' : ''}` } },
    });
  }

  return { requestId, created, linkSent };
}

/**
 * Open a request after a recorded decline. Best-effort (runs after the
 * webhook response): never throws, and quietly skips orgs/members it does not
 * apply to. No link is sent — IQPro emails one after a decline itself.
 */
export async function openUpdateRequestAfterDecline(
  memberId: string,
  organizationId: string,
  config: PaymentProviderConfig,
): Promise<void> {
  try {
    await openPaymentMethodUpdateRequest(memberId, organizationId, config, { reason: 'decline', sendLink: false });
  } catch (error) {
    if (error instanceof PaymentMethodUpdateNotSupportedError || error instanceof NoProviderCustomerError) {
      return;
    }
    logger.warn('[CardUpdateRequest] Could not open a request after a decline', {
      memberId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * If the member has an open request and added a card at IQPro since it
 * opened, put that card on every live subscription and close the request.
 * The caller (the card sync) then reconciles the local card.
 */
export async function applyPendingCardUpdate(
  memberId: string,
  organizationId: string,
  config: PaymentProviderConfig,
): Promise<{ switched: boolean; paymentMethodId?: string; error?: string }> {
  if (config.provider !== PAYMENT_PROVIDER.IQPRO) {
    return { switched: false };
  }

  // Stop polling requests nobody acted on.
  await expireStale(memberId);

  const open = await findOpen(memberId);
  if (!open) {
    return { switched: false };
  }

  const provider = await getPaymentProvider(config);
  const remote = await provider.listCustomerPaymentMethods(config, open.providerCustomerId);
  if (!remote) {
    return { switched: false, error: 'Could not read the member\'s saved cards from IQPro.' };
  }

  const baseline = new Set(parseIds(open.baseline));
  const added = remote.filter(pm => !baseline.has(pm.paymentMethodId));
  if (added.length === 0) {
    return { switched: false };
  }
  // IQPro does not report when a method was added; the new default, else the
  // last one listed, is the member's choice.
  const chosen = added.find(pm => pm.isDefault) ?? added.at(-1)!;

  const subscriptions = await db
    .select({ subscriptionId: memberMembershipSchema.providerSubscriptionId })
    .from(memberMembershipSchema)
    .innerJoin(memberSchema, eq(memberSchema.id, memberMembershipSchema.memberId))
    .where(and(
      eq(memberMembershipSchema.memberId, memberId),
      eq(memberSchema.organizationId, organizationId),
      isNotNull(memberMembershipSchema.providerSubscriptionId),
      ne(memberMembershipSchema.status, 'cancelled'),
    ));

  const failures: string[] = [];
  for (const { subscriptionId } of subscriptions) {
    if (!subscriptionId || subscriptionId.startsWith('seed_')) {
      continue;
    }
    const result = await provider.setSubscriptionPaymentMethod(config, subscriptionId, chosen.paymentMethodId);
    if (!result.success) {
      failures.push(result.error ?? 'unknown error');
    }
  }

  if (failures.length > 0) {
    // Stay pending: the next poll tries again.
    logger.error('[CardUpdateRequest] Could not move the subscription to the new card', {
      memberId,
      failures,
    });
    return { switched: false, paymentMethodId: chosen.paymentMethodId, error: failures[0] };
  }

  await db
    .update(paymentMethodUpdateRequestSchema)
    .set({ status: 'completed', newPaymentMethodId: chosen.paymentMethodId, completedAt: new Date() })
    .where(eq(paymentMethodUpdateRequestSchema.id, open.id));

  logger.info('[CardUpdateRequest] Member added a card; subscriptions switched', {
    memberId,
    subscriptions: subscriptions.length,
  });
  return { switched: true, paymentMethodId: chosen.paymentMethodId };
}

/** Members of the org with an open request — the cron polls these too. */
export async function membersWithOpenUpdateRequests(organizationId: string, limit: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ memberId: paymentMethodUpdateRequestSchema.memberId })
    .from(paymentMethodUpdateRequestSchema)
    .where(and(
      eq(paymentMethodUpdateRequestSchema.organizationId, organizationId),
      eq(paymentMethodUpdateRequestSchema.status, 'pending'),
      gte(paymentMethodUpdateRequestSchema.createdAt, new Date(Date.now() - UPDATE_REQUEST_TTL_MS)),
    ))
    .limit(limit);
  return rows.map(r => r.memberId);
}
