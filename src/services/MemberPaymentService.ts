/**
 * Member payment orchestration service.
 *
 * Coordinates the full payment flow for member payments:
 * 1. Get or create payment processor customer
 * 2. Register payment method (card/ACH)
 * 3. Process one-time payment OR create recurring subscription
 * 4. Persist results to the database
 */

import type { AppliedCoupon, BillingType, PaymentMethod } from '@/hooks/useAddMemberWizard';

import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { memberMembershipSchema, memberSchema, paymentMethodSchema, transactionSchema } from '@/models/Schema';

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

  const provider = await getPaymentProvider();

  try {
    // ── Step 1: Get or create customer ──────────────────────────────
    const existing = await db
      .select({ iqproCustomerId: memberSchema.iqproCustomerId })
      .from(memberSchema)
      .where(eq(memberSchema.id, params.memberId))
      .limit(1);

    let customerId = existing[0]?.iqproCustomerId ?? null;

    if (!customerId) {
      customerId = await provider.createCustomer({
        organizationId: params.organizationId,
        memberId: params.memberId,
        email: params.memberEmail,
        firstName: params.memberFirstName,
        lastName: params.memberLastName,
        phone: params.memberPhone,
        address: params.memberAddress,
      });

      await db
        .update(memberSchema)
        .set({ iqproCustomerId: customerId })
        .where(eq(memberSchema.id, params.memberId));

      logger.info('[MemberPayment] Created customer', { customerId });
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

    // ── Step 3: Route by billing type ───────────────────────────────
    const frequency = params.membershipPlanFrequency?.toLowerCase();
    const isAutopay
      = params.billingType === 'autopay'
        && (frequency === 'monthly' || frequency === 'annual');

    if (isAutopay) {
      return await handleAutopay(provider, params, customerId, pmResult.paymentMethodId, frequency as 'monthly' | 'annual');
    }

    return await handleOneTimePayment(provider, params, customerId, pmResult.paymentMethodId);
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
      customerId = await provider.createCustomer({
        organizationId: params.organizationId,
        memberId: params.memberId,
        email: params.memberEmail,
        firstName: params.memberFirstName,
        lastName: params.memberLastName,
        phone: params.memberPhone,
        address: params.memberAddress,
      });

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

async function handleAutopay(
  provider: Awaited<ReturnType<typeof getPaymentProvider>>,
  params: ProcessMemberPaymentParams,
  customerId: string,
  paymentMethodId: string,
  frequency: 'monthly' | 'annual',
): Promise<ProcessMemberPaymentResult> {
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

  // Persist subscription ID on membership
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

  logger.info('[MemberPayment] Subscription created', { subscriptionId: subResult.subscriptionId });
  return { success: true, status: 'approved' };
}

async function handleOneTimePayment(
  provider: Awaited<ReturnType<typeof getPaymentProvider>>,
  params: ProcessMemberPaymentParams,
  customerId: string,
  paymentMethodId: string,
): Promise<ProcessMemberPaymentResult> {
  const payResult = await provider.processPayment({
    customerId,
    paymentMethodId,
    amount: params.amount,
    currency: 'USD',
    description: params.description,
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
    amount: params.amount,
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

  logger.info('[MemberPayment] One-time payment processed', { txId, status: payResult.status });

  return {
    success: payResult.success,
    status: payResult.status,
    declineReason: payResult.declineReason,
    transactionId: txId,
    error: payResult.error,
  };
}
