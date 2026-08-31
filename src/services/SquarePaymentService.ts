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
  SubscriptionFrequency,
  SubscriptionPaymentMethod,
  SubscriptionResult,
} from './PaymentProviderService';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { getServiceFeePct } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import { fromMinorUnits, squareGet, squarePost, toMinorUnits } from '@/libs/Square';
import { squarePlanVariationSchema } from '@/models/Schema';
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

/**
 * Our four billing cadences → Square's catalog cadences.
 *
 * All four map natively, including semi-annual — which on IQPro has to be
 * emulated with a yearly billing period and two `monthsOfYear` entries. This
 * is one of the few places Square is the simpler integration.
 */
const SQUARE_CADENCE: Record<SubscriptionFrequency, string> = {
  'weekly': 'WEEKLY',
  'monthly': 'MONTHLY',
  'semi-annual': 'EVERY_SIX_MONTHS',
  'annual': 'ANNUAL',
};

/** Square takes plain `YYYY-MM-DD` for subscription dates, not an ISO instant. */
function squareDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Lift the tax RATE out of the fee adjustments the orchestrator built.
 *
 * Square wants a percentage on the subscription and computes the money itself
 * on each cycle's order — which is the provider-authoritative rule holding on
 * the recurring path too, not just the initial sale. Sandbox-verified as
 * mutable after creation, so a later tax-rate change can be pushed to existing
 * members with a `PUT`.
 *
 * The service fee is deliberately NOT carried onto the subscription: Square
 * models it as an order-level service charge, and there is no per-subscription
 * equivalent. B7's webhook path is where a recurring cycle's fees are recorded.
 */
function squareTaxPercentage(
  adjustments: CreateSubscriptionParams['paymentAdjustments'],
): { tax_percentage?: string } {
  const tax = adjustments?.find(a => a.type === 'Tax');
  const pct = tax?.percentage;
  if (pct === null || pct === undefined || pct <= 0) {
    return {};
  }
  return { tax_percentage: String(pct) };
}

/**
 * Resolve this org's Square catalog plan variation for a cadence, creating it
 * on first use.
 *
 * A read-through cache over `square_plan_variation`, bounded at **four rows
 * per org** — one per cadence, not one per membership plan. That is only
 * viable because `price_override_money` is per-subscription (sandbox-verified:
 * a $50 variation produced a $73.50 subscription), so the variation carries no
 * price anyone depends on and never needs syncing when a plan's price changes.
 *
 * The unique index on `(organization_id, cadence)` is the real guard: two
 * concurrent first-charges would both miss the cache, and the loser's insert
 * conflicts rather than minting a second catalog object. It re-reads the
 * winner's row instead of failing.
 *
 * ⚠️ Uses the ambient `db`, so it must run inside a tenant scope. Every caller
 * is an RPC handler, which is scoped; a server component would throw.
 */
