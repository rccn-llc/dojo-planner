import type { AuditContext } from '@/types/Audit';
import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG_ROLE } from '@/types/Auth';

// Mock all dependencies
vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('@/libs/Logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('./AuthGuards', () => ({
  guardRole: vi.fn(),
}));
vi.mock('@/services/TransactionsService', () => ({
  getOrganizationTransactions: vi.fn(),
  getTransactionById: vi.fn(),
}));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
const mockPaymentConfig = { provider: 'iqpro' as const, gatewayId: 'test-gateway' };
vi.mock('@/services/PaymentProviderConfigService', () => ({
  resolvePaymentProviderConfig: vi.fn(async () => mockPaymentConfig),
}));
vi.mock('@/services/PaymentRetryService', async () => {
  const actual = await vi.importActual<typeof import('@/services/PaymentRetryService')>('@/services/PaymentRetryService');
  return {
    ...actual,
    retryFailedTransaction: vi.fn(),
    getRetryQuote: vi.fn(),
  };
});
vi.mock('@/services/MemberPaymentService', async () => {
  const actual = await vi.importActual<typeof import('@/services/MemberPaymentService')>('@/services/MemberPaymentService');
  return {
    ...actual,
    refundTransaction: vi.fn(),
  };
});

const mockContext: AuditContext = {
  userId: 'test-user-123',
  orgId: 'test-org-456',
  role: 'org:front_desk',
};

