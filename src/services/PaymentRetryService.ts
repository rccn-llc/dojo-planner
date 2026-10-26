/**
 * Retry a declined recurring payment from the app.
 *
 * ── What a retry is ─────────────────────────────────────────────────────────
 *
 * A standalone charge of the card saved on the membership's subscription, for
 * the amount the failed attempt tried to collect. It is NOT "pay the
 * provider's invoice": Square documents that its API cannot pay an invoice,
 * and IQPro offers no such action either. Every retry is recorded as its own
 * transaction row (`source = 'retry'`, `retry_of_transaction_id` → the failed
 * row), approved or declined.
 *
 * ── Provider differences ───────────────────────────────────────────────────
 *
 * - **Square** emails the member the failed invoice with a pay link and does
 *   not retry. After a successful retry the invoice is CANCELLED so that link
 *   cannot also be paid (`closeFailedInvoice`).
 * - **IQPro** retries a declined subscription charge itself, up to 3 times per
 *   cycle. A manual retry while automatic attempts remain risks IQPro's own
 *   retry ALSO succeeding. The UI warns and requires confirmation; the
 *   recorder flags a probable double charge (`possible_duplicate`). If the
 *   sandbox shows IQPro does not stand down after a manual charge, set
 *   `IQPRO_MANUAL_RETRY_POLICY` to `'overdue_only'`.
 *
 * ── Concurrency ─────────────────────────────────────────────────────────────
 *
 * The failed row is locked FOR UPDATE while a `pending` placeholder retry row
 * is inserted. A second concurrent retry sees the pending child and is
 * refused, so two staff members cannot both charge the same failure.
 */
import type { PaymentProviderConfig } from './PaymentProviderConfigService';
import type { FeeQuote } from './PaymentProviderService';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, inArray, ne } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { getServiceFeePct, roundCents } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import {
  memberMembershipSchema,
  memberSchema,
  membershipPlanSchema,
  paymentMethodSchema,
  transactionSchema,
} from '@/models/Schema';
import { MEMBER_STATUS } from '@/types/MemberStatus';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';
import { sendPaymentReceiptEmail } from './EmailService';
import { TransactionNotFoundError } from './MemberPaymentService';
import { getPaymentProvider } from './PaymentProviderService';
import { IQPRO_MAX_ATTEMPTS } from './RecurringChargeWebhookService';
import { recordExternalRef, REF_TYPE } from './TenantExternalRefService';

/**
 * Whether staff may retry an IQPro charge while IQPro still has automatic
 * attempts left. Decided by the Phase 0 sandbox double-charge test.
 */
export const IQPRO_MANUAL_RETRY_POLICY: 'anytime' | 'overdue_only' = 'anytime';

const RETRYABLE_TYPES = ['membership_payment', 'hold_fee'];

/** How long a `seed_slow_*` simulated retry takes, so the UI's processing state is visible. */
export const SIMULATED_SLOW_RETRY_MS = 3000;

export class TransactionNotRetryableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'TransactionNotRetryableError';
  }
}

export class TransactionRetryInProgressError extends Error {
  constructor() {
    super('A retry for this payment is already in progress.');
    this.name = 'TransactionRetryInProgressError';
  }
}

/** No payment provider is configured for the org. */
export class RetryProviderUnavailableError extends Error {
  constructor() {
    super('No payment provider is configured for this organization.');
    this.name = 'RetryProviderUnavailableError';
  }
}

/** The charge could not be attempted (not a decline): missing card, network, config. */
export class TransactionRetryFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionRetryFailedError';
  }
}

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

type RetryContext = {
  original: {
    id: string;
    amount: number;
    source: string;
    transactionType: string;
    providerInvoiceId: string | null;
    failureReason: string | null;
    createdAt: Date;
    memberId: string;
    memberMembershipId: string;
  };
  membership: {
    id: string;
    status: string;
    declineCount: number;
    subscriptionId: string;
    planName: string;
  };
  member: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    providerCustomerId: string | null;
  };
};

/**
 * Load and validate everything a retry needs. Throws a typed error for each
 * reason a row cannot be retried. Pass `lock` inside a transaction to hold the
 * failed row FOR UPDATE.
 */
