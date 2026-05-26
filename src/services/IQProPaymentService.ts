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

import type {
  CreateCustomerParams,
  CreateCustomerResult,
  CreatePaymentMethodParams,
  CreatePaymentMethodResult,
  CreateSubscriptionParams,
  IPaymentProvider,
  PaymentResult,
  ProcessPaymentParams,
  SubscriptionResult,
} from './PaymentProviderService';

import type { IQProConfig } from '@/libs/IQPro';
import { getGatewayProcessors, iqproGet, iqproPost, tokenizeAch } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';

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
  async createCustomer(config: IQProConfig, params: CreateCustomerParams): Promise<CreateCustomerResult> {
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

  async createPaymentMethod(config: IQProConfig, params: CreatePaymentMethodParams): Promise<CreatePaymentMethodResult> {
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

  async processPayment(config: IQProConfig, params: ProcessPaymentParams): Promise<PaymentResult> {
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
      const lineItem = params.lineItem ?? {
        name: params.description,
        description: params.description,
        unitPrice: params.amount,
        discount: 0,
      };
      const lineItems = [
        {
          name: lineItem.name,
          description: lineItem.description,
          quantity: 1,
          unitPrice: lineItem.unitPrice,
          discount: lineItem.discount,
          freightAmount: 0,
          unitOfMeasureId: 1,
          localTaxPercent: isTaxable ? fb.taxPct : 0,
          nationalTaxPercent: 0,
        },
      ];

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

  async createSubscription(config: IQProConfig, params: CreateSubscriptionParams): Promise<SubscriptionResult> {
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
      // - Weekly (billingPeriodId: 2): schedule must include daysOfWeek.
      // - Monthly (billingPeriodId: 4): schedule needs daysOfMonth only.
      // - Semi-annual: IQPro has no native 6-month cadence. We use
      //   billingPeriodId: 6 (yearly) with two monthsOfYear entries (startMonth
      //   and startMonth+6 wrapped mod 12) so the sub fires twice a year.
      // - Annual (billingPeriodId: 6): schedule needs daysOfMonth +
      //   monthsOfYear with the single start month.
      let billingPeriodId: number;
      const schedule: Record<string, number[]> = {
        minutes: [0],
        hours: [0],
        daysOfMonth: [dayOfMonth],
      };
      switch (params.frequency) {
        case 'weekly':
          billingPeriodId = 2;
          schedule.daysOfWeek = [params.startDate.getDay()];
          // Weekly schedules don't need daysOfMonth — replace it.
          delete (schedule as Record<string, unknown>).daysOfMonth;
          break;
        case 'semi-annual': {
          billingPeriodId = 6;
          const secondMonth = ((startMonth - 1 + 6) % 12) + 1;
          schedule.monthsOfYear = [startMonth, secondMonth].sort((a, b) => a - b);
          break;
        }
        case 'annual':
          billingPeriodId = 6;
          schedule.monthsOfYear = [startMonth];
          break;
        case 'monthly':
        default:
          billingPeriodId = 4;
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

      // IQPro unitOfMeasureId: 1=Item, 3=Month, 4=Year, 6=Week (per gateway docs).
      // Semi-annual bills in months, so use Month (3) and let unitPrice be the
      // 6-month total.
      const unitOfMeasureId = (() => {
        switch (params.frequency) {
          case 'weekly': return 6;
          case 'annual': return 4;
          case 'semi-annual':
          case 'monthly':
          default: return 3;
        }
      })();

      const subscriptionPayload: Record<string, unknown> = {
        customerId: params.customerId,
        subscriptionStatusId: 1, // Active
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
}
