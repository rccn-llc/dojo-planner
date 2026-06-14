import { auth } from '@clerk/nextjs/server';
import { ORPCError, os } from '@orpc/server';
import * as z from 'zod';

import { getTokenizationConfig } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import { audit } from '@/services/AuditService';
import { getAcademyOwner } from '@/services/ClerkRolesService';
import { resolvePlatformIQProConfig } from '@/services/IQProConfigService';
import {
  cancelSubscription,
  changePlan,
  getBillingHistory,
  getCurrentSubscription,
  subscribe,
} from '@/services/SaasSubscriptionService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import {
  CancelSubscriptionValidation,
  ChangePlanValidation,
  SubscribeValidation,
} from '@/validations/SaasSubscriptionValidation';

import { guardRole } from './AuthGuards';

async function requirePlatformConfig() {
  const config = await resolvePlatformIQProConfig();
  if (!config) {
    throw new ORPCError('SaaS billing is not configured. Set platform IQPro credentials in Platform Settings.', { status: 503 });
  }
  return config;
}

export const getCurrentPlan = os.handler(async () => {
  const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);
  const { sessionClaims } = await auth();
  const username = (sessionClaims as Record<string, unknown>)?.username as string | undefined;

  const subscription = await getCurrentSubscription(context.orgId, username);

  // Resolve the responsible academy owner's display info for the UI. Best-effort:
  // a missing owner (or Clerk error) just leaves the display fields null.
  let responsibleOwner: { name: string | null; email: string | null } | null = null;
  try {
    const owner = await getAcademyOwner(context.orgId);
    if (owner) {
      const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
      responsibleOwner = { name: name || null, email: owner.email || null };
    }
  } catch (error) {
    logger.warn('[SaaSSubscription] Failed to resolve academy owner', { orgId: context.orgId, error });
  }

  return { ...subscription, responsibleOwner };
});

export const subscribeToPlan = os
  .input(SubscribeValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);
    const config = await requirePlatformConfig();

    // The SaaS subscription must be tied to a responsible academy owner. If
    // none is assigned in Clerk, the subscription cannot be created — and the
    // org cannot access the dashboard until one exists (see the owner-aware
    // gate in requireActiveSubscription).
    const owner = await getAcademyOwner(context.orgId);
    if (!owner) {
      throw new ORPCError('An Academy Owner must be assigned in Clerk before subscribing.', { status: 409 });
    }

    try {
      const result = await subscribe(config, {
        orgId: context.orgId,
        orgName: input.orgName,
        // Bill the responsible academy owner; fall back to the supplied email.
        adminEmail: owner.email || input.adminEmail,
        responsibleClerkUserId: owner.clerkUserId,
        planId: input.planId,
        billingCycle: input.billingCycle,
        cardToken: input.cardToken,
        cardFirstSix: input.cardFirstSix,
        cardLastFour: input.cardLastFour,
        cardExpiry: input.cardExpiry,
        cardNumber: input.cardNumber,
      });

      await audit(context, AUDIT_ACTION.SAAS_SUBSCRIPTION_CREATE, AUDIT_ENTITY_TYPE.ORGANIZATION, {
        entityId: context.orgId,
        status: result.success ? 'success' : 'failure',
        error: result.error,
      });

      if (!result.success) {
        logger.warn('[SaaSSubscription] Subscribe failed', { orgId: context.orgId, error: result.error });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[SaaSSubscription] Subscribe error', { error });

      await audit(context, AUDIT_ACTION.SAAS_SUBSCRIPTION_CREATE, AUDIT_ENTITY_TYPE.ORGANIZATION, {
        entityId: context.orgId,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError
        ? error
        : new ORPCError('Subscription failed. Please try again.', { status: 500 });
    }
  });

export const changeSaasPlan = os
  .input(ChangePlanValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);
    const config = await requirePlatformConfig();

    try {
      const result = await changePlan(config, context.orgId, input.newPlanId, input.newBillingCycle);

      await audit(context, AUDIT_ACTION.SAAS_SUBSCRIPTION_CHANGE, AUDIT_ENTITY_TYPE.ORGANIZATION, {
        entityId: context.orgId,
        status: result.success ? 'success' : 'failure',
        error: result.error,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[SaaSSubscription] Change plan error', { error });

      await audit(context, AUDIT_ACTION.SAAS_SUBSCRIPTION_CHANGE, AUDIT_ENTITY_TYPE.ORGANIZATION, {
        entityId: context.orgId,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError
        ? error
        : new ORPCError('Plan change failed. Please try again.', { status: 500 });
    }
  });

export const cancelSaasSubscription = os
  .input(CancelSubscriptionValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);
    // Resolve platform config best-effort — cancellation should still update
    // local state even when IQPro is unreachable (or never configured).
    const config = await resolvePlatformIQProConfig();

    try {
      const result = await cancelSubscription(config, context.orgId, input.endOfPeriod);

      await audit(context, AUDIT_ACTION.SAAS_SUBSCRIPTION_CANCEL, AUDIT_ENTITY_TYPE.ORGANIZATION, {
        entityId: context.orgId,
        status: result.success ? 'success' : 'failure',
        error: result.error,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[SaaSSubscription] Cancel error', { error });

      await audit(context, AUDIT_ACTION.SAAS_SUBSCRIPTION_CANCEL, AUDIT_ENTITY_TYPE.ORGANIZATION, {
        entityId: context.orgId,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError
        ? error
        : new ORPCError('Cancellation failed. Please try again.', { status: 500 });
    }
  });

export const getSaasBillingHistory = os.handler(async () => {
  const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);
  const config = await resolvePlatformIQProConfig();
  return getBillingHistory(config, context.orgId);
});

export const getSaasTokenizationConfig = os
  .input(z.object({ origin: z.string().url() }))
  .handler(async ({ input }) => {
    await guardRole(ORG_ROLE.ADMIN);
    const config = await requirePlatformConfig();

    try {
      return await getTokenizationConfig(config, input.origin);
    } catch (error) {
      logger.error('[SaaSSubscription] Failed to get tokenization config', { error });
      throw new ORPCError('Failed to load payment configuration.', { status: 500 });
    }
  });
