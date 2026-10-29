/**
 * Records recurring (subscription) charges reported by a payment provider's
 * webhook — both declines and successes — and applies the membership / member
 * status side effects. Shared by the IQPro and Square webhook routes so the two
 * providers cannot drift.
 *
 * Must run INSIDE a resolved tenant scope: it uses the ambient `db`.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Before this, both webhooks only flipped statuses: a renewal that charged (or
 * failed to charge) a member left no `transaction` row, so billing history and
 * the transactions list showed only the FIRST charge of every subscription.
 *
 * ── IQPro's retry model ─────────────────────────────────────────────────────
 *
 * IQPro retries a declined subscription Sale up to 3 times per billing cycle
 * and marks the subscription overdue after the 3rd ("iQ Pro+ Subscription
 * Decline Webhooks"). Each attempt has its own transactionId and webhook, so
 * each becomes its own declined row, and `member_membership.decline_count`
 * mirrors the provider's attempt sequence. Any success resets it.
 */
import type { PaymentProvider } from '@/types/PaymentProvider';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import {
  memberMembershipSchema,
  memberSchema,
  paymentMethodSchema,
  paymentWebhookEventSchema,
  transactionSchema,
} from '@/models/Schema';
import { audit } from '@/services/AuditService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE, SYSTEM_ACTOR_USER_ID } from '@/types/Audit';
import { MEMBER_STATUS } from '@/types/MemberStatus';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';
import { recordExternalRef, REF_TYPE } from './TenantExternalRefService';

/** IQPro's documented attempt limit per billing cycle. */
export const IQPRO_MAX_ATTEMPTS = 3;

/** `failure_reason` marker for a suspected double charge (see step 6). */
export const POSSIBLE_DUPLICATE_REASON = 'possible_duplicate';

/**
 * How recently a manual retry must have collected a cycle for a later
 * automatic success to count as a probable double charge. Shorter than the
 * shortest billing cadence (weekly) so a legitimate next renewal is never
 * flagged. Calibrate against the observed IQPro retry spacing.
 */
export const DUPLICATE_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * A paid row recorded by the app itself (the at-signup first charge) this
 * close to a renewal success is the same money: Square bills the first
 * invoice of a subscription the app already charged for.
 */
const FIRST_CHARGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Member statuses a recurring-charge webhook must never overwrite. */
const FINALISED_MEMBER_STATUSES = ['archived', MEMBER_STATUS.CANCELLED, MEMBER_STATUS.HOLD];

/** Membership statuses that are being collected on. */
const COLLECTING_MEMBERSHIP_STATUSES = ['active', MEMBER_STATUS.PAST_DUE];

export type RecurringChargeEvent = {
  provider: PaymentProvider;
  /** Dedup key: IQPro `transactionId:STATUS`, Square `event_id`. */
  eventKey: string;
  organizationId: string;
  /** The subscription the provider charged. */
  providerSubscriptionId: string;
  /** The provider's charge id, when the event carries one. */
  providerTransactionId?: string | null;
  /** Square invoice id / IQPro invoiceId. */
  providerInvoiceId?: string | null;
  /** The total the provider attempted, in dollars. */
  amount: number;
  outcome: 'paid' | 'declined';
  failureReason?: string | null;
  occurredAt?: Date;
  nextPaymentDate?: Date;
};

export type RecordRecurringChargeResult
  = | { status: 'duplicate' }
    | { status: 'updated_existing'; transactionId: string }
    | { status: 'unmatched' }
    | { status: 'skipped_first_charge' }
    | {
      status: 'recorded';
      transactionId: string;
      memberId: string;
      memberMembershipId: string;
      declineCount: number;
      overdue: boolean;
      possibleDuplicate: boolean;
    };

/**
 * Claim an event key. Returns false when another delivery already claimed it.
 */
async function claimEvent(event: RecurringChargeEvent): Promise<boolean> {
  const claimed = await db
    .insert(paymentWebhookEventSchema)
    .values({
      id: randomUUID(),
      organizationId: event.organizationId,
      provider: event.provider,
      eventKey: event.eventKey,
    })
    .onConflictDoNothing()
    .returning({ id: paymentWebhookEventSchema.id });

  return claimed.length > 0;
}

