/**
 * Square implementation of `IPaymentProvider`.
 *
 * ── Scope: member payments only ─────────────────────────────────────────────
 *
 * An organization choosing Square changes how ITS members are charged. It
 * never changes how that organization pays us: the SaaS subscription is always
 * the platform's own IQPro account, resolved through
 * `resolvePlatformIQProConfig`, which is typed against `IQProConfig` and so
 * cannot receive a Square config even by accident.
 *
 * ── Card-only, deliberately ─────────────────────────────────────────────────
 *
 * Square's Subscriptions API cannot store a bank account and charge it later,
 * so recurring ACH would mean this app owning a charge scheduler — retry,
 * dunning, idempotency — having always delegated recurrence to the processor.
 * Card-only applies org-wide rather than per-flow, because a per-surface
 * capability matrix is confusing to explain and awkward to enforce in four
 * separate payment-method pickers.
 *
 * ── What is implemented here ────────────────────────────────────────────────
 *
 * Customers, cards on file, fee quotes, and one-time payments. Subscriptions
 * and the lifecycle operations built on them return typed soft failures — see
 * the note above `createSubscription`.
 */

import type { PaymentProviderConfig, SquareProviderConfig } from './PaymentProviderConfigService';
import type {
  ChargeFeeResult,
  ChargeOneTimeFeeParams,
  ComputeFeesParams,
  CreateCustomerParams,
  CreateCustomerResult,
  CreatePaymentMethodParams,
  CreatePaymentMethodResult,
  CreateSubscriptionParams,
  FeeQuote,
  IPaymentProvider,
  LifecycleActionResult,
  PaymentResult,
  ProcessPaymentParams,
  SubscriptionPaymentMethod,
  SubscriptionResult,
} from './PaymentProviderService';
import { randomUUID } from 'node:crypto';
import { getServiceFeePct } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import { fromMinorUnits, squarePost, toMinorUnits } from '@/libs/Square';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';

/**
 * Narrow the union at the boundary, mirroring `requireIQPro`.
 *
 * Everything below then works with a `SquareProviderConfig` and cannot be
 * handed another provider's credentials — the failure that would otherwise
 * send a dojo's money to the wrong merchant account.
 */
function requireSquare(config: PaymentProviderConfig): SquareProviderConfig {
  if (config.provider !== PAYMENT_PROVIDER.SQUARE) {
    throw new TypeError(
      `SquarePaymentService received a "${config.provider}" config. Refusing rather than charging the wrong merchant account.`,
    );
  }
  return config;
}

/**
 * Square requires an idempotency key on every mutating call, and
 * `ProcessPaymentParams` has no field for one.
 *
 * Generated per attempt rather than derived from the params: the orchestrator
 * does not retry a charge, so a stable key would buy nothing, while a key
 * derived from amount+member would wrongly collapse two DELIBERATE charges of
 * the same amount to the same member (a second event registration, say) into
 * one. Square's window is 24 hours.
 */
function idempotencyKey(): string {
  return randomUUID();
}

/**
 * Square payment status → our three-state result.
 *
 * APPROVED means authorised but not captured, which only happens when
 * `autocomplete: false`. We always autocomplete, so it is treated as
 * in-flight rather than settled.
 */
function mapPaymentStatus(status: string | undefined): PaymentResult['status'] {
  switch (status) {
    case 'COMPLETED':
      return 'approved';
    case 'APPROVED':
    case 'PENDING':
      return 'processing';
    case 'FAILED':
    case 'CANCELED':
      return 'declined';
    default:
      return 'declined';
  }
}

/** The soft failure the lifecycle methods return until B4b lands. */
const SUBSCRIPTIONS_NOT_IMPLEMENTED
  = 'Square subscriptions are not implemented yet. This organization cannot use recurring billing on Square.';

