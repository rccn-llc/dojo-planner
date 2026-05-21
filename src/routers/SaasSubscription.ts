import { auth } from '@clerk/nextjs/server';
import { ORPCError, os } from '@orpc/server';
import * as z from 'zod';

import { getTokenizationConfig } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import { audit } from '@/services/AuditService';
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

  return getCurrentSubscription(context.orgId, username);
});

export const subscribeToPlan = os
  .input(SubscribeValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);
    const config = await requirePlatformConfig();

    try {
      const result = await subscribe(config, {
        orgId: context.orgId,
        orgName: input.orgName,
        adminEmail: input.adminEmail,
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