async function loadRetryContext(
  exec: Executor,
  transactionId: string,
  organizationId: string,
  opts: { lock?: boolean } = {},
): Promise<RetryContext> {
  const query = exec
    .select({
      id: transactionSchema.id,
      amount: transactionSchema.amount,
      status: transactionSchema.status,
      source: transactionSchema.source,
      transactionType: transactionSchema.transactionType,
      providerInvoiceId: transactionSchema.providerInvoiceId,
      failureReason: transactionSchema.failureReason,
      createdAt: transactionSchema.createdAt,
      memberId: transactionSchema.memberId,
      memberMembershipId: transactionSchema.memberMembershipId,
    })
    .from(transactionSchema)
    .where(and(eq(transactionSchema.id, transactionId), eq(transactionSchema.organizationId, organizationId)))
    .limit(1);
  const [row] = opts.lock ? await query.for('update') : await query;

  if (!row) {
    throw new TransactionNotFoundError(transactionId);
  }
  if (row.status !== 'declined') {
    throw new TransactionNotRetryableError('Only declined payments can be retried.');
  }
  if (!RETRYABLE_TYPES.includes(row.transactionType)) {
    throw new TransactionNotRetryableError('Only membership and hold-fee payments can be retried.');
  }
  if (!row.memberId || !row.memberMembershipId) {
    throw new TransactionNotRetryableError('This payment is not linked to a membership.');
  }

  const [joined] = await exec
    .select({
      membershipId: memberMembershipSchema.id,
      status: memberMembershipSchema.status,
      declineCount: memberMembershipSchema.declineCount,
      providerSubscriptionId: memberMembershipSchema.providerSubscriptionId,
      providerHoldFeeSubscriptionId: memberMembershipSchema.providerHoldFeeSubscriptionId,
      planName: membershipPlanSchema.name,
      memberId: memberSchema.id,
      firstName: memberSchema.firstName,
      lastName: memberSchema.lastName,
      email: memberSchema.email,
      providerCustomerId: memberSchema.providerCustomerId,
    })
    .from(memberMembershipSchema)
    .innerJoin(memberSchema, eq(memberSchema.id, memberMembershipSchema.memberId))
    .innerJoin(membershipPlanSchema, eq(membershipPlanSchema.id, memberMembershipSchema.membershipPlanId))
    .where(and(
      eq(memberMembershipSchema.id, row.memberMembershipId),
      eq(memberSchema.organizationId, organizationId),
    ))
    .limit(1);

  if (!joined) {
    throw new TransactionNotRetryableError('This payment is not linked to a membership.');
  }

  const subscriptionId = row.transactionType === 'hold_fee'
    ? joined.providerHoldFeeSubscriptionId
    : joined.providerSubscriptionId;
  if (!subscriptionId) {
    throw new TransactionNotRetryableError('There is no card on file for this subscription — update the payment method.');
  }

  // A pending retry child: someone else is charging this right now.
  const [pending] = await exec
    .select({ id: transactionSchema.id })
    .from(transactionSchema)
    .where(and(eq(transactionSchema.retryOfTransactionId, row.id), eq(transactionSchema.status, 'pending')))
    .limit(1);
  if (pending) {
    throw new TransactionRetryInProgressError();
  }

  // Resolved: something collected this membership after the failure — a
  // manual retry, an automatic retry, or the member paying the provider's
  // email link. One success settles every failed attempt in the cycle.
  const [laterPaid] = await exec
    .select({ id: transactionSchema.id })
    .from(transactionSchema)
    .where(and(
      eq(transactionSchema.memberMembershipId, row.memberMembershipId),
      eq(transactionSchema.status, 'paid'),
      gt(transactionSchema.createdAt, row.createdAt),
    ))
    .limit(1);
  if (laterPaid) {
    throw new TransactionNotRetryableError('This payment has already been collected.');
  }

  // Only the LATEST failure is retried; an older attempt in the same cycle is
  // superseded by the newer one (same amount, same card).
  const [laterDeclined] = await exec
    .select({ id: transactionSchema.id })
    .from(transactionSchema)
    .where(and(
      eq(transactionSchema.memberMembershipId, row.memberMembershipId),
      eq(transactionSchema.status, 'declined'),
      inArray(transactionSchema.transactionType, RETRYABLE_TYPES),
      gt(transactionSchema.createdAt, row.createdAt),
    ))
    .limit(1);
  if (laterDeclined) {
    throw new TransactionNotRetryableError('A newer failed attempt exists — retry that one instead.');
  }

  return {
    original: {
      id: row.id,
      amount: row.amount,
      source: row.source,
      transactionType: row.transactionType,
      providerInvoiceId: row.providerInvoiceId,
      failureReason: row.failureReason,
      createdAt: row.createdAt,
      memberId: row.memberId,
      memberMembershipId: row.memberMembershipId,
    },
    membership: {
      id: joined.membershipId,
      status: joined.status,
      declineCount: joined.declineCount,
      subscriptionId,
      planName: joined.planName,
    },
    member: {
      id: joined.memberId,
      firstName: joined.firstName,
      lastName: joined.lastName,
      email: joined.email,
      providerCustomerId: joined.providerCustomerId,
    },
  };
}

