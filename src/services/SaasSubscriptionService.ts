/**
 * SaaS subscription service for organization-level billing via IQPro.
 *
 * Handles org SaaS subscriptions (Basic/Growth plans),
 * distinct from member-level payments handled by MemberPaymentService.
 */

import type { IQProConfig } from '@/libs/IQPro';
import type { SaasPlanId } from '@/utils/SaasPlans';
import { eq } from 'drizzle-orm';
// Every organization read AND write in this file goes through the control
// plane, not the tenant-scoped `db`. The `saas_*` columns describe the
// platform's billing relationship with an organization, so they must remain
// reachable when that org's own tenant database is unreachable or not yet
// provisioned — and the access gate reads them during RSC render, where no
// ambient tenant scope exists.
//
// A1 moved only `hasActiveSubscription`; the other five functions still wrote
// through `db`. Harmless while both handles resolve to one physical database,
// but split-brain the moment the planes separate: `subscribe()` would write
// `saas_subscription_status='active'` to the tenant database while the gate
// read control, saw null, and locked out a customer who had just paid.
import { controlOrganizationDb } from '@/libs/ControlPlaneReads';
import { getGatewayProcessors, iqproPost, iqproPut } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import { organizationSchema } from '@/models/Schema';
import { getPlanTotalPrice, getSaasPlan } from '@/utils/SaasPlans';
import { isExemptOrg, isSuperAdmin } from '@/utils/SuperAdmins';

// Grace window applied to `saasCurrentPeriodEnd` before an otherwise-active
// subscription is treated as expired. Absorbs IQPro webhook lag so a paying
// customer isn't locked out the instant a renewal webhook is late. Expiry is
// normally driven by webhooks flipping the status; this is a time-based
// backstop for when a webhook is missed/delayed.
const SUBSCRIPTION_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

// IQPro requires a valid US state code on addresses where country === 'US'
// (it rejects 'N/A'). SaaS billing doesn't collect the org's address, so we
// send a neutral placeholder state. This only labels the billing record; it
// does not affect tax (SaaS line items are non-taxable here).
const SAAS_DEFAULT_STATE = 'KS';

// Error surfaced when a change/cancel is attempted on an org that has no real
// IQPro-backed subscription (null id, or a legacy synthetic `seed_org_*` id).
const NO_PAID_SUBSCRIPTION_ERROR
  = 'This organization has no active paid subscription. Please subscribe with a payment method first.';

/**
 * A subscription id only counts as IQPro-backed when it's present and not a
 * synthetic seed placeholder. Seeded/local orgs have no real IQPro subscription,
 * so change/cancel must not fire doomed IQPro calls (or silently mutate state)
 * against them.
 */
function isRealSubscriptionId(subscriptionId: string | null | undefined): subscriptionId is string {
  return !!subscriptionId && !subscriptionId.startsWith('seed_org_');
}

/**
 * Whether a subscription with the given status + period end should count as
 * active. Active requires the status to be `active`/`trial` AND the period end
 * (if known) to be within the grace window. A null period end never blocks
 * (defensive — older rows or super-admin grants may lack it).
 */
function isSubscriptionActive(
  status: string | null | undefined,
  currentPeriodEnd: number | null | undefined,
): boolean {
  if (status !== 'active' && status !== 'trial') {
    return false;
  }
  if (currentPeriodEnd == null) {
    return true;
  }
  return currentPeriodEnd + SUBSCRIPTION_GRACE_MS > Date.now();
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
  responsibleClerkUserId: string | null;
  /** Display info for the responsible academy owner, resolved at the router layer. */
  responsibleOwner?: { name: string | null; email: string | null } | null;
};

