/**
 * IQPro implementation of the payment provider interface.
 *
 * All calls go directly through the IQPro REST API (no SDK) via the helpers
 * in `src/libs/IQPro.ts`. Handles:
 * - Customer creation (returns both the customerId and the billing-address ID)
 * - Payment method registration (card via TokenEx token, ACH via vault token)
 * - One-time transaction processing (full `remit` block with tax + adjustments)
 * - Recurring subscription creation (with an immediate initial Sale handled by
 *   the orchestrator, not here)
 *
 * Ported from the kiosk app's canonical payloads in
 * `dojo-planner-kiosk/src/app/api/payment/{process,membership}/route.ts`.
 */

import type { PaymentProviderConfig } from './PaymentProviderConfigService';

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
  ReverseTransactionResult,
  SubscriptionPaymentMethod,
  SubscriptionResult,
} from './PaymentProviderService';
import type { IQProConfig } from '@/libs/IQPro';
import { z } from 'zod';
import {
  buildServiceFeeAdjustment,
  computeFeeBreakdown,
  getCustomerPaymentMethod,
  getGatewayProcessors,
  iqproGet,
  iqproPost,
  iqproPut,
  mapTransactionStatus,
  tokenizeAch,
} from '@/libs/IQPro';
import { IQPRO_BILLING_PERIOD, IQPRO_SUBSCRIPTION_STATUS, IQPRO_UNIT } from '@/libs/IQProConstants';
import { logger } from '@/libs/Logger';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';
import { normalizeExpiration } from '@/utils/CardExpiration';

// IQPro transaction statuses (lowercased) that decide how a charge is reversed.
// Per the API reference, `/void` accepts only Pending / PendingSettlement and
// `/refund` only a Settled transaction.
const IQPRO_VOIDABLE_STATUSES = new Set(['pending', 'pendingsettlement']);
const IQPRO_REFUNDABLE_STATUSES = new Set(['settled']);
const IQPRO_REVERSED_STATUSES = new Set(['voided', 'refunded']);
// What a void / refund call MAY report for the resulting transaction. Sandbox
// finding: a successful void answers 200 with only `{ transactionId }` — no
// status at all — so a missing status is NOT a failure; it is confirmed by
// re-reading the charge (see `confirmReversal`).
const IQPRO_VOID_OK_STATUSES = new Set(['voided']);
const IQPRO_REFUND_OK_STATUSES = new Set(['approved', 'pending', 'pendingsettlement', 'settled', 'refunded']);

function roundToCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Narrow the union at the provider boundary.
 *
 * The interface hands every implementation a `PaymentProviderConfig`; this
 * class only knows how to talk to IQPro. Routing a Square org's config here
 * would charge the wrong merchant account, so it is a hard failure rather
 * than a best-effort attempt.
 *
 * Everything below this call keeps using `IQProConfig` unchanged.
 */
function requireIQPro(config: PaymentProviderConfig): IQProConfig {
  if (config.provider !== PAYMENT_PROVIDER.IQPRO) {
    throw new TypeError(
      `IQProPaymentProvider received a "${config.provider}" config. This is a routing bug — the factory should have returned that provider's implementation.`,
    );
  }
  const { provider: _provider, ...iqpro } = config;
  return iqpro;
}

/**
 * Shape of the IQPro subscription-lookup response we depend on for resolving a
 * vaulted payment method. All fields are optional/lenient — IQPro may omit any
 * of them — but parsing once (instead of a chain of `as Record<string,unknown>`
 * casts) means a real shape change surfaces as a parse result we can reason
 * about rather than a silent `undefined` charged on a fallback BIN (#WS4).
 */
const IQProSubscriptionResponseSchema = z.object({
  customer: z.object({ customerId: z.string().optional() }).partial().optional(),
  paymentMethod: z.object({
    customerPaymentMethod: z.object({
      paymentMethodId: z.string().optional(),
      card: z.object({
        maskedNumber: z.string().optional(),
        maskedCard: z.string().optional(),
        // Names per the webhook guide's `transactionPaymentMethod.card`;
        // nullable because the API returns explicit nulls.
        cardType: z.string().nullish(),
        expirationDate: z.string().nullish(),
      }).partial().optional(),
      ach: z.object({
        maskedAccount: z.string().nullish(),
        accountNumber: z.string().nullish(),
        accountType: z.string().nullish(),
      }).partial().nullish(),
    }).partial().optional(),
  }).partial().optional(),
}).partial();

/** Strip a phone string to digits only, max 10 characters (IQPro limit). */
function sanitizePhone(phone?: string): string | undefined {
  if (!phone) {
    return undefined;
  }
  const digits = phone.replace(/\D/g, '');
  // Drop leading country code '1' if it results in >10 digits
  const trimmed = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return trimmed.slice(0, 10) || undefined;
}

/** Normalize country names — IQPro expects ISO-2 codes. */
function normalizeCountry(country?: string): string {
  if (!country || country === 'United States') {
    return 'US';
  }
  return country;
}