/**
 * The pre-fee base to re-charge. Webhook-recorded rows hold the provider's
 * charged TOTAL (fee included), so the service fee is backed out — otherwise
 * the retry would charge the total PLUS a second fee. App-recorded rows
 * already hold the base.
 */
export function retryBaseAmount(row: { amount: number; source: string }, serviceFeePct: number): number {
  if (row.source !== 'webhook_recurring') {
    return roundCents(row.amount);
  }
  return roundCents(row.amount / (1 + serviceFeePct / 100));
}

/** IQPro automatic attempts left in the current cycle; 0 for Square. */
export function autoRetriesRemaining(provider: string, declineCount: number): number {
  return provider === PAYMENT_PROVIDER.IQPRO ? Math.max(0, IQPRO_MAX_ATTEMPTS - declineCount) : 0;
}

/** Non-production simulation for synthetic seed subscriptions (local testing). */
function isSimulated(subscriptionId: string): boolean {
  return subscriptionId.startsWith('seed_') && process.env.NODE_ENV !== 'production';
}

export type RetryQuote = {
  transactionId: string;
  provider: string | null;
  memberName: string;
  planName: string;
  failedAt: Date;
  failureReason: string | null;
  baseAmount: number;
  /** Fee breakdown for the charge; null when the provider could not quote it. */
  fees: Pick<FeeQuote, 'baseAmount' | 'serviceFeeAmount' | 'serviceFeePct' | 'taxAmount' | 'amount'> | null;
  card: {
    type: string;
    cardBrand: string | null;
    last4: string | null;
    expirationDate: string | null;
    updatedAt: Date | null;
    updatedSource: string | null;
    /** The card was replaced/updated at the provider after this failure. */
    updatedAfterFailure: boolean;
  } | null;
  declineCount: number;
  autoRetriesRemaining: number;
  overdue: boolean;
  /** Set when policy forbids retrying now; the UI disables the charge. */
  blockedReason: string | null;
};

function estimateFees(baseAmount: number): RetryQuote['fees'] {
  try {
    const pct = getServiceFeePct();
    const fee = roundCents(baseAmount * pct / 100);
    return { baseAmount, serviceFeeAmount: fee, serviceFeePct: pct, taxAmount: 0, amount: roundCents(baseAmount + fee) };
  } catch {
    return null;
  }
}

