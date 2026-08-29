/**
 * Payment provider abstraction layer.
 *
 * Defines a provider-agnostic interface for member payment operations. Each
 * organization picks its provider via `organization.payment_provider`; the
 * choice governs EVERY member-facing charge that org takes — memberships,
 * lifecycle fees, events, and the kiosk store. Platform SaaS billing is
 * separate and IQPro-only (see `resolvePlatformIQProConfig`).
 *
 * IQPro is the only implementation today. Square arrives in B4: implement
 * `IPaymentProvider`, then add its branch to `getPaymentProvider()` — the
 * exhaustiveness check there turns a missing branch into a compile error
 * rather than a runtime surprise.
 */

import type { BillingType, PaymentMethod } from '@/hooks/useAddMemberWizard';
import type { PaymentProviderConfig } from '@/services/PaymentProviderConfigService';
import type { PaymentProvider } from '@/types/PaymentProvider';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';

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
 * Fee breakdown passed into `processPayment` / `createSubscription` so the
 * provider's charge reconciles exactly with what was quoted.
 *
 * See `FeeProvenance` for which of these numbers the provider actually
 * attested to — it is NOT all of them on every provider.
 */
export type FeeBreakdown = {
  baseAmount: number;
  taxAmount: number;
  taxPct: number;
  serviceFeeAmount: number;
  serviceFeePct: number;
  amount: number;
};

/**
 * Where each money figure in a `FeeBreakdown` came from.
 *
 * The standing rule for this codebase is that every tax and fee amount shown,
 * persisted, or reported should be the value the provider's API returned — not
 * one this app calculated — so displayed, charged, and settled figures cannot
 * drift. **IQPro cannot fully satisfy that rule**, and pretending otherwise
 * would be worse than saying so:
 *
 * | Provider | tax | serviceFee |
 * |---|---|---|
 * | IQPro | `local` — no tax API exists; computed as `base × rate` in `computeFeeBreakdown` | `provider` — `/transaction/calculatefees` |
 * | Square (B4) | `provider` — `POST /v2/orders/calculate` | `provider` — same call |
 *
 * Recording this alongside the amounts means an audit can tell which figures
 * are provider-attested and which are ours, instead of having to infer it from
 * which provider the org happened to be on at the time.
 */
export type FeeProvenance = {
  tax: 'provider' | 'local';
  serviceFee: 'provider' | 'local';
};

/** A fee breakdown together with the provenance of its figures. */
export type FeeQuote = FeeBreakdown & { provenance: FeeProvenance };

