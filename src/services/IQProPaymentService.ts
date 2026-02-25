/**
 * IQPro implementation of the payment provider interface.
 *
 * Handles all communication with the IQ Pro+ API for:
 * - Customer creation
 * - Payment method registration (card / ACH)
 * - One-time transaction processing
 * - Recurring subscription creation
 */

import type {
  CreateCustomerParams,
  CreatePaymentMethodParams,
  CreatePaymentMethodResult,
  CreateSubscriptionParams,
  IPaymentProvider,
  PaymentResult,
  ProcessPaymentParams,
  SubscriptionResult,
} from './PaymentProviderService';

import { getGatewayProcessors, getIQProClient } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';

// Minimal shape of the IQPro client used by this service.
// The actual client is loaded dynamically to avoid bundler errors
// when the optional @dojo-planner/iqpro-client package is absent.
type IQProClientShape = {
  customers: {
    create: (params: Record<string, unknown>, idempotencyKey?: string) => Promise<{ customerId: string }>;
    createPaymentMethod: (customerId: string, params: Record<string, unknown>) => Promise<{
      paymentMethodId?: string;
      customerPaymentMethodId?: string;
      customerPaymentId?: string;
      last4?: string;
      card?: { maskedCard?: string };
      ach?: { maskedAccount?: string };
    }>;
  };
  transactions: {
    create: (params: Record<string, unknown>) => Promise<{ id: string; status?: string; processorResponseMessage?: string; amount?: number }>;
  };
  subscriptions: {
    create: (params: Record<string, unknown>) => Promise<{ subscriptionId?: string }>;
  };
};

async function requireClient(): Promise<IQProClientShape> {
  const client = await getIQProClient();
  if (!client) {
    throw new Error('IQPro client is not configured');
  }
  return client as IQProClientShape;
}

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

export class IQProPaymentProvider implements IPaymentProvider {
  async createCustomer(params: CreateCustomerParams): Promise<string> {
    const client = await requireClient();

    logger.info('[IQPro] Creating customer', { memberId: params.memberId });

    const customer = await client.customers.create({
      name: `${params.firstName} ${params.lastName}`,
      referenceId: params.memberId,
      ...(params.address && {
        addresses: [
          {
            addressLine1: params.address.street,
            addressLine2: params.address.apartment,
            city: params.address.city,
            state: params.address.state,
            postalCode: params.address.zipCode,
            country: params.address.country,
            firstName: params.firstName,
            lastName: params.lastName,
            email: params.email,
            ...(sanitizePhone(params.phone) && { phone: sanitizePhone(params.phone) }),
            isBilling: true,
          },
        ],
      }),
    });

    logger.info('[IQPro] Customer created', { customerId: customer.customerId });
    return customer.customerId;
  }

  async createPaymentMethod(params: CreatePaymentMethodParams): Promise<CreatePaymentMethodResult> {
    const client = await requireClient();

    logger.info('[IQPro] Creating payment method', {
      customerId: params.customerId,
      type: params.paymentMethod,
    });

    if (params.paymentMethod === 'card') {
      // IQPro InsertCard schema expects expirationDate as "MM/YY"
      const expirationDate = (params.cardExpiry ?? '').trim(); // already "MM/YY"

      // maskedCard is required by the API. Format: BIN(6) + ******(6) + last4 = 16 chars (max 19)
      // e.g. "424242******4242". Falls back to "000000******0000" if no card details available.
      const first6 = params.cardFirstSix ?? params.cardNumber?.slice(0, 6) ?? '000000';
      const last4 = params.cardLastFour ?? params.cardNumber?.slice(-4) ?? '0000';
      const maskedCard = `${first6}******${last4}`;

      let cardPayload: Record<string, unknown>;

      if (params.cardToken) {
        // PCI-compliant tokenized path — token from TokenEx iframe
        // InsertCard schema: { token, expirationDate, maskedCard, cardType? }
        cardPayload = {
          card: {
            token: params.cardToken,
            expirationDate,
            maskedCard,
          },
          isDefault: true,
        };
      } else {
        // Fallback: raw card number (local dev / testing only)
        cardPayload = {
          card: {
            token: params.cardNumber,
            expirationDate,
            maskedCard,
          },
          isDefault: true,
        };
      }

      logger.info('[IQPro] Card payment method payload', {
        path: params.cardToken ? 'tokenized' : 'raw',
      });

      const pm = await client.customers.createPaymentMethod(params.customerId, cardPayload);

      const pmId = pm.customerPaymentMethodId ?? pm.paymentMethodId ?? pm.customerPaymentId ?? '';
      logger.info('[IQPro] Card payment method created', { paymentMethodId: pmId });
      return {
        paymentMethodId: pmId,
        last4: pm.last4 ?? pm.card?.maskedCard?.slice(-4) ?? params.cardLastFour ?? params.cardNumber?.slice(-4),
      };
    }

    // ACH — IQPro InsertAch schema: { token, routingNumber, accountType, secCode?, maskedAccount? }
    const pm = await client.customers.createPaymentMethod(params.customerId, {
      ach: {
        token: params.achAccountNumber,
        routingNumber: params.achRoutingNumber,
        accountType: 'Checking',
        secCode: 'WEB',
      },
      isDefault: true,
    });

    const pmId = pm.customerPaymentMethodId ?? pm.paymentMethodId ?? pm.customerPaymentId ?? '';
    logger.info('[IQPro] ACH payment method created', { paymentMethodId: pmId });
    return {
      paymentMethodId: pmId,
      last4: pm.last4 ?? pm.ach?.maskedAccount?.slice(-4) ?? params.achAccountNumber?.slice(-4),
    };
  }

