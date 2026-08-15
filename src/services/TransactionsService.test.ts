import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB and Schema modules
vi.mock('@/libs/DB', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/models/Schema', () => ({
  memberSchema: {
    id: 'member.id',
    firstName: 'member.firstName',
    lastName: 'member.lastName',
    memberType: 'member.memberType',
  },
  transactionSchema: {
    id: 'transaction.id',
    organizationId: 'transaction.organizationId',
    memberId: 'transaction.memberId',
    memberMembershipId: 'transaction.memberMembershipId',
    eventRegistrationId: 'transaction.eventRegistrationId',
    transactionType: 'transaction.transactionType',
    amount: 'transaction.amount',
    currency: 'transaction.currency',
    status: 'transaction.status',
    paymentMethod: 'transaction.paymentMethod',
    description: 'transaction.description',
    providerTransactionId: 'transaction.providerTransactionId',
    processedAt: 'transaction.processedAt',
    createdAt: 'transaction.createdAt',
  },
  memberMembershipSchema: {
    id: 'memberMembership.id',
    membershipPlanId: 'memberMembership.membershipPlanId',
    billingType: 'memberMembership.billingType',
    startDate: 'memberMembership.startDate',
    nextPaymentDate: 'memberMembership.nextPaymentDate',
  },
  membershipPlanSchema: {
    id: 'membershipPlan.id',
    name: 'membershipPlan.name',
    frequency: 'membershipPlan.frequency',
    price: 'membershipPlan.price',
  },
  eventRegistrationSchema: {
    id: 'eventRegistration.id',
    eventId: 'eventRegistration.eventId',
  },
  eventSchema: {
    id: 'event.id',
    name: 'event.name',
    eventType: 'event.eventType',
  },
}));

