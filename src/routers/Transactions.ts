import { ORPCError, os } from '@orpc/server';
import { logger } from '@/libs/Logger';
import { getOrganizationTransactions, getTransactionById } from '@/services/TransactionsService';
import { ORG_ROLE } from '@/types/Auth';
import { GetTransactionValidation, TransactionListValidation } from '@/validations/TransactionValidation';
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
