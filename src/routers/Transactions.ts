import { ORPCError, os } from '@orpc/server';
import { logger } from '@/libs/Logger';
import { audit } from '@/services/AuditService';
import { refundTransaction as refundTransactionService, TransactionAlreadyRefundedError, TransactionNotFoundError, TransactionNotRefundableError, TransactionReversalFailedError } from '@/services/MemberPaymentService';
import { resolvePaymentProviderConfig } from '@/services/PaymentProviderConfigService';
import { getOrganizationTransactions, getTransactionById } from '@/services/TransactionsService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import { GetTransactionValidation, RefundTransactionValidation, TransactionListValidation } from '@/validations/TransactionValidation';
import { guardRole } from './AuthGuards';

export const list = os
  .input(TransactionListValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

    const transactions = await getOrganizationTransactions(orgId, input ?? undefined);

    return { transactions };
  });

export const get = os
  .input(GetTransactionValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const transaction = await getTransactionById(input.id, orgId);
      if (!transaction) {
        throw new ORPCError('Transaction not found', { status: 404 });
      }
      return { transaction };
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch transaction: ${errorMessage}`);
      throw new ORPCError('Failed to fetch transaction.', { status: 500 });
    }
  });

/**
 * Full-amount refund. Reverses the charge at the org's payment provider first
 * (void if unsettled, refund if settled), then records it locally. A provider
 * refusal leaves the books untouched and is surfaced to the caller as a 422.
 */
export const refund = os
  .input(RefundTransactionValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const paymentConfig = await resolvePaymentProviderConfig(context.orgId);
      const result = await refundTransactionService(input.transactionId, context.orgId, paymentConfig);

      await audit(context, AUDIT_ACTION.TRANSACTION_REFUND, AUDIT_ENTITY_TYPE.TRANSACTION, {
        entityId: input.transactionId,
        status: 'success',
      });

      return result;
    } catch (error) {
      await audit(context, AUDIT_ACTION.TRANSACTION_REFUND, AUDIT_ENTITY_TYPE.TRANSACTION, {
        entityId: input.transactionId,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof TransactionNotFoundError) {
        throw new ORPCError('Not Found', { status: 404, message: error.message });
      }
      if (error instanceof TransactionAlreadyRefundedError || error instanceof TransactionNotRefundableError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      if (error instanceof TransactionReversalFailedError) {
        throw new ORPCError('Unprocessable Content', { status: 422, message: error.message });
      }
      throw error;
    }
  });