async function ensurePlanVariation(
  square: SquareProviderConfig,
  organizationId: string,
  cadence: string,
): Promise<string> {
  const existing = await db
    .select({ planVariationId: squarePlanVariationSchema.planVariationId })
    .from(squarePlanVariationSchema)
    .where(
      and(
        eq(squarePlanVariationSchema.organizationId, organizationId),
        eq(squarePlanVariationSchema.cadence, cadence),
      ),
    )
    .limit(1);

  const cached = existing[0]?.planVariationId;
  if (cached) {
    return cached;
  }

  // Square requires the plan and its variation to be created together, with
  // the variation referencing the plan by a `#`-prefixed temporary id that
  // Square resolves server-side.
  const planTempId = '#plan';
  const res = await squarePost<{
    catalog_object?: {
      id?: string;
      subscription_plan_data?: { subscription_plan_variations?: Array<{ id?: string }> };
    };
  }>(square, '/v2/catalog/object', {
    idempotency_key: idempotencyKey(),
    object: {
      id: planTempId,
      type: 'SUBSCRIPTION_PLAN',
      subscription_plan_data: {
        name: `Dojo Planner membership (${cadence})`,
        subscription_plan_variations: [
          {
            id: '#variation',
            type: 'SUBSCRIPTION_PLAN_VARIATION',
            subscription_plan_variation_data: {
              name: `Dojo Planner ${cadence}`,
              phases: [{ cadence, ordinal: 0 }],
            },
          },
        ],
      },
    },
  });

  const planId = res.catalog_object?.id;
  const planVariationId
    = res.catalog_object?.subscription_plan_data?.subscription_plan_variations?.[0]?.id;

  if (!planVariationId) {
    throw new Error('Square created a subscription plan but returned no variation id.');
  }

  const inserted = await db
    .insert(squarePlanVariationSchema)
    .values({
      id: randomUUID(),
      organizationId,
      cadence,
      planVariationId,
      planId: planId ?? null,
    })
    .onConflictDoNothing({
      target: [squarePlanVariationSchema.organizationId, squarePlanVariationSchema.cadence],
    })
    .returning({ planVariationId: squarePlanVariationSchema.planVariationId });

  if (inserted[0]?.planVariationId) {
    return inserted[0].planVariationId;
  }

  // Lost a race: another request inserted first. Use ITS variation, so both
  // requests agree on one catalog object. The one we just created in Square is
  // orphaned but inert — a plan variation carries no money.
  const winner = await db
    .select({ planVariationId: squarePlanVariationSchema.planVariationId })
    .from(squarePlanVariationSchema)
    .where(
      and(
        eq(squarePlanVariationSchema.organizationId, organizationId),
        eq(squarePlanVariationSchema.cadence, cadence),
      ),
    )
    .limit(1);

  const raced = winner[0]?.planVariationId;
  if (!raced) {
    throw new Error('Square plan variation insert conflicted but no existing row was found.');
  }
  return raced;
}

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
  // ⚠️ Every method below RETURNS failures rather than throwing. Four of them
  // carry a documented degrade-never-throw contract (#237): a hold or cancel
  // that throws becomes a 500 and blocks the local DB write that must still
  // happen. That contract is why each body is wrapped in its own try/catch
  // even though the transport throws `SquareApiError`.

  /**
   * Create a recurring membership subscription.
   *
   * Three sandbox findings shape this, each contradicting the documentation:
   *
   * 1. **`plan_variation_id` is required**, though the API reference marks it
   *    optional. Omitting it returns `` `plan_variation_id` cannot be empty ``,
   *    and ad-hoc `phases` are rejected — `cadence` belongs to the catalog
   *    variation, not the subscription.
   * 2. **But one variation serves every member**, because `price_override_money`
   *    and `tax_percentage` are per-SUBSCRIPTION. So the catalog holds four
   *    objects per org (one per cadence), not one per membership plan, and
   *    there is no price-sync problem to solve.
   * 3. ⚠️ **`card_id` must always be sent.** Omitting it does not fail —
   *    Square silently switches to emailing the member an invoice, which for
   *    autopay is wrong in the most expensive direction.
   *
   * A member with no email is also rejected (`CUSTOMER_MISSING_EMAIL`), so
   * that is checked here rather than surfacing as a raw Square error.
   */
  async createSubscription(
    config: PaymentProviderConfig,
    params: CreateSubscriptionParams,
  ): Promise<SubscriptionResult> {
    const square = requireSquare(config);

    if (!params.paymentMethodId) {
      // Without a card id Square invoices the member instead of charging them.
      // Refusing is the safe failure; billing silently by email is not.
      return { success: false, error: 'Square requires a saved card to create a subscription.' };
    }

    if (!params.email) {
      return {
        success: false,
        error: 'Square requires the customer to have an email address before a subscription can be created.',
      };
    }

    const cadence = SQUARE_CADENCE[params.frequency];

    try {
      const planVariationId = await ensurePlanVariation(square, params.organizationId, cadence);

      const body = {
        idempotency_key: idempotencyKey(),
        location_id: square.locationId,
        plan_variation_id: planVariationId,
        customer_id: params.customerId,
        // Always present — see the card_id note above.
        card_id: params.paymentMethodId,
        start_date: squareDate(params.startDate),
        // Per-subscription override, which is what lets one catalog variation
        // serve every member on this cadence.
        price_override_money: { amount: toMinorUnits(params.amount), currency: 'USD' },
        ...(squareTaxPercentage(params.paymentAdjustments)),
      };

      const res = await squarePost<{ subscription?: { id?: string } }>(square, '/v2/subscriptions', body);
      const subscriptionId = res.subscription?.id;
      if (!subscriptionId) {
        return { success: false, error: 'Square created a subscription but returned no id.' };
      }

      return { success: true, subscriptionId };
    } catch (error) {
      logger.error('[Square] subscription create failed', {
        organizationId: params.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Square subscription creation failed.',
      };
    }
  }

  /**
   * Charge a hold or cancellation fee against the card saved on an existing
   * subscription.
   *
   * Mirrors `IQProPaymentService.chargeOneTimeFee`: resolve the payment method
   * from the subscription, quote the fees, then charge. Lifecycle fees are NOT
   * taxable, matching the IQPro path.
   */
  async chargeOneTimeFee(
    config: PaymentProviderConfig,
    params: ChargeOneTimeFeeParams,
  ): Promise<ChargeFeeResult> {
    const square = requireSquare(config);
    const baseAmount = Math.round(params.amount * 100) / 100;

    if (baseAmount <= 0) {
      // Same short-circuit as IQPro: nothing owed means no API call at all.
      return { success: true, amountCharged: 0 };
    }

    try {
      const resolved = await this.getSubscriptionPaymentMethod(config, params.providerSubscriptionId);
      if (!resolved?.paymentMethodId) {
        return {
          success: false,
          error: 'No saved payment method on the existing subscription. Cannot charge fee.',
        };
      }

      const customerId = resolved.customerId || params.providerCustomerId;

      const feeQuote = await this.computeFees(config, {
        baseAmount,
        isTaxable: false,
        taxStatePct: 0,
        paymentMethodType: 'card',
        customerId,
        paymentMethodId: resolved.paymentMethodId,
      });

      const res = await squarePost<{ payment?: { id?: string; status?: string } }>(square, '/v2/payments', {
        idempotency_key: idempotencyKey(),
        source_id: resolved.paymentMethodId,
        customer_id: customerId,
        location_id: square.locationId,
        amount_money: { amount: toMinorUnits(feeQuote.amount), currency: 'USD' },
        note: params.description.slice(0, 500),
      });

      if (mapPaymentStatus(res.payment?.status) !== 'approved') {
        return {
          success: false,
          error: `Square declined the fee charge (${res.payment?.status ?? 'unknown'}).`,
        };
      }

      return {
        success: true,
        amountCharged: feeQuote.amount,
        transactionId: res.payment?.id,
        paymentMethodName: 'card',
        feeBreakdown: feeQuote,
      };
    } catch (error) {
      logger.error('[Square] one-time fee charge failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Square fee charge failed.',
      };
    }
  }

  /**
   * Cancel a subscription.
   *
   * `POST /cancel` is the only cancel Square offers, and it sets
   * `canceled_date` to the end of the current billing period — so the member
   * keeps the period they already paid for and is never charged again.
   *
   * ⚠️ Sandbox-corrected: an earlier draft tried to honour
   * `endOfBillingPeriod: false` by PUTting `status: 'DEACTIVATED'`, which
   * Square rejects — *"The provided subscription field status is immutable."*
   * There is no immediate-cancel variant, so `opts` cannot change what happens
   * here; it is accepted only because the interface is shared with IQPro,
   * where it does. Verified: cancelling a same-day subscription returns
   * `status: CANCELED` with `billing_end_date` today, which is the
   * immediate outcome the membership-cancel flow wants anyway.
   */
  async cancelSubscription(
    config: PaymentProviderConfig,
    subscriptionId: string,
    _opts?: { endOfBillingPeriod?: boolean },
  ): Promise<LifecycleActionResult> {
    const square = requireSquare(config);

    try {
      await squarePost(square, `/v2/subscriptions/${subscriptionId}/cancel`, {});
      return { success: true };
    } catch (error) {
      logger.error('[Square] subscription cancel failed', {
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Square subscription cancel failed.',
      };
    }
  }

  /**
   * Pause (false) or resume (true) a subscription — the hold / reactivate pair.
   *
   * Square has no auto-renewal flag; it has PAUSE and RESUME actions, so the
   * IQPro-shaped boolean maps onto those.
   *
   * ⚠️ Sandbox-corrected: resume REQUIRES `resume_change_timing`, though the
   * field is not marked required. Omitting it returns
   * `Resume change timing must not be null`. `IMMEDIATE` is right for a
   * reactivate — the member is unpaused now, not at the next billing date.
   */
  async setSubscriptionAutoRenewal(
    config: PaymentProviderConfig,
    subscriptionId: string,
    isAutoRenewed: boolean,
  ): Promise<LifecycleActionResult> {
    const square = requireSquare(config);
    const action = isAutoRenewed ? 'resume' : 'pause';

    try {
      await squarePost(square, `/v2/subscriptions/${subscriptionId}/${action}`, {
        ...(isAutoRenewed ? { resume_change_timing: 'IMMEDIATE' } : {}),
      });
      return { success: true };
    } catch (error) {
      logger.error('[Square] subscription auto-renewal change failed', {
        subscriptionId,
        action,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : `Square subscription ${action} failed.`,
      };
    }
  }

  /**
   * Resolve the card saved on a subscription, so a hold fee can be charged
   * against it without re-collecting card data.
   *
   * Always reports `card`: Square is card-only here, and a subscription cannot
   * hold a bank account at all.
   */
  async getSubscriptionPaymentMethod(
    config: PaymentProviderConfig,
    subscriptionId: string,
  ): Promise<SubscriptionPaymentMethod | null> {
    const square = requireSquare(config);

    try {
      const res = await squareGet<{
        subscription?: { customer_id?: string; card_id?: string };
      }>(square, `/v2/subscriptions/${subscriptionId}`);

      const customerId = res.subscription?.customer_id;
      const paymentMethodId = res.subscription?.card_id;
      if (!customerId || !paymentMethodId) {
        return null;
      }

      return { customerId, paymentMethodId, paymentMethodName: 'card' };
    } catch (error) {
      // Null rather than a throw: the callers treat "cannot read it" and
      // "there isn't one" identically, and both must degrade.
      logger.error('[Square] subscription payment-method lookup failed', {
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