describe('TransactionsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrganizationTransactions', () => {
    it('should return transactions with default options (no filters)', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          memberId: 'member-1',
          memberFirstName: 'John',
          memberLastName: 'Doe',
          transactionType: 'payment',
          amount: 10000,
          currency: 'USD',
          status: 'completed',
          paymentMethod: 'credit_card',
          description: 'Monthly membership',
          processedAt: new Date('2026-01-15'),
          createdAt: new Date('2026-01-15'),
        },
        {
          id: 'txn-2',
          memberId: 'member-2',
          memberFirstName: 'Jane',
          memberLastName: 'Smith',
          transactionType: 'refund',
          amount: 5000,
          currency: 'USD',
          status: 'completed',
          paymentMethod: 'credit_card',
          description: 'Partial refund',
          processedAt: new Date('2026-01-14'),
          createdAt: new Date('2026-01-14'),
        },
      ];

      const mockOffset = vi.fn().mockResolvedValue(mockTransactions);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockMemberJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const { getOrganizationTransactions } = await import('./TransactionsService');

      const result = await getOrganizationTransactions('org-test-123');

      expect(result).toEqual(mockTransactions);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockMemberJoin).toHaveBeenCalledTimes(1);
      expect(mockWhere).toHaveBeenCalledTimes(1);
      expect(mockOrderBy).toHaveBeenCalledTimes(1);
      expect(mockLimit).toHaveBeenCalledWith(500);
      expect(mockOffset).toHaveBeenCalledWith(0);
    });

    it('returns guest/non-member transactions (null member) via the leftJoin', async () => {
      // A kiosk store sale has member_id = NULL and no member row. The leftJoin
      // must keep it in the list (an innerJoin would drop it) with null names.
      const mockTransactions = [
        {
          id: 'txn-guest',
          memberId: null,
          memberFirstName: null,
          memberLastName: null,
          transactionType: 'adjustment',
          amount: 8000,
          currency: 'USD',
          status: 'paid',
          paymentMethod: 'card',
          description: 'Store: Black Belt — John Customer',
          processedAt: new Date('2026-01-20'),
          createdAt: new Date('2026-01-20'),
        },
      ];

      const mockOffset = vi.fn().mockResolvedValue(mockTransactions);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockMemberJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockSelect() as any);

      const { getOrganizationTransactions } = await import('./TransactionsService');
      const result = await getOrganizationTransactions('org-test-123');

      expect(result).toEqual(mockTransactions);
      expect(result[0]?.memberId).toBeNull();
      expect(result[0]?.memberFirstName).toBeNull();
      expect(mockMemberJoin).toHaveBeenCalledTimes(1);
    });

    it('should filter by status when provided', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          memberId: 'member-1',
          memberFirstName: 'John',
          memberLastName: 'Doe',
          transactionType: 'payment',
          amount: 10000,
          currency: 'USD',
          status: 'pending',
          paymentMethod: 'credit_card',
          description: 'Monthly membership',
          processedAt: null,
          createdAt: new Date('2026-01-15'),
        },
      ];

      const mockOffset = vi.fn().mockResolvedValue(mockTransactions);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockMemberJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockSelect() as any);

      const { getOrganizationTransactions } = await import('./TransactionsService');

      const result = await getOrganizationTransactions('org-test-123', {
        status: 'pending',
      });

      expect(result).toEqual(mockTransactions);
      expect(mockWhere).toHaveBeenCalledTimes(1);
      expect(mockLimit).toHaveBeenCalledWith(500);
    });

    it('should filter by transactionType when provided', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          memberId: 'member-1',
          memberFirstName: 'John',
          memberLastName: 'Doe',
          transactionType: 'refund',
          amount: 5000,
          currency: 'USD',
          status: 'completed',
          paymentMethod: 'credit_card',
          description: 'Refund',
          processedAt: new Date('2026-01-15'),
          createdAt: new Date('2026-01-15'),
        },
      ];

      const mockOffset = vi.fn().mockResolvedValue(mockTransactions);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockMemberJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockSelect() as any);

      const { getOrganizationTransactions } = await import('./TransactionsService');

      const result = await getOrganizationTransactions('org-test-123', {
        transactionType: 'refund',
      });

      expect(result).toEqual(mockTransactions);
      expect(mockWhere).toHaveBeenCalledTimes(1);
      expect(mockLimit).toHaveBeenCalledWith(500);
    });

    it('should use custom limit and offset', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          memberId: 'member-1',
          memberFirstName: 'John',
          memberLastName: 'Doe',
          transactionType: 'payment',
          amount: 10000,
          currency: 'USD',
          status: 'completed',
          paymentMethod: 'credit_card',
          description: 'Monthly membership',
          processedAt: new Date('2026-01-15'),
          createdAt: new Date('2026-01-15'),
        },
      ];

      const mockOffset = vi.fn().mockResolvedValue(mockTransactions);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockMemberJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockSelect() as any);

      const { getOrganizationTransactions } = await import('./TransactionsService');

      const result = await getOrganizationTransactions('org-test-123', {
        limit: 50,
        offset: 100,
      });

      expect(result).toEqual(mockTransactions);
      expect(mockOffset).toHaveBeenCalledWith(100);
      expect(mockLimit).toHaveBeenCalledWith(50);
    });

    it('should return empty array when no results', async () => {
      const mockTransactions: any[] = [];

      const mockOffset = vi.fn().mockResolvedValue(mockTransactions);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockMemberJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockSelect() as any);

      const { getOrganizationTransactions } = await import('./TransactionsService');

      const result = await getOrganizationTransactions('org-test-123');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('should filter by both status and transactionType when provided', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          memberId: 'member-1',
          memberFirstName: 'John',
          memberLastName: 'Doe',
          transactionType: 'refund',
          amount: 5000,
          currency: 'USD',
          status: 'pending',
          paymentMethod: 'credit_card',
          description: 'Pending refund',
          processedAt: null,
          createdAt: new Date('2026-01-15'),
        },
      ];

      const mockOffset = vi.fn().mockResolvedValue(mockTransactions);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockMemberJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockSelect() as any);

      const { getOrganizationTransactions } = await import('./TransactionsService');

      const result = await getOrganizationTransactions('org-test-123', {
        status: 'pending',
        transactionType: 'refund',
      });

      expect(result).toEqual(mockTransactions);
      expect(mockWhere).toHaveBeenCalledTimes(1);
    });

    it('should handle null values in optional fields', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          memberId: 'member-1',
          memberFirstName: null,
          memberLastName: null,
          transactionType: 'payment',
          amount: 10000,
          currency: 'USD',
          status: 'completed',
          paymentMethod: null,
          description: null,
          processedAt: null,
          createdAt: new Date('2026-01-15'),
        },
      ];

      const mockOffset = vi.fn().mockResolvedValue(mockTransactions);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockMemberJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockSelect() as any);

      const { getOrganizationTransactions } = await import('./TransactionsService');

      const result = await getOrganizationTransactions('org-test-123');

      expect(result).toEqual(mockTransactions);
      expect(result[0]?.memberFirstName).toBeNull();
      expect(result[0]?.memberLastName).toBeNull();
      expect(result[0]?.paymentMethod).toBeNull();
      expect(result[0]?.description).toBeNull();
      expect(result[0]?.processedAt).toBeNull();
    });
  });

  describe('getTransactionById', () => {
    it('should return transaction with membership details', async () => {
      const mockRow = {
        id: 'txn-1',
        memberId: 'member-1',
        memberFirstName: 'John',
        memberLastName: 'Smith',
        memberType: 'individual',
        transactionType: 'membership_payment',
        amount: 16000,
        currency: 'USD',
        status: 'paid',
        paymentMethod: 'card',
        description: 'Monthly payment',
        providerTransactionId: 'iqpro_1',
        processedAt: new Date('2025-04-15'),
        createdAt: new Date('2025-04-15'),
        membershipPlanName: 'Adult BJJ Monthly',
        membershipPlanFrequency: 'Monthly',
        membershipPlanPrice: 16000,
        membershipBillingType: 'autopay',
        membershipStartDate: new Date('2025-01-01'),
        membershipNextPaymentDate: new Date('2025-05-15'),
        eventName: null,
        eventType: null,
      };

      const mockLimit = vi.fn().mockResolvedValue([mockRow]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockLeftJoin4 = vi.fn().mockReturnValue({ where: mockWhere });
      const mockLeftJoin3 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin4 });
      const mockLeftJoin2 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin3 });
      const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
      const mockMemberJoin = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockSelect() as any);

      const { getTransactionById } = await import('./TransactionsService');
      const result = await getTransactionById('txn-1', 'org-test-123');

      expect(result).toEqual(mockRow);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(mockMemberJoin).toHaveBeenCalledTimes(1);
      expect(mockLeftJoin1).toHaveBeenCalledTimes(1);
      expect(mockLeftJoin2).toHaveBeenCalledTimes(1);
      expect(mockLeftJoin3).toHaveBeenCalledTimes(1);
      expect(mockLeftJoin4).toHaveBeenCalledTimes(1);
      expect(mockLimit).toHaveBeenCalledWith(1);
    });

    it('should return transaction with event details', async () => {
      const mockRow = {
        id: 'txn-2',
        memberId: 'member-2',
        memberFirstName: 'Jane',
        memberLastName: 'Doe',
        memberType: 'individual',
        transactionType: 'event_registration',
        amount: 5000,
        currency: 'USD',
        status: 'paid',
        paymentMethod: 'card',
        description: 'Seminar registration',
        providerTransactionId: null,
        processedAt: new Date('2025-04-20'),
        createdAt: new Date('2025-04-20'),
        membershipPlanName: null,
        membershipPlanFrequency: null,
        membershipPlanPrice: null,
        membershipBillingType: null,
        membershipStartDate: null,
        membershipNextPaymentDate: null,
        eventName: 'BJJ Fundamentals Seminar',
        eventType: 'seminar',
      };

      const mockLimit = vi.fn().mockResolvedValue([mockRow]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockLeftJoin4 = vi.fn().mockReturnValue({ where: mockWhere });
      const mockLeftJoin3 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin4 });
      const mockLeftJoin2 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin3 });
      const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
      const mockMemberJoin = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockSelect() as any);

      const { getTransactionById } = await import('./TransactionsService');
      const result = await getTransactionById('txn-2', 'org-test-123');

      expect(result).toEqual(mockRow);
      expect(result?.eventName).toBe('BJJ Fundamentals Seminar');
      expect(result?.eventType).toBe('seminar');
      expect(result?.membershipPlanName).toBeNull();
    });

    it('should return null when transaction not found', async () => {
      const mockLimit = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockLeftJoin4 = vi.fn().mockReturnValue({ where: mockWhere });
      const mockLeftJoin3 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin4 });
      const mockLeftJoin2 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin3 });
      const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
      const mockMemberJoin = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockSelect() as any);

      const { getTransactionById } = await import('./TransactionsService');
      const result = await getTransactionById('nonexistent', 'org-test-123');

      expect(result).toBeNull();
    });

    it('should return base fields when no membership or event FK', async () => {
      const mockRow = {
        id: 'txn-3',
        memberId: 'member-3',
        memberFirstName: 'Bob',
        memberLastName: 'Jones',
        memberType: 'individual',
        transactionType: 'refund',
        amount: 3000,
        currency: 'USD',
        status: 'paid',
        paymentMethod: 'card',
        description: 'Refund for overpayment',
        providerTransactionId: null,
        processedAt: new Date('2025-04-25'),
        createdAt: new Date('2025-04-25'),
        membershipPlanName: null,
        membershipPlanFrequency: null,
        membershipPlanPrice: null,
        membershipBillingType: null,
        membershipStartDate: null,
        membershipNextPaymentDate: null,
        eventName: null,
        eventType: null,
      };

      const mockLimit = vi.fn().mockResolvedValue([mockRow]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockLeftJoin4 = vi.fn().mockReturnValue({ where: mockWhere });
      const mockLeftJoin3 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin4 });
      const mockLeftJoin2 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin3 });
      const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
      const mockMemberJoin = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockMemberJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockSelect() as any);

      const { getTransactionById } = await import('./TransactionsService');
      const result = await getTransactionById('txn-3', 'org-test-123');

      expect(result).toEqual(mockRow);
      expect(result?.membershipPlanName).toBeNull();
      expect(result?.eventName).toBeNull();
    });
  });
});