export class IQProPaymentProvider implements IPaymentProvider {
  async createCustomer(providerConfig: PaymentProviderConfig, params: CreateCustomerParams): Promise<CreateCustomerResult> {
    const config = requireIQPro(providerConfig);
    const gatewayId = config.gatewayId;

    logger.info('[IQPro] Creating customer', { memberId: params.memberId });

    const customerRes = await iqproPost<{ data?: Record<string, unknown> }>(
      config,
      `/api/gateway/${gatewayId}/customer`,
      {
        name: `${params.firstName} ${params.lastName}`,
        referenceId: params.memberId,
        ...(params.address && {
          addresses: [
            {
              addressLine1: params.address.street,
              ...(params.address.apartment && { addressLine2: params.address.apartment }),
              city: params.address.city,
              state: params.address.state,
              postalCode: params.address.zipCode,
              country: normalizeCountry(params.address.country),
              firstName: params.firstName,
              lastName: params.lastName,
              email: params.email,
              ...(sanitizePhone(params.phone) && { phone: sanitizePhone(params.phone) }),
              isBilling: true,
            },
          ],
        }),
      },
    );

    const customerData = (customerRes.data ?? customerRes) as Record<string, unknown>;
    const customerId = customerData.customerId as string;

    // Resolve the billing-address ID by fetching the customer detail. The ACH
    // processor uses this to look up the cardholder name from the vault.
    let billingAddressId: string | undefined;
    if (params.address) {
      const detailRes = await iqproGet<{ data?: Record<string, unknown> }>(
        config,
        `/api/gateway/${gatewayId}/customer/${customerId}`,
      );
      const detailData = (detailRes.data ?? detailRes) as Record<string, unknown>;
      const addresses = (detailData.addresses ?? []) as Array<Record<string, unknown>>;
      const billing = addresses.find(a => a.isBilling) ?? addresses[0];
      billingAddressId = (billing?.customerAddressId ?? billing?.id) as string | undefined;
    }

    logger.info('[IQPro] Customer created', { customerId, billingAddressId });
    return { customerId, billingAddressId };
  }

  async createPaymentMethod(providerConfig: PaymentProviderConfig, params: CreatePaymentMethodParams): Promise<CreatePaymentMethodResult> {
    const config = requireIQPro(providerConfig);
    const gatewayId = config.gatewayId;

    logger.info('[IQPro] Creating payment method', {
      customerId: params.customerId,
      type: params.paymentMethod,
    });

    if (params.paymentMethod === 'card') {
      // IQPro rejects raw card numbers ("Raw card number may not be submitted.
      // Submit a tokenized card number instead.") so cardToken from TokenEx is
      // required. Verified against the sandbox: the createPaymentMethod
      // endpoint validates this server-side.
      if (!params.cardToken) {
        throw new Error('cardToken is required — IQPro rejects raw card numbers. Run the TokenEx iframe flow first.');
      }
      if (!params.cardFirstSix || !params.cardLastFour) {
        throw new Error('cardFirstSix and cardLastFour are required to build the IQPro maskedCard field.');
      }

      // IQPro InsertCard schema expects expirationDate as "MM/YY" and a
      // maskedCard of the form BIN(6) + ****** + last4 = 16 chars.
      const expirationDate = (params.cardExpiry ?? '').trim();
      const maskedCard = `${params.cardFirstSix}******${params.cardLastFour}`;

      const pmRes = await iqproPost<{ data?: Record<string, unknown> }>(
        config,
        `/api/gateway/${gatewayId}/customer/${params.customerId}/payment`,
        {
          card: {
            token: params.cardToken,
            expirationDate,
            maskedCard,
          },
          isDefault: true,
        },
      );

      const pmData = (pmRes.data ?? pmRes) as Record<string, unknown>;
      const pmId = (pmData.customerPaymentMethodId
        ?? pmData.paymentMethodId
        ?? pmData.customerPaymentId
        ?? '') as string;

      const cardData = pmData.card as { maskedCard?: string } | undefined;
      const returnedLast4
        = (pmData.last4 as string | undefined)
          ?? cardData?.maskedCard?.slice(-4)
          ?? params.cardLastFour;

      logger.info('[IQPro] Card payment method created', { paymentMethodId: pmId });

      return {
        paymentMethodId: pmId,
        last4: returnedLast4,
      };
    }

    // ACH — tokenize account number via Vault API, then create payment method.
    const accountType = params.achAccountType ?? 'Checking';

    const tokenResult = await tokenizeAch(config, {
      accountNumber: params.achAccountNumber!,
      routingNumber: params.achRoutingNumber!,
      secCode: 'PPD',
      achAccountType: accountType,
    });

    const pmRes = await iqproPost<{ data?: Record<string, unknown> }>(
      config,
      `/api/gateway/${gatewayId}/customer/${params.customerId}/payment`,
      {
        ach: {
          token: tokenResult.achToken,
          secCode: 'PPD',
          routingNumber: params.achRoutingNumber,
          accountType,
          checkNumber: null,
          accountHolderAuth: {
            dlState: null,
            dlNumber: null,
          },
        },
        isDefault: true,
      },
    );

    const pmData = (pmRes.data ?? pmRes) as Record<string, unknown>;
    const pmId = (pmData.customerPaymentMethodId
      ?? pmData.paymentMethodId
      ?? pmData.customerPaymentId
      ?? '') as string;

    const achData = pmData.ach as { maskedAccount?: string } | undefined;
    const returnedLast4
      = (pmData.last4 as string | undefined)
        ?? achData?.maskedAccount?.slice(-4)
        ?? params.achAccountNumber?.slice(-4);

    logger.info('[IQPro] ACH payment method created', { paymentMethodId: pmId });

    return {
      paymentMethodId: pmId,
      last4: returnedLast4,
      achToken: tokenResult.achToken,
    };
  }