export type ComputeFeesParams = {
  baseAmount: number;
  isTaxable: boolean;
  /**
   * The org's tax rate. Used only by providers whose tax is `local`; a
   * provider that computes tax itself ignores this and reports
   * `provenance.tax === 'provider'`.
   */
  taxStatePct: number;
  /**
   * Which instrument is being charged.
   *
   * Provider-neutral by design. This replaced a `processorId` that only IQPro
   * has: obtaining one meant an IQPro gateway call, so the orchestrator could
   * not build these params for any other provider — a Square org failed before
   * reaching provider code at all. A provider that needs a processor id now
   * resolves its own from this.
   */
  paymentMethodType: 'card' | 'ach';
  /**
   * A SAVED payment method to price against, when the caller has no BIN or
   * token to hand. IQPro's /calculatefees needs one of those identifiers, so
   * its implementation looks them up itself rather than making the
   * orchestrator do an IQPro-shaped fetch.
   */
  customerId?: string;
  paymentMethodId?: string;
  creditCardBin?: string;
  token?: string;
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
  /**
   * Line items describing what's being charged. When more than one is
   * provided (e.g. membership + signup fee), each becomes a row in the
   * IQPro Sale's `lineItems[]` array. When omitted, the provider falls
   * back to a single item built from `description` + `amount`.
   */
  lineItems?: TransactionLineItem[];
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

export type SubscriptionFrequency = 'weekly' | 'monthly' | 'semi-annual' | 'annual';

export type CreateSubscriptionParams = {
  customerId: string;
  paymentMethodId: string;
  amount: number;
  frequency: SubscriptionFrequency;
  startDate: Date;
  description: string;
  metadata?: Record<string, string>;
  /**
   * Subscription prefix sent to IQPro (max 10 chars). Defaults to 'MBR' for
   * member-membership subscriptions. Use 'HOLD' for the recurring hold-fee
   * sub created when a member is placed on hold.
   */
  prefix?: string;

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

// ===== Lifecycle types =====

/** Result of a best-effort one-time fee charge (cancellation / hold fee). */
export type ChargeFeeResult = {
  success: boolean;
  /** Total captured, inclusive of fees. Absent when nothing was charged. */
  amountCharged?: number;
  transactionId?: string;
  /** Set when the charge could not proceed. Callers degrade, never throw. */
  error?: string;
  /** Card vs bank, resolved from the saved payment method. */
  paymentMethodName?: 'card' | 'ach';
  feeBreakdown?: FeeQuote;
};

export type ChargeOneTimeFeeParams = {
  providerSubscriptionId: string;
  providerCustomerId: string;
  amount: number;
  description: string;
  caption: string;
};

/** A saved payment method resolved from an existing subscription. */
export type SubscriptionPaymentMethod = {
  customerId: string;
  paymentMethodId: string;
  paymentMethodName: 'card' | 'ach';
};

export type LifecycleActionResult = { success: boolean; error?: string };

// ===== Provider interface =====
//
// Every method takes the org's resolved `PaymentProviderConfig`, so the
// implementation targets the right merchant account. The config is a
// discriminated union — an implementation narrows it at its own boundary and
// rejects a config belonging to a different provider.
//
// The four lifecycle methods below were previously raw IQPro calls inlined in
// MemberPaymentService, bypassing this interface entirely. That meant a Square
// org's hold/cancel would have charged the platform's IQPro merchant. They are
// on the interface now so that cannot happen.

export type IPaymentProvider = {
  createCustomer: (config: PaymentProviderConfig, params: CreateCustomerParams) => Promise<CreateCustomerResult>;
  createPaymentMethod: (config: PaymentProviderConfig, params: CreatePaymentMethodParams) => Promise<CreatePaymentMethodResult>;
  processPayment: (config: PaymentProviderConfig, params: ProcessPaymentParams) => Promise<PaymentResult>;
  createSubscription: (config: PaymentProviderConfig, params: CreateSubscriptionParams) => Promise<SubscriptionResult>;

  /** Server-authoritative fee quote. See `FeeProvenance`. */
  computeFees: (config: PaymentProviderConfig, params: ComputeFeesParams) => Promise<FeeQuote>;

  /**
   * Charge a one-time fee against the payment method saved on an existing
   * subscription. Best-effort: returns `success: false` rather than throwing,
   * so a failed fee degrades to a partial success instead of a 500 (#237).
   */
  chargeOneTimeFee: (config: PaymentProviderConfig, params: ChargeOneTimeFeeParams) => Promise<ChargeFeeResult>;

  /** Cancel a subscription. Errors are returned so local cleanup proceeds. */
  cancelSubscription: (
    config: PaymentProviderConfig,
    subscriptionId: string,
    opts?: { endOfBillingPeriod?: boolean },
  ) => Promise<LifecycleActionResult>;

  /** Pause (false) or resume (true) a subscription's auto-renewal. */
  setSubscriptionAutoRenewal: (
    config: PaymentProviderConfig,
    subscriptionId: string,
    isAutoRenewed: boolean,
  ) => Promise<LifecycleActionResult>;

  /**
   * Resolve the saved payment method on a subscription. Used when creating a
   * recurring hold-fee subscription against the member's existing card.
   * Returns null when the subscription or its payment method can't be read.
   */
  getSubscriptionPaymentMethod: (
    config: PaymentProviderConfig,
    subscriptionId: string,
  ) => Promise<SubscriptionPaymentMethod | null>;
};

// ===== Factory =====

/**
 * Cached per provider, not globally. A single shared slot could only ever hold
 * one implementation, so an org on Square would be served whichever provider
 * happened to be constructed first.
 */
const providerCache = new Map<PaymentProvider, IPaymentProvider>();

export async function getPaymentProvider(config: PaymentProviderConfig): Promise<IPaymentProvider> {
  const cached = providerCache.get(config.provider);
  if (cached) {
    return cached;
  }

  let provider: IPaymentProvider;
  switch (config.provider) {
    case PAYMENT_PROVIDER.IQPRO: {
      const { IQProPaymentProvider } = await import('./IQProPaymentService');
      provider = new IQProPaymentProvider();
      break;
    }
    case PAYMENT_PROVIDER.SQUARE: {
      const { SquarePaymentProvider } = await import('./SquarePaymentService');
      provider = new SquarePaymentProvider();
      break;
    }
    // Unreachable while every PaymentProvider has a case above — `config` is
    // `never` here, which is the compiler proving the switch is exhaustive.
    // Adding a provider without a case turns that proof into a type error
    // rather than a silent fall-through that bills the wrong merchant.
    default:
      throw new UnsupportedProviderError((config as PaymentProviderConfig).provider);
  }

  providerCache.set(config.provider, provider);
  return provider;
}

/** Thrown when an org selects a provider that has no implementation yet. */
export class UnsupportedProviderError extends Error {
  constructor(provider: string) {
    super(`Payment provider "${provider}" is selected for this organization but is not implemented yet.`);
    this.name = 'UnsupportedProviderError';
  }
}

// Exported for testing – reset cached providers
export function resetPaymentProvider(): void {
  providerCache.clear();
}

// Re-export billing types for convenience
export type { BillingType, PaymentMethod };
