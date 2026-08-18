import { ORPCError, os } from '@orpc/server';
import * as z from 'zod';

import { getTokenizationConfig } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import { audit } from '@/services/AuditService';
import { processMemberPayment, registerPaymentMethod as registerPaymentMethodService } from '@/services/MemberPaymentService';
import { resolveIQProConfig, resolvePaymentProviderConfig } from '@/services/PaymentProviderConfigService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import { ProcessPaymentValidation, RegisterPaymentMethodValidation } from '@/validations/PaymentValidation';

import { guardRole } from './AuthGuards';

/**
 * The org's payment config, whichever provider it uses. This is what makes the
 * per-org provider choice real: everything downstream switches on
 * `config.provider`.
 */
async function requirePerOrgConfig(orgId: string) {
  const config = await resolvePaymentProviderConfig(orgId);
  if (!config) {
    throw new ORPCError('Payment processing is not configured for this organization. Set merchant credentials in Payment Settings.', { status: 503 });
  }
  return config;
}

/**
 * IQPro-only config, for the TokenEx iframe. Card tokenization is inherently
 * provider-specific — Square uses its own Web Payments SDK — so a Square org
 * gets a clear error here until B6 builds the Square tokenization path.
 */
async function requireIQProOnlyConfig(orgId: string) {
  const config = await resolveIQProConfig(orgId);
  if (!config) {
    throw new ORPCError('Payment processing is not configured for this organization. Set IQPro credentials in Payment Settings.', { status: 503 });
  }
  return config;
}

export const getTokenizationIframeConfig = os
  .input(z.object({ origin: z.string().url() }))
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);
    const config = await requireIQProOnlyConfig(context.orgId);

    try {
      return await getTokenizationConfig(config, input.origin);
    } catch (error) {
      logger.error('[Payment] Failed to get tokenization config', { error });
      throw new ORPCError('Failed to load payment configuration.', { status: 500 });
    }
  });

export const processPayment = os
  .input(ProcessPaymentValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);
    const config = await requirePerOrgConfig(context.orgId);

    try {
      logger.info('[Payment] Processing member payment', {
        memberId: input.memberId,
        amount: input.amount,
        billingType: input.billingType,
        paymentMethodSource: input.paymentMethodSource,
        isTaxable: input.isTaxable,
      });

      const result = await processMemberPayment(config, {
        organizationId: context.orgId,
        ...input,
      });

      await audit(context, AUDIT_ACTION.PAYMENT_PROCESS, AUDIT_ENTITY_TYPE.TRANSACTION, {
        entityId: result.transactionId,
        status: result.success ? 'success' : 'failure',
        error: result.error,
        changes: {
          paymentMethodSource: { before: undefined, after: input.paymentMethodSource ?? 'new' },
          isTaxable: { before: undefined, after: input.isTaxable ?? false },
        },
      });

      if (!result.success) {
        logger.warn('[Payment] Payment declined or failed', {
          memberId: input.memberId,
          status: result.status,
          declineReason: result.declineReason,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[Payment] Payment processing error', { error });

      await audit(context, AUDIT_ACTION.PAYMENT_PROCESS, AUDIT_ENTITY_TYPE.TRANSACTION, {
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError
        ? error
        : new ORPCError('Payment processing failed. Please try again.', { status: 500 });
    }
  });

export const registerPaymentMethod = os
  .input(RegisterPaymentMethodValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);
    const config = await requirePerOrgConfig(context.orgId);

    try {
      logger.info('[Payment] Registering payment method (no charge)', {
        memberId: input.memberId,
        paymentMethod: input.paymentMethod,
      });

      const result = await registerPaymentMethodService(config, {
        organizationId: context.orgId,
        ...input,
      });

      await audit(context, AUDIT_ACTION.PAYMENT_METHOD_REGISTER, AUDIT_ENTITY_TYPE.PAYMENT_METHOD, {
        entityId: result.paymentMethodId,
        status: result.success ? 'success' : 'failure',
        error: result.error,
      });

      if (!result.success) {
        logger.warn('[Payment] Payment method registration failed', {
          memberId: input.memberId,
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[Payment] Payment method registration error', { error });

      await audit(context, AUDIT_ACTION.PAYMENT_METHOD_REGISTER, AUDIT_ENTITY_TYPE.PAYMENT_METHOD, {
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError
        ? error
        : new ORPCError('Failed to register payment method. Please try again.', { status: 500 });
    }
  });