/** What a retry would charge, and with which card — for the confirm step of the modal. */
export async function getRetryQuote(
  transactionId: string,
  organizationId: string,
  config: PaymentProviderConfig | null,
): Promise<RetryQuote> {
  const ctx = await loadRetryContext(db, transactionId, organizationId);
  const pct = (() => {
    try {
      return getServiceFeePct();
    } catch {
      return 0;
    }
  })();
  const baseAmount = retryBaseAmount(ctx.original, pct);

  const [card] = await db
    .select({
      type: paymentMethodSchema.type,
      cardBrand: paymentMethodSchema.cardBrand,
      last4: paymentMethodSchema.last4,
      expirationDate: paymentMethodSchema.expirationDate,
      updatedAt: paymentMethodSchema.updatedAt,
      updatedSource: paymentMethodSchema.updatedSource,
    })
    .from(paymentMethodSchema)
    .where(and(eq(paymentMethodSchema.memberId, ctx.member.id), eq(paymentMethodSchema.status, 'active')))
    .orderBy(desc(paymentMethodSchema.isDefault), desc(paymentMethodSchema.updatedAt))
    .limit(1);

  let fees: RetryQuote['fees'] = null;
  if (config && !isSimulated(ctx.membership.subscriptionId)) {
    try {
      const provider = await getPaymentProvider(config);
      const quote = await provider.computeFees(config, {
        baseAmount,
        isTaxable: false,
        taxStatePct: 0,
        paymentMethodType: card?.type === 'bank_transfer' ? 'ach' : 'card',
      });
      fees = { baseAmount: quote.baseAmount, serviceFeeAmount: quote.serviceFeeAmount, serviceFeePct: quote.serviceFeePct, taxAmount: quote.taxAmount, amount: quote.amount };
    } catch (error) {
      logger.warn('[PaymentRetry] Fee quote failed; showing an estimate', {
        transactionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  fees ??= estimateFees(baseAmount);

  const providerName = config?.provider ?? null;
  const remaining = providerName ? autoRetriesRemaining(providerName, ctx.membership.declineCount) : 0;
  const overdue = providerName === PAYMENT_PROVIDER.IQPRO && ctx.membership.declineCount >= IQPRO_MAX_ATTEMPTS;

  return {
    transactionId,
    provider: providerName,
    memberName: `${ctx.member.firstName} ${ctx.member.lastName}`.trim(),
    planName: ctx.membership.planName,
    failedAt: ctx.original.createdAt,
    failureReason: ctx.original.failureReason,
    baseAmount,
    fees,
    card: card
      ? {
          type: card.type,
          cardBrand: card.cardBrand,
          last4: card.last4,
          expirationDate: card.expirationDate,
          updatedAt: card.updatedAt,
          updatedSource: card.updatedSource,
          updatedAfterFailure: card.updatedSource === 'provider_sync'
            && !!card.updatedAt
            && card.updatedAt.getTime() > ctx.original.createdAt.getTime(),
        }
      : null,
    declineCount: ctx.membership.declineCount,
    autoRetriesRemaining: remaining,
    overdue,
    blockedReason: retryBlockedReason(providerName, remaining),
  };
}

function retryBlockedReason(provider: string | null, remaining: number): string | null {
  if (!provider) {
    return 'No payment provider is configured for this organization.';
  }
  if (provider === PAYMENT_PROVIDER.IQPRO && IQPRO_MANUAL_RETRY_POLICY === 'overdue_only' && remaining > 0) {
    return 'IQPro is still retrying this charge automatically. A manual retry is available once it is overdue.';
  }
  return null;
}

export type RetryResult = {
  status: 'approved' | 'declined';
  retryTransactionId: string;
  amountCharged?: number;
  declineReason?: string;
  /** Money was collected but a follow-up step failed (e.g. closing the Square invoice). */
  warning?: string;
  membershipReactivated: boolean;
};

type ChargeOutcome
  = | { kind: 'approved'; amountCharged: number; providerTransactionId: string | null; paymentMethod: string; fees?: FeeQuote }
    | { kind: 'declined'; reason: string; providerTransactionId: string | null; paymentMethod: string }
    | { kind: 'error'; message: string };

async function simulateCharge(subscriptionId: string, baseAmount: number): Promise<ChargeOutcome> {
  if (subscriptionId.startsWith('seed_slow_')) {
    await new Promise(resolve => setTimeout(resolve, SIMULATED_SLOW_RETRY_MS));
  }
  if (subscriptionId.startsWith('seed_decline_')) {
    return { kind: 'declined', reason: 'Insufficient funds (simulated)', providerTransactionId: `seed_retry_${randomUUID()}`, paymentMethod: 'card' };
  }
  const fees = estimateFees(baseAmount);
  return { kind: 'approved', amountCharged: fees?.amount ?? baseAmount, providerTransactionId: `seed_retry_${randomUUID()}`, paymentMethod: 'card' };
}

async function chargeSubscriptionCard(
  config: PaymentProviderConfig,
  ctx: RetryContext,
  baseAmount: number,
): Promise<ChargeOutcome> {
  if (isSimulated(ctx.membership.subscriptionId)) {
    return simulateCharge(ctx.membership.subscriptionId, baseAmount);
  }

  const provider = await getPaymentProvider(config);
  const label = ctx.original.transactionType === 'hold_fee' ? 'hold fee' : 'membership payment';
  const charge = await provider.chargeOneTimeFee(config, {
    providerSubscriptionId: ctx.membership.subscriptionId,
    providerCustomerId: ctx.member.providerCustomerId ?? '',
    amount: baseAmount,
    description: `Retry of ${ctx.membership.planName} ${label}`,
    caption: 'Payment retry',
  });

  if (charge.success) {
    return {
      kind: 'approved',
      amountCharged: charge.amountCharged ?? baseAmount,
      providerTransactionId: charge.transactionId ?? null,
      paymentMethod: charge.paymentMethodName ?? 'card',
      fees: charge.feeBreakdown,
    };
  }
  if (charge.declined) {
    return {
      kind: 'declined',
      reason: charge.error ?? 'Declined',
      providerTransactionId: charge.transactionId ?? null,
      paymentMethod: charge.paymentMethodName ?? 'card',
    };
  }
  return { kind: 'error', message: charge.error ?? 'The payment could not be attempted.' };
}

/** Lift a collected membership (and its member) out of past_due. */
async function reactivateAfterRetry(ctx: RetryContext, organizationId: string): Promise<boolean> {
  if (ctx.original.transactionType !== 'membership_payment') {
    return false;
  }

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(memberMembershipSchema)
      .set({
        status: 'active',
        declineCount: 0,
        lastDeclineAt: null,
        lastDeclineReason: null,
      })
      .where(and(
        eq(memberMembershipSchema.id, ctx.membership.id),
        inArray(memberMembershipSchema.status, ['active', MEMBER_STATUS.PAST_DUE]),
      ))
      .returning({ id: memberMembershipSchema.id });

    const [otherPastDue] = await tx
      .select({ id: memberMembershipSchema.id })
      .from(memberMembershipSchema)
      .where(and(
        eq(memberMembershipSchema.memberId, ctx.member.id),
        eq(memberMembershipSchema.status, MEMBER_STATUS.PAST_DUE),
        ne(memberMembershipSchema.id, ctx.membership.id),
      ))
      .limit(1);

    let memberFlipped = false;
    if (!otherPastDue) {
      const rows = await tx
        .update(memberSchema)
        .set({ status: MEMBER_STATUS.ACTIVE, statusChangedAt: new Date() })
        .where(and(
          eq(memberSchema.id, ctx.member.id),
          eq(memberSchema.organizationId, organizationId),
          eq(memberSchema.status, MEMBER_STATUS.PAST_DUE),
        ))
        .returning({ id: memberSchema.id });
      memberFlipped = rows.length > 0;
    }

    return ctx.membership.status === MEMBER_STATUS.PAST_DUE ? updated.length > 0 : memberFlipped;
  });
}

/**
 * Retry a declined recurring payment. A decline is a normal RESULT (status
 * 'declined'), not an error — the attempt is recorded and returned. Errors are
 * thrown only when the charge could not be attempted.
 */
export async function retryFailedTransaction(
  transactionId: string,
  organizationId: string,
  config: PaymentProviderConfig | null,
): Promise<RetryResult> {
  if (!config) {
    throw new RetryProviderUnavailableError();
  }

  const retryTransactionId = randomUUID();

  // Lock the failed row, validate, and insert the pending placeholder in ONE
  // transaction: a concurrent retry blocks on the lock, then sees the pending
  // child and is refused.
  const ctx = await db.transaction(async (tx) => {
    const loaded = await loadRetryContext(tx, transactionId, organizationId, { lock: true });

    const blocked = retryBlockedReason(config.provider, autoRetriesRemaining(config.provider, loaded.membership.declineCount));
    if (blocked) {
      throw new TransactionNotRetryableError(blocked);
    }

    await tx.insert(transactionSchema).values({
      id: retryTransactionId,
      organizationId,
      memberId: loaded.original.memberId,
      memberMembershipId: loaded.original.memberMembershipId,
      transactionType: loaded.original.transactionType,
      amount: loaded.original.amount,
      currency: 'USD',
      status: 'pending',
      source: 'retry',
      retryOfTransactionId: loaded.original.id,
      description: `Retry of ${loaded.membership.planName} payment`,
      // Explicit, like the webhook recorder: ordering against the failed row
      // ("resolved", "superseded") compares app-written timestamps, so they
      // must come from the same clock.
      createdAt: new Date(),
    });
    return loaded;
  });

  const pct = (() => {
    try {
      return getServiceFeePct();
    } catch {
      return 0;
    }
  })();
  const baseAmount = retryBaseAmount(ctx.original, pct);

  let outcome: ChargeOutcome;
  try {
    outcome = await chargeSubscriptionCard(config, ctx, baseAmount);
  } catch (error) {
    outcome = { kind: 'error', message: error instanceof Error ? error.message : 'The payment could not be attempted.' };
  }

  if (outcome.kind === 'error') {
    // Nothing was charged as far as the provider told us. Remove the
    // placeholder so the failure can be retried; log loudly, because a
    // transport timeout AFTER the request reached the provider is
    // indistinguishable here — the operator should check the provider console.
    await db.delete(transactionSchema).where(eq(transactionSchema.id, retryTransactionId));
    logger.error('[PaymentRetry] Charge could not be attempted', {
      transactionId,
      organizationId,
      error: outcome.message,
    });
    throw new TransactionRetryFailedError(outcome.message);
  }

  const now = new Date();
  if (outcome.kind === 'declined') {
    await db
      .update(transactionSchema)
      .set({
        status: 'declined',
        failureReason: outcome.reason,
        providerTransactionId: outcome.providerTransactionId,
        paymentMethod: outcome.paymentMethod,
      })
      .where(eq(transactionSchema.id, retryTransactionId));
    await recordExternalRef(REF_TYPE.PROVIDER_TRANSACTION, outcome.providerTransactionId, organizationId);

    return { status: 'declined', retryTransactionId, declineReason: outcome.reason, membershipReactivated: false };
  }

  await db
    .update(transactionSchema)
    .set({
      status: 'paid',
      amount: outcome.amountCharged,
      providerTransactionId: outcome.providerTransactionId,
      paymentMethod: outcome.paymentMethod,
      processedAt: now,
    })
    .where(eq(transactionSchema.id, retryTransactionId));
  await recordExternalRef(REF_TYPE.PROVIDER_TRANSACTION, outcome.providerTransactionId, organizationId);

  const membershipReactivated = await reactivateAfterRetry(ctx, organizationId);

  let warning: string | undefined;
  if (ctx.original.providerInvoiceId && !isSimulated(ctx.membership.subscriptionId)) {
    const provider = await getPaymentProvider(config);
    const closed = await provider.closeFailedInvoice(config, ctx.original.providerInvoiceId);
    if (!closed.success) {
      warning = 'The payment was collected, but the open invoice could not be cancelled at the payment provider. Void it in the provider dashboard so the member is not asked to pay again.';
      logger.error('[PaymentRetry] Could not close the failed invoice after a successful retry', {
        transactionId,
        providerInvoiceId: ctx.original.providerInvoiceId,
        error: closed.error,
      });
    }
  }

  if (ctx.member.email) {
    const fees = outcome.fees;
    sendPaymentReceiptEmail({
      toEmail: ctx.member.email,
      firstName: ctx.member.firstName,
      lastName: ctx.member.lastName,
      lineItems: [{ name: `${ctx.membership.planName} payment`, quantity: 1, unitPrice: baseAmount }],
      subtotal: baseAmount,
      discountAmount: 0,
      taxAmount: fees?.taxAmount ?? 0,
      taxPct: fees?.taxPct ?? 0,
      serviceFeeAmount: fees?.serviceFeeAmount ?? roundCents(outcome.amountCharged - baseAmount),
      serviceFeePct: fees?.serviceFeePct ?? pct,
      total: outcome.amountCharged,
      transactionId: outcome.providerTransactionId ?? retryTransactionId,
      isRecurring: true,
    }).catch((error: unknown) => {
      logger.error('[PaymentRetry] Receipt email failed (non-fatal)', { error });
    });
  }

  return {
    status: 'approved',
    retryTransactionId,
    amountCharged: outcome.amountCharged,
    ...(warning ? { warning } : {}),
    membershipReactivated,
  };
}