export class SquarePaymentProvider implements IPaymentProvider {
  async createCustomer(config: PaymentProviderConfig, params: CreateCustomerParams): Promise<CreateCustomerResult> {
    const square = requireSquare(config);

    const body = {
      idempotency_key: idempotencyKey(),
      given_name: params.firstName,
      family_name: params.lastName,
      email_address: params.email,
      ...(params.phone ? { phone_number: params.phone } : {}),
      ...(params.address
        ? {
            address: {
              address_line_1: params.address.street,
              ...(params.address.apartment ? { address_line_2: params.address.apartment } : {}),
              locality: params.address.city,
              administrative_district_level_1: params.address.state,
              postal_code: params.address.zipCode,
              country: params.address.country,
            },
          }
        : {}),
      reference_id: params.memberId,
    };

    const res = await squarePost<{ customer?: { id?: string } }>(square, '/v2/customers', body);
    const customerId = res.customer?.id;
    if (!customerId) {
      throw new Error('Square created a customer but returned no id.');
    }

    // No `billingAddressId`: that is an IQPro vault concept with no Square
    // analogue — the address lives on the customer record itself.
    return { customerId };
  }

  async createPaymentMethod(
    config: PaymentProviderConfig,
    params: CreatePaymentMethodParams,
  ): Promise<CreatePaymentMethodResult> {
    const square = requireSquare(config);

    if (params.paymentMethod !== 'card') {
      throw new TypeError(
        `Square is card-only; "${params.paymentMethod}" was requested. Square cannot store a bank account for later charging, so recurring ACH is not offered.`,
      );
    }

    // The Web Payments SDK nonce. Raw card numbers never reach this service —
    // Square, like IQPro, requires client-side tokenisation for PCI reasons.
    if (!params.cardToken) {
      throw new Error('Square requires a card token from the Web Payments SDK; none was supplied.');
    }

    const body = {
      idempotency_key: idempotencyKey(),
      source_id: params.cardToken,
      card: {
        customer_id: params.customerId,
        ...(params.cardholderName ? { cardholder_name: params.cardholderName } : {}),
      },
    };

    const res = await squarePost<{ card?: { id?: string; last_4?: string } }>(square, '/v2/cards', body);
    const paymentMethodId = res.card?.id;
    if (!paymentMethodId) {
      throw new Error('Square created a card but returned no id.');
    }

    // `id` is the `ccof:`-prefixed card-on-file id, used as `source_id` on
    // later payments. No `achToken` — Square is card-only here.
    return { paymentMethodId, last4: res.card?.last_4 };
  }

  /**
   * Provider-authoritative fee quote via `POST /v2/orders/calculate`.
   *
   * Verified against the sandbox: for a $100 line item with 8.375% tax and a
   * 3.75% service charge, Square returns tax 838 and service charge 375 —
   * i.e. **tax is computed on the subtotal only and does NOT include the
   * service charge**. Square rounds half-up (837.5 → 838), matching
   * `roundCents`, so no divergence at the boundary.
   *
   * ⚠️ A service charge is NOT taxed unless `applied_taxes` names the tax
   * explicitly; the sandbox returned `taxable: false` by default. That is
   * deliberate here — the service fee is our platform fee, not a taxable good.
   *
   * Both figures come back from Square, so provenance is `provider` for each —
   * unlike IQPro, whose tax is local arithmetic.
   */
  async computeFees(config: PaymentProviderConfig, params: ComputeFeesParams): Promise<FeeQuote> {
    const square = requireSquare(config);

    const body = {
      order: {
        location_id: square.locationId,
        line_items: [
          {
            name: 'Charge',
            quantity: '1',
            base_price_money: { amount: toMinorUnits(params.baseAmount), currency: 'USD' },
          },
        ],
        ...(params.isTaxable && params.taxStatePct > 0
          ? {
              taxes: [
                {
                  uid: 'tax',
                  name: 'Sales tax',
                  percentage: String(params.taxStatePct),
                  scope: 'ORDER',
                },
              ],
            }
          : {}),
        service_charges: [
          {
            uid: 'service-fee',
            name: 'Service fee',
            percentage: String(getServiceFeePct()),
            calculation_phase: 'SUBTOTAL_PHASE',
          },
        ],
      },
    };

    const res = await squarePost<{
      order?: {
        total_money?: { amount?: number };
        total_tax_money?: { amount?: number };
        total_service_charge_money?: { amount?: number };
      };
    }>(square, '/v2/orders/calculate', body);

    const totalMinor = res.order?.total_money?.amount;
    if (totalMinor === undefined) {
      throw new Error('Square calculated an order but returned no total.');
    }

    const taxAmount = fromMinorUnits(res.order?.total_tax_money?.amount ?? 0);
    const serviceFeeAmount = fromMinorUnits(res.order?.total_service_charge_money?.amount ?? 0);

    return {
      baseAmount: params.baseAmount,
      taxAmount,
      taxPct: params.isTaxable ? params.taxStatePct : 0,
      serviceFeeAmount,
      serviceFeePct: getServiceFeePct(),
      amount: fromMinorUnits(totalMinor),
      provenance: { tax: 'provider', serviceFee: 'provider' },
    };
  }

