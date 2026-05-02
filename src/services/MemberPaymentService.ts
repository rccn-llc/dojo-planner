/**
 * Member payment orchestration service.
 *
 * Coordinates the full payment flow for member payments:
 * 1. Get or create payment processor customer (returns billingAddressId)
 * 2. Register payment method (card/ACH)
 * 3. Calculate authoritative fees from IQPro
 * 4. Process one-time payment OR create recurring subscription
 *    - Autopay subscriptions ALSO trigger an immediate Sale charge for the
 *      first period, since IQPro subscriptions don't auto-charge on creation.
 * 5. Persist results to the database
 */

import type {
  FeeBreakdown,
  TransactionBillingAddress,
  TransactionLineItem,
} from './PaymentProviderService';

import type { AppliedCoupon, BillingType, PaymentMethod } from '@/hooks/useAddMemberWizard';
import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  calculateTransactionFees,
  getGatewayProcessors,
  isIQProConfigured,
} from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import { couponSchema, couponUsageSchema, memberMembershipSchema, memberSchema, paymentMethodSchema, transactionSchema } from '@/models/Schema';

import { getPaymentProvider, isPaymentEnabled } from './PaymentProviderService';

// ===== Public types =====

export type ProcessMemberPaymentParams = {
  organizationId: string;
  memberId: string;
  memberEmail: string;
  memberFirstName: string;
  memberLastName: string;
  memberPhone?: string;
  memberAddress?: {
    street: string;
    apartment?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };

  paymentMethod: PaymentMethod;
  billingType: BillingType;
  amount: number;
  description: string;

  // Card fields
  cardholderName?: string;
  cardNumber?: string;
  cardToken?: string;
  cardFirstSix?: string;
  cardLastFour?: string;
  cardExpiry?: string;
  cardCvc?: string;

  // ACH fields
  achAccountHolder?: string;
  achRoutingNumber?: string;
  achAccountNumber?: string;
  achAccountType?: 'Checking' | 'Savings';

  // Membership context
  membershipPlanId?: string;
  membershipPlanFrequency?: string;
  memberMembershipId?: string;

  appliedCoupon?: AppliedCoupon | null;
};

export type ProcessMemberPaymentResult = {
  success: boolean;
  status: 'approved' | 'declined' | 'processing';
  declineReason?: string;
  transactionId?: string;
  error?: string;
};

export type RegisterPaymentMethodParams = {
  organizationId: string;
  memberId: string;
  memberEmail: string;
  memberFirstName: string;
  memberLastName: string;
  memberPhone?: string;
  memberAddress?: {
    street: string;
    apartment?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };

  paymentMethod: PaymentMethod;

  // Card fields
  cardholderName?: string;
  cardNumber?: string;
  cardToken?: string;
  cardFirstSix?: string;
  cardLastFour?: string;
  cardExpiry?: string;
  cardCvc?: string;

  // ACH fields
  achAccountHolder?: string;
  achRoutingNumber?: string;
  achAccountNumber?: string;
  achAccountType?: 'Checking' | 'Savings';
};

export type RegisterPaymentMethodResult = {
  success: boolean;
  paymentMethodId?: string;
  error?: string;
};

// ===== Main orchestration function =====

