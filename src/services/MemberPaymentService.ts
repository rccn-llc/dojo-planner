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

import type { PaymentProviderConfig } from './PaymentProviderConfigService';

import type {
  FeeBreakdown,
  SubscriptionFrequency,
  TransactionBillingAddress,
  TransactionLineItem,
} from './PaymentProviderService';
import type { AppliedCoupon, BillingType, PaymentMethod } from '@/hooks/useAddMemberWizard';
import { randomUUID } from 'node:crypto';

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { auditEventSchema, couponSchema, couponUsageSchema, memberMembershipSchema, memberSchema, membershipPlanSchema, paymentMethodSchema, transactionSchema } from '@/models/Schema';
import { computeNextPaymentDate, normalizeFrequency } from '@/utils/PaymentSchedule';

import { sendPaymentReceiptEmail } from './EmailService';
import { getOrganizationTaxRate } from './OrganizationService';
import { getPaymentProvider } from './PaymentProviderService';
import { recordExternalRef, REF_TYPE } from './TenantExternalRefService';

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
  /**
   * One-time signup fee charged on the FIRST transaction only. When > 0,
   * this is added to the immediate Sale alongside `amount`, but never enters
   * the recurring subscription amount. Coupon discounts apply to `amount`
   * only, never to the signup fee. Recorded as a separate `signup_fee`
   * transaction row sharing the same `providerTransactionId` as the membership
   * row.
   */
  signupFee?: number;
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
  config: PaymentProviderConfig,
  params: ProcessMemberPaymentParams,
): Promise<ProcessMemberPaymentResult> {
  // Coupon revalidation — NEVER trust the client's `appliedCoupon` payload for
  // the discount type/amount or eligibility. Re-fetch the coupon from the DB
  // scoped to this org, verify it's active/in-window/under its global limit and
  // the member is under the per-user limit, and rebuild an authoritative
  // AppliedCoupon from the DB values. All downstream discount math then uses
  // trusted numbers (a client can't inflate the discount, redeem a foreign or
  // expired coupon, or exceed the limits).
  if (params.appliedCoupon?.id) {
    const validated = await validateCouponForCharge(
      params.appliedCoupon.id,
      params.organizationId,
      params.memberId,
      params.isTaxable ? 'event' : 'membership',
    );
    if (!validated.ok) {
      logger.warn('[MemberPayment] Coupon rejected', {
        couponId: params.appliedCoupon.id,
        memberId: params.memberId,
        organizationId: params.organizationId,
        reason: validated.reason,
      });
      return {
        success: false,
        status: 'declined',
        error: validated.userMessage,
      };
    }
    // Override the client-supplied coupon with the server-authoritative one so
    // every computeCouponDiscount() call below uses DB values.
    params = { ...params, appliedCoupon: validated.coupon };
  }

  const provider = await getPaymentProvider(config);
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
      // Scope to the caller's org so a saved card can never be charged across tenants.
      const memberRow = await db
        .select({ providerCustomerId: memberSchema.providerCustomerId })
        .from(memberSchema)
        .where(and(
          eq(memberSchema.id, params.memberId),
          eq(memberSchema.organizationId, params.organizationId),
        ))
        .limit(1);
      const savedCustomerId = memberRow[0]?.providerCustomerId;
      if (!savedCustomerId) {
        return {
          success: false,
          status: 'declined',
          error: 'Member has no saved customer record.',
        };
      }

      const pmRow = await db
        .select({
          providerPaymentMethodId: paymentMethodSchema.providerPaymentMethodId,
          type: paymentMethodSchema.type,
          last4: paymentMethodSchema.last4,
        })
        .from(paymentMethodSchema)
        .where(and(
          eq(paymentMethodSchema.memberId, params.memberId),
          sql`${paymentMethodSchema.providerPaymentMethodId} IS NOT NULL`,
        ))
        .orderBy(desc(paymentMethodSchema.isDefault))
        .limit(1);
      const savedPm = pmRow[0];
      if (!savedPm?.providerPaymentMethodId) {
        return {
          success: false,
          status: 'declined',
          error: 'Member has no saved payment method.',
        };
      }

      customerId = savedCustomerId;
      paymentMethodId = savedPm.providerPaymentMethodId;
      effectivePaymentMethod = savedPm.type === 'bank_transfer' ? 'ach' : 'card';
      last4ForReceipt = savedPm.last4 ?? undefined;

      // The identifiers a fee quote needs from a SAVED method are the
      // provider's business: IQPro's /calculatefees wants a BIN or ACH token,
      // Square's order pricing wants neither. The customer and payment-method
      // ids are passed to `computeFees` below and each provider looks up what
      // it needs — this used to be an IQPro vault fetch inlined here, which is
      // what made the whole orchestrator IQPro-only.

      logger.info('[MemberPayment] Charging vaulted payment method', {
        memberId: params.memberId,
        customerId,
        paymentMethodId,
        type: effectivePaymentMethod,
      });
    } else {
      // Standard flow: create or reuse customer, then register a fresh PM.
      const existing = await db
        .select({ providerCustomerId: memberSchema.providerCustomerId })
        .from(memberSchema)
        .where(and(
          eq(memberSchema.id, params.memberId),
          eq(memberSchema.organizationId, params.organizationId),
        ))
        .limit(1);

      let resolvedCustomerId = existing[0]?.providerCustomerId ?? null;

      if (!resolvedCustomerId) {
        const created = await provider.createCustomer(config, {
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
          .set({ providerCustomerId: resolvedCustomerId })
          .where(eq(memberSchema.id, params.memberId));

        await recordExternalRef(REF_TYPE.PROVIDER_CUSTOMER, resolvedCustomerId, params.organizationId);

        logger.info('[MemberPayment] Created customer', {
          customerId: resolvedCustomerId,
          billingAddressId,
        });
      }
      customerId = resolvedCustomerId;

      const pmResult = await provider.createPaymentMethod(config, {
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
        providerPaymentMethodId: pmResult.paymentMethodId,
        type: params.paymentMethod,
        firstSix: params.paymentMethod === 'card' ? params.cardFirstSix ?? null : null,
        last4: pmResult.last4,
        accountType: params.paymentMethod === 'ach' ? params.achAccountType ?? null : null,
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
    // No provider-specific setup here any more. A gateway processor id is an
    // IQPro concept, and fetching one required an IQPro call — which threw for
    // any other provider, so this orchestrator could never reach a non-IQPro
    // implementation at all. Providers now resolve their own.

    const couponDiscount = computeCouponDiscount(params.amount, params.appliedCoupon);
    const signupFee = params.signupFee ?? 0;
    // baseAmount is the customer-facing subtotal sent to IQPro's fee
    // calculator: recurring (post-coupon) + one-time signup fee. The
    // signup fee never gets a coupon discount.
    const baseAmount = Math.max(0, Math.round(((params.amount - couponDiscount) + signupFee) * 100) / 100);

    const taxStatePct = isTaxable ? await getOrganizationTaxRate(params.organizationId) : 0;

    // Provider-quoted where the provider can quote it. `feeQuote.provenance`
    // records which figures the provider actually attested to — on IQPro the
    // service fee is provider-computed but tax is local arithmetic, because
    // IQPro exposes no tax API. See `FeeProvenance`.
    const feeQuote = await provider.computeFees(config, {
      baseAmount,
      isTaxable,
      taxStatePct,
      paymentMethodType: effectivePaymentMethod,
      // For a saved method the provider looks up whatever identifier its fee
      // API needs; for a new one we already hold the BIN or token.
      ...(customerId && paymentMethodId && { customerId, paymentMethodId }),
      ...(feeToken && { token: feeToken }),
      ...(!feeToken && feeBin && { creditCardBin: feeBin }),
    });
    const feeBreakdown: FeeBreakdown = feeQuote;

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

    // Itemize the membership and (optional) signup fee as separate IQPro
    // line items. The signup-fee line has no coupon discount.
    const lineItems: TransactionLineItem[] = [
      {
        name: params.description,
        description: params.description,
        unitPrice: params.amount,
        discount: couponDiscount,
      },
    ];
    if (signupFee > 0) {
      const planLabel = params.description.replace(/^Membership:\s*/i, '').trim() || 'membership';
      lineItems.push({
        name: 'Sign-up fee',
        description: `Sign-up fee — ${planLabel}`,
        unitPrice: signupFee,
        discount: 0,
      });
    }

    // ── Step 3: Route by billing type ───────────────────────────────
    // Recurring frequencies that map to an IQPro subscription. 'none' / null
    // / 'one-time' all fall through to a single one-time charge.
    const frequency = normalizeFrequency(params.membershipPlanFrequency);
    const isAutopay
      = params.billingType === 'autopay'
        && frequency !== null;

    if (isAutopay && frequency) {
      return await handleAutopay({
        config,
        provider,
        params,
        customerId,
        paymentMethodId,
        frequency,
        feeBreakdown,
        billingAddressId,
        billingAddress,
        lineItems,
        achData,
        vaulted,
        isTaxable,
        last4ForReceipt,
      });
    }

    return await handleOneTimePayment({
      config,
      provider,
      params,
      customerId,
      paymentMethodId,
      feeBreakdown,
      billingAddressId,
      billingAddress,
      lineItems,
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
  config: PaymentProviderConfig,
  params: RegisterPaymentMethodParams,
): Promise<RegisterPaymentMethodResult> {
  const provider = await getPaymentProvider(config);

  try {
    // Step 1: Get or create customer (scoped to the caller's org for tenant safety)
    const existing = await db
      .select({ providerCustomerId: memberSchema.providerCustomerId })
      .from(memberSchema)
      .where(and(
        eq(memberSchema.id, params.memberId),
        eq(memberSchema.organizationId, params.organizationId),
      ))
      .limit(1);

    let customerId = existing[0]?.providerCustomerId ?? null;

    if (!customerId) {
      const created = await provider.createCustomer(config, {
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
        .set({ providerCustomerId: customerId })
        .where(eq(memberSchema.id, params.memberId));

      await recordExternalRef(REF_TYPE.PROVIDER_CUSTOMER, customerId, params.organizationId);

      logger.info('[MemberPayment] Created customer for payment method registration', { customerId });
    }

    // Step 2: Create payment method (no charge)
    const pmResult = await provider.createPaymentMethod(config, {
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
    // The newly-added method becomes the default; clear the flag on any existing
    // methods first so exactly one stays default (avoids multiple defaults when
    // a member adds a second card/ACH).
    await db.transaction(async (tx) => {
      await tx
        .update(paymentMethodSchema)
        .set({ isDefault: false })
        .where(eq(paymentMethodSchema.memberId, params.memberId));
      await tx.insert(paymentMethodSchema).values({
        id: paymentMethodDbId,
        memberId: params.memberId,
        providerPaymentMethodId: pmResult.paymentMethodId,
        type: params.paymentMethod,
        firstSix: params.paymentMethod === 'card' ? params.cardFirstSix ?? null : null,
        last4: pmResult.last4,
        accountType: params.paymentMethod === 'ach' ? params.achAccountType ?? null : null,
        isDefault: true,
      });
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

// Re-export the schedule helpers so callers (tests, lifecycle code) that
// historically imported them from this module keep working. The actual
// implementations live in `@/utils/PaymentSchedule` — a pure module the
// seed script can import without pulling in DB/IQPro/Env.
export { computeNextPaymentDate, normalizeFrequency };

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
    let discount = Math.round(amount * (couponAmount / 100) * 100) / 100;
    // Honor the coupon's maxDiscountAmount cap (dollars) when set.
    if (coupon.maxDiscountAmount != null && coupon.maxDiscountAmount >= 0) {
      discount = Math.min(discount, coupon.maxDiscountAmount);
    }
    return Math.min(amount, discount);
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
 * memberships, this is a single line (plan name + frequency + price). When a
 * signup fee is present, an additional one-time line is emitted with no
 * discount (coupons never apply to signup fees).
 */
function buildReceiptLineItems(params: ProcessMemberPaymentParams): Array<{
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}> {
  const couponDiscount = computeCouponDiscount(params.amount, params.appliedCoupon);
  const signupFee = params.signupFee ?? 0;
  const items = [
    {
      name: params.description,
      description: params.description,
      quantity: 1,
      unitPrice: params.amount,
      discount: couponDiscount,
    },
  ];
  if (signupFee > 0) {
    const planLabel = params.description.replace(/^Membership:\s*/i, '').trim() || 'membership';
    items.push({
      name: 'Sign-up fee',
      description: `Sign-up fee — ${planLabel}`,
      quantity: 1,
      unitPrice: signupFee,
      discount: 0,
    });
  }
  return items;
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
  config: PaymentProviderConfig;
  provider: Awaited<ReturnType<typeof getPaymentProvider>>;
  params: ProcessMemberPaymentParams;
  customerId: string;
  paymentMethodId: string;
  frequency: SubscriptionFrequency;
  feeBreakdown: FeeBreakdown;
  billingAddressId?: string;
  billingAddress: TransactionBillingAddress;
  lineItems: TransactionLineItem[];
  achData?: { achToken: string; secCode: string; routingNumber: string; accountType: string };
  vaulted: boolean;
  isTaxable: boolean;
  last4ForReceipt?: string;
};

async function handleAutopay(args: AutopayParams): Promise<ProcessMemberPaymentResult> {
  const { config, provider, params, customerId, paymentMethodId, frequency, feeBreakdown, billingAddressId, billingAddress, lineItems, achData, vaulted, isTaxable } = args;

  const signupFee = params.signupFee ?? 0;
  const couponDiscount = computeCouponDiscount(params.amount, params.appliedCoupon);
  // Recurring price — what IQPro will bill every cycle. Coupon discount
  // applies to recurring only; signup fee is NEVER part of the recurring
  // amount (it's a one-time charge on the initial Sale only).
  const recurringAmount = Math.max(0, Math.round((params.amount - couponDiscount) * 100) / 100);

  const subResult = await provider.createSubscription(config, {
    organizationId: params.organizationId,
    customerId,
    paymentMethodId,
    amount: recurringAmount,
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
  // for the first period so the member is charged on signup day. This Sale
  // includes both the recurring portion AND the one-time signup fee; the
  // recurring schedule then takes over with `recurringAmount` only.
  const initialCharge = await provider.processPayment(config, {
    customerId,
    paymentMethodId,
    amount: feeBreakdown.amount,
    currency: 'USD',
    description: params.description,
    feeBreakdown,
    customerBillingAddressId: billingAddressId,
    billingAddress,
    lineItems,
    ach: achData,
    vaulted,
    isTaxable,
    metadata: {
      organizationId: params.organizationId,
      memberId: params.memberId,
      ...(params.membershipPlanId && { membershipPlanId: params.membershipPlanId }),
      ...(params.appliedCoupon?.code && { couponCode: params.appliedCoupon.code }),
      providerSubscriptionId: subResult.subscriptionId ?? '',
    },
  });

  // Persist the initial transaction(s). When signup fee > 0, split into TWO
  // rows sharing the same IQPro transaction id (one Sale, two local rows) —
  // mirrors the cancellation_fee / hold_fee pattern and gives clean per-type
  // revenue reporting. The membership row's amount is the post-coupon
  // recurring portion; the signup-fee row is the full fee.
  const txStatus = initialCharge.status === 'approved'
    ? 'paid' as const
    : initialCharge.status === 'declined'
      ? 'declined' as const
      : 'processing' as const;
  const processedAt = initialCharge.success ? new Date() : null;
  const txId = randomUUID();
  const txRows: Array<typeof transactionSchema.$inferInsert> = [
    {
      id: txId,
      organizationId: params.organizationId,
      memberId: params.memberId,
      memberMembershipId: params.memberMembershipId ?? null,
      providerTransactionId: initialCharge.transactionId ?? null,
      transactionType: 'membership_payment',
      amount: recurringAmount,
      currency: 'USD',
      status: txStatus,
      paymentMethod: params.paymentMethod,
      description: params.description,
      processedAt,
    },
  ];
  if (signupFee > 0) {
    const planLabel = params.description.replace(/^Membership:\s*/i, '').trim() || 'membership';
    txRows.push({
      id: randomUUID(),
      organizationId: params.organizationId,
      memberId: params.memberId,
      memberMembershipId: params.memberMembershipId ?? null,
      providerTransactionId: initialCharge.transactionId ?? null,
      transactionType: 'signup_fee',
      amount: signupFee,
      currency: 'USD',
      status: txStatus,
      paymentMethod: params.paymentMethod,
      description: `Sign-up fee — ${planLabel}`,
      processedAt,
    });
  }
  if (!initialCharge.success) {
    // Subscription was created in IQPro but the initial charge failed. Record
    // the attempt row(s), then surface the failure rather than silently
    // proceeding — the membership stays unactivated (its providerSubscriptionId is
    // NOT persisted) and the operator can retry or cancel the IQPro
    // subscription. This is the documented compensating path for an orphan
    // IQPro subscription (#WS3).
    await db.insert(transactionSchema).values(txRows);
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

  // Success path: the transaction row(s) and the membership activation
  // (providerSubscriptionId + billing dates) are one logical unit — persist them
  // atomically so we never end up with recorded transactions but a membership
  // that never learned its IQPro subscription id (which the app couldn't later
  // cancel) (#WS3).
  await db.transaction(async (tx) => {
    await tx.insert(transactionSchema).values(txRows);

    if (params.memberMembershipId) {
      const firstPaymentDate = new Date();
      const nextPayment = computeNextPaymentDate(firstPaymentDate, frequency);

      await tx
        .update(memberMembershipSchema)
        .set({
          providerSubscriptionId: subResult.subscriptionId,
          billingType: 'autopay',
          firstPaymentDate,
          nextPaymentDate: nextPayment,
        })
        .where(eq(memberMembershipSchema.id, params.memberMembershipId));
    }
  });

  // Map the provider ids to this org so a sessionless webhook can find its
  // way home once each org has its own database. Written AFTER the commit and
  // best-effort, like the coupon redemption below — the payment has already
  // succeeded and must not be undone by bookkeeping.
  await Promise.all([
    recordExternalRef(REF_TYPE.PROVIDER_SUBSCRIPTION, subResult.subscriptionId, params.organizationId),
    // Both txRows share ONE provider transaction id; the insert is
    // ON CONFLICT DO NOTHING, so the second is a harmless no-op.
    recordExternalRef(REF_TYPE.PROVIDER_TRANSACTION, initialCharge.transactionId, params.organizationId),
  ]);

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
  config: PaymentProviderConfig;
  provider: Awaited<ReturnType<typeof getPaymentProvider>>;
  params: ProcessMemberPaymentParams;
  customerId: string;
  paymentMethodId: string;
  feeBreakdown: FeeBreakdown;
  billingAddressId?: string;
  billingAddress: TransactionBillingAddress;
  lineItems: TransactionLineItem[];
  achData?: { achToken: string; secCode: string; routingNumber: string; accountType: string };
  vaulted: boolean;
  isTaxable: boolean;
  last4ForReceipt?: string;
};

async function handleOneTimePayment(args: OneTimeParams): Promise<ProcessMemberPaymentResult> {
  const { config, provider, params, customerId, paymentMethodId, feeBreakdown, billingAddressId, billingAddress, lineItems, achData, vaulted, isTaxable } = args;

  const signupFee = params.signupFee ?? 0;
  const couponDiscount = computeCouponDiscount(params.amount, params.appliedCoupon);
  const membershipAmount = Math.max(0, Math.round((params.amount - couponDiscount) * 100) / 100);

  const payResult = await provider.processPayment(config, {
    customerId,
    paymentMethodId,
    amount: feeBreakdown.amount,
    currency: 'USD',
    description: params.description,
    feeBreakdown,
    customerBillingAddressId: billingAddressId,
    billingAddress,
    lineItems,
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

  // Persist transaction record(s). When signupFee > 0, split into TWO rows
  // sharing the same IQPro transaction id — mirrors handleAutopay and the
  // cancellation_fee / hold_fee pattern.
  const txStatus = payResult.status === 'approved'
    ? 'paid' as const
    : payResult.status === 'declined'
      ? 'declined' as const
      : 'processing' as const;
  const processedAt = payResult.success ? new Date() : null;
  const txId = randomUUID();
  const txRows: Array<typeof transactionSchema.$inferInsert> = [
    {
      id: txId,
      organizationId: params.organizationId,
      memberId: params.memberId,
      memberMembershipId: params.memberMembershipId ?? null,
      providerTransactionId: payResult.transactionId ?? null,
      transactionType: 'membership_payment',
      amount: membershipAmount,
      currency: 'USD',
      status: txStatus,
      paymentMethod: params.paymentMethod,
      description: params.description,
      processedAt,
    },
  ];
  if (signupFee > 0) {
    const planLabel = params.description.replace(/^Membership:\s*/i, '').trim() || 'membership';
    txRows.push({
      id: randomUUID(),
      organizationId: params.organizationId,
      memberId: params.memberId,
      memberMembershipId: params.memberMembershipId ?? null,
      providerTransactionId: payResult.transactionId ?? null,
      transactionType: 'signup_fee',
      amount: signupFee,
      currency: 'USD',
      status: txStatus,
      paymentMethod: params.paymentMethod,
      description: `Sign-up fee — ${planLabel}`,
      processedAt,
    });
  }
  // On success the transaction row(s) and the membership billing update are one
  // logical unit — persist atomically so we never record a paid transaction
  // without activating the membership (#WS3). On failure only the attempt
  // row(s) are recorded.
  if (params.memberMembershipId && payResult.success) {
    await db.transaction(async (tx) => {
      await tx.insert(transactionSchema).values(txRows);
      await tx
        .update(memberMembershipSchema)
        .set({ billingType: 'one-time', firstPaymentDate: new Date() })
        .where(eq(memberMembershipSchema.id, params.memberMembershipId!));
    });
  } else {
    await db.insert(transactionSchema).values(txRows);
  }

  // Map the provider transaction to this org for webhook routing. Both txRows
  // share ONE provider id; ON CONFLICT DO NOTHING makes the second a no-op.
  await recordExternalRef(REF_TYPE.PROVIDER_TRANSACTION, payResult.transactionId, params.organizationId);

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

// ===== Coupon validation & redemption tracking =====

// Map the DB `discount_type` to the client-facing AppliedCoupon.type used by
// the discount math. Mirrors features/marketing/couponDataTransformers.ts.
function dbDiscountTypeToAppliedType(discountType: string): AppliedCoupon['type'] {
  switch (discountType.toLowerCase()) {
    case 'fixed':
      return 'Fixed Amount';
    case 'free_days':
      return 'Free Trial';
    case 'percentage':
    default:
      return 'Percentage';
  }
}

type CouponValidationResult
  = | { ok: true; coupon: AppliedCoupon }
    | { ok: false; reason: string; userMessage: string };

/**
 * Server-authoritative coupon validation. Re-fetches the coupon from the DB
 * scoped to `organizationId` and verifies:
 *   - it exists and belongs to this org (blocks cross-tenant redemption),
 *   - status is 'active',
 *   - now is within [validFrom, validUntil],
 *   - applicableTo matches the charge context ('all' always matches),
 *   - the global usageLimit is not already reached,
 *   - the member is under perUserLimit.
 * On success returns an AppliedCoupon rebuilt from DB values (discount type +
 * amount + maxDiscountAmount cap), so the caller never trusts the client's
 * numbers. `now` is injected for deterministic tests.
 */
async function validateCouponForCharge(
  couponId: string,
  organizationId: string,
  memberId: string,
  context: 'membership' | 'event',
  now: Date = new Date(),
): Promise<CouponValidationResult> {
  const rows = await db
    .select({
      id: couponSchema.id,
      code: couponSchema.code,
      description: couponSchema.description,
      discountType: couponSchema.discountType,
      discountValue: couponSchema.discountValue,
      applicableTo: couponSchema.applicableTo,
      maxDiscountAmount: couponSchema.maxDiscountAmount,
      usageLimit: couponSchema.usageLimit,
      usageCount: couponSchema.usageCount,
      perUserLimit: couponSchema.perUserLimit,
      validFrom: couponSchema.validFrom,
      validUntil: couponSchema.validUntil,
      status: couponSchema.status,
    })
    .from(couponSchema)
    .where(and(eq(couponSchema.id, couponId), eq(couponSchema.organizationId, organizationId)))
    .limit(1);

  const coupon = rows[0];
  if (!coupon) {
    // Missing OR belongs to another org — same generic message either way.
    return { ok: false, reason: 'not_found_or_foreign', userMessage: 'This coupon is not valid.' };
  }
  if (coupon.status !== 'active') {
    return { ok: false, reason: `status_${coupon.status}`, userMessage: 'This coupon is no longer active.' };
  }
  if (coupon.validFrom && now < coupon.validFrom) {
    return { ok: false, reason: 'not_yet_valid', userMessage: 'This coupon is not valid yet.' };
  }
  if (coupon.validUntil && now > coupon.validUntil) {
    return { ok: false, reason: 'expired', userMessage: 'This coupon has expired.' };
  }
  if (coupon.applicableTo !== 'all' && coupon.applicableTo !== context) {
    return { ok: false, reason: 'not_applicable', userMessage: 'This coupon does not apply to this purchase.' };
  }
  if (coupon.usageLimit != null && (coupon.usageCount ?? 0) >= coupon.usageLimit) {
    return { ok: false, reason: 'global_limit', userMessage: 'This coupon has reached its usage limit.' };
  }

  const perUserLimit = coupon.perUserLimit ?? 1;
  const usageCounts = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(couponUsageSchema)
    .where(and(
      eq(couponUsageSchema.couponId, couponId),
      eq(couponUsageSchema.memberId, memberId),
    ));
  const priorUsages = usageCounts[0]?.count ?? 0;
  if (priorUsages >= perUserLimit) {
    return {
      ok: false,
      reason: 'per_user_limit',
      userMessage: 'You have already used this coupon the maximum number of times.',
    };
  }

  return {
    ok: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      type: dbDiscountTypeToAppliedType(coupon.discountType),
      amount: String(coupon.discountValue),
      description: coupon.description ?? '',
      maxDiscountAmount: coupon.maxDiscountAmount,
    },
  };
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
    // Increment usageCount atomically AND enforce the global usageLimit in the
    // same statement — the WHERE guard means two concurrent redemptions of a
    // limit-N coupon can never push the counter past N (the pre-charge check in
    // validateCouponForCharge can race; this is the authoritative gate). A
    // zero-row result means the limit was already reached between the pre-check
    // and here — the charge already happened, so we log for reconciliation
    // rather than roll back a completed payment.
    const incremented = await db
      .update(couponSchema)
      .set({ usageCount: sql`COALESCE(${couponSchema.usageCount}, 0) + 1` })
      .where(and(
        eq(couponSchema.id, args.appliedCoupon.id),
        sql`(${couponSchema.usageLimit} IS NULL OR COALESCE(${couponSchema.usageCount}, 0) < ${couponSchema.usageLimit})`,
      ))
      .returning({ id: couponSchema.id });
    if (incremented.length === 0) {
      logger.warn('[MemberPayment] Coupon global usage limit reached at redemption time (charge already completed)', {
        couponId: args.appliedCoupon.id,
        memberId: args.memberId,
        transactionId: args.transactionId,
      });
    } else {
      logger.info('[MemberPayment] Coupon redemption recorded', {
        couponId: args.appliedCoupon.id,
        memberId: args.memberId,
        transactionId: args.transactionId,
        discountApplied: args.couponDiscount,
      });
    }
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
  const refundId = randomUUID();

  // The refund-row insert and the original-status flip must be atomic:
  // otherwise a crash between them would leave an orphan refund row while the
  // original still looks refundable, and the caller could refund it a second
  // time (#WS3 double-refund). We flip FIRST, guarded on the row still being
  // non-refunded, so two racing refunds can't both create a refund row.
  const originalTx = await db.transaction(async (tx) => {
    const original = await tx
      .select()
      .from(transactionSchema)
      .where(and(eq(transactionSchema.id, transactionId), eq(transactionSchema.organizationId, organizationId)))
      .limit(1);
    const row = original[0];
    if (!row) {
      throw new TransactionNotFoundError(transactionId);
    }
    if (row.status === 'refunded') {
      throw new TransactionAlreadyRefundedError(transactionId);
    }

    const flipped = await tx
      .update(transactionSchema)
      .set({ status: 'refunded' })
      .where(and(
        eq(transactionSchema.id, transactionId),
        sql`${transactionSchema.status} != 'refunded'`,
      ))
      .returning({ id: transactionSchema.id });

    if (flipped.length === 0) {
      // A concurrent refund already flipped it between our read and update.
      throw new TransactionAlreadyRefundedError(transactionId);
    }

    await tx.insert(transactionSchema).values({
      id: refundId,
      organizationId,
      memberId: row.memberId,
      memberMembershipId: row.memberMembershipId,
      transactionType: 'refund',
      amount: -Math.abs(row.amount),
      currency: row.currency,
      status: 'paid',
      paymentMethod: row.paymentMethod,
      description: `Refund for transaction ${row.id}`,
      processedAt: new Date(),
    });

    return row;
  });

  // Coupon reversal is intentionally best-effort and runs AFTER the refund
  // commits: a stuck coupon counter must not roll back (or block) a completed
  // refund. Batched — one delete for all usage rows, plus one grouped decrement
  // per distinct coupon — replacing the previous 2-writes-per-usage loop (#WS2).
  let decrementedCoupons = 0;
  try {
    const usages = await db
      .select({ id: couponUsageSchema.id, couponId: couponUsageSchema.couponId })
      .from(couponUsageSchema)
      .where(eq(couponUsageSchema.transactionId, transactionId));

    if (usages.length > 0) {
      await db.delete(couponUsageSchema).where(inArray(couponUsageSchema.id, usages.map(u => u.id)));

      // Group by coupon so a transaction that redeemed the same coupon more than
      // once decrements by the correct count in a single UPDATE.
      const decrementByCoupon = new Map<string, number>();
      for (const usage of usages) {
        decrementByCoupon.set(usage.couponId, (decrementByCoupon.get(usage.couponId) ?? 0) + 1);
      }

      await Promise.all(
        [...decrementByCoupon.entries()].map(([couponId, count]) =>
          db
            .update(couponSchema)
            .set({ usageCount: sql`GREATEST(COALESCE(${couponSchema.usageCount}, 0) - ${count}, 0)` })
            .where(eq(couponSchema.id, couponId)),
        ),
      );

      decrementedCoupons = usages.length;
    }
  } catch (error) {
    logger.error('[MemberPayment] Failed to reverse coupon redemptions (non-fatal)', {
      error,
      transactionId,
    });
  }

  logger.info('[MemberPayment] Refund processed', {
    refundTransactionId: refundId,
    originalTransactionId: originalTx.id,
    decrementedCoupons,
  });

  return {
    refundTransactionId: refundId,
    originalTransactionId: transactionId,
    decrementedCoupons,
  };
}

// =============================================================================
// MEMBERSHIP LIFECYCLE: CANCEL / HOLD / REACTIVATE
// =============================================================================

export type LifecycleContext = {
  member: {
    id: string;
    organizationId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    providerCustomerId: string | null;
  };
  membership: {
    id: string;
    memberId: string;
    membershipPlanId: string;
    status: string;
    providerSubscriptionId: string | null;
    providerHoldFeeSubscriptionId: string | null;
  };
  plan: {
    id: string;
    name: string;
    cancellationFee: number;
    holdFeeAmount: number;
    holdFeeFrequency: string | null;
    holdLimitPerYear: number | null;
  };
};

/**
 * Fetch the member + membership + plan together for a lifecycle action.
 * Returns null when the record doesn't exist, is in a different org, or
 * doesn't match the requested member. The router-level guards already check
 * the org, so this is mostly a tenancy belt-and-suspenders.
 */
export async function getLifecycleContext(
  memberId: string,
  memberMembershipId: string,
  organizationId: string,
): Promise<LifecycleContext | null> {
  const rows = await db
    .select({
      memberId: memberSchema.id,
      memberOrgId: memberSchema.organizationId,
      memberFirstName: memberSchema.firstName,
      memberLastName: memberSchema.lastName,
      memberEmail: memberSchema.email,
      memberPhone: memberSchema.phone,
      providerCustomerId: memberSchema.providerCustomerId,
      membershipId: memberMembershipSchema.id,
      membershipPlanId: memberMembershipSchema.membershipPlanId,
      membershipStatus: memberMembershipSchema.status,
      providerSubscriptionId: memberMembershipSchema.providerSubscriptionId,
      providerHoldFeeSubscriptionId: memberMembershipSchema.providerHoldFeeSubscriptionId,
      planId: membershipPlanSchema.id,
      planName: membershipPlanSchema.name,
      cancellationFee: membershipPlanSchema.cancellationFee,
      holdFeeAmount: membershipPlanSchema.holdFeeAmount,
      holdFeeFrequency: membershipPlanSchema.holdFeeFrequency,
      holdLimitPerYear: membershipPlanSchema.holdLimitPerYear,
    })
    .from(memberMembershipSchema)
    .innerJoin(memberSchema, eq(memberMembershipSchema.memberId, memberSchema.id))
    .innerJoin(membershipPlanSchema, eq(memberMembershipSchema.membershipPlanId, membershipPlanSchema.id))
    .where(and(
      eq(memberMembershipSchema.id, memberMembershipId),
      eq(memberMembershipSchema.memberId, memberId),
      eq(memberSchema.organizationId, organizationId),
    ))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    member: {
      id: row.memberId,
      organizationId: row.memberOrgId,
      firstName: row.memberFirstName,
      lastName: row.memberLastName,
      email: row.memberEmail,
      phone: row.memberPhone,
      providerCustomerId: row.providerCustomerId,
    },
    membership: {
      id: row.membershipId,
      memberId: row.memberId,
      membershipPlanId: row.membershipPlanId,
      status: row.membershipStatus,
      providerSubscriptionId: row.providerSubscriptionId,
      providerHoldFeeSubscriptionId: row.providerHoldFeeSubscriptionId,
    },
    plan: {
      id: row.planId,
      name: row.planName,
      cancellationFee: row.cancellationFee,
      holdFeeAmount: row.holdFeeAmount,
      holdFeeFrequency: row.holdFeeFrequency,
      holdLimitPerYear: row.holdLimitPerYear,
    },
  };
}

export type LifecycleResult = {
  success: boolean;
  amountCharged?: number;
  transactionId?: string;
  error?: string;
};

/**
 * Charge a one-time fee against an existing IQPro subscription's vaulted
 * payment method. Mirrors the kiosk's cancellation-fee Sale payload byte-for-
 * byte. Used for cancellation fees and one-time hold fees.
 *
 * Returns `success: false` when the charge can't proceed (no subscription,
 * no payment method on file) — callers can decide whether the missing fee is
 * fatal or whether the cancel/hold should continue anyway.
 */
export async function chargeOneTimeFee(args: {
  config: PaymentProviderConfig;
  providerSubscriptionId: string;
  providerCustomerId: string;
  orgId: string;
  memberId: string;
  memberMembershipId: string;
  amount: number;
  transactionType: 'cancellation_fee' | 'hold_fee';
  description: string;
  caption: string;
}): Promise<LifecycleResult> {
  const { config, providerSubscriptionId, providerCustomerId, orgId, memberId, memberMembershipId, amount, transactionType, description, caption } = args;

  const provider = await getPaymentProvider(config);
  const charge = await provider.chargeOneTimeFee(config, {
    providerSubscriptionId,
    providerCustomerId,
    amount,
    description,
    caption,
  });

  if (!charge.success) {
    return { success: false, error: charge.error };
  }
  // Zero-amount fee: nothing charged, nothing to record.
  if (!charge.transactionId && !charge.amountCharged) {
    return { success: true, amountCharged: 0 };
  }

  const now = new Date();
  await db.insert(transactionSchema).values({
    id: randomUUID(),
    organizationId: orgId,
    memberId,
    memberMembershipId,
    transactionType,
    amount: charge.amountCharged ?? 0,
    status: 'paid',
    paymentMethod: charge.paymentMethodName ?? 'card',
    description,
    providerTransactionId: charge.transactionId ?? '',
    processedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return { success: true, amountCharged: charge.amountCharged ?? 0, transactionId: charge.transactionId };
}

/**
 * Cancel an IQPro subscription via the dedicated cancel endpoint. Idempotent
 * from the caller's perspective — failures are logged and returned rather
 * than thrown so the local DB cleanup can still proceed.
 */
export async function cancelIQProSubscription(
  config: PaymentProviderConfig,
  providerSubscriptionId: string,
  opts?: { endOfBillingPeriod?: boolean },
): Promise<{ success: boolean; error?: string }> {
  const provider = await getPaymentProvider(config);
  return provider.cancelSubscription(config, providerSubscriptionId, opts);
}

/**
 * Toggle an existing IQPro subscription's auto-renewal flag. Used to pause
 * (isAutoRenewed=false) when placing a member on hold and resume
 * (isAutoRenewed=true) on reactivation. Mirrors the kiosk's PUT recurrence
 * payload exactly so we don't drift between the two apps.
 */
export async function setSubscriptionAutoRenewal(
  config: PaymentProviderConfig,
  providerSubscriptionId: string,
  isAutoRenewed: boolean,
): Promise<{ success: boolean; error?: string }> {
  const provider = await getPaymentProvider(config);
  return provider.setSubscriptionAutoRenewal(config, providerSubscriptionId, isAutoRenewed);
}

/**
 * Map a stored `holdFeeFrequency` ('Monthly', 'Semi-Annual', etc.) to the
 * IQPro `SubscriptionFrequency` enum. Returns null for 'one-time' or unknown
 * values — caller is expected to special-case 'one-time' before calling.
 */
function holdFeeFrequencyToSubscriptionFrequency(value: string | null): SubscriptionFrequency | null {
  if (!value || value === 'one-time') {
    return null;
  }
  return normalizeFrequency(value);
}

export type CancelMembershipResult = {
  success: boolean;
  cancellationFeeCharged: number;
  cancellationTransactionId?: string;
  subscriptionCancelled: boolean;
  error?: string;
};

/**
 * Cancel a member's membership end-to-end:
 *  1) Charge the plan's cancellation fee (unless waived) via IQPro using the
 *     saved payment method on the existing subscription. A failure here is
 *     surfaced but does NOT block the cancellation itself.
 *  2) Cancel the IQPro subscription via the dedicated cancel endpoint.
 *  3) Cancel any recurring hold-fee subscription if the membership was on hold.
 *  4) Mark the membership cancelled + set endDate; only flip member.status to
 *     'cancelled' if this was the member's last active membership (mirrors
 *     the IQPro webhook semantics so the two code paths agree).
 *
 * Returns a structured result so the caller (router/audit) can record exactly
 * what happened.
 */
export async function cancelMembershipLifecycle(args: {
  config: PaymentProviderConfig | null;
  ctx: LifecycleContext;
  waiveFee: boolean;
}): Promise<CancelMembershipResult> {
  const { config, ctx, waiveFee } = args;
  const now = new Date();
  const feeAmount = waiveFee ? 0 : (ctx.plan.cancellationFee ?? 0);

  let cancellationFeeCharged = 0;
  let cancellationTransactionId: string | undefined;
  let feeChargeError: string | undefined;

  // 1) Charge the cancellation fee (best-effort)
  if (config && feeAmount > 0 && ctx.member.providerCustomerId && ctx.membership.providerSubscriptionId) {
    const feeResult = await chargeOneTimeFee({
      config,
      providerSubscriptionId: ctx.membership.providerSubscriptionId,
      providerCustomerId: ctx.member.providerCustomerId,
      orgId: ctx.member.organizationId,
      memberId: ctx.member.id,
      memberMembershipId: ctx.membership.id,
      amount: feeAmount,
      transactionType: 'cancellation_fee',
      description: `Cancellation fee — ${ctx.plan.name}`,
      caption: 'Cancellation fee',
    });
    if (feeResult.success) {
      cancellationFeeCharged = feeResult.amountCharged ?? 0;
      cancellationTransactionId = feeResult.transactionId;
    } else {
      feeChargeError = feeResult.error;
    }
  }

  // Whether we still owe a 'pending' cancellation-fee row (fee owed, not waived,
  // and no live charge transaction was produced). Written below in the same DB
  // transaction as the status updates.
  const needsPendingFeeRow = feeAmount > 0 && !cancellationTransactionId;

  // 2) Cancel the IQPro membership subscription
  let subscriptionCancelled = false;
  if (config && ctx.membership.providerSubscriptionId) {
    const cancelResult = await cancelIQProSubscription(config, ctx.membership.providerSubscriptionId);
    subscriptionCancelled = cancelResult.success;
  }

  // 3) Tear down any recurring hold-fee subscription
  if (config && ctx.membership.providerHoldFeeSubscriptionId) {
    await cancelIQProSubscription(config, ctx.membership.providerHoldFeeSubscriptionId);
  }

  // 4) Update local DB rows atomically. The pending-fee record, the membership
  // status flip, and the mirrored member-status flip are one unit — a mid-way
  // failure must not leave e.g. a cancelled membership without its fee record,
  // or a fee row with no status mirror (#WS3). Runs after the IQPro side
  // effects resolve (those can't participate in a DB transaction).
  await db.transaction(async (tx) => {
    // Record the cancellation fee in the member's billing history even when the
    // live IQPro charge didn't run or failed (#239). Without this, a fee owed on
    // a member whose subscription is synthetic (Preview/seed) or whose charge
    // errored would silently vanish. `chargeOneTimeFee` already inserts a 'paid'
    // row on success; here we insert a 'pending' row for the not-captured case.
    if (needsPendingFeeRow) {
      await tx.insert(transactionSchema).values({
        id: randomUUID(),
        organizationId: ctx.member.organizationId,
        memberId: ctx.member.id,
        memberMembershipId: ctx.membership.id,
        transactionType: 'cancellation_fee',
        amount: feeAmount,
        status: 'pending',
        description: `Cancellation fee — ${ctx.plan.name}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    await tx.update(memberMembershipSchema)
      .set({
        status: 'cancelled',
        endDate: now,
        providerHoldFeeSubscriptionId: null,
      })
      .where(eq(memberMembershipSchema.id, ctx.membership.id));

    // Mirror member.status only if no other active memberships remain — matches
    // the IQPro webhook handler at src/app/[locale]/webhook/iqpro/route.ts.
    const otherActive = await tx.query.memberMembershipSchema.findFirst({
      where: and(
        eq(memberMembershipSchema.memberId, ctx.member.id),
        eq(memberMembershipSchema.status, 'active'),
      ),
      columns: { id: true },
    });
    if (!otherActive) {
      await tx.update(memberSchema)
        .set({ status: 'cancelled', statusChangedAt: now })
        .where(eq(memberSchema.id, ctx.member.id));
    }
  });

  if (needsPendingFeeRow) {
    cancellationFeeCharged = feeAmount;
  }

  return {
    success: true,
    cancellationFeeCharged,
    cancellationTransactionId,
    subscriptionCancelled,
    error: feeChargeError,
  };
}

export type HoldMembershipResult = {
  success: boolean;
  holdFeeCharged: number;
  holdFeeTransactionId?: string;
  holdFeeSubscriptionId?: string;
  error?: string;
  /** Set when the request was refused because the plan's hold-limit-per-year has been reached. */
  limitReached?: {
    holdLimitPerYear: number;
    priorHolds: number;
  };
};

/**
 * Thrown by `holdMembershipLifecycle` when the plan's `hold_limit_per_year`
 * has been hit in the trailing 12 months. Router catches this and surfaces
 * a 409 to the client.
 */
export class HoldLimitReachedError extends Error {
  public readonly holdLimitPerYear: number;
  public readonly priorHolds: number;

  constructor(holdLimitPerYear: number, priorHolds: number) {
    super(`Hold limit reached: ${priorHolds} of ${holdLimitPerYear} holds used in the past 12 months.`);
    this.name = 'HoldLimitReachedError';
    this.holdLimitPerYear = holdLimitPerYear;
    this.priorHolds = priorHolds;
  }
}

/**
 * Count successful `memberMembership.hold` audit events for a given
 * membership over the trailing 12 months. We count from the audit log rather
 * than from the membership row because the hold state is short-lived (we
 * flip back to 'active' on reactivate, losing the historical fact). The
 * audit log is the canonical record of "how many holds did this membership
 * have this year".
 */
async function countRecentHolds(memberMembershipId: string, organizationId: string): Promise<number> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const result = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(auditEventSchema)
    .where(and(
      eq(auditEventSchema.organizationId, organizationId),
      eq(auditEventSchema.action, 'memberMembership.hold'),
      eq(auditEventSchema.entityId, memberMembershipId),
      eq(auditEventSchema.status, 'success'),
      gte(auditEventSchema.timestamp, twelveMonthsAgo),
    ));

  return result[0]?.count ?? 0;
}

/**
 * Place a membership on hold end-to-end:
 *  0) Enforce the plan's `hold_limit_per_year` if set. Counts prior successful
 *     hold actions in the trailing 12 months via the audit log. Throws
 *     `HoldLimitReachedError` (caught by the router as a 409) when reached.
 *  1) If the plan has a one-time hold fee, charge it now via the saved PM.
 *  2) If the plan has a recurring hold fee, create a new IQPro subscription
 *     (prefix 'HOLD') that bills the fee on that cadence; store its id on
 *     member_membership.providerHoldFeeSubscriptionId so reactivation can tear
 *     it down.
 *  3) Pause the original membership subscription (isAutoRenewed=false).
 *  4) Set membership.status='hold' and member.status='hold'.
 */
export async function holdMembershipLifecycle(args: {
  config: PaymentProviderConfig | null;
  ctx: LifecycleContext;
}): Promise<HoldMembershipResult> {
  const { config, ctx } = args;
  const now = new Date();

  // 0) Enforce the per-year hold limit if the plan has one. 0 or null = unlimited.
  const limit = ctx.plan.holdLimitPerYear;
  if (limit != null && limit > 0) {
    const priorHolds = await countRecentHolds(ctx.membership.id, ctx.member.organizationId);
    if (priorHolds >= limit) {
      throw new HoldLimitReachedError(limit, priorHolds);
    }
  }

  let holdFeeCharged = 0;
  let holdFeeTransactionId: string | undefined;
  let holdFeeSubscriptionId: string | undefined;
  let chargeError: string | undefined;

  const feeAmount = ctx.plan.holdFeeAmount ?? 0;
  const feeFrequency = ctx.plan.holdFeeFrequency;

  if (
    config
    && feeAmount > 0
    && ctx.member.providerCustomerId
    && ctx.membership.providerSubscriptionId
    && feeFrequency
  ) {
    if (feeFrequency === 'one-time') {
      const result = await chargeOneTimeFee({
        config,
        providerSubscriptionId: ctx.membership.providerSubscriptionId,
        providerCustomerId: ctx.member.providerCustomerId,
        orgId: ctx.member.organizationId,
        memberId: ctx.member.id,
        memberMembershipId: ctx.membership.id,
        amount: feeAmount,
        transactionType: 'hold_fee',
        description: `Hold fee — ${ctx.plan.name}`,
        caption: 'Hold fee',
      });
      if (result.success) {
        holdFeeCharged = result.amountCharged ?? 0;
        holdFeeTransactionId = result.transactionId;
      } else {
        chargeError = result.error;
      }
    } else {
      // Recurring hold-fee subscription. Re-use the existing
      // provider.createSubscription path but with prefix 'HOLD' and the
      // hold-fee cadence. We need the member's payment-method id from the
      // existing membership sub — look it up.
      const subFrequency = holdFeeFrequencyToSubscriptionFrequency(feeFrequency);
      if (subFrequency) {
        try {
          const provider = await getPaymentProvider(config);
          const saved = await provider.getSubscriptionPaymentMethod(
            config,
            ctx.membership.providerSubscriptionId,
          );
          const pmId = saved?.paymentMethodId ?? '';
          const customerId = saved?.customerId || (ctx.member.providerCustomerId ?? '');

          if (pmId) {
            const subResult = await provider.createSubscription(config, {
              organizationId: ctx.member.organizationId,
              customerId,
              paymentMethodId: pmId,
              amount: feeAmount,
              frequency: subFrequency,
              startDate: now,
              description: `Hold fee — ${ctx.plan.name}`,
              prefix: 'HOLD',
              firstName: ctx.member.firstName,
              lastName: ctx.member.lastName,
              email: ctx.member.email ?? '',
              ...(ctx.member.phone ? { phone: ctx.member.phone } : {}),
            });
            if (subResult.success && subResult.subscriptionId) {
              holdFeeSubscriptionId = subResult.subscriptionId;
            } else {
              chargeError = subResult.error;
            }
          } else {
            chargeError = 'No saved payment method on the existing subscription. Cannot create recurring hold-fee sub.';
          }
        } catch (err) {
          chargeError = err instanceof Error ? err.message : 'Unknown error';
          logger.error('[MemberPayment] Hold-fee subscription create failed', { error: chargeError });
        }
      }
    }
  }

  // Pause the original membership subscription. A failure here (e.g. IQPro
  // rejecting a synthetic/seed subscription id) must NOT abort the hold — the
  // local status change still proceeds and the error is surfaced, matching the
  // cancellation path's best-effort behaviour (#237).
  if (config && ctx.membership.providerSubscriptionId) {
    const pauseResult = await setSubscriptionAutoRenewal(config, ctx.membership.providerSubscriptionId, false);
    if (!pauseResult.success && !chargeError) {
      chargeError = pauseResult.error;
    }
  }

  // Update local DB rows atomically (mirrors the cancel path): the membership
  // status flip and the mirrored member status flip are one unit.
  await db.transaction(async (tx) => {
    await tx.update(memberMembershipSchema)
      .set({
        status: 'hold',
        ...(holdFeeSubscriptionId ? { providerHoldFeeSubscriptionId: holdFeeSubscriptionId } : {}),
      })
      .where(eq(memberMembershipSchema.id, ctx.membership.id));

    await tx.update(memberSchema)
      .set({ status: 'hold', statusChangedAt: now })
      .where(eq(memberSchema.id, ctx.member.id));
  });

  return {
    success: true,
    holdFeeCharged,
    holdFeeTransactionId,
    holdFeeSubscriptionId,
    error: chargeError,
  };
}

/**
 * Reactivate a held membership:
 *  1) Cancel any recurring hold-fee subscription that was created at hold time.
 *  2) Resume the original membership subscription (isAutoRenewed=true).
 *  3) Set membership.status='active' and member.status='active'.
 */
export async function reactivateMembershipLifecycle(args: {
  config: PaymentProviderConfig | null;
  ctx: LifecycleContext;
}): Promise<{ success: boolean; error?: string }> {
  const { config, ctx } = args;
  const now = new Date();

  // Both IQPro calls are best-effort: a failure (e.g. a synthetic/seed
  // subscription id IQPro rejects) is surfaced but never blocks the local
  // reactivation, mirroring the hold/cancel paths (#237).
  let error: string | undefined;
  if (config && ctx.membership.providerHoldFeeSubscriptionId) {
    const cancelResult = await cancelIQProSubscription(config, ctx.membership.providerHoldFeeSubscriptionId);
    if (!cancelResult.success) {
      error = cancelResult.error;
    }
  }
  if (config && ctx.membership.providerSubscriptionId) {
    const resumeResult = await setSubscriptionAutoRenewal(config, ctx.membership.providerSubscriptionId, true);
    if (!resumeResult.success && !error) {
      error = resumeResult.error;
    }
  }

  // Update local DB rows atomically (mirrors the cancel path).
  await db.transaction(async (tx) => {
    await tx.update(memberMembershipSchema)
      .set({
        status: 'active',
        providerHoldFeeSubscriptionId: null,
      })
      .where(eq(memberMembershipSchema.id, ctx.membership.id));

    await tx.update(memberSchema)
      .set({ status: 'active', statusChangedAt: now })
      .where(eq(memberSchema.id, ctx.member.id));
  });

  return { success: true, error };
}