  /**
   * One-time charge.
   *
   * ⚠️ Non-atomic, unlike IQPro's single Sale call: this creates an Order and
   * then a Payment against it, so a failure between the two leaves an order
   * that exists but was never paid. The order id is logged before the charge
   * so an orphan can be reconciled; Square orders carry no money on their own,
   * so an unpaid one is inert rather than harmful.
   */
  async processPayment(config: PaymentProviderConfig, params: ProcessPaymentParams): Promise<PaymentResult> {
    const square = requireSquare(config);

    if (!params.paymentMethodId) {
      return { success: false, status: 'declined', error: 'No Square payment method supplied.' };
    }

    const body = {
      idempotency_key: idempotencyKey(),
      source_id: params.paymentMethodId,
      // Required by Square whenever source_id is a stored card.
      customer_id: params.customerId,
      location_id: square.locationId,
      amount_money: { amount: toMinorUnits(params.amount), currency: params.currency ?? 'USD' },
      ...(params.description ? { note: params.description.slice(0, 500) } : {}),
    };

    try {
      const res = await squarePost<{
        payment?: { id?: string; status?: string };
      }>(square, '/v2/payments', body);

      const status = mapPaymentStatus(res.payment?.status);

      return {
        success: status === 'approved',
        status,
        transactionId: res.payment?.id,
        ...(status === 'declined' ? { error: `Square declined the payment (${res.payment?.status ?? 'unknown'}).` } : {}),
      };
    } catch (error) {
      logger.error('[Square] payment failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        status: 'declined',
        error: error instanceof Error ? error.message : 'Square payment failed.',
      };
    }
  }

  // ===== Subscriptions and the lifecycle built on them =====
  //
  // Not implemented until B4b, which needs two answers only a sandbox
  // experiment can give: whether CreateSubscription accepts ad-hoc phases
  // without a catalog plan variation, and whether per-cycle orders recompute
  // tax or snapshot it.
  //
  // ⚠️ These RETURN failures rather than throwing. Four of them have a
  // documented degrade-never-throw contract (#237): a hold or cancel that
  // throws becomes a 500 and blocks the local DB write that should still
  // happen. Throwing here would turn a missing feature into a regression.

  async createSubscription(
    _config: PaymentProviderConfig,
    _params: CreateSubscriptionParams,
  ): Promise<SubscriptionResult> {
    return { success: false, error: SUBSCRIPTIONS_NOT_IMPLEMENTED };
  }

  async chargeOneTimeFee(
    _config: PaymentProviderConfig,
    _params: ChargeOneTimeFeeParams,
  ): Promise<ChargeFeeResult> {
    return { success: false, error: SUBSCRIPTIONS_NOT_IMPLEMENTED };
  }

  async cancelSubscription(
    _config: PaymentProviderConfig,
    _subscriptionId: string,
    _opts?: { endOfBillingPeriod?: boolean },
  ): Promise<LifecycleActionResult> {
    return { success: false, error: SUBSCRIPTIONS_NOT_IMPLEMENTED };
  }

  async setSubscriptionAutoRenewal(
    _config: PaymentProviderConfig,
    _subscriptionId: string,
    _isAutoRenewed: boolean,
  ): Promise<LifecycleActionResult> {
    return { success: false, error: SUBSCRIPTIONS_NOT_IMPLEMENTED };
  }

  async getSubscriptionPaymentMethod(
    _config: PaymentProviderConfig,
    _subscriptionId: string,
  ): Promise<SubscriptionPaymentMethod | null> {
    return null;
  }
}
