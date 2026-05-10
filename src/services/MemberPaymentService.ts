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

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  computeFeeBreakdown,
  getCustomerPaymentMethod,
  getGatewayProcessors,
  isIQProConfigured,
} from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import { couponSchema, couponUsageSchema, memberMembershipSchema, memberSchema, paymentMethodSchema, transactionSchema } from '@/models/Schema';

import { sendPaymentReceiptEmail } from './EmailService';
import { getOrganizationTaxRate } from './OrganizationService';
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

  /**
   * 'new' (default) → standard flow: create or reuse customer, register a
   * fresh payment method from the supplied card/ACH fields, then charge.
   * 'saved' → vaulted-charge flow: reuse the member's existing IQPro customer
   * + saved payment method (looked up from the local DB). No card/ACH fields
   * are consumed in this mode. Used for HOH-pays-for-family and event/seminar
   * purchases where the member already has a card on file.
   */
  paymentMethodSource?: 'new' | 'saved';

  /**
   * Whether this transaction is taxable. Defaults false (memberships).
   * Events / seminars / store charges should set true.
   */
  isTaxable?: boolean;
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
  const paymentMethodSource = params.paymentMethodSource ?? 'new';
  const isTaxable = !!params.isTaxable;
  const vaulted = paymentMethodSource === 'saved';

  try {
    // ── Step 1: Resolve customer + payment method ───────────────────
    let customerId: string;
    let paymentMethodId: string;
    let billingAddressId: string | undefined;
    let achData: { achToken: string; secCode: string; routingNumber: string; accountType: string } | undefined;
    // The token/BIN we pass to /calculatefees. For new card we use the TokenEx
    // token; for new ACH we use the freshly-vaulted achToken; for saved we
    // pull both from the saved PM.
    let feeToken: string | undefined;
    let feeBin: string | undefined;
    // Effective payment method type — for vaulted charges, comes from the
    // saved PM; for new charges, from params.paymentMethod.
    let effectivePaymentMethod: PaymentMethod = params.paymentMethod;
    let last4ForReceipt: string | undefined;

    if (vaulted) {
      // Vaulted-charge branch: look up the member's IQPro customer + saved PM.
      const memberRow = await db
        .select({ iqproCustomerId: memberSchema.iqproCustomerId })
        .from(memberSchema)
        .where(eq(memberSchema.id, params.memberId))
        .limit(1);
      const savedCustomerId = memberRow[0]?.iqproCustomerId;
      if (!savedCustomerId) {
        return {
          success: false,
          status: 'declined',
          error: 'Member has no saved customer record.',
        };
      }

      const pmRow = await db
        .select({
          iqproPaymentMethodId: paymentMethodSchema.iqproPaymentMethodId,
          type: paymentMethodSchema.type,
          last4: paymentMethodSchema.last4,
        })
        .from(paymentMethodSchema)
        .where(and(
          eq(paymentMethodSchema.memberId, params.memberId),
          sql`${paymentMethodSchema.iqproPaymentMethodId} IS NOT NULL`,
        ))
        .orderBy(desc(paymentMethodSchema.isDefault))
        .limit(1);
      const savedPm = pmRow[0];
      if (!savedPm?.iqproPaymentMethodId) {
        return {
          success: false,
          status: 'declined',
          error: 'Member has no saved payment method.',
        };
      }

      customerId = savedCustomerId;
      paymentMethodId = savedPm.iqproPaymentMethodId;
      effectivePaymentMethod = savedPm.type === 'bank_transfer' ? 'ach' : 'card';
      last4ForReceipt = savedPm.last4 ?? undefined;

      // Fetch the BIN (for card) or achToken (for ACH) from IQPro so
      // /calculatefees has a valid identifier. The endpoint requires exactly
      // one of token or creditCardBin.
      const remoteInfo = await getCustomerPaymentMethod(customerId, paymentMethodId);
      if (remoteInfo) {
        if (remoteInfo.type === 'card' && remoteInfo.firstSix) {
          feeBin = remoteInfo.firstSix;
        } else if (remoteInfo.type === 'ach' && remoteInfo.achToken) {
          feeToken = remoteInfo.achToken;
        }
      }
      if (!feeToken && !feeBin) {
        // Last resort: pass nothing and let IQPro reject; this surfaces a
        // clear error to the operator rather than charging without fee preview.
        logger.warn('[MemberPayment] Saved PM has no BIN/achToken — fee preview will fail', {
          memberId: params.memberId,
          customerId,
          paymentMethodId,
        });
      }

      logger.info('[MemberPayment] Charging vaulted payment method', {
        memberId: params.memberId,
        customerId,
        paymentMethodId,
        type: effectivePaymentMethod,
      });
    } else {
      // Standard flow: create or reuse customer, then register a fresh PM.
      const existing = await db
        .select({ iqproCustomerId: memberSchema.iqproCustomerId })
        .from(memberSchema)
        .where(eq(memberSchema.id, params.memberId))
        .limit(1);

      let resolvedCustomerId = existing[0]?.iqproCustomerId ?? null;

      if (!resolvedCustomerId) {
        const created = await provider.createCustomer({
          organizationId: params.organizationId,
          memberId: params.memberId,
          email: params.memberEmail,
          firstName: params.memberFirstName,
          lastName: params.memberLastName,
          phone: params.memberPhone,
          address: params.memberAddress,
        });
        resolvedCustomerId = created.customerId;
        billingAddressId = created.billingAddressId;

        await db
          .update(memberSchema)
          .set({ iqproCustomerId: resolvedCustomerId })
          .where(eq(memberSchema.id, params.memberId));

        logger.info('[MemberPayment] Created customer', {
          customerId: resolvedCustomerId,
          billingAddressId,
        });
      }
      customerId = resolvedCustomerId;

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

      paymentMethodId = pmResult.paymentMethodId;
      last4ForReceipt = pmResult.last4;
      feeToken = params.paymentMethod === 'card' ? params.cardToken : pmResult.achToken;
      feeBin = params.paymentMethod === 'card' && !params.cardToken ? params.cardFirstSix : undefined;
      if (params.paymentMethod === 'ach' && pmResult.achToken) {
        achData = {
          achToken: pmResult.achToken,
          secCode: 'PPD',
          routingNumber: params.achRoutingNumber!,
          accountType: params.achAccountType ?? 'Checking',
        };
      }
    }

    // ── Step 2: Calculate authoritative fees (kiosk shape) ──────────
    const processors = await getGatewayProcessors();
    const processorId = effectivePaymentMethod === 'card'
      ? processors.cardProcessorId
      : processors.achProcessorId;
    if (!processorId) {
      throw new Error(`No ${effectivePaymentMethod} processor configured for this gateway.`);
    }

    const couponDiscount = computeCouponDiscount(params.amount, params.appliedCoupon);
    const baseAmount = Math.max(0, Math.round((params.amount - couponDiscount) * 100) / 100);

    const taxStatePct = isTaxable ? await getOrganizationTaxRate(params.organizationId) : 0;

    const feeBreakdown: FeeBreakdown = await computeFeeBreakdown(
      baseAmount,
      isTaxable,
      taxStatePct,
      {
        processorId,
        ...(feeToken && { token: feeToken }),
        ...(!feeToken && feeBin && { creditCardBin: feeBin }),
      },
    );

    const taxState = params.memberAddress?.state ?? 'N/A';
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

    // ── Step 3: Route by billing type ───────────────────────────────
    const frequency = params.membershipPlanFrequency?.toLowerCase();
    const isAutopay
      = params.billingType === 'autopay'
        && (frequency === 'monthly' || frequency === 'annual');

    if (isAutopay) {
      return await handleAutopay({
        provider,
        params,
        customerId,
        paymentMethodId,
        frequency: frequency as 'monthly' | 'annual',
        feeBreakdown,
        billingAddressId,
        billingAddress,
        lineItem,
        achData,
        vaulted,
        isTaxable,
        last4ForReceipt,
      });
    }

    return await handleOneTimePayment({
      provider,
      params,
      customerId,
      paymentMethodId,
      feeBreakdown,
      billingAddressId,
      billingAddress,
      lineItem,
      achData,
      vaulted,
      isTaxable,
      last4ForReceipt,
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

/**
 * Build the paymentAdjustments list for a subscription. Mirrors kiosk's
 * shape: ServiceFee is always present (percentage), Tax is added only when
 * taxable. Tax must be flatAmount, ServiceFee must be percentage — IQPro
 * rejects the inverse for either.
 */
function buildPaymentAdjustments(
  feeBreakdown: FeeBreakdown,
  isTaxable: boolean,
): Array<{ type: string; percentage: number | null; flatAmount: number | null }> {
  const adjustments: Array<{ type: string; percentage: number | null; flatAmount: number | null }> = [];
  if (isTaxable && feeBreakdown.taxAmount > 0) {
    adjustments.push({ type: 'Tax', percentage: null, flatAmount: feeBreakdown.taxAmount });
  }
  adjustments.push({ type: 'ServiceFee', percentage: feeBreakdown.serviceFeePct, flatAmount: null });
  return adjustments;
}

/**
 * Build the receipt-email line items from a member-payment context. For
 * memberships, this is a single line: plan name + frequency + price.
 */
function buildReceiptLineItems(params: ProcessMemberPaymentParams): Array<{
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}> {
  const couponDiscount = computeCouponDiscount(params.amount, params.appliedCoupon);
  return [
    {
      name: params.description,
      description: params.description,
      quantity: 1,
      unitPrice: params.amount,
      discount: couponDiscount,
    },
  ];
}

/**
 * Fire-and-forget receipt email sender. Caller awaits the .catch() to
 * suppress unhandled rejection warnings; the actual await is never blocking.
 */
function fireReceiptEmail(args: {
  toEmail: string;
  firstName: string;
  lastName: string;
  params: ProcessMemberPaymentParams;
  feeBreakdown: FeeBreakdown;
  transactionId?: string;
  isRecurring: boolean;
}): void {
  const couponDiscount = computeCouponDiscount(args.params.amount, args.params.appliedCoupon);
  const lineItems = buildReceiptLineItems(args.params);
  sendPaymentReceiptEmail({
    toEmail: args.toEmail,
    firstName: args.firstName,
    lastName: args.lastName,
    lineItems,
    subtotal: args.params.amount,
    discountAmount: couponDiscount,
    taxAmount: args.feeBreakdown.taxAmount,
    taxPct: args.feeBreakdown.taxPct,
    serviceFeeAmount: args.feeBreakdown.serviceFeeAmount,
    serviceFeePct: args.feeBreakdown.serviceFeePct,
    total: args.feeBreakdown.amount,
    transactionId: args.transactionId,
    isRecurring: args.isRecurring,
  }).catch((error) => {
    logger.error('[MemberPayment] Receipt email failed (non-fatal)', { error });
  });
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
  vaulted: boolean;
  isTaxable: boolean;
  last4ForReceipt?: string;
};

async function handleAutopay(args: AutopayParams): Promise<ProcessMemberPaymentResult> {
  const { provider, params, customerId, paymentMethodId, frequency, feeBreakdown, billingAddressId, billingAddress, lineItem, achData, vaulted, isTaxable } = args;

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
    paymentAdjustments: buildPaymentAdjustments(feeBreakdown, isTaxable),
    vaulted,
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
    vaulted,
    isTaxable,
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

  // Itemized receipt — fire-and-forget, only sent on approved.
  fireReceiptEmail({
    toEmail: params.memberEmail,
    firstName: params.memberFirstName,
    lastName: params.memberLastName,
    params,
    feeBreakdown,
    transactionId: initialCharge.transactionId,
    isRecurring: true,
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
  vaulted: boolean;
  isTaxable: boolean;
  last4ForReceipt?: string;
};

async function handleOneTimePayment(args: OneTimeParams): Promise<ProcessMemberPaymentResult> {
  const { provider, params, customerId, paymentMethodId, feeBreakdown, billingAddressId, billingAddress, lineItem, achData, vaulted, isTaxable } = args;

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
    vaulted,
    isTaxable,
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

    // Itemized receipt — fire-and-forget, only sent on approved.
    fireReceiptEmail({
      toEmail: params.memberEmail,
      firstName: params.memberFirstName,
      lastName: params.memberLastName,
      params,
      feeBreakdown,
      transactionId: payResult.transactionId,
      isRecurring: false,
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
