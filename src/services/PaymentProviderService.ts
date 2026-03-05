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

export type CreatePaymentMethodResult = {
  paymentMethodId: string;
  last4?: string;
  /** ACH token from vault tokenization — needed for ACH transaction processing */
  achToken?: string;
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
};

export type SubscriptionResult = {
  success: boolean;
  subscriptionId?: string;
  error?: string;
};

// ===== Provider interface =====

export type IPaymentProvider = {
  createCustomer: (params: CreateCustomerParams) => Promise<string>;
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