  async processPayment(providerConfig: PaymentProviderConfig, params: ProcessPaymentParams): Promise<PaymentResult> {
    const config = requireIQPro(providerConfig);
    const gatewayId = config.gatewayId;
    const isAch = !!params.ach;
    const vaulted = !!params.vaulted;
    const isTaxable = !!params.isTaxable;

    logger.info('[IQPro] Processing payment', {
      customerId: params.customerId,
      amount: params.amount,
      method: isAch ? 'ach' : 'card',
      vaulted,
      isTaxable,
    });

    try {
      const fb = params.feeBreakdown;

      // ── paymentAdjustments (mirrors kiosk shapes byte-for-byte) ────────────
      // ServiceFee: percentage only — IQPro rejects flatAmount on ServiceFee.
      // Tax: flatAmount only — IQPro rejects percentage on Tax.
      const paymentAdjustments: Array<Record<string, unknown>> = [];
      if (isTaxable && fb.taxAmount > 0) {
        paymentAdjustments.push({
          type: 'Tax',
          percentage: null,
          flatAmount: fb.taxAmount,
        });
      }
      paymentAdjustments.push({
        type: 'ServiceFee',
        percentage: fb.serviceFeePct,
        flatAmount: null,
      });

      // ── remit block ────────────────────────────────────────────────────────
      // Taxable: taxAmount: null + isTaxExempt: false (Tax expressed via the
      //   Tax paymentAdjustment per Basys guidance). IQPro rejects taxAmount +
      //   Tax adjustment together.
      // Non-taxable (memberships): taxAmount: 0 + isTaxExempt: true.
      const remit: Record<string, unknown> = {
        baseAmount: fb.baseAmount,
        taxAmount: isTaxable ? null : 0,
        isTaxExempt: !isTaxable,
        currencyCode: params.currency,
        addTaxToTotal: true,
        paymentAdjustments,
      };

      // ── paymentMethod block (mirrors kiosk's buildTxPaymentMethod) ─────────
      // Vaulted: customer ref only (no customerBillingAddressId).
      // Non-vaulted ACH: inline ach block per Basys ACH docs (customer record
      //   was vaulted upstream, but the charge uses inline ACH).
      // Non-vaulted card: customer ref with optional customerBillingAddressId.
      let paymentMethodBlock: Record<string, unknown>;
      if (vaulted) {
        paymentMethodBlock = {
          customer: {
            customerId: params.customerId,
            customerPaymentMethodId: params.paymentMethodId,
          },
        };
      } else if (isAch && params.ach) {
        paymentMethodBlock = {
          ach: {
            achToken: params.ach.achToken,
            secCode: params.ach.secCode,
            routingNumber: params.ach.routingNumber,
            accountType: params.ach.accountType,
            checkNumber: null,
            accountHolderAuth: { dlState: null, dlNumber: null },
          },
        };
      } else {
        paymentMethodBlock = {
          customer: {
            customerId: params.customerId,
            customerPaymentMethodId: params.paymentMethodId,
            ...(params.customerBillingAddressId && {
              customerBillingAddressId: params.customerBillingAddressId,
            }),
          },
        };
      }

      // ── address[] block ────────────────────────────────────────────────────
      // Vaulted charges: omit entirely — IQPro already has the address tied
      // to the saved PM, and a half-filled buyer form would override it.
      const addressBlock = !vaulted && params.billingAddress
        ? [
            {
              isPhysical: true,
              isBilling: true,
              isShipping: false,
              firstName: params.billingAddress.firstName || null,
              lastName: params.billingAddress.lastName || null,
              company: null,
              email: params.billingAddress.email || null,
              phone: sanitizePhone(params.billingAddress.phone) ?? null,
              addressLine1: params.billingAddress.addressLine1 ?? null,
              addressLine2: params.billingAddress.addressLine2 ?? null,
              city: params.billingAddress.city ?? null,
              state: params.billingAddress.state || null,
              postalCode: params.billingAddress.postalCode ?? null,
              country: normalizeCountry(params.billingAddress.country),
            },
          ]
        : undefined;

      // ── line items ─────────────────────────────────────────────────────────
      // localTaxPercent: when taxable, set to the configured rate so IQPro's
      // per-line-item tax check passes ("Remit.IsTaxExempt must be true when
      // all line items have zero tax"). IQPro charges tax via the Tax
      // paymentAdjustment, not from this percent.
      const sourceLineItems = params.lineItems && params.lineItems.length > 0
        ? params.lineItems
        : [{
            name: params.description,
            description: params.description,
            unitPrice: params.amount,
            discount: 0,
          }];
      const lineItems = sourceLineItems.map(li => ({
        name: li.name,
        description: li.description,
        quantity: 1,
        unitPrice: li.unitPrice,
        discount: li.discount,
        freightAmount: 0,
        unitOfMeasureId: IQPRO_UNIT.PIECE,
        localTaxPercent: isTaxable ? fb.taxPct : 0,
        nationalTaxPercent: 0,
      }));

      const txPayload: Record<string, unknown> = {
        type: 'Sale',
        remit,
        paymentMethod: paymentMethodBlock,
        ...(addressBlock && { address: addressBlock }),
        lineItems,
        ...(params.description && { caption: params.description.substring(0, 19) }),
      };

      const txRes = await iqproPost<{ data?: Record<string, unknown> }>(
        config,
        `/api/gateway/${gatewayId}/transaction`,
        txPayload,
      );

      const txRaw = (txRes.data ?? txRes) as Record<string, unknown>;
      const txData = (txRaw.transaction ?? txRaw) as Record<string, unknown>;

      const responseText = (txData.processorResponseText ?? txData.processorResponseMessage) as string | undefined;

      // Sandbox tolerance: Basys's sandbox ACH processor rejects the standard
      // test routing/account numbers with a certification-error message.
      // Treat that as a successful pendingsettlement so ACH dev flows work.
      const isSandbox = config.baseUrl.includes('sandbox');
      const isCertError = responseText?.includes('not a valid transaction for certification') ?? false;

      const transactionId = (txData.transactionId ?? txData.id ?? '') as string;
      const rawStatus = ((txData.status ?? '') as string).toLowerCase();
      const effectiveStatus = isSandbox && isCertError ? 'pendingsettlement' : rawStatus;

      const mapped: PaymentResult['status']
        = effectiveStatus === 'captured'
          || effectiveStatus === 'settled'
          || effectiveStatus === 'authorized'
          || effectiveStatus === 'pendingsettlement'
          ? 'approved'
          : effectiveStatus === 'declined' || effectiveStatus === 'failed'
            ? 'declined'
            : 'processing';

      logger.info('[IQPro] Payment processed', {
        transactionId,
        rawStatus,
        effectiveStatus,
        mapped,
        sandboxCertTolerated: isSandbox && isCertError,
      });

      return {
        success: mapped === 'approved',
        transactionId,
        status: mapped,
        declineReason: mapped === 'declined' ? responseText : undefined,
      };
    } catch (error) {
      logger.error('[IQPro] Payment failed', { error });
      return {
        success: false,
        status: 'declined',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createSubscription(providerConfig: PaymentProviderConfig, params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    const config = requireIQPro(providerConfig);
    const gatewayId = config.gatewayId;
    const processors = await getGatewayProcessors(config);

    logger.info('[IQPro] Creating subscription', {
      customerId: params.customerId,
      frequency: params.frequency,
    });

    try {
      const now = params.startDate.toISOString();
      const dayOfMonth = params.startDate.getDate();
      const startMonth = params.startDate.getMonth() + 1; // 1-12

      // Billing period mapping (IQPro recurrence schema):
      // - Weekly (WEEKLY): schedule must include daysOfWeek.
      // - Monthly (MONTHLY): schedule needs daysOfMonth only.
      // - Semi-annual (SIX_MONTHS, IQPro's native period 7): IQPro REQUIRES
      //   monthsOfYear + daysOfMonth for it (sandbox-verified). It does not say
      //   whether a single month would fire every 6 months or once a year, so
      //   both months are listed (startMonth and startMonth+6) — fires twice a
      //   year either way, exactly as the earlier yearly emulation did.
      // - Annual (YEARLY): schedule needs daysOfMonth + monthsOfYear with the
      //   single start month.
      let billingPeriodId: number;
      const schedule: Record<string, number[]> = {
        minutes: [0],
        hours: [0],
        daysOfMonth: [dayOfMonth],
      };
      switch (params.frequency) {
        case 'weekly':
          billingPeriodId = IQPRO_BILLING_PERIOD.WEEKLY;
          schedule.daysOfWeek = [params.startDate.getDay()];
          // Weekly schedules don't need daysOfMonth — replace it.
          delete (schedule as Record<string, unknown>).daysOfMonth;
          break;
        case 'semi-annual': {
          billingPeriodId = IQPRO_BILLING_PERIOD.SIX_MONTHS;
          const secondMonth = ((startMonth - 1 + 6) % 12) + 1;
          schedule.monthsOfYear = [startMonth, secondMonth].sort((a, b) => a - b);
          break;
        }
        case 'annual':
          billingPeriodId = IQPRO_BILLING_PERIOD.YEARLY;
          schedule.monthsOfYear = [startMonth];
          break;
        case 'monthly':
        default:
          billingPeriodId = IQPRO_BILLING_PERIOD.MONTHLY;
          break;
      }

      // Billing address — API requires country, state, email at minimum
      const country = normalizeCountry(params.address?.country);
      const state = params.address?.state ?? 'N/A';
      const billingAddress: Record<string, unknown> = {
        isBilling: true,
        isShipping: false,
        isRemittance: false,
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        state,
        country,
        ...(sanitizePhone(params.phone) && { phone: sanitizePhone(params.phone) }),
        ...(params.address && {
          addressLine1: params.address.street,
          addressLine2: params.address.apartment,
          city: params.address.city,
          postalCode: params.address.zipCode,
        }),
      };

      // Remittance address — required separately from billing
      const remittanceAddress: Record<string, unknown> = {
        isBilling: false,
        isShipping: false,
        isRemittance: true,
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        country,
      };

      // The line item's unit is the billing period (unitPrice is the price
      // for one period). IDs from IQPro's /api/constants/units — see IQPRO_UNIT.
      const unitOfMeasureId = (() => {
        switch (params.frequency) {
          case 'weekly': return IQPRO_UNIT.WEEKS;
          case 'annual': return IQPRO_UNIT.YEARS;
          case 'semi-annual': return IQPRO_UNIT.HALF_YEAR;
          case 'monthly':
          default: return IQPRO_UNIT.MONTHS;
        }
      })();

      const subscriptionPayload: Record<string, unknown> = {
        customerId: params.customerId,
        subscriptionStatusId: IQPRO_SUBSCRIPTION_STATUS.SCHEDULED, // 1 is DRAFT, which never bills
        name: params.description,
        prefix: params.prefix ?? 'MBR', // Membership subscription prefix (max 10 chars). 'HOLD' for hold-fee subs.
        recurrence: {
          termStartDate: now,
          billingStartDate: now,
          isAutoRenewed: true,
          allowProration: false,
          trialLengthInDays: 0,
          invoiceLengthInDays: 1,
          billingPeriodId,
          schedule,
        },
        paymentMethod: {
          customerPaymentMethodId: params.paymentMethodId,
          isAutoCharged: true,
          ...(processors.cardProcessorId && { cardProcessorId: processors.cardProcessorId }),
          ...(processors.achProcessorId && { achProcessorId: processors.achProcessorId }),
        },
        addresses: [billingAddress, remittanceAddress],
        lineItems: [
          {
            name: params.description,
            description: `${params.frequency} membership payment`,
            quantity: 1,
            unitPrice: params.amount, // Dollars, not cents
            discount: 0,
            unitOfMeasureId,
          },
        ],
        ...(params.paymentAdjustments && params.paymentAdjustments.length > 0 && {
          paymentAdjustments: params.paymentAdjustments,
        }),
      };

      const res = await iqproPost<{ data?: Record<string, unknown> }>(
        config,
        `/api/gateway/${gatewayId}/subscription`,
        subscriptionPayload,
      );

      const subData = (res.data ?? res) as Record<string, unknown>;
      const subscriptionId = (subData.subscriptionId ?? subData.id ?? '') as string;

      logger.info('[IQPro] Subscription created', { subscriptionId });

      return { success: true, subscriptionId };
    } catch (error) {
      logger.error('[IQPro] Subscription creation failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===== Fees =====

  /**
   * IQPro quotes the service fee via `/transaction/calculatefees` but has no
   * tax API, so tax stays local arithmetic over the org's configured rate.
   * The returned provenance says exactly that — see `FeeProvenance`.
   */
  async computeFees(config: PaymentProviderConfig, params: ComputeFeesParams): Promise<FeeQuote> {
    const iqpro = requireIQPro(config);

    // Resolve the processor HERE rather than making the caller do it. It is an
    // IQPro gateway concept, and requiring it in the shared params meant the
    // orchestrator had to make an IQPro call before it could price anything —
    // which threw outright for a Square org. `chargeOneTimeFee` already did it
    // this way; this makes the two consistent.
    const { cardProcessorId, achProcessorId } = await getGatewayProcessors(iqpro);
    const processorId = params.paymentMethodType === 'card' ? cardProcessorId : achProcessorId;
    if (!processorId) {
      throw new Error(`No ${params.paymentMethodType} processor configured for this gateway.`);
    }

    // /calculatefees needs exactly one of token or creditCardBin. When pricing
    // a SAVED method the caller has neither, so fetch them from the vault —
    // again inside the provider, since this is an IQPro-shaped requirement.
    let { creditCardBin, token } = params;
    if (!creditCardBin && !token && params.customerId && params.paymentMethodId) {
      const remoteInfo = await getCustomerPaymentMethod(iqpro, params.customerId, params.paymentMethodId);
      if (remoteInfo?.type === 'card' && remoteInfo.firstSix) {
        creditCardBin = remoteInfo.firstSix;
      } else if (remoteInfo?.type === 'ach' && remoteInfo.achToken) {
        token = remoteInfo.achToken;
      }
    }

    const breakdown = await computeFeeBreakdown(
      iqpro,
      params.baseAmount,
      params.isTaxable,
      params.taxStatePct,
      { processorId, creditCardBin, token },
    );
    return { ...breakdown, provenance: { tax: 'local', serviceFee: 'provider' } };
  }

  // ===== Subscription lifecycle =====

  /**
   * Charge a one-time fee against the payment method saved on an existing
   * subscription. Payload mirrors the kiosk's cancellation-fee Sale
   * byte-for-byte; `MemberPaymentService.payloads.test.ts` pins it.
   *
   * Every IQPro call here is inside the try — a failure anywhere (including
   * the initial subscription fetch against a synthetic/seed id, the processor
   * lookup, or the fee calculation) must degrade to a returned error rather
   * than throw, so a fee-charge failure is a partial success in the caller and
   * never a 500 (#237).
   */
  async chargeOneTimeFee(config: PaymentProviderConfig, params: ChargeOneTimeFeeParams): Promise<ChargeFeeResult> {
    const iqpro = requireIQPro(config);
    const gatewayId = iqpro.gatewayId;
    const baseAmount = Math.round(params.amount * 100) / 100;

    if (baseAmount <= 0) {
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
      const { paymentMethodId: pmId, paymentMethodName } = resolved;

      // `computeFees` resolves the processor itself now, so the lookup that
      // used to sit here is gone. A missing processor throws from in there and
      // is caught by this method's outer try, which still returns a soft
      // failure — the degrade-never-throw contract (#237) is preserved.
      //
      // Cancellation / hold fees are NOT taxable (per Basys guidance on non-store charges).
      const serverFees = await this.computeFees(config, {
        baseAmount,
        isTaxable: false,
        taxStatePct: 0,
        paymentMethodType: paymentMethodName === 'card' ? 'card' : 'ach',
        creditCardBin: paymentMethodName === 'card' ? resolved.cardBin : undefined,
      });
      const paymentAdjustments: Array<Record<string, unknown>> = [buildServiceFeeAdjustment(serverFees)];

      const feeTxPayload = {
        type: 'Sale',
        // Applies the payment to the invoice (a failed subscription charge's),
        // which updates its balance/status and ends IQPro's automatic retries.
        ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
        remit: {
          baseAmount: serverFees.baseAmount,
          taxAmount: serverFees.taxAmount,
          isTaxExempt: serverFees.taxAmount <= 0,
          currencyCode: 'USD',
          addTaxToTotal: true,
          paymentAdjustments,
        },
        paymentMethod: {
          customer: {
            customerId,
            customerPaymentMethodId: pmId,
          },
        },
        lineItems: [
          {
            name: params.caption,
            description: params.description,
            quantity: 1,
            unitPrice: baseAmount,
            discount: 0,
            freightAmount: 0,
            unitOfMeasureId: IQPRO_UNIT.PIECE,
            localTaxPercent: 0,
            nationalTaxPercent: 0,
          },
        ],
        caption: params.caption,
      };

      const txRes = await iqproPost<{ data?: Record<string, unknown> }>(
        iqpro,
        `/api/gateway/${gatewayId}/transaction`,
        feeTxPayload,
      );
      const txRaw = txRes.data ?? txRes;
      const txData = ((txRaw as Record<string, unknown>).transaction ?? txRaw) as Record<string, unknown>;
      const transactionId = (txData.transactionId ?? txData.id ?? '') as string;

      if (mapTransactionStatus(txData) !== 'approved') {
        // The processor refused the card: a decline, not an error. Keep the
        // attempt's id so the caller can record it.
        const reason = (txData.processorResponseText ?? txData.processorResponseMessage ?? txData.response ?? 'Transaction declined') as string;
        return { success: false, declined: true, error: reason, transactionId: transactionId || undefined, paymentMethodName };
      }

      return {
        success: true,
        amountCharged: serverFees.amount,
        transactionId,
        paymentMethodName,
        feeBreakdown: serverFees,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[IQPro] One-time fee charge failed', {
        providerSubscriptionId: params.providerSubscriptionId,
        error: message,
      });
      return { success: false, error: message };
    }
  }

  /**
   * Cancel via the dedicated cancel endpoint. Idempotent from the caller's
   * perspective — failures are logged and returned rather than thrown so the
   * local DB cleanup can still proceed.
   */
  async cancelSubscription(
    config: PaymentProviderConfig,
    subscriptionId: string,
    opts?: { endOfBillingPeriod?: boolean },
  ): Promise<LifecycleActionResult> {
    const iqpro = requireIQPro(config);
    try {
      await iqproPost(
        iqpro,
        `/api/gateway/${iqpro.gatewayId}/subscription/${subscriptionId}/cancel`,
        {
          cancel: {
            now: !opts?.endOfBillingPeriod,
            endOfBillingPeriod: !!opts?.endOfBillingPeriod,
          },
        },
      );
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[IQPro] Subscription cancel failed', { subscriptionId, error: message });
      return { success: false, error: message };
    }
  }

  /**
   * Toggle auto-renewal: pause (false) when placing a member on hold, resume
   * (true) on reactivation. Mirrors the kiosk's PUT recurrence payload exactly
   * so the two apps don't drift.
   *
   * Note `billingPeriodId` is lifted out of the nested `billingPeriod` object —
   * IQPro returns it nested on GET and expects it flat on PUT.
   */
  async setSubscriptionAutoRenewal(
    config: PaymentProviderConfig,
    subscriptionId: string,
    isAutoRenewed: boolean,
  ): Promise<LifecycleActionResult> {
    const iqpro = requireIQPro(config);
    const subPath = `/api/gateway/${iqpro.gatewayId}/subscription/${subscriptionId}`;
    try {
      const subRes = await iqproGet<{ data?: Record<string, unknown> }>(iqpro, subPath);
      const sub = (subRes.data ?? subRes) as Record<string, unknown>;
      const recurrence = sub.recurrence as Record<string, unknown> | undefined;

      const putPayload: Record<string, unknown> = {
        name: sub.name,
        prefix: sub.prefix,
      };
      if (recurrence) {
        putPayload.recurrence = {
          termStartDate: recurrence.termStartDate,
          billingStartDate: recurrence.billingStartDate,
          isAutoRenewed,
          allowProration: recurrence.allowProration,
          trialLengthInDays: recurrence.trialLengthInDays,
          invoiceLengthInDays: recurrence.invoiceLengthInDays,
          billingPeriodId: (recurrence.billingPeriod as Record<string, unknown> | undefined)?.billingPeriodId,
          schedule: recurrence.schedule,
        };
      }

      await iqproPut(iqpro, subPath, putPayload);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[IQPro] Subscription update failed', { subscriptionId, isAutoRenewed, error: message });
      return { success: false, error: message };
    }
  }

  /**
   * IQPro has no documented action for closing the invoice of a failed
   * subscription charge, and it RETRIES the charge itself (up to 3 attempts),
   * so there is no emailed pay link to neutralise the way there is on Square.
   * A no-op success keeps the retry flow provider-neutral; revisit if the
   * Phase 0 sandbox run shows IQPro still auto-retries after a manual charge.
   */
  async closeFailedInvoice(
    _config: PaymentProviderConfig,
    _providerInvoiceId: string,
  ): Promise<LifecycleActionResult & { note?: string }> {
    return { success: true, note: 'IQPro has no invoice-close action; nothing to do.' };
  }

  /**
   * Reverse a charge for its full amount. Reads the charge first, because
   * IQPro only voids an unsettled charge and only refunds a settled one —
   * calling the wrong endpoint just fails.
   *
   * The refund amount is the amount IQPro SETTLED, not our local row's amount:
   * our rows record the pre-fee base (and one Sale can be split across two
   * rows), whereas the member was charged the total incl. service fee and tax.
   */
  async reverseTransaction(
    config: PaymentProviderConfig,
    providerTransactionId: string,
  ): Promise<ReverseTransactionResult> {
    const iqpro = requireIQPro(config);
    const txPath = `/api/gateway/${iqpro.gatewayId}/transaction/${providerTransactionId}`;

    try {
      const getRes = await iqproGet<{ data?: Record<string, unknown> }>(iqpro, txPath);
      const current = (getRes.data ?? getRes) as Record<string, unknown>;
      const currentStatus = String(current.status ?? '').toLowerCase();

      if (IQPRO_REVERSED_STATUSES.has(currentStatus)) {
        logger.info('[IQPro] Transaction already reversed at the processor', { providerTransactionId, currentStatus });
        return { success: true, method: currentStatus === 'voided' ? 'void' : 'refund', alreadyReversed: true };
      }

      if (IQPRO_VOIDABLE_STATUSES.has(currentStatus)) {
        const res = await iqproPut<{ data?: Record<string, unknown> }>(iqpro, `${txPath}/void`, {});
        const data = (res.data ?? res) as Record<string, unknown>;
        const confirmed = await confirmReversal(iqpro, txPath, data, IQPRO_VOID_OK_STATUSES, ['voided']);
        if (!confirmed.ok) {
          return { success: false, error: `IQPro did not void the transaction${confirmed.reason}` };
        }
        return { success: true, method: 'void' };
      }

      if (IQPRO_REFUNDABLE_STATUSES.has(currentStatus)) {
        const remit = (current.remit ?? {}) as Record<string, unknown>;
        // `amountSettled` is reported as 0 (not null) until settlement, so fall
        // through on zero rather than relying on `??`.
        const settled = firstPositive(remit.amountSettled, remit.amountCaptured, remit.amount);
        const alreadyRefunded = Number(remit.amountRefunded ?? 0);
        const amount = roundToCents(settled - alreadyRefunded);
        if (!(amount > 0)) {
          return { success: false, error: 'IQPro reports no refundable amount on this transaction.' };
        }

        const res = await iqproPost<{ data?: Record<string, unknown> }>(iqpro, `${txPath}/refund`, { amount });
        const data = (res.data ?? res) as Record<string, unknown>;
        const confirmed = await confirmReversal(iqpro, txPath, data, IQPRO_REFUND_OK_STATUSES, ['refunded']);
        if (!confirmed.ok) {
          return { success: false, error: `IQPro did not refund the transaction${confirmed.reason}` };
        }
        // The refund is a NEW transaction; the response's id is the refund's
        // only when it differs from the charge being refunded.
        const refundId = data.transactionId as string | undefined;
        return {
          success: true,
          method: 'refund',
          refundTransactionId: refundId && refundId !== providerTransactionId ? refundId : undefined,
        };
      }

      return {
        success: false,
        error: `This transaction is "${String(current.status ?? 'unknown')}" at IQPro and cannot be voided or refunded.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[IQPro] Transaction reversal failed', { providerTransactionId, error: message });
      return { success: false, error: message };
    }
  }

  /**
   * Resolve the saved payment method on a subscription. IQPro lets us
   * reference it by `customerPaymentMethodId` on a later Sale.
   *
   * Returns null (rather than throwing) when the subscription can't be read,
   * so callers on the lifecycle path degrade rather than 500.
   */
  async getSubscriptionPaymentMethod(
    config: PaymentProviderConfig,
    subscriptionId: string,
  ): Promise<(SubscriptionPaymentMethod & { cardBin?: string }) | null> {
    const iqpro = requireIQPro(config);
    const subRes = await iqproGet<{ data?: Record<string, unknown> }>(
      iqpro,
      `/api/gateway/${iqpro.gatewayId}/subscription/${subscriptionId}`,
    );
    const sub = IQProSubscriptionResponseSchema.parse(subRes.data ?? subRes);
    const custPM = sub.paymentMethod?.customerPaymentMethod;
    const paymentMethodId = custPM?.paymentMethodId ?? '';

    if (!paymentMethodId) {
      return null;
    }

    const paymentMethodName: 'card' | 'ach' = custPM?.card ? 'card' : 'ach';
    const cardInfo = custPM?.card;
    const maskedNumber = cardInfo?.maskedNumber ?? cardInfo?.maskedCard ?? '';
    const cardBin = maskedNumber && maskedNumber.length >= 6 ? maskedNumber.slice(0, 6) : '400000';
    const achMasked = custPM?.ach?.maskedAccount ?? custPM?.ach?.accountNumber ?? '';
    const masked = paymentMethodName === 'card' ? maskedNumber : achMasked;
    // Display fields for the payment-method reconcile. Unlike `cardBin` these
    // are never invented: an unknown value stays undefined.
    const display = {
      ...(paymentMethodName === 'card' && maskedNumber.length >= 6 && /^\d{6}/.test(maskedNumber) ? { firstSix: maskedNumber.slice(0, 6) } : {}),
      ...(masked.length >= 4 ? { last4: masked.slice(-4) } : {}),
      ...(cardInfo?.cardType ? { cardBrand: cardInfo.cardType } : {}),
      ...(cardInfo?.expirationDate ? { expirationDate: normalizeExpiration(cardInfo.expirationDate) } : {}),
      ...(custPM?.ach?.accountType ? { accountType: custPM.ach.accountType } : {}),
    };

    return {
      customerId: sub.customer?.customerId ?? '',
      paymentMethodId,
      paymentMethodName,
      ...display,
      cardBin,
    };
  }
}

function processorReason(data: Record<string, unknown>): string {
  const reason = data.processorResponseText ?? data.responseMessage ?? data.statusDescription ?? data.response;
  return typeof reason === 'string' && reason ? `: ${reason}` : '.';
}

/**
 * Decide whether a void / refund call succeeded.
 *
 * When IQPro's response carries a status, it is authoritative. When it does
 * not — a successful void answers with only `{ transactionId }` — re-read the
 * original charge and require it to have reached `expectedAfter`. Trusting a
 * bare 200 would record a reversal IQPro may not have made; treating it as a
 * failure (the first sandbox run) leaves the books saying "paid" for money
 * that was returned.
 */
async function confirmReversal(
  iqpro: IQProConfig,
  txPath: string,
  response: Record<string, unknown>,
  okStatuses: Set<string>,
  expectedAfter: string[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const status = String(response.status ?? '').toLowerCase();
  if (status) {
    return okStatuses.has(status) ? { ok: true } : { ok: false, reason: processorReason(response) };
  }

  const reread = await iqproGet<{ data?: Record<string, unknown> }>(iqpro, txPath);
  const after = (reread.data ?? reread) as Record<string, unknown>;
  if (expectedAfter.includes(String(after.status ?? '').toLowerCase())) {
    return { ok: true };
  }
  // Report the charge's actual state — its processor text describes the
  // ORIGINAL sale ("Approved"), which would read as nonsense here.
  return { ok: false, reason: `: the transaction is still "${String(after.status ?? 'unknown')}".` };
}

function firstPositive(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return 0;
}
