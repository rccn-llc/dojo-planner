import { ORPCError, os } from '@orpc/server';
import * as z from 'zod';

import { getTokenizationConfig } from '@/libs/IQPro';
import { logger } from '@/libs/Logger';
import { audit } from '@/services/AuditService';
import { processMemberPayment } from '@/services/MemberPaymentService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import { ProcessPaymentValidation } from '@/validations/PaymentValidation';

import { guardRole } from './AuthGuards';

export const getTokenizationIframeConfig = os
  .input(z.object({ origin: z.string().url() }))
  .handler(async ({ input }) => {
    await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const config = await getTokenizationConfig(input.origin);
      return config;
    } catch (error) {
      logger.error('[Payment] Failed to get tokenization config', { error });
      throw new ORPCError('Failed to load payment configuration.', { status: 500 });
    }
  });

export const processPayment = os
  .input(ProcessPaymentValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      logger.info('[Payment] Processing member payment', {
        memberId: input.memberId,
        amount: input.amount,
        billingType: input.billingType,
      });

      const result = await processMemberPayment({
        organizationId: context.orgId,
        ...input,
      });

      await audit(context, AUDIT_ACTION.PAYMENT_PROCESS, AUDIT_ENTITY_TYPE.TRANSACTION, {
        entityId: result.transactionId,
        status: result.success ? 'success' : 'failure',
        error: result.error,
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