/**
 * The membership a subscription belongs to, verified to sit under a member of
 * this org. Also matches a recurring hold-fee subscription.
 */
async function resolveMembership(organizationId: string, subscriptionId: string) {
  const rows = await db
    .select({
      id: memberMembershipSchema.id,
      memberId: memberMembershipSchema.memberId,
      status: memberMembershipSchema.status,
      declineCount: memberMembershipSchema.declineCount,
      providerSubscriptionId: memberMembershipSchema.providerSubscriptionId,
    })
    .from(memberMembershipSchema)
    .innerJoin(memberSchema, eq(memberSchema.id, memberMembershipSchema.memberId))
    .where(and(
      eq(memberSchema.organizationId, organizationId),
      sql`(${memberMembershipSchema.providerSubscriptionId} = ${subscriptionId} OR ${memberMembershipSchema.providerHoldFeeSubscriptionId} = ${subscriptionId})`,
    ))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    ...row,
    transactionType: row.providerSubscriptionId === subscriptionId ? 'membership_payment' : 'hold_fee',
  };
}

/** True when the cycle was collected by a recent manual retry (step 6). */
async function wasCollectedByRecentRetry(memberMembershipId: string, occurredAt: Date): Promise<boolean> {
  const [lastDecline] = await db
    .select({ createdAt: transactionSchema.createdAt })
    .from(transactionSchema)
    .where(and(
      eq(transactionSchema.memberMembershipId, memberMembershipId),
      eq(transactionSchema.status, 'declined'),
    ))
    .orderBy(desc(transactionSchema.createdAt))
    .limit(1);

  if (!lastDecline) {
    return false;
  }

  const [paidAfter] = await db
    .select({ source: transactionSchema.source, createdAt: transactionSchema.createdAt })
    .from(transactionSchema)
    .where(and(
      eq(transactionSchema.memberMembershipId, memberMembershipId),
      eq(transactionSchema.status, 'paid'),
      gte(transactionSchema.createdAt, lastDecline.createdAt),
    ))
    .orderBy(desc(transactionSchema.createdAt))
    .limit(1);

  // Only a RETRY that is the most recent paid row counts. If an automatic
  // charge already succeeded after it, this one is a later cycle.
  return paidAfter?.source === 'retry'
    && occurredAt.getTime() - paidAfter.createdAt.getTime() <= DUPLICATE_WINDOW_MS;
}

/** True when the app itself recorded this first charge moments ago. */
async function isAppRecordedFirstCharge(memberMembershipId: string, occurredAt: Date): Promise<boolean> {
  const [recent] = await db
    .select({ id: transactionSchema.id })
    .from(transactionSchema)
    .where(and(
      eq(transactionSchema.memberMembershipId, memberMembershipId),
      eq(transactionSchema.status, 'paid'),
      eq(transactionSchema.source, 'app'),
      gte(transactionSchema.createdAt, new Date(occurredAt.getTime() - FIRST_CHARGE_WINDOW_MS)),
    ))
    .limit(1);
  return Boolean(recent);
}

/** Undo a claim so the provider's redelivery is processed, not dropped. */
async function releaseEvent(event: RecurringChargeEvent): Promise<void> {
  await db
    .delete(paymentWebhookEventSchema)
    .where(and(
      eq(paymentWebhookEventSchema.provider, event.provider),
      eq(paymentWebhookEventSchema.eventKey, event.eventKey),
    ));
}

export async function recordRecurringCharge(event: RecurringChargeEvent): Promise<RecordRecurringChargeResult> {
  // 1. Dedup. Providers deliver at least once.
  if (!(await claimEvent(event))) {
    logger.info('[RecurringCharge] Duplicate delivery ignored', { provider: event.provider, eventKey: event.eventKey });
    return { status: 'duplicate' };
  }

  try {
    return await processClaimedEvent(event);
  } catch (error) {
    // The route answers 500 so the provider redelivers. Without releasing the
    // claim that redelivery would be dropped as a duplicate and the charge
    // never recorded.
    await releaseEvent(event).catch((releaseError: unknown) => {
      logger.error('[RecurringCharge] Failed to release event claim after an error', {
        eventKey: event.eventKey,
        error: releaseError instanceof Error ? releaseError.message : String(releaseError),
      });
    });
    throw error;
  }
}