export type SubscribeParams = {
  orgId: string;
  orgName: string;
  adminEmail: string;
  planId: SaasPlanId;
  billingCycle: 'monthly' | 'annual';
  /** Clerk userId of the academy owner responsible for this subscription. */
  responsibleClerkUserId?: string;
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
  const org = await controlOrganizationDb().query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: {
      saasProviderPlanId: true,
      saasSubscriptionStatus: true,
      saasBillingCycle: true,
      saasCurrentPeriodEnd: true,
      saasResponsibleClerkUserId: true,
    },
  });

  const planId = org?.saasProviderPlanId as SaasPlanId | null;
  const status = org?.saasSubscriptionStatus ?? null;
  const isActive = isSubscriptionActive(status, org?.saasCurrentPeriodEnd);
  const superAdmin = isSuperAdmin(username) || isExemptOrg(orgId);

  // Super admin auto-grant: if no active plan, grant Basic for free
  if (superAdmin && !isActive) {
    await controlOrganizationDb()
      .update(organizationSchema)
      .set({
        saasProviderPlanId: 'basic',
        saasSubscriptionStatus: 'active',
        saasBillingCycle: 'monthly',
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
      responsibleClerkUserId: org?.saasResponsibleClerkUserId ?? null,
    };
  }

  const plan = planId ? getSaasPlan(planId) : null;

  return {
    planId,
    planName: plan?.name ?? null,
    status,
    billingCycle: org?.saasBillingCycle ?? null,
    currentPeriodEnd: org?.saasCurrentPeriodEnd ?? null,
    isSuperAdmin: superAdmin,
    hasActiveSubscription: isActive,
    responsibleClerkUserId: org?.saasResponsibleClerkUserId ?? null,
  };
}

// ===== Subscribe to a plan =====

