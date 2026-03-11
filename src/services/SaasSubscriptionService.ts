/**
 * SaaS subscription service for organization-level billing via IQPro.
 *
 * Handles org SaaS subscriptions (Basic/Growth plans),
 * distinct from member-level payments handled by MemberPaymentService.
 */

import type { SaasPlanId } from '@/utils/SaasPlans';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { getGatewayProcessors, getIQProClient } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import { organizationSchema } from '@/models/Schema';
import { getPlanTotalPrice, getSaasPlan } from '@/utils/SaasPlans';
import { isExemptOrg, isSuperAdmin } from '@/utils/SuperAdmins';

type IQProClientShape = {
  customers: {
    create: (params: Record<string, unknown>, idempotencyKey?: string) => Promise<{ customerId: string }>;
    createPaymentMethod: (customerId: string, params: Record<string, unknown>) => Promise<{
      paymentMethodId?: string;
      customerPaymentMethodId?: string;
      customerPaymentId?: string;
      last4?: string;
      card?: { maskedCard?: string };
    }>;
  };
  subscriptions: {
    get: (id: string) => Promise<Record<string, unknown>>;
    update: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
    cancel: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  transactions: {
    getServiceContext: () => { gatewayContext?: { gatewayId: string } };
  };
  post: <T = Record<string, unknown>>(path: string, body?: unknown) => Promise<T>;
};

async function requireClient(): Promise<IQProClientShape> {
  const client = await getIQProClient();
  if (!client) {
    throw new Error('IQPro client is not configured');
  }
  return client as IQProClientShape;
}

// ===== Types =====

export type CurrentSubscription = {
  planId: SaasPlanId | null;
  planName: string | null;
  status: string | null;
  billingCycle: string | null;
  currentPeriodEnd: number | null;
  isSuperAdmin: boolean;
  hasActiveSubscription: boolean;
};

export type SubscribeParams = {
  orgId: string;
  orgName: string;
  adminEmail: string;
  planId: SaasPlanId;
  billingCycle: 'monthly' | 'annual';
  cardToken?: string;
  cardFirstSix?: string;
  cardLastFour?: string;
  cardExpiry?: string;
  cardNumber?: string; // fallback for dev
};

export type BillingHistoryItem = {
  invoiceId: string;
  status: string | null;
  amount: number;
  invoiceDate: string | null;
  dueDate: string | null;
  paymentMethodLast4: string | null;
};

// ===== Get current subscription =====

export async function getCurrentSubscription(
  orgId: string,
  username?: string | null,
): Promise<CurrentSubscription> {
  const org = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: {
      iqproSubscriptionPlanId: true,
      iqproSubscriptionStatus: true,
      iqproBillingCycle: true,
      iqproCurrentPeriodEnd: true,
    },
  });

  const planId = org?.iqproSubscriptionPlanId as SaasPlanId | null;
  const status = org?.iqproSubscriptionStatus ?? null;
  const isActive = status === 'active' || status === 'trial';
  const superAdmin = isSuperAdmin(username) || isExemptOrg(orgId);

  // Super admin auto-grant: if no active plan, grant Basic for free
  if (superAdmin && !isActive) {
    await db
      .update(organizationSchema)
      .set({
        iqproSubscriptionPlanId: 'basic',
        iqproSubscriptionStatus: 'active',
        iqproBillingCycle: 'monthly',
      })
      .where(eq(organizationSchema.id, orgId));

    const plan = getSaasPlan('basic');
    return {
      planId: 'basic',
      planName: plan?.name ?? 'Basic',
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodEnd: null,
      isSuperAdmin: true,
      hasActiveSubscription: true,
    };
  }

  const plan = planId ? getSaasPlan(planId) : null;

  return {
    planId,
    planName: plan?.name ?? null,
    status,
    billingCycle: org?.iqproBillingCycle ?? null,
    currentPeriodEnd: org?.iqproCurrentPeriodEnd ?? null,
    isSuperAdmin: superAdmin,
    hasActiveSubscription: isActive,
  };
}

// ===== Subscribe to a plan =====

