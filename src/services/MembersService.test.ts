import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/libs/DB', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'new-id' }])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'member-123', email: 'updated@example.com' }])),
        })),
      })),
    })),
  },
}));

vi.mock('@/models/Schema', () => ({
  memberSchema: {
    id: 'id',
    organizationId: 'organization_id',
    firstName: 'first_name',
    lastName: 'last_name',
  },
  addressSchema: {
    id: 'id',
    memberId: 'member_id',
    isDefault: 'is_default',
  },
  paymentMethodSchema: {
    id: 'id',
    memberId: 'member_id',
    type: 'type',
    last4: 'last4',
    isDefault: 'is_default',
  },
  transactionSchema: {
    id: 'id',
    memberId: 'member_id',
    organizationId: 'organization_id',
    transactionType: 'transaction_type',
    amount: 'amount',
    currency: 'currency',
    status: 'status',
    paymentMethod: 'payment_method',
    description: 'description',
    processedAt: 'processed_at',
    createdAt: 'created_at',
  },
}));

vi.mock('@/services/TransactionsService', () => ({}));

describe('MembersService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateMemberContactInfo', () => {
    it('should update member email and phone', async () => {
      const { updateMemberContactInfo } = await import('./MembersService');
      const input = {
        id: 'member-123',
        email: 'updated@example.com',
        phone: '(555) 999-8888',
      };

      const result = await updateMemberContactInfo(input, 'org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('member-123');
    });

    it('should handle null phone value', async () => {
      const { updateMemberContactInfo } = await import('./MembersService');
      const input = {
        id: 'member-123',
        email: 'updated@example.com',
        phone: null,
      };

      const result = await updateMemberContactInfo(input, 'org-123');

      expect(result).toHaveLength(1);
    });

    it('should update member with address when provided', async () => {
      const { updateMemberContactInfo } = await import('./MembersService');
      const input = {
        id: 'member-123',
        email: 'updated@example.com',
        phone: '(555) 999-8888',
        address: {
          street: '456 New St',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90001',
          country: 'US',
        },
      };

      const result = await updateMemberContactInfo(input, 'org-123');

      expect(result).toHaveLength(1);
    });

    it('should not update address if incomplete', async () => {
      const { updateMemberContactInfo } = await import('./MembersService');
      const input = {
        id: 'member-123',
        email: 'updated@example.com',
        phone: '(555) 999-8888',
        address: {
          street: '456 New St',
          city: '',
          state: '',
          zipCode: '',
          country: 'US',
        },
      };

      const result = await updateMemberContactInfo(input, 'org-123');

      expect(result).toHaveLength(1);
    });
  });

  describe('updateMemberStatus', () => {
    it('should update member status', async () => {
      const { updateMemberStatus } = await import('./MembersService');

      const result = await updateMemberStatus('member-123', 'org-123', 'active');

      expect(result).toBeDefined();
    });
  });

  describe('updateMember', () => {
    it('should update member with provided data', async () => {
      const { updateMember } = await import('./MembersService');
      const input = {
        id: 'member-123',
        email: 'new@example.com',
        firstName: 'John',
        lastName: 'Doe',
        status: 'active',
      };

      const result = await updateMember(input, 'org-123');

      expect(result).toBeDefined();
    });
  });

  describe('getMemberPaymentMethods', () => {
    it('should return payment methods for a member', async () => {
      const { db } = await import('@/libs/DB');
      const mockPaymentMethods = [
        { id: 'pm-1', type: 'card', last4: '4242', isDefault: true },
        { id: 'pm-2', type: 'bank_transfer', last4: '6789', isDefault: false },
      ];

      const mockOrderBy = vi.fn(() => Promise.resolve(mockPaymentMethods));
      const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getMemberPaymentMethods } = await import('./MembersService');
      const result = await getMemberPaymentMethods('member-123');

      expect(result).toEqual(mockPaymentMethods);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return empty array when no payment methods exist', async () => {
      const { db } = await import('@/libs/DB');

      const mockOrderBy = vi.fn(() => Promise.resolve([]));
      const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getMemberPaymentMethods } = await import('./MembersService');
      const result = await getMemberPaymentMethods('member-no-pm');

      expect(result).toEqual([]);
    });
  });

  describe('getMemberTransactions', () => {
    it('should return transactions for a member', async () => {
      const { db } = await import('@/libs/DB');
      const mockTransactions = [
        {
          id: 'tx-1',
          memberId: 'member-123',
          memberFirstName: 'John',
          memberLastName: 'Doe',
          transactionType: 'membership_payment',
          amount: 150,
          currency: 'USD',
          status: 'paid',
          paymentMethod: 'card',
          description: 'Monthly membership',
          processedAt: new Date(),
          createdAt: new Date(),
        },
      ];

      const mockLimit = vi.fn(() => Promise.resolve(mockTransactions));
      const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
      const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getMemberTransactions } = await import('./MembersService');
      const result = await getMemberTransactions('member-123', 'org-123');

      expect(result).toEqual(mockTransactions);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return empty array when no transactions exist', async () => {
      const { db } = await import('@/libs/DB');

      const mockLimit = vi.fn(() => Promise.resolve([]));
      const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
      const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getMemberTransactions } = await import('./MembersService');
      const result = await getMemberTransactions('member-no-tx', 'org-123');

      expect(result).toEqual([]);
    });

    it('should respect custom limit parameter', async () => {
      const { db } = await import('@/libs/DB');

      const mockLimit = vi.fn(() => Promise.resolve([]));
      const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
      const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getMemberTransactions } = await import('./MembersService');
      await getMemberTransactions('member-123', 'org-123', 10);

      expect(mockLimit).toHaveBeenCalledWith(10);
    });
  });
});