  async processPayment(params: ProcessPaymentParams): Promise<PaymentResult> {
    const client = await requireClient();

    logger.info('[IQPro] Processing payment', {
      customerId: params.customerId,
      amount: params.amount,
    });

    try {
      // Amount is in dollars from the app – IQPro expects cents
      const amountCents = Math.round(params.amount * 100);

      const tx = await client.transactions.create({
        customerId: params.customerId,
        amount: amountCents,
        currency: params.currency,
        description: params.description,
        Remit: {
          totalAmount: amountCents,
        },
        paymentMethod: {
          customer: {
            customerId: params.customerId,
            customerPaymentMethodId: params.paymentMethodId,
          },
        },
        metadata: params.metadata,
      });

      const statusStr = typeof tx.status === 'string'
        ? tx.status
        : '';

      const mapped: PaymentResult['status']
        = statusStr === 'captured' || statusStr === 'settled' || statusStr === 'authorized'
          ? 'approved'
          : statusStr === 'declined' || statusStr === 'failed'
            ? 'declined'
            : 'processing';

      logger.info('[IQPro] Payment processed', { transactionId: tx.id, status: statusStr });

      return {
        success: mapped === 'approved',
        transactionId: tx.id,
        status: mapped,
        declineReason: tx.processorResponseMessage,
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

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    const client = await requireClient();
    const processors = await getGatewayProcessors();

    logger.info('[IQPro] Creating subscription', {
      customerId: params.customerId,
      frequency: params.frequency,
    });

    try {
      const now = params.startDate.toISOString();
      const dayOfMonth = params.startDate.getDate();

      // Billing period: Monthly=4, Yearly=6
      const billingPeriodId = params.frequency === 'annual' ? 6 : 4;

      // Schedule varies by frequency:
      // Monthly: minutes, hours, daysOfMonth (no monthsOfYear)
      // Annual: minutes, hours, daysOfMonth, monthsOfYear (only start month)
      const schedule: Record<string, number[]> = {
        minutes: [0],
        hours: [0],
        daysOfMonth: [dayOfMonth],
      };
      if (params.frequency === 'annual') {
        schedule.monthsOfYear = [params.startDate.getMonth() + 1];
      }

      // Billing address — API requires country, state, email at minimum
      const country = params.address?.country ?? 'US';
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

      const subscription = await client.subscriptions.create({
        customerId: params.customerId,
        subscriptionStatusId: 1, // Active
        name: params.description,
        prefix: 'MBR', // Membership subscription prefix (max 10 chars)
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
            unitPrice: params.amount, // API expects dollars (double), not cents
            discount: 0,
            unitOfMeasureId: params.frequency === 'annual' ? 4 : 3, // YEAR=4 or MONTH=3
          },
        ],
      });

      logger.info('[IQPro] Subscription created', { subscriptionId: subscription.subscriptionId });

      return {
        success: true,
        subscriptionId: subscription.subscriptionId,
      };
    } catch (error) {
      logger.error('[IQPro] Subscription creation failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