async function processClaimedEvent(event: RecurringChargeEvent): Promise<RecordRecurringChargeResult> {
  const { organizationId } = event;
  const occurredAt = event.occurredAt ?? new Date();

  // 2. A charge we already have a row for (a manual retry whose webhook
  //    followed it, say): update it, never insert a second row.
  if (event.providerTransactionId) {
    const [existing] = await db
      .select({ id: transactionSchema.id })
      .from(transactionSchema)
      .where(and(
        eq(transactionSchema.providerTransactionId, event.providerTransactionId),
        eq(transactionSchema.organizationId, organizationId),
      ))
      .limit(1);

    if (existing) {
      await db
        .update(transactionSchema)
        .set({
          status: event.outcome,
          ...(event.outcome === 'paid' ? { processedAt: occurredAt } : { failureReason: event.failureReason ?? null }),
        })
        .where(and(
          eq(transactionSchema.providerTransactionId, event.providerTransactionId),
          eq(transactionSchema.organizationId, organizationId),
          // A refunded charge stays refunded.
          ne(transactionSchema.status, 'refunded'),
        ));
      return { status: 'updated_existing', transactionId: existing.id };
    }
  }

  // 3. Same invoice already recorded with this outcome (Square invoice events
  //    carry no payment id, and Square may send more than one event for it).
  if (event.providerInvoiceId) {
    const [sameInvoice] = await db
      .select({ id: transactionSchema.id })
      .from(transactionSchema)
      .where(and(
        eq(transactionSchema.providerInvoiceId, event.providerInvoiceId),
        eq(transactionSchema.organizationId, organizationId),
        eq(transactionSchema.status, event.outcome),
      ))
      .limit(1);
    if (sameInvoice) {
      return { status: 'duplicate' };
    }
  }

  // 4. The membership this subscription bills.
  const membership = await resolveMembership(organizationId, event.providerSubscriptionId);
  if (!membership) {
    logger.warn('[RecurringCharge] No membership for subscription — not recorded', {
      provider: event.provider,
      providerSubscriptionId: event.providerSubscriptionId,
      organizationId,
    });
    return { status: 'unmatched' };
  }

  // 5. The first invoice of a subscription the app already charged at signup.
  if (event.outcome === 'paid' && await isAppRecordedFirstCharge(membership.id, occurredAt)) {
    logger.info('[RecurringCharge] First-period charge already recorded by the app', {
      memberMembershipId: membership.id,
    });
    return { status: 'skipped_first_charge' };
  }

  // 6. A success for a cycle a manual retry already collected.
  const possibleDuplicate = event.outcome === 'paid'
    && await wasCollectedByRecentRetry(membership.id, occurredAt);

  const [savedMethod] = await db
    .select({ type: paymentMethodSchema.type })
    .from(paymentMethodSchema)
    .where(and(eq(paymentMethodSchema.memberId, membership.memberId), eq(paymentMethodSchema.status, 'active')))
    .orderBy(desc(paymentMethodSchema.isDefault))
    .limit(1);

  const transactionId = randomUUID();
  const collecting = COLLECTING_MEMBERSHIP_STATUSES.includes(membership.status);
  let declineCount = membership.declineCount;

  await db.transaction(async (tx) => {
    await tx.insert(transactionSchema).values({
      id: transactionId,
      organizationId,
      memberId: membership.memberId,
      memberMembershipId: membership.id,
      providerTransactionId: event.providerTransactionId ?? null,
      providerInvoiceId: event.providerInvoiceId ?? null,
      transactionType: membership.transactionType,
      // The provider's charged TOTAL (fees included). First-charge rows store
      // the pre-fee base instead; the retry backs the fee out (see
      // retryFailedTransaction) so a retry charges the same total.
      amount: event.amount,
      currency: 'USD',
      status: event.outcome,
      source: 'webhook_recurring',
      paymentMethod: savedMethod?.type ?? 'card',
      description: event.outcome === 'paid' ? 'Recurring membership payment' : 'Recurring membership payment (declined)',
      failureReason: possibleDuplicate ? POSSIBLE_DUPLICATE_REASON : (event.failureReason ?? null),
      processedAt: event.outcome === 'paid' ? occurredAt : null,
      createdAt: occurredAt,
    });

    // Hold-fee subscriptions bill a membership that is on hold; their charges
    // must not move the membership or member out of hold.
    if (membership.transactionType !== 'membership_payment' || !collecting) {
      return;
    }

    if (event.outcome === 'declined') {
      const [updated] = await tx
        .update(memberMembershipSchema)
        .set({
          status: MEMBER_STATUS.PAST_DUE,
          declineCount: sql`${memberMembershipSchema.declineCount} + 1`,
          lastDeclineAt: occurredAt,
          lastDeclineReason: event.failureReason ?? null,
        })
        .where(eq(memberMembershipSchema.id, membership.id))
        .returning({ declineCount: memberMembershipSchema.declineCount });
      declineCount = updated?.declineCount ?? declineCount + 1;

      await tx
        .update(memberSchema)
        .set({ status: MEMBER_STATUS.PAST_DUE, statusChangedAt: new Date() })
        .where(and(
          eq(memberSchema.id, membership.memberId),
          eq(memberSchema.organizationId, organizationId),
          notInArray(memberSchema.status, FINALISED_MEMBER_STATUSES),
        ));
      return;
    }

    // Paid: clear the decline state and lift past_due.
    await tx
      .update(memberMembershipSchema)
      .set({
        status: 'active',
        declineCount: 0,
        lastDeclineAt: null,
        lastDeclineReason: null,
        ...(event.nextPaymentDate && { nextPaymentDate: event.nextPaymentDate }),
      })
      .where(eq(memberMembershipSchema.id, membership.id));
    declineCount = 0;

    const [otherPastDue] = await tx
      .select({ id: memberMembershipSchema.id })
      .from(memberMembershipSchema)
      .where(and(
        eq(memberMembershipSchema.memberId, membership.memberId),
        eq(memberMembershipSchema.status, MEMBER_STATUS.PAST_DUE),
        ne(memberMembershipSchema.id, membership.id),
      ))
      .limit(1);

    if (!otherPastDue) {
      await tx
        .update(memberSchema)
        .set({ status: MEMBER_STATUS.ACTIVE, statusChangedAt: new Date() })
        .where(and(
          eq(memberSchema.id, membership.memberId),
          eq(memberSchema.organizationId, organizationId),
          inArray(memberSchema.status, [MEMBER_STATUS.PAST_DUE]),
        ));
    }
  });

  await recordExternalRef(REF_TYPE.PROVIDER_TRANSACTION, event.providerTransactionId, organizationId);

  const systemContext = { userId: SYSTEM_ACTOR_USER_ID, orgId: organizationId };
  const overdue = event.provider === PAYMENT_PROVIDER.IQPRO && declineCount >= IQPRO_MAX_ATTEMPTS;

  if (event.outcome === 'declined' && event.provider === PAYMENT_PROVIDER.IQPRO && declineCount === IQPRO_MAX_ATTEMPTS) {
    await audit(systemContext, AUDIT_ACTION.MEMBERSHIP_OVERDUE, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
      entityId: membership.id,
      status: 'success',
    });
  }

  if (possibleDuplicate) {
    logger.warn('[RecurringCharge] Possible double charge: cycle already collected by a manual retry', {
      transactionId,
      memberMembershipId: membership.id,
      organizationId,
    });
    await audit(systemContext, AUDIT_ACTION.TRANSACTION_POSSIBLE_DUPLICATE, AUDIT_ENTITY_TYPE.TRANSACTION, {
      entityId: transactionId,
      status: 'success',
    });
  }

  logger.info('[RecurringCharge] Recorded', {
    provider: event.provider,
    outcome: event.outcome,
    transactionId,
    memberMembershipId: membership.id,
    declineCount,
  });

  return {
    status: 'recorded',
    transactionId,
    memberId: membership.memberId,
    memberMembershipId: membership.id,
    declineCount,
    overdue,
    possibleDuplicate,
  };
}