// Helper to call ORPC handlers
function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('Transactions Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return transactions on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getOrganizationTransactions } = await import('@/services/TransactionsService');

      const mockTransactions = [
        {
          id: 'txn_1',
          memberId: 'member_1',
          memberFirstName: 'John',
          memberLastName: 'Doe',
          transactionType: 'payment',
          amount: 10000,
          currency: 'USD',
          status: 'completed',
          paymentMethod: 'credit_card',
          description: 'Monthly membership',
          processedAt: new Date('2026-01-01'),
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 'txn_2',
          memberId: 'member_2',
          memberFirstName: 'Jane',
          memberLastName: 'Smith',
          transactionType: 'refund',
          amount: 5000,
          currency: 'USD',
          status: 'completed',
          paymentMethod: 'credit_card',
          description: 'Refund for cancellation',
          processedAt: new Date('2026-01-02'),
          createdAt: new Date('2026-01-02'),
        },
        {
          // Guest / non-member sale (e.g. kiosk store purchase): null member.
          id: 'txn_guest',
          memberId: null,
          memberFirstName: null,
          memberLastName: null,
          transactionType: 'adjustment',
          amount: 8000,
          currency: 'USD',
          status: 'paid',
          paymentMethod: 'card',
          description: 'Store: Black Belt — John Customer',
          processedAt: new Date('2026-01-03'),
          createdAt: new Date('2026-01-03'),
        },
      ];

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getOrganizationTransactions).mockResolvedValue(mockTransactions as never);

      const { list } = await import('./Transactions');
      const input = { limit: 10, offset: 0 };
      const result = await callHandler(list, input);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getOrganizationTransactions).toHaveBeenCalledWith('test-org-456', input);
      expect(result).toEqual({ transactions: mockTransactions });
    });

    it('should pass undefined when input is null', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getOrganizationTransactions } = await import('@/services/TransactionsService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getOrganizationTransactions).mockResolvedValue([]);

      const { list } = await import('./Transactions');
      const result = await callHandler(list, null);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getOrganizationTransactions).toHaveBeenCalledWith('test-org-456', undefined);
      expect(result).toEqual({ transactions: [] });
    });

    it('should rethrow ORPCError from guardRole', async () => {
      const { guardRole } = await import('./AuthGuards');
      const error = new ORPCError('UNAUTHORIZED', {
        message: 'Insufficient permissions',
      });
      vi.mocked(guardRole).mockRejectedValue(error);

      const { list } = await import('./Transactions');

      await expect(callHandler(list)).rejects.toThrow(error);
    });

    it('should propagate service errors', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getOrganizationTransactions } = await import('@/services/TransactionsService');

      const serviceError = new Error('Database connection failed');
      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getOrganizationTransactions).mockRejectedValue(serviceError);

      const { list } = await import('./Transactions');

      await expect(callHandler(list)).rejects.toThrow(serviceError);
    });

    it('should handle empty transactions list', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getOrganizationTransactions } = await import('@/services/TransactionsService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getOrganizationTransactions).mockResolvedValue([]);

      const { list } = await import('./Transactions');
      const result = await callHandler(list, { limit: 10, offset: 0 });

      expect(result).toEqual({ transactions: [] });
    });
  });

  describe('get', () => {
    it('should return transaction details on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getTransactionById } = await import('@/services/TransactionsService');

      const mockTransaction = {
        id: 'txn_1',
        memberId: 'member_1',
        memberFirstName: 'John',
        memberLastName: 'Doe',
        memberType: 'individual',
        transactionType: 'membership_payment',
        amount: 16000,
        currency: 'USD',
        status: 'paid',
        paymentMethod: 'card',
        description: 'Monthly membership payment',
        providerTransactionId: 'iqpro_123',
        processedAt: new Date('2026-01-15'),
        createdAt: new Date('2026-01-15'),
        membershipPlanName: 'Adult BJJ Monthly',
        membershipPlanFrequency: 'Monthly',
        membershipPlanPrice: 16000,
        membershipBillingType: 'autopay',
        membershipStartDate: new Date('2025-06-01'),
        membershipNextPaymentDate: new Date('2026-02-15'),
        eventName: null,
        eventType: null,
      };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getTransactionById).mockResolvedValue(mockTransaction as never);

      const { get } = await import('./Transactions');
      const result = await callHandler(get, { id: 'txn_1' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getTransactionById).toHaveBeenCalledWith('txn_1', 'test-org-456');
      expect(result).toEqual({ transaction: mockTransaction });
    });

    it('should throw 404 when transaction not found', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getTransactionById } = await import('@/services/TransactionsService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getTransactionById).mockResolvedValue(null);

      const { get } = await import('./Transactions');

      await expect(callHandler(get, { id: 'nonexistent-id' })).rejects.toThrow(
        expect.objectContaining({
          message: 'Transaction not found',
        }),
      );
    });

    it('should rethrow ORPCError from guardRole', async () => {
      const { guardRole } = await import('./AuthGuards');
      const error = new ORPCError('UNAUTHORIZED', {
        message: 'Insufficient permissions',
      });
      vi.mocked(guardRole).mockRejectedValue(error);

      const { get } = await import('./Transactions');

      await expect(callHandler(get, { id: 'txn_1' })).rejects.toThrow(error);
    });

    it('should wrap service errors as 500 ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getTransactionById } = await import('@/services/TransactionsService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getTransactionById).mockRejectedValue(new Error('DB connection lost'));

      const { get } = await import('./Transactions');

      await expect(callHandler(get, { id: 'txn_1' })).rejects.toThrow(
        expect.objectContaining({
          message: 'Failed to fetch transaction.',
        }),
      );
    });

    it('should return event details for event registration transactions', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getTransactionById } = await import('@/services/TransactionsService');

      const mockTransaction = {
        id: 'txn_2',
        memberId: 'member_2',
        memberFirstName: 'Jane',
        memberLastName: 'Smith',
        memberType: 'individual',
        transactionType: 'event_registration',
        amount: 5000,
        currency: 'USD',
        status: 'paid',
        paymentMethod: 'card',
        description: 'BJJ Seminar Registration',
        providerTransactionId: null,
        processedAt: new Date('2026-01-20'),
        createdAt: new Date('2026-01-20'),
        membershipPlanName: null,
        membershipPlanFrequency: null,
        membershipPlanPrice: null,
        membershipBillingType: null,
        membershipStartDate: null,
        membershipNextPaymentDate: null,
        eventName: 'BJJ Fundamentals Seminar',
        eventType: 'seminar',
      };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getTransactionById).mockResolvedValue(mockTransaction as never);

      const { get } = await import('./Transactions');
      const result = await callHandler(get, { id: 'txn_2' });

      expect(result).toEqual({ transaction: mockTransaction });
    });
  });

  describe('refund', () => {
    const adminContext: AuditContext = {
      userId: 'test-user-123',
      orgId: 'test-org-456',
      role: 'org:admin',
    };

    it('refunds the transaction and emits a success audit event', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { refundTransaction } = await import('@/services/MemberPaymentService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(refundTransaction).mockResolvedValue({
        refundTransactionId: 'refund-tx-1',
        originalTransactionId: '11111111-1111-1111-1111-111111111111',
        decrementedCoupons: 1,
        providerReversal: 'void',
        reversedTransactionIds: ['11111111-1111-1111-1111-111111111111'],
      });

      const { refund } = await import('./Transactions');
      const result = await callHandler(refund, { transactionId: '11111111-1111-1111-1111-111111111111' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ADMIN);

      const { resolvePaymentProviderConfig } = await import('@/services/PaymentProviderConfigService');

      expect(resolvePaymentProviderConfig).toHaveBeenCalledWith('test-org-456');
      expect(refundTransaction).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', 'test-org-456', mockPaymentConfig);
      expect(audit).toHaveBeenCalledWith(
        adminContext,
        'transaction.refund',
        'transaction',
        expect.objectContaining({
          entityId: '11111111-1111-1111-1111-111111111111',
          status: 'success',
        }),
      );
      expect(result).toEqual({
        refundTransactionId: 'refund-tx-1',
        originalTransactionId: '11111111-1111-1111-1111-111111111111',
        decrementedCoupons: 1,
        providerReversal: 'void',
        reversedTransactionIds: ['11111111-1111-1111-1111-111111111111'],
      });
    });

    it('maps TransactionNotFoundError to a 404 ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { refundTransaction, TransactionNotFoundError } = await import('@/services/MemberPaymentService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(refundTransaction).mockRejectedValue(new TransactionNotFoundError('11111111-1111-1111-1111-111111111111'));

      const { refund } = await import('./Transactions');

      await expect(callHandler(refund, { transactionId: '11111111-1111-1111-1111-111111111111' }))
        .rejects
        .toBeInstanceOf(ORPCError);
    });

    it('maps TransactionAlreadyRefundedError to a 409 ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { refundTransaction, TransactionAlreadyRefundedError } = await import('@/services/MemberPaymentService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(refundTransaction).mockRejectedValue(new TransactionAlreadyRefundedError('11111111-1111-1111-1111-111111111111'));

      const { refund } = await import('./Transactions');

      await expect(callHandler(refund, { transactionId: '11111111-1111-1111-1111-111111111111' }))
        .rejects
        .toBeInstanceOf(ORPCError);
    });

    it.each([
      ['TransactionNotRefundableError', 409, 'TransactionNotRefundableError'],
      ['TransactionReversalFailedError', 422, 'TransactionReversalFailedError'],
    ] as const)('maps %s to a %i ORPCError and audits the failure', async (_label, status, errorName) => {
      const { guardRole } = await import('./AuthGuards');
      const service = await import('@/services/MemberPaymentService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      const error = errorName === 'TransactionNotRefundableError'
        ? new service.TransactionNotRefundableError('11111111-1111-1111-1111-111111111111', 'it was declined.')
        : new service.TransactionReversalFailedError('The payment provider did not reverse this charge. Processor said no');
      vi.mocked(service.refundTransaction).mockRejectedValue(error);

      const { refund } = await import('./Transactions');
      const promise = callHandler(refund, { transactionId: '11111111-1111-1111-1111-111111111111' });

      await expect(promise).rejects.toBeInstanceOf(ORPCError);
      await expect(promise).rejects.toMatchObject({ status, message: error.message });
      expect(audit).toHaveBeenCalledWith(
        adminContext,
        'transaction.refund',
        'transaction',
        expect.objectContaining({ status: 'failure', error: error.message }),
      );
    });
  });

  describe('retry', () => {
    const TX = '22222222-2222-2222-2222-222222222222';

    it('requires FRONT_DESK and audits a completed retry with its outcome', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { retryFailedTransaction } = await import('@/services/PaymentRetryService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(retryFailedTransaction).mockResolvedValue({ status: 'declined', retryTransactionId: 'r1', declineReason: 'Do not honor', membershipReactivated: false });

      const { retry } = await import('./Transactions');
      const result = await callHandler(retry, { transactionId: TX });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(retryFailedTransaction).toHaveBeenCalledWith(TX, 'test-org-456', mockPaymentConfig);
      expect(result).toMatchObject({ status: 'declined', declineReason: 'Do not honor' });
      expect(audit).toHaveBeenCalledWith(mockContext, 'transaction.retry', 'transaction', expect.objectContaining({
        entityId: TX,
        status: 'success',
        changes: { outcome: { before: 'declined', after: 'declined' }, retryTransactionId: { before: null, after: 'r1' } },
      }));
    });

    it.each([
      ['TransactionNotFoundError', 404],
      ['TransactionNotRetryableError', 409],
      ['TransactionRetryInProgressError', 409],
      ['RetryProviderUnavailableError', 503],
      ['TransactionRetryFailedError', 422],
    ] as const)('maps %s to %i and audits the failure', async (name, status) => {
      const { guardRole } = await import('./AuthGuards');
      const retrySvc = await import('@/services/PaymentRetryService');
      const memberSvc = await import('@/services/MemberPaymentService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(mockContext);
      const errors: Record<string, Error> = {
        TransactionNotFoundError: new memberSvc.TransactionNotFoundError(TX),
        TransactionNotRetryableError: new retrySvc.TransactionNotRetryableError('Only declined payments can be retried.'),
        TransactionRetryInProgressError: new retrySvc.TransactionRetryInProgressError(),
        RetryProviderUnavailableError: new retrySvc.RetryProviderUnavailableError(),
        TransactionRetryFailedError: new retrySvc.TransactionRetryFailedError('No saved payment method.'),
      };
      vi.mocked(retrySvc.retryFailedTransaction).mockRejectedValue(errors[name]);

      const { retry } = await import('./Transactions');
      const promise = callHandler(retry, { transactionId: TX });

      await expect(promise).rejects.toMatchObject({ status, message: errors[name]!.message });
      expect(audit).toHaveBeenCalledWith(mockContext, 'transaction.retry', 'transaction', expect.objectContaining({ status: 'failure' }));
    });

    it('rethrows an unknown error untouched and audits a non-Error as Unknown', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { retryFailedTransaction } = await import('@/services/PaymentRetryService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(retryFailedTransaction).mockRejectedValue('boom');

      const { retry } = await import('./Transactions');

      await expect(callHandler(retry, { transactionId: TX })).rejects.toBe('boom');
      expect(audit).toHaveBeenCalledWith(mockContext, 'transaction.retry', 'transaction', expect.objectContaining({ error: 'Unknown error' }));
    });
  });

  describe('retryQuote', () => {
    const TX = '33333333-3333-3333-3333-333333333333';

    it('requires FRONT_DESK and returns the quote', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getRetryQuote } = await import('@/services/PaymentRetryService');
      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getRetryQuote).mockResolvedValue({ transactionId: TX, autoRetriesRemaining: 2 } as never);

      const { retryQuote } = await import('./Transactions');

      await expect(callHandler(retryQuote, { transactionId: TX })).resolves.toMatchObject({ autoRetriesRemaining: 2 });
      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getRetryQuote).toHaveBeenCalledWith(TX, 'test-org-456', mockPaymentConfig);
    });

    it('maps a not-retryable row to 409', async () => {
      const { guardRole } = await import('./AuthGuards');
      const retrySvc = await import('@/services/PaymentRetryService');
      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(retrySvc.getRetryQuote).mockRejectedValue(new retrySvc.TransactionNotRetryableError('already been collected'));

      const { retryQuote } = await import('./Transactions');

      await expect(callHandler(retryQuote, { transactionId: TX })).rejects.toMatchObject({ status: 409 });
    });
  });
});
