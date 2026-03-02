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
      ];

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getOrganizationTransactions).mockResolvedValue(mockTransactions);

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
        iqproTransactionId: 'iqpro_123',
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
      vi.mocked(getTransactionById).mockResolvedValue(mockTransaction);

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
        iqproTransactionId: null,
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
      vi.mocked(getTransactionById).mockResolvedValue(mockTransaction);

      const { get } = await import('./Transactions');
      const result = await callHandler(get, { id: 'txn_2' });

      expect(result).toEqual({ transaction: mockTransaction });
    });
  });
});