export async function processMemberPayment(
  params: ProcessMemberPaymentParams,
): Promise<ProcessMemberPaymentResult> {
  if (!isPaymentEnabled()) {
    throw new Error('Payment processing is not configured. Set IQPRO_* environment variables.');
  }

  // Per-user redemption limit — refuse before charging if this member has
  // already redeemed the coupon up to its perUserLimit. We re-fetch the coupon
  // from the DB rather than trusting the client's `appliedCoupon` payload.
  if (params.appliedCoupon?.id) {
    const limitCheck = await checkPerUserCouponLimit(params.appliedCoupon.id, params.memberId);
    if (!limitCheck.ok) {
      logger.warn('[MemberPayment] Per-user coupon limit reached', {
        couponId: params.appliedCoupon.id,
        memberId: params.memberId,
        priorUsages: limitCheck.priorUsages,
        perUserLimit: limitCheck.perUserLimit,
      });
      return {
        success: false,
        status: 'declined',
        error: 'You have already used this coupon the maximum number of times.',
      };
    }
  }

  const provider = await getPaymentProvider();

  try {
    // Tax state is required by IQPro's calculatefees endpoint. Source it from
    // the member's billing address. (The org table has no address column today;
    // when we add per-org tax-state metadata, look that up first and fall back
    // to the member address.)
    const taxState = params.memberAddress?.state;
    if (!taxState) {
      throw new Error('Member address state is required to calculate IQPro fees.');
    }
    // ── Step 1: Get or create customer ──────────────────────────────
    const existing = await db
      .select({ iqproCustomerId: memberSchema.iqproCustomerId })
      .from(memberSchema)
      .where(eq(memberSchema.id, params.memberId))
      .limit(1);

    let customerId = existing[0]?.iqproCustomerId ?? null;
    let billingAddressId: string | undefined;

    if (!customerId) {
      const created = await provider.createCustomer({
        organizationId: params.organizationId,
        memberId: params.memberId,
        email: params.memberEmail,
        firstName: params.memberFirstName,
        lastName: params.memberLastName,
        phone: params.memberPhone,
        address: params.memberAddress,
      });
      customerId = created.customerId;
      billingAddressId = created.billingAddressId;

      await db
        .update(memberSchema)
        .set({ iqproCustomerId: customerId })
        .where(eq(memberSchema.id, params.memberId));

      logger.info('[MemberPayment] Created customer', { customerId, billingAddressId });
    }

    // ── Step 2: Create payment method ───────────────────────────────
    const pmResult = await provider.createPaymentMethod({
      customerId,
      paymentMethod: params.paymentMethod,
      cardholderName: params.cardholderName,
      cardNumber: params.cardNumber,
      cardToken: params.cardToken,
      cardFirstSix: params.cardFirstSix,
      cardLastFour: params.cardLastFour,
      cardExpiry: params.cardExpiry,
      cardCvc: params.cardCvc,
      achAccountHolder: params.achAccountHolder,
      achRoutingNumber: params.achRoutingNumber,
      achAccountNumber: params.achAccountNumber,
      achAccountType: params.achAccountType,
    });

    const paymentMethodDbId = randomUUID();
    await db.insert(paymentMethodSchema).values({
      id: paymentMethodDbId,
      memberId: params.memberId,
      iqproPaymentMethodId: pmResult.paymentMethodId,
      type: params.paymentMethod,
      last4: pmResult.last4,
      isDefault: true,
    });

    logger.info('[MemberPayment] Payment method saved', { paymentMethodDbId });

    // ── Step 3: Calculate authoritative fees ────────────────────────
    const processors = await getGatewayProcessors();
    const processorId = params.paymentMethod === 'card'
      ? processors.cardProcessorId
      : processors.achProcessorId;

    if (!processorId) {
      throw new Error(`No ${params.paymentMethod} processor configured for this gateway.`);
    }

    const couponDiscount = computeCouponDiscount(params.amount, params.appliedCoupon);
    const baseAmount = Math.max(0, Math.round((params.amount - couponDiscount) * 100) / 100);

    // IQPro's calculatefees endpoint requires exactly one of `token` or
    // `creditCardBin` regardless of payment method. For card we use the
    // TokenEx token (or fall back to the BIN). For ACH we pass the vault
    // achToken from the payment method we just created — without it the
    // endpoint returns 400 "Exactly one of Token/CreditCardBin must be provided".
    const feeToken = params.paymentMethod === 'card'
      ? params.cardToken
      : pmResult.achToken;
    const feeBin = params.paymentMethod === 'card' && !params.cardToken
      ? params.cardFirstSix
      : undefined;

    const serverFees = await calculateTransactionFees({
      baseAmount,
      processorId,
      state: taxState,
      paymentMethod: params.paymentMethod,
      ...(feeToken && { token: feeToken }),
      ...(!feeToken && feeBin && { creditCardBin: feeBin }),
    });

    const feeBreakdown: FeeBreakdown = {
      baseAmount: serverFees.baseAmount,
      taxAmount: serverFees.taxAmount,
      surchargeAmount: serverFees.surchargeAmount,
      serviceFeesAmount: serverFees.serviceFeesAmount,
      convenienceFeesAmount: serverFees.convenienceFeesAmount,
      amount: serverFees.amount,
    };

    const billingAddress: TransactionBillingAddress = {
      firstName: params.memberFirstName,
      lastName: params.memberLastName,
      email: params.memberEmail,
      phone: params.memberPhone,
      addressLine1: params.memberAddress?.street,
      addressLine2: params.memberAddress?.apartment,
      city: params.memberAddress?.city,
      state: taxState,
      postalCode: params.memberAddress?.zipCode,
      country: params.memberAddress?.country ?? 'US',
    };

    const lineItem: TransactionLineItem = {
      name: params.description,
      description: params.description,
      unitPrice: params.amount,
      discount: couponDiscount,
    };

    // ── Step 4: Route by billing type ───────────────────────────────
    const frequency = params.membershipPlanFrequency?.toLowerCase();
    const isAutopay
      = params.billingType === 'autopay'
        && (frequency === 'monthly' || frequency === 'annual');

    const achData = params.paymentMethod === 'ach' && pmResult.achToken
      ? {
          achToken: pmResult.achToken,
          secCode: 'WEB',
          routingNumber: params.achRoutingNumber!,
          accountType: params.achAccountType ?? 'Checking',
        }
      : undefined;

    if (isAutopay) {
      return await handleAutopay({
        provider,
        params,
        customerId,
        paymentMethodId: pmResult.paymentMethodId,
        frequency: frequency as 'monthly' | 'annual',
        feeBreakdown,
        billingAddressId,
        billingAddress,
        lineItem,
        achData,
      });
    }

    return await handleOneTimePayment({
      provider,
      params,
      customerId,
      paymentMethodId: pmResult.paymentMethodId,
      feeBreakdown,
      billingAddressId,
      billingAddress,
      lineItem,
      achData,
    });
  } catch (error) {
    logger.error('[MemberPayment] Payment processing failed', { error });
    return {
      success: false,
      status: 'declined',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ===== Register payment method only (no charge) =====

export async function registerPaymentMethod(
  params: RegisterPaymentMethodParams,
): Promise<RegisterPaymentMethodResult> {
  if (!isPaymentEnabled()) {
    throw new Error('Payment processing is not configured. Set IQPRO_* environment variables.');
  }

  const provider = await getPaymentProvider();

  try {
    // Step 1: Get or create customer
    const existing = await db
      .select({ iqproCustomerId: memberSchema.iqproCustomerId })
      .from(memberSchema)
      .where(eq(memberSchema.id, params.memberId))
      .limit(1);

    let customerId = existing[0]?.iqproCustomerId ?? null;

    if (!customerId) {
      const created = await provider.createCustomer({
        organizationId: params.organizationId,
        memberId: params.memberId,
        email: params.memberEmail,
        firstName: params.memberFirstName,
        lastName: params.memberLastName,
        phone: params.memberPhone,
        address: params.memberAddress,
      });
      customerId = created.customerId;

      await db
        .update(memberSchema)
        .set({ iqproCustomerId: customerId })
        .where(eq(memberSchema.id, params.memberId));

      logger.info('[MemberPayment] Created customer for payment method registration', { customerId });
    }

    // Step 2: Create payment method (no charge)
    const pmResult = await provider.createPaymentMethod({
      customerId,
      paymentMethod: params.paymentMethod,
      cardholderName: params.cardholderName,
      cardNumber: params.cardNumber,
      cardToken: params.cardToken,
      cardFirstSix: params.cardFirstSix,
      cardLastFour: params.cardLastFour,
      cardExpiry: params.cardExpiry,
      cardCvc: params.cardCvc,
      achAccountHolder: params.achAccountHolder,
      achRoutingNumber: params.achRoutingNumber,
      achAccountNumber: params.achAccountNumber,
      achAccountType: params.achAccountType,
    });

    const paymentMethodDbId = randomUUID();
    await db.insert(paymentMethodSchema).values({
      id: paymentMethodDbId,
      memberId: params.memberId,
      iqproPaymentMethodId: pmResult.paymentMethodId,
      type: params.paymentMethod,
      last4: pmResult.last4,
      isDefault: true,
    });

    logger.info('[MemberPayment] Payment method registered (no charge)', { paymentMethodDbId });

    return { success: true, paymentMethodId: paymentMethodDbId };
  } catch (error) {
    logger.error('[MemberPayment] Payment method registration failed', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ===== Internal helpers =====

function computeCouponDiscount(amount: number, coupon?: AppliedCoupon | null): number {
  if (!coupon) {
    return 0;
  }
  if (coupon.type === 'Free Trial') {
    return amount;
  }
  const couponAmount = Number.parseFloat(coupon.amount);
  if (Number.isNaN(couponAmount)) {
    return 0;
  }
  if (coupon.type === 'Percentage') {
    return Math.round(amount * (couponAmount / 100) * 100) / 100;
  }
  if (coupon.type === 'Fixed Amount') {
    return Math.min(amount, couponAmount);
  }
  return 0;
}

function buildPaymentAdjustments(feeBreakdown: FeeBreakdown) {
  const adjustments: Array<{ type: string; percentage: number | null; flatAmount: number }> = [];
  if (feeBreakdown.surchargeAmount > 0) {
    adjustments.push({ type: 'Surcharge', percentage: null, flatAmount: feeBreakdown.surchargeAmount });
  }
  if (feeBreakdown.serviceFeesAmount > 0) {
    adjustments.push({ type: 'ServiceFees', percentage: null, flatAmount: feeBreakdown.serviceFeesAmount });
  }
  if (feeBreakdown.convenienceFeesAmount > 0) {
    adjustments.push({ type: 'ConvenienceFees', percentage: null, flatAmount: feeBreakdown.convenienceFeesAmount });
  }
  return adjustments;
}

type AutopayParams = {
  provider: Awaited<ReturnType<typeof getPaymentProvider>>;
  params: ProcessMemberPaymentParams;
  customerId: string;
  paymentMethodId: string;
  frequency: 'monthly' | 'annual';
  feeBreakdown: FeeBreakdown;
  billingAddressId?: string;
  billingAddress: TransactionBillingAddress;
  lineItem: TransactionLineItem;
  achData?: { achToken: string; secCode: string; routingNumber: string; accountType: string };
};

async function handleAutopay(args: AutopayParams): Promise<ProcessMemberPaymentResult> {
  const { provider, params, customerId, paymentMethodId, frequency, feeBreakdown, billingAddressId, billingAddress, lineItem, achData } = args;

  const subResult = await provider.createSubscription({
    customerId,
    paymentMethodId,
    amount: params.amount,
    frequency,
    startDate: new Date(),
    description: params.description,
    firstName: params.memberFirstName,
    lastName: params.memberLastName,
    email: params.memberEmail,
    phone: params.memberPhone,
    address: params.memberAddress,
    paymentAdjustments: buildPaymentAdjustments(feeBreakdown),
    metadata: {
      organizationId: params.organizationId,
      memberId: params.memberId,
      ...(params.membershipPlanId && { membershipPlanId: params.membershipPlanId }),
      ...(params.appliedCoupon?.code && { couponCode: params.appliedCoupon.code }),
    },
  });

  if (!subResult.success) {
    return { success: false, status: 'declined', error: subResult.error };
  }

  // IQPro subscriptions don't auto-charge on creation. Run an immediate Sale
  // for the first period so the member is charged on signup day. The recurring
  // schedule then takes over from the next billing date.
  const initialCharge = await provider.processPayment({
    customerId,
    paymentMethodId,
    amount: feeBreakdown.amount,
    currency: 'USD',
    description: params.description,
    feeBreakdown,
    customerBillingAddressId: billingAddressId,
    billingAddress,
    lineItem,
    ach: achData,
    metadata: {
      organizationId: params.organizationId,
      memberId: params.memberId,
      ...(params.membershipPlanId && { membershipPlanId: params.membershipPlanId }),
      ...(params.appliedCoupon?.code && { couponCode: params.appliedCoupon.code }),
      iqproSubscriptionId: subResult.subscriptionId ?? '',
    },
  });

  // Persist the initial transaction regardless of outcome so the failure is
  // visible in the transactions table.
  const txId = randomUUID();
  await db.insert(transactionSchema).values({
    id: txId,
    organizationId: params.organizationId,
    memberId: params.memberId,
    memberMembershipId: params.memberMembershipId ?? null,
    iqproTransactionId: initialCharge.transactionId ?? null,
    transactionType: 'membership_payment',
    amount: feeBreakdown.amount,
    currency: 'USD',
    status: initialCharge.status === 'approved'
      ? 'paid'
      : initialCharge.status === 'declined'
        ? 'declined'
        : 'processing',
    paymentMethod: params.paymentMethod,
    description: params.description,
    processedAt: initialCharge.success ? new Date() : null,
  });

  if (!initialCharge.success) {
    // Subscription was created in IQPro but the initial charge failed. Surface
    // the failure rather than silently proceeding — the membership will remain
    // unactivated and the operator can decide whether to retry or cancel the
    // IQPro subscription.
    logger.error('[MemberPayment] Subscription created but initial charge failed', {
      subscriptionId: subResult.subscriptionId,
      memberId: params.memberId,
      declineReason: initialCharge.declineReason,
    });
    return {
      success: false,
      status: initialCharge.status,
      declineReason: initialCharge.declineReason,
      transactionId: txId,
      error: initialCharge.error
        ?? 'Subscription created but initial charge failed. The IQPro subscription may need manual cleanup.',
    };
  }

  // Persist subscription ID + dates on membership only after both succeed.
  if (params.memberMembershipId) {
    const nextPayment = frequency === 'annual'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db
      .update(memberMembershipSchema)
      .set({
        iqproSubscriptionId: subResult.subscriptionId,
        billingType: 'autopay',
        firstPaymentDate: new Date(),
        nextPaymentDate: nextPayment,
      })
      .where(eq(memberMembershipSchema.id, params.memberMembershipId));
  }

  // Record coupon redemption AFTER the charge has approved. Failures here are
  // logged but never thrown — payment already succeeded.
  await recordCouponRedemption({
    appliedCoupon: params.appliedCoupon,
    memberId: params.memberId,
    transactionId: txId,
    couponDiscount: feeBreakdown.amount > 0
      ? computeCouponDiscount(params.amount, params.appliedCoupon)
      : 0,
  });

  logger.info('[MemberPayment] Autopay subscription + initial charge complete', {
    subscriptionId: subResult.subscriptionId,
    transactionId: txId,
  });

  return {
    success: true,
    status: 'approved',
    transactionId: txId,
  };
}

type OneTimeParams = {
  provider: Awaited<ReturnType<typeof getPaymentProvider>>;
  params: ProcessMemberPaymentParams;
  customerId: string;
  paymentMethodId: string;
  feeBreakdown: FeeBreakdown;
  billingAddressId?: string;
  billingAddress: TransactionBillingAddress;
  lineItem: TransactionLineItem;
  achData?: { achToken: string; secCode: string; routingNumber: string; accountType: string };
};

async function handleOneTimePayment(args: OneTimeParams): Promise<ProcessMemberPaymentResult> {
  const { provider, params, customerId, paymentMethodId, feeBreakdown, billingAddressId, billingAddress, lineItem, achData } = args;

  const payResult = await provider.processPayment({
    customerId,
    paymentMethodId,
    amount: feeBreakdown.amount,
    currency: 'USD',
    description: params.description,
    feeBreakdown,
    customerBillingAddressId: billingAddressId,
    billingAddress,
    lineItem,
    ach: achData,
    metadata: {
      organizationId: params.organizationId,
      memberId: params.memberId,
      ...(params.membershipPlanId && { membershipPlanId: params.membershipPlanId }),
      ...(params.appliedCoupon?.code && { couponCode: params.appliedCoupon.code }),
    },
  });

  // Persist transaction record
  const txId = randomUUID();
  await db.insert(transactionSchema).values({
    id: txId,
    organizationId: params.organizationId,
    memberId: params.memberId,
    memberMembershipId: params.memberMembershipId ?? null,
    iqproTransactionId: payResult.transactionId ?? null,
    transactionType: 'membership_payment',
    amount: feeBreakdown.amount,
    currency: 'USD',
    status: payResult.status === 'approved' ? 'paid' : payResult.status === 'declined' ? 'declined' : 'processing',
    paymentMethod: params.paymentMethod,
    description: params.description,
    processedAt: payResult.success ? new Date() : null,
  });

  // Update membership billing info
  if (params.memberMembershipId && payResult.success) {
    await db
      .update(memberMembershipSchema)
      .set({ billingType: 'one-time', firstPaymentDate: new Date() })
      .where(eq(memberMembershipSchema.id, params.memberMembershipId));
  }

  // Record coupon redemption only on approved transactions. Declined or
  // pending payments must not consume usage — if the user retries and the
  // second attempt approves, that one redeems instead.
  if (payResult.success) {
    await recordCouponRedemption({
      appliedCoupon: params.appliedCoupon,
      memberId: params.memberId,
      transactionId: txId,
      couponDiscount: computeCouponDiscount(params.amount, params.appliedCoupon),
    });
  }

  logger.info('[MemberPayment] One-time payment processed', { txId, status: payResult.status });

  return {
    success: payResult.success,
    status: payResult.status,
    declineReason: payResult.declineReason,
    transactionId: txId,
    error: payResult.error,
  };
}

// ===== Coupon redemption tracking =====

type CouponLimitCheck
  = | { ok: true }
    | { ok: false; priorUsages: number; perUserLimit: number };

/**
 * Re-fetches the coupon from the DB (don't trust client) and counts prior
 * usages by this member. Returns ok:false when the per-user limit is reached.
 */
async function checkPerUserCouponLimit(
  couponId: string,
  memberId: string,
): Promise<CouponLimitCheck> {
  const rows = await db
    .select({ perUserLimit: couponSchema.perUserLimit })
    .from(couponSchema)
    .where(eq(couponSchema.id, couponId))
    .limit(1);
  const perUserLimit = rows[0]?.perUserLimit ?? 1;

  const usageCounts = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(couponUsageSchema)
    .where(and(
      eq(couponUsageSchema.couponId, couponId),
      eq(couponUsageSchema.memberId, memberId),
    ));
  const priorUsages = usageCounts[0]?.count ?? 0;

  if (priorUsages >= perUserLimit) {
    return { ok: false, priorUsages, perUserLimit };
  }
  return { ok: true };
}

/**
 * Insert a coupon_usage row + increment couponSchema.usageCount. Both writes
 * are best-effort: if either fails, log but don't throw — payment has already
 * succeeded and we don't want to roll it back over a tracking write.
 *
 * The usageCount increment is done SQL-side to avoid a read-then-write race
 * under concurrent redemptions.
 */
async function recordCouponRedemption(args: {
  appliedCoupon?: AppliedCoupon | null;
  memberId: string;
  transactionId: string;
  couponDiscount: number;
}): Promise<void> {
  if (!args.appliedCoupon?.id) {
    return;
  }
  try {
    await db.insert(couponUsageSchema).values({
      id: randomUUID(),
      couponId: args.appliedCoupon.id,
      memberId: args.memberId,
      transactionId: args.transactionId,
      discountApplied: args.couponDiscount,
    });
    await db
      .update(couponSchema)
      .set({ usageCount: sql`COALESCE(${couponSchema.usageCount}, 0) + 1` })
      .where(eq(couponSchema.id, args.appliedCoupon.id));
    logger.info('[MemberPayment] Coupon redemption recorded', {
      couponId: args.appliedCoupon.id,
      memberId: args.memberId,
      transactionId: args.transactionId,
      discountApplied: args.couponDiscount,
    });
  } catch (error) {
    logger.error('[MemberPayment] Failed to record coupon redemption (non-fatal)', {
      error,
      couponId: args.appliedCoupon.id,
      transactionId: args.transactionId,
    });
  }
}

// ===== Refund =====

export type RefundTransactionResult = {
  refundTransactionId: string;
  originalTransactionId: string;
  decrementedCoupons: number;
};

export class TransactionNotFoundError extends Error {
  constructor(id: string) {
    super(`Transaction ${id} not found.`);
    this.name = 'TransactionNotFoundError';
  }
}

export class TransactionAlreadyRefundedError extends Error {
  constructor(id: string) {
    super(`Transaction ${id} is already refunded.`);
    this.name = 'TransactionAlreadyRefundedError';
  }
}

/**
 * Bookkeeping refund: inserts a refund transaction row, flips the original to
 * status='refunded', and reverses any coupon redemption tied to the original
 * transaction (deletes coupon_usage row + decrements couponSchema.usageCount).
 *
 * NOTE: this does NOT call IQPro's refund API. The operator who triggers this
 * is expected to also process the IQPro-side refund manually (or build that
 * automation in a separate ticket).
 */
export async function refundTransaction(
  transactionId: string,
  organizationId: string,
): Promise<RefundTransactionResult> {
  const original = await db
    .select()
    .from(transactionSchema)
    .where(and(eq(transactionSchema.id, transactionId), eq(transactionSchema.organizationId, organizationId)))
    .limit(1);
  const originalTx = original[0];
  if (!originalTx) {
    throw new TransactionNotFoundError(transactionId);
  }
  if (originalTx.status === 'refunded') {
    throw new TransactionAlreadyRefundedError(transactionId);
  }

  const refundId = randomUUID();
  await db.insert(transactionSchema).values({
    id: refundId,
    organizationId,
    memberId: originalTx.memberId,
    memberMembershipId: originalTx.memberMembershipId,
    transactionType: 'refund',
    amount: -Math.abs(originalTx.amount),
    currency: originalTx.currency,
    status: 'paid',
    paymentMethod: originalTx.paymentMethod,
    description: `Refund for transaction ${originalTx.id}`,
    processedAt: new Date(),
  });

  await db
    .update(transactionSchema)
    .set({ status: 'refunded' })
    .where(eq(transactionSchema.id, transactionId));

  // Reverse coupon redemption(s) tied to the original transaction.
  const usages = await db
    .select({ id: couponUsageSchema.id, couponId: couponUsageSchema.couponId })
    .from(couponUsageSchema)
    .where(eq(couponUsageSchema.transactionId, transactionId));

  let decrementedCoupons = 0;
  for (const usage of usages) {
    try {
      await db.delete(couponUsageSchema).where(eq(couponUsageSchema.id, usage.id));
      await db
        .update(couponSchema)
        .set({ usageCount: sql`GREATEST(COALESCE(${couponSchema.usageCount}, 0) - 1, 0)` })
        .where(eq(couponSchema.id, usage.couponId));
      decrementedCoupons += 1;
    } catch (error) {
      logger.error('[MemberPayment] Failed to reverse coupon redemption (non-fatal)', {
        error,
        couponUsageId: usage.id,
        couponId: usage.couponId,
        transactionId,
      });
    }
  }

  logger.info('[MemberPayment] Refund processed', {
    refundTransactionId: refundId,
    originalTransactionId: transactionId,
    decrementedCoupons,
  });

  return {
    refundTransactionId: refundId,
    originalTransactionId: transactionId,
    decrementedCoupons,
  };
}

// Re-export for tests that previously imported from this module
export { isIQProConfigured };