export async function subscribe(params: SubscribeParams): Promise<{ success: boolean; error?: string }> {
  const client = await requireClient();
  const processors = await getGatewayProcessors();

  try {
    // Step 1: Get or create IQPro customer for the org
    const existing = await db.query.organizationSchema.findFirst({
      where: eq(organizationSchema.id, params.orgId),
      columns: { iqproCustomerId: true },
    });

    let customerId = existing?.iqproCustomerId ?? null;

    if (!customerId) {
      const customer = await client.customers.create({
        name: params.orgName,
        referenceId: params.orgId,
        addresses: [{
          email: params.adminEmail,
          isBilling: true,
          country: 'US',
          state: 'N/A',
        }],
      });
      customerId = customer.customerId;

      await db
        .update(organizationSchema)
        .set({ iqproCustomerId: customerId })
        .where(eq(organizationSchema.id, params.orgId));

      logger.info('[SaaS] Created org customer', { orgId: params.orgId, customerId });
    }

    // Step 2: Register payment method
    const first6 = params.cardFirstSix ?? params.cardNumber?.slice(0, 6) ?? '000000';
    const last4 = params.cardLastFour ?? params.cardNumber?.slice(-4) ?? '0000';
    const maskedCard = `${first6}******${last4}`;

    const pm = await client.customers.createPaymentMethod(customerId, {
      card: {
        token: params.cardToken ?? params.cardNumber,
        expirationDate: params.cardExpiry,
        maskedCard,
      },
      isDefault: true,
    });

    const paymentMethodId = pm.customerPaymentMethodId ?? pm.paymentMethodId ?? pm.customerPaymentId ?? '';

    await db
      .update(organizationSchema)
      .set({ iqproPaymentMethodId: paymentMethodId })
      .where(eq(organizationSchema.id, params.orgId));

    logger.info('[SaaS] Payment method registered', { orgId: params.orgId, paymentMethodId });

    // Step 3: Create subscription
    const plan = getSaasPlan(params.planId);
    if (!plan || plan.isContactUs) {
      return { success: false, error: 'Invalid plan' };
    }

    const amount = getPlanTotalPrice(params.planId, params.billingCycle);
    const now = new Date();
    const dayOfMonth = now.getDate();
    const billingPeriodId = params.billingCycle === 'annual' ? 6 : 4;

    const schedule: Record<string, number[]> = {
      minutes: [0],
      hours: [0],
      daysOfMonth: [dayOfMonth],
    };
    if (params.billingCycle === 'annual') {
      schedule.monthsOfYear = [now.getMonth() + 1];
    }

    const gatewayContext = client.transactions.getServiceContext().gatewayContext;
    if (!gatewayContext) {
      throw new Error('Gateway context is required');
    }

    const subscriptionPayload = {
      customerId,
      subscriptionStatusId: 1, // Active
      name: `Dojo Planner ${plan.name} Plan`,
      prefix: 'SAAS',
      recurrence: {
        termStartDate: now.toISOString(),
        billingStartDate: now.toISOString(),
        isAutoRenewed: true,
        allowProration: false,
        trialLengthInDays: 0,
        invoiceLengthInDays: 1,
        billingPeriodId,
        schedule,
      },
      paymentMethod: {
        customerPaymentMethodId: paymentMethodId,
        isAutoCharged: true,
        ...(processors.cardProcessorId && { cardProcessorId: processors.cardProcessorId }),
        ...(processors.achProcessorId && { achProcessorId: processors.achProcessorId }),
      },
      addresses: [
        {
          isBilling: true,
          isShipping: false,
          isRemittance: false,
          email: params.adminEmail,
          country: 'US',
          state: 'N/A',
        },
        {
          isBilling: false,
          isShipping: false,
          isRemittance: true,
          email: params.adminEmail,
          country: 'US',
        },
      ],
      lineItems: [{
        name: `${plan.name} Plan`,
        description: `${params.billingCycle} SaaS subscription`,
        quantity: 1,
        unitPrice: amount,
        discount: 0,
        unitOfMeasureId: params.billingCycle === 'annual' ? 4 : 3,
      }],
    };

    const response = await client.post<Record<string, unknown>>(
      `/api/gateway/${gatewayContext.gatewayId}/subscription`,
      subscriptionPayload,
    );

    const data = (response as Record<string, unknown>).data ?? response;
    const subData = data as Record<string, unknown>;
    const subscriptionId = (subData.subscriptionId ?? subData.id ?? '') as string;

    // Calculate next period end
    const nextPeriodEnd = params.billingCycle === 'annual'
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db
      .update(organizationSchema)
      .set({
        iqproSubscriptionId: subscriptionId,
        iqproSubscriptionPlanId: params.planId,
        iqproBillingCycle: params.billingCycle,
        iqproSubscriptionStatus: 'active',
        iqproCurrentPeriodEnd: nextPeriodEnd.getTime(),
      })
      .where(eq(organizationSchema.id, params.orgId));

    logger.info('[SaaS] Subscription created', { orgId: params.orgId, subscriptionId });
    return { success: true };
  } catch (error) {
    logger.error('[SaaS] Subscribe failed', { orgId: params.orgId, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ===== Change plan =====

export async function changePlan(
  orgId: string,
  newPlanId: SaasPlanId,
  newBillingCycle: 'monthly' | 'annual',
): Promise<{ success: boolean; error?: string }> {
  const client = await requireClient();

  try {
    const org = await db.query.organizationSchema.findFirst({
      where: eq(organizationSchema.id, orgId),
      columns: { iqproSubscriptionId: true },
    });

    if (!org?.iqproSubscriptionId) {
      return { success: false, error: 'No active subscription to change' };
    }

    const plan = getSaasPlan(newPlanId);
    if (!plan || plan.isContactUs) {
      return { success: false, error: 'Invalid plan' };
    }

    const amount = getPlanTotalPrice(newPlanId, newBillingCycle);

    await client.subscriptions.update(org.iqproSubscriptionId, {
      name: `Dojo Planner ${plan.name} Plan`,
      lineItems: [{
        name: `${plan.name} Plan`,
        description: `${newBillingCycle} SaaS subscription`,
        quantity: 1,
        unitPrice: amount,
        discount: 0,
        unitOfMeasureId: newBillingCycle === 'annual' ? 4 : 3,
      }],
    });

    await db
      .update(organizationSchema)
      .set({
        iqproSubscriptionPlanId: newPlanId,
        iqproBillingCycle: newBillingCycle,
      })
      .where(eq(organizationSchema.id, orgId));

    logger.info('[SaaS] Plan changed', { orgId, newPlanId, newBillingCycle });
    return { success: true };
  } catch (error) {
    logger.error('[SaaS] Plan change failed', { orgId, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ===== Cancel subscription =====

export async function cancelSubscription(
  orgId: string,
  endOfPeriod: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const org = await db.query.organizationSchema.findFirst({
      where: eq(organizationSchema.id, orgId),
      columns: { iqproSubscriptionId: true },
    });

    // If there's an IQPro subscription, cancel it
    if (org?.iqproSubscriptionId) {
      const client = await requireClient();
      await client.subscriptions.cancel(org.iqproSubscriptionId, {
        cancel: {
          now: !endOfPeriod,
          endOfBillingPeriod: endOfPeriod,
        },
      });
    }

    await db
      .update(organizationSchema)
      .set({ iqproSubscriptionStatus: 'cancelled' })
      .where(eq(organizationSchema.id, orgId));

    logger.info('[SaaS] Subscription cancelled', { orgId, endOfPeriod });
    return { success: true };
  } catch (error) {
    logger.error('[SaaS] Cancel failed', { orgId, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ===== Get billing history =====

export async function getBillingHistory(orgId: string): Promise<BillingHistoryItem[]> {
  const org = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: { iqproSubscriptionId: true },
  });

  if (!org?.iqproSubscriptionId) {
    return [];
  }

  try {
    const client = await requireClient();
    const subscription = await client.subscriptions.get(org.iqproSubscriptionId);

    const data = (subscription as Record<string, unknown>).data ?? subscription;
    const sub = data as Record<string, unknown>;
    const invoices = (sub.invoices ?? []) as Array<Record<string, unknown>>;

    // Extract payment method last4 from the subscription
    const paymentMethod = sub.paymentMethod as Record<string, unknown> | undefined;
    const customerPM = paymentMethod?.customerPaymentMethod as Record<string, unknown> | undefined;
    const card = customerPM?.card as Record<string, unknown> | undefined;
    const maskedCard = (card?.maskedCard as string) ?? null;
    const last4 = maskedCard?.slice(-4) ?? null;

    return invoices.map((invoice) => {
      const status = invoice.status as Record<string, unknown> | undefined;
      return {
        invoiceId: (invoice.invoiceId ?? '') as string,
        status: (status?.name ?? null) as string | null,
        amount: (invoice.amountCaptured ?? 0) as number,
        invoiceDate: (invoice.invoiceDate ?? null) as string | null,
        dueDate: (invoice.dueDate ?? null) as string | null,
        paymentMethodLast4: last4,
      };
    });
  } catch (error) {
    logger.error('[SaaS] Failed to fetch billing history', { orgId, error });
    return [];
  }
}

// ===== Check if org has active subscription (for access enforcement) =====

export async function hasActiveSubscription(orgId: string): Promise<boolean> {
  const org = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: {
      iqproSubscriptionStatus: true,
      stripeSubscriptionStatus: true,
    },
  });

  if (!org) {
    return false;
  }

  // Check IQPro subscription first
  if (org.iqproSubscriptionStatus === 'active' || org.iqproSubscriptionStatus === 'trial') {
    return true;
  }

  // Fallback to Stripe subscription
  if (org.stripeSubscriptionStatus === 'active') {
    return true;
  }

  return false;
}
