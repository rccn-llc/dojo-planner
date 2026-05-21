/**
 * Payment provider abstraction layer.
 *
 * Defines a provider-agnostic interface for member payment operations.
 * Currently IQPro is the active provider. Stripe can be added by
 * implementing `IPaymentProvider` and updating `getPaymentProvider()`.
 */

import type { BillingType, PaymentMethod } from '@/hooks/useAddMemberWizard';
import type { IQProConfig } from '@/libs/IQPro';

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
 * Server-authoritative fee breakdown produced by `computeFeeBreakdown` in
 * libs/IQPro.ts. Tax is computed locally from the org's per-tenant tax rate
 * (organization.location_tax_rate, taxable transactions only); service fee is
 * computed by IQPro's /calculatefees endpoint. Passed into `processPayment`
 * and `createSubscription` so the `remit` block + Tax / ServiceFee
 * paymentAdjustments reconcile exactly with what IQPro will charge.
 */
export type FeeBreakdown = {
  baseAmount: number;
  taxAmount: number;
  taxPct: number;
  serviceFeeAmount: number;
  serviceFeePct: number;
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
  /**
   * ACH inline-charge fields. When provided AND `vaulted` is false, the IQPro
   * provider sends `paymentMethod.ach` (inline) instead of `paymentMethod.customer`
   * — mirrors kiosk behavior: ACH is vaulted upstream for the customer record
   * but the charge itself uses the inline ACH sub-object per Basys ACH docs.
   */
  ach?: {
    achToken: string;
    secCode: string;
    routingNumber: string;
    accountType: string;
  };
  /**
   * Required fee breakdown from `computeFeeBreakdown`. Drives the `remit`
   * block, Tax/ServiceFee paymentAdjustments, and line-item taxPct.
   */
  feeBreakdown: FeeBreakdown;
  /** IQPro `customerAddressId` to attach to the transaction's customer ref. */
  customerBillingAddressId?: string;
  /** Single line item describing what's being charged. */
  lineItem?: TransactionLineItem;
  /** Buyer billing address — used in the transaction's `address[]` block. */
  billingAddress?: TransactionBillingAddress;
  /**
   * When true, the transaction's `paymentMethod` block uses the customer-ref
   * shape `{ customer: { customerId, customerPaymentMethodId } }` — no inline
   * card/ach, no top-level address[]. Use for charging a member's existing
   * vaulted payment method.
   */
  vaulted?: boolean;
  /**
   * When true, the transaction is taxable: emits a `Tax` paymentAdjustment,
   * sets `remit.taxAmount: null` + `remit.isTaxExempt: false`, and sets
   * `lineItems[].localTaxPercent` to the configured rate. Default false.
   */
  isTaxable?: boolean;
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
   * Optional payment adjustments (Tax / ServiceFee) from a fee-breakdown
   * calculation. Attached to the subscription so each recurring invoice
   * carries the same fees as the initial sale.
   */
  paymentAdjustments?: Array<{
    type: string;
    percentage?: number | null;
    flatAmount?: number | null;
  }>;
  /**
   * When true, the subscription charges an existing vaulted payment method.
   * No payload-shape change required (the `paymentMethod.customerPaymentMethodId`
   * field works for any saved PM regardless of how it was created), but the
   * flag is propagated for clarity and future-proofing.
   */
  vaulted?: boolean;
};

export type SubscriptionResult = {
  success: boolean;
  subscriptionId?: string;
  error?: string;
};

// ===== Provider interface =====
//
// Each method receives an `IQProConfig` so the provider can target the right
// merchant gateway for the call (per-org for customer payments, platform for
// SaaS billing). Resolved by the caller and passed in.

export type IPaymentProvider = {
  createCustomer: (config: IQProConfig, params: CreateCustomerParams) => Promise<CreateCustomerResult>;
  createPaymentMethod: (config: IQProConfig, params: CreatePaymentMethodParams) => Promise<CreatePaymentMethodResult>;
  processPayment: (config: IQProConfig, params: ProcessPaymentParams) => Promise<PaymentResult>;
  createSubscription: (config: IQProConfig, params: CreateSubscriptionParams) => Promise<SubscriptionResult>;
};

// ===== Factory =====

let cachedProvider: IPaymentProvider | null = null;

export async function getPaymentProvider(): Promise<IPaymentProvider> {
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
