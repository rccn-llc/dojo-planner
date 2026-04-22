/**
 * Payment provider abstraction layer.
 *
 * Defines a provider-agnostic interface for member payment operations.
 * Currently IQPro is the active provider. Stripe can be added by
 * implementing `IPaymentProvider` and updating `getPaymentProvider()`.
 */

import type { BillingType, PaymentMethod } from '@/hooks/useAddMemberWizard';

import { isIQProConfigured } from '@/libs/IQPro';

// ===== Provider-agnostic types =====

export type CreateCustomerParams = {
  organizationId: string;
  memberId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: {
    street: string;
    apartment?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
};

export type CreatePaymentMethodParams = {
  customerId: string;
  paymentMethod: PaymentMethod;
  cardholderName?: string;
  cardNumber?: string;
  cardToken?: string;
  cardFirstSix?: string;
  cardLastFour?: string;
  cardExpiry?: string;
  cardCvc?: string;
  achAccountHolder?: string;
  achRoutingNumber?: string;
  achAccountNumber?: string;
  achAccountType?: 'Checking' | 'Savings';
};

export type CreateCustomerResult = {
  customerId: string;
  /**
   * The IQPro `customerAddressId` of the billing address created with the
   * customer. Sent back into transaction payloads as
   * `paymentMethod.customer.customerBillingAddressId` so the ACH processor
   * can resolve the cardholder name from the vault.
   */
  billingAddressId?: string;
};

export type CreatePaymentMethodResult = {
  paymentMethodId: string;
  last4?: string;
  /** ACH token from vault tokenization — needed for ACH transaction processing */
  achToken?: string;
};

/**
 * Server-authoritative fee breakdown returned by IQPro's `calculatefees`
 * endpoint. Passed into `processPayment` and `createSubscription` so the
 * `remit` block on the transaction reconciles exactly with what IQPro will
 * charge (base + tax + surcharge + service fees + convenience fees).
 */
export type FeeBreakdown = {
  baseAmount: number;
  taxAmount: number;
  surchargeAmount: number;
  serviceFeesAmount: number;
  convenienceFeesAmount: number;
  amount: number;
};

export type TransactionLineItem = {
  name: string;
  description: string;
  unitPrice: number;
  discount: number;
};

export type TransactionBillingAddress = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state: string;
  postalCode?: string;
  country: string;
};

export type ProcessPaymentParams = {
  customerId: string;
  paymentMethodId: string;
  amount: number;
  currency: string;
  description: string;
  metadata?: Record<string, string>;
  /** ACH-specific fields — included in the transaction payload per IQPro docs */
  ach?: {
    achToken: string;
    secCode: string;
    routingNumber: string;
    accountType: string;
  };
  /**
   * Optional fee breakdown from IQPro's `calculatefees` endpoint. When
   * provided, the IQPro provider builds a full `remit` block with tax and
   * payment adjustments. When omitted, falls back to a minimal `remit`
   * derived from `amount`.
   */
  feeBreakdown?: FeeBreakdown;
  /** IQPro `customerAddressId` to attach to the transaction's customer ref. */
  customerBillingAddressId?: string;
  /** Single line item describing what's being charged. */
  lineItem?: TransactionLineItem;
  /** Buyer billing address — used in the transaction's `address[]` block. */
  billingAddress?: TransactionBillingAddress;
};

export type PaymentResult = {
  success: boolean;
  transactionId?: string;
  status: 'approved' | 'declined' | 'processing';
  declineReason?: string;
  error?: string;
};

export type CreateSubscriptionParams = {
  customerId: string;
  paymentMethodId: string;
  amount: number;
  frequency: 'monthly' | 'annual';
  startDate: Date;
  description: string;
  metadata?: Record<string, string>;

  // Member info for subscription address (required by IQPro)
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: {
    street: string;
    apartment?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };

  /**
   * Optional payment adjustments (Surcharge / ServiceFees / ConvenienceFees)
   * from a fee-breakdown calculation. Attached to the subscription so each
   * recurring invoice carries the same fees as the initial sale.
   */
  paymentAdjustments?: Array<{
    type: string;
    percentage?: number | null;
    flatAmount?: number | null;
  }>;
};

export type SubscriptionResult = {
  success: boolean;
  subscriptionId?: string;
  error?: string;
};

// ===== Provider interface =====

export type IPaymentProvider = {
  createCustomer: (params: CreateCustomerParams) => Promise<CreateCustomerResult>;
  createPaymentMethod: (params: CreatePaymentMethodParams) => Promise<CreatePaymentMethodResult>;
  processPayment: (params: ProcessPaymentParams) => Promise<PaymentResult>;
  createSubscription: (params: CreateSubscriptionParams) => Promise<SubscriptionResult>;
};

// ===== Factory =====

export function isPaymentEnabled(): boolean {
  return isIQProConfigured();
}

let cachedProvider: IPaymentProvider | null = null;

export async function getPaymentProvider(): Promise<IPaymentProvider> {
  if (!isPaymentEnabled()) {
    throw new Error('Payment processing is not configured. Set IQPRO_* environment variables.');
  }

  if (!cachedProvider) {
    const { IQProPaymentProvider } = await import('./IQProPaymentService');
    cachedProvider = new IQProPaymentProvider();
  }

  return cachedProvider;
}

// Exported for testing – reset cached provider
export function resetPaymentProvider(): void {
  cachedProvider = null;
}

// Re-export billing types for convenience
export type { BillingType, PaymentMethod };