export async function subscribe(
  config: IQProConfig,
  params: SubscribeParams,
): Promise<{ success: boolean; error?: string }> {
  const gatewayId = config.gatewayId;
  const processors = await getGatewayProcessors(config);

  try {
    // Step 1: Get or create IQPro customer for the org
    const existing = await controlOrganizationDb().query.organizationSchema.findFirst({
      where: eq(organizationSchema.id, params.orgId),
      columns: { saasProviderCustomerId: true },
    });

    let customerId = existing?.saasProviderCustomerId ?? null;

    if (!customerId) {
      const customerRes = await iqproPost<{ data?: Record<string, unknown> }>(
        config,
        `/api/gateway/${gatewayId}/customer`,
        {
          name: params.orgName,
          referenceId: params.orgId,
          addresses: [{
            email: params.adminEmail,
            isBilling: true,
            country: 'US',
            state: SAAS_DEFAULT_STATE,
          }],
        },
      );
      const customerData = (customerRes.data ?? customerRes) as Record<string, unknown>;
      customerId = customerData.customerId as string;

      await controlOrganizationDb()
        .update(organizationSchema)
        .set({ saasProviderCustomerId: customerId })
        .where(eq(organizationSchema.id, params.orgId));

      logger.info('[SaaS] Created org customer', { orgId: params.orgId, customerId });
    }

    // Step 2: Register payment method
    const first6 = params.cardFirstSix ?? params.cardNumber?.slice(0, 6) ?? '000000';
    const last4 = params.cardLastFour ?? params.cardNumber?.slice(-4) ?? '0000';
    const maskedCard = `${first6}******${last4}`;

    const pmRes = await iqproPost<{ data?: Record<string, unknown> }>(
      config,
      `/api/gateway/${gatewayId}/customer/${customerId}/payment`,
      {
        card: {
          token: params.cardToken ?? params.cardNumber,
          expirationDate: params.cardExpiry,
          maskedCard,
        },
        isDefault: true,
      },
    );
    const pm = (pmRes.data ?? pmRes) as Record<string, unknown>;
    const paymentMethodId = (pm.customerPaymentMethodId ?? pm.paymentMethodId ?? pm.customerPaymentId ?? '') as string;

    await controlOrganizationDb()
      .update(organizationSchema)
      .set({ saasProviderPaymentMethodId: paymentMethodId })
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
          state: SAAS_DEFAULT_STATE,
        },
        {
          isBilling: false,
          isShipping: false,
          isRemittance: true,
          email: params.adminEmail,
          country: 'US',
          state: SAAS_DEFAULT_STATE,
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

    const response = await iqproPost<Record<string, unknown>>(
      config,
      `/api/gateway/${gatewayId}/subscription`,
      subscriptionPayload,
    );

    const data = (response as Record<string, unknown>).data ?? response;
    const subData = data as Record<string, unknown>;
    const subscriptionId = (subData.subscriptionId ?? subData.id ?? '') as string;

    // Step 4: Immediate first-period charge. IQPro subscriptions do NOT
    // auto-charge on creation (same as member subscriptions), so without this
    // the org would be marked active but never billed and Billing History would
    // be empty. Run a vaulted Sale against the saved payment method for the
    // first period's amount. SaaS plans are non-taxable; a ServiceFee % applies
    // to every transaction.
    const serviceFeePct = Number(process.env.SERVICE_FEE_PCT ?? '0') || 0;
    const salePayload = {
      type: 'Sale',
      remit: {
        baseAmount: amount,
        taxAmount: 0,
        isTaxExempt: true,
        currencyCode: 'USD',
        addTaxToTotal: true,
        paymentAdjustments: [
          { type: 'ServiceFee', percentage: serviceFeePct, flatAmount: null },
        ],
      },
      paymentMethod: {
        customer: {
          customerId,
          customerPaymentMethodId: paymentMethodId,
        },
      },
      lineItems: [{
        name: `${plan.name} Plan`,
        description: `${params.billingCycle} SaaS subscription`,
        quantity: 1,
        unitPrice: amount,
        discount: 0,
        freightAmount: 0,
        unitOfMeasureId: 1,
        localTaxPercent: 0,
        nationalTaxPercent: 0,
      }],
      caption: `Dojo Planner ${plan.name}`.substring(0, 19),
    };

    const saleRes = await iqproPost<{ data?: Record<string, unknown> }>(
      config,
      `/api/gateway/${gatewayId}/transaction`,
      salePayload,
    );
    const saleRaw = (saleRes.data ?? saleRes) as Record<string, unknown>;
    const saleTx = (saleRaw.transaction ?? saleRaw) as Record<string, unknown>;
    const saleStatus = ((saleTx.status ?? '') as string).toLowerCase();
    const saleApproved = ['captured', 'settled', 'authorized', 'pendingsettlement'].includes(saleStatus);

    if (!saleApproved) {
      // Subscription exists in IQPro but the first charge didn't go through. Do
      // NOT mark the org active — surface the failure so the admin can retry.
      const reason = (saleTx.processorResponseText ?? saleTx.processorResponseMessage ?? saleStatus) as string;
      logger.error('[SaaS] Subscription created but initial charge failed', {
        orgId: params.orgId,
        subscriptionId,
        status: saleStatus,
      });
      return { success: false, error: `Subscription created but the first charge failed: ${reason}` };
    }

    logger.info('[SaaS] Initial charge approved', { orgId: params.orgId, subscriptionId, status: saleStatus });

    // Calculate next period end
    const nextPeriodEnd = params.billingCycle === 'annual'
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await controlOrganizationDb()
      .update(organizationSchema)
      .set({
        saasProviderSubscriptionId: subscriptionId,
        saasProviderPlanId: params.planId,
        saasBillingCycle: params.billingCycle,
        saasSubscriptionStatus: 'active',
        saasCurrentPeriodEnd: nextPeriodEnd.getTime(),
        ...(params.responsibleClerkUserId && {
          saasResponsibleClerkUserId: params.responsibleClerkUserId,
        }),
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
  config: IQProConfig,
  orgId: string,
  newPlanId: SaasPlanId,
  newBillingCycle: 'monthly' | 'annual',
): Promise<{ success: boolean; error?: string }> {
  const gatewayId = config.gatewayId;

  try {
    const org = await controlOrganizationDb().query.organizationSchema.findFirst({
      where: eq(organizationSchema.id, orgId),
      columns: { saasProviderSubscriptionId: true },
    });

    if (!isRealSubscriptionId(org?.saasProviderSubscriptionId)) {
      return { success: false, error: NO_PAID_SUBSCRIPTION_ERROR };
    }

    const plan = getSaasPlan(newPlanId);
    if (!plan || plan.isContactUs) {
      return { success: false, error: 'Invalid plan' };
    }

    const amount = getPlanTotalPrice(newPlanId, newBillingCycle);

    await iqproPut(
      config,
      `/api/gateway/${gatewayId}/subscription/${org.saasProviderSubscriptionId}`,
      {
        name: `Dojo Planner ${plan.name} Plan`,
        lineItems: [{
          name: `${plan.name} Plan`,
          description: `${newBillingCycle} SaaS subscription`,
          quantity: 1,
          unitPrice: amount,
          discount: 0,
          unitOfMeasureId: newBillingCycle === 'annual' ? 4 : 3,
        }],
      },
    );

    await controlOrganizationDb()
      .update(organizationSchema)
      .set({
        saasProviderPlanId: newPlanId,
        saasBillingCycle: newBillingCycle,
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
  config: IQProConfig | null,
  orgId: string,
  endOfPeriod: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const org = await controlOrganizationDb().query.organizationSchema.findFirst({
      where: eq(organizationSchema.id, orgId),
      columns: { saasProviderSubscriptionId: true },
    });

    // No real IQPro subscription (null id or a synthetic seed placeholder):
    // there's nothing to cancel and we must not silently flip local status.
    if (!isRealSubscriptionId(org?.saasProviderSubscriptionId)) {
      return { success: false, error: NO_PAID_SUBSCRIPTION_ERROR };
    }

    // Cancel the IQPro subscription (best-effort when config is present).
    if (config) {
      const gatewayId = config.gatewayId;
      await iqproPost(
        config,
        `/api/gateway/${gatewayId}/subscription/${org.saasProviderSubscriptionId}/cancel`,
        {
          cancel: {
            now: !endOfPeriod,
            endOfBillingPeriod: endOfPeriod,
          },
        },
      );
    }

    await controlOrganizationDb()
      .update(organizationSchema)
      .set({ saasSubscriptionStatus: 'cancelled' })
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

export async function getBillingHistory(
  config: IQProConfig | null,
  orgId: string,
): Promise<BillingHistoryItem[]> {
  const org = await controlOrganizationDb().query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: { saasProviderCustomerId: true },
  });

  // SaaS charges (the immediate first-period Sale + IQPro's scheduled renewals)
  // are all tied to the org's IQPro customer. Since they are org-level they
  // aren't recorded in the member-scoped `transaction` table, so we read them
  // back from IQPro by searching transactions for this customer.
  if (!org?.saasProviderCustomerId || !config) {
    return [];
  }

  try {
    const gatewayId = config.gatewayId;
    const res = await iqproPost<{ data?: Record<string, unknown> }>(
      config,
      `/api/gateway/${gatewayId}/transaction/search`,
      {
        customerId: { operator: 'Equal', value: org.saasProviderCustomerId },
        limit: 100,
        offset: 0,
        sortColumn: 'CreatedDateTime',
        sortDirection: 'DESC',
      },
    );

    const data = (res.data ?? res) as Record<string, unknown>;
    const results = (data.results ?? []) as Array<Record<string, unknown>>;

    return results.map((tx) => {
      const maskedCard = (tx.maskedCard as string) ?? null;
      const amount = (tx.amountCaptured ?? tx.amountSettled ?? tx.amount ?? 0) as number;
      return {
        invoiceId: (tx.transactionId ?? '') as string,
        status: (tx.statusDescription ?? tx.status ?? null) as string | null,
        amount,
        invoiceDate: (tx.createdDateTime ?? null) as string | null,
        dueDate: null,
        paymentMethodLast4: maskedCard ? maskedCard.slice(-4) : null,
      };
    });
  } catch (error) {
    logger.error('[SaaS] Failed to fetch billing history', { orgId, error });
    return [];
  }
}

// ===== Check if org has active subscription (for access enforcement) =====

/**
 * Reads through the CONTROL plane rather than the tenant-scoped `db`: this is
 * called from `requireActiveSubscription` during React Server Component render,
 * where no tenant scope exists, and the access gate must keep working even when
 * the org's own database is unreachable or not yet provisioned.
 */
export async function hasActiveSubscription(orgId: string): Promise<boolean> {
  const org = await controlOrganizationDb().query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: {
      saasSubscriptionStatus: true,
      saasCurrentPeriodEnd: true,
      stripeSubscriptionStatus: true,
    },
  });

  if (!org) {
    return false;
  }

  // Check IQPro subscription first, including a time-based expiry backstop so a
  // missed renewal webhook doesn't keep an expired org active indefinitely.
  if (isSubscriptionActive(org.saasSubscriptionStatus, org.saasCurrentPeriodEnd)) {
    return true;
  }

  // Fallback to Stripe subscription (legacy, status-only)
  if (org.stripeSubscriptionStatus === 'active') {
    return true;
  }

  return false;
}
