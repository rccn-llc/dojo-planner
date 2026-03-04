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
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
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
    memberType: 'member_type',
    status: 'status',
    email: 'email',
    phone: 'phone',
    photoUrl: 'photo_url',
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
  familyMemberSchema: {
    memberId: 'member_id',
    relatedMemberId: 'related_member_id',
    relationship: 'relationship',
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

  describe('getHeadOfHouseholdMembers', () => {
    it('should return HOH members for the organization', async () => {
      const { db } = await import('@/libs/DB');
      const mockHOHMembers = [
        { id: 'hoh-1', firstName: 'John', lastName: 'Doe', email: 'john@test.com', phone: '555-1234', photoUrl: null, status: 'active' },
        { id: 'hoh-2', firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', phone: '555-5678', photoUrl: null, status: 'trial' },
      ];

      const mockWhere = vi.fn(() => Promise.resolve(mockHOHMembers));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getHeadOfHouseholdMembers } = await import('./MembersService');
      const result = await getHeadOfHouseholdMembers('org-123');

      expect(result).toEqual(mockHOHMembers);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return empty array when no HOH members exist', async () => {
      const { db } = await import('@/libs/DB');

      const mockWhere = vi.fn(() => Promise.resolve([]));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getHeadOfHouseholdMembers } = await import('./MembersService');
      const result = await getHeadOfHouseholdMembers('org-no-hoh');

      expect(result).toEqual([]);
    });
  });

  describe('linkFamilyMember', () => {
    it('should insert a family member relationship', async () => {
      const { db } = await import('@/libs/DB');
      const mockResult = [{ id: 'family-link-1' }];

      const mockReturning = vi.fn(() => Promise.resolve(mockResult));
      const mockValues = vi.fn(() => ({ returning: mockReturning }));
      vi.mocked(db.insert).mockReturnValue({ values: mockValues } as never);

      const { linkFamilyMember } = await import('./MembersService');
      const result = await linkFamilyMember('hoh-123', 'member-456', 'family-member');

      expect(result).toEqual(mockResult);
      expect(db.insert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith({
        memberId: 'hoh-123',
        relatedMemberId: 'member-456',
        relationship: 'family-member',
      });
    });
  });

  describe('getFamilyMembers', () => {
    it('should return family members for an HOH', async () => {
      const { db } = await import('@/libs/DB');
      const mockFamilyMembers = [
        { id: 'fm-1', firstName: 'Alice', lastName: 'Doe', email: 'alice@test.com', photoUrl: null, status: 'active', relationship: 'family-member' },
      ];

      const mockWhere = vi.fn(() => Promise.resolve(mockFamilyMembers));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getFamilyMembers } = await import('./MembersService');
      const result = await getFamilyMembers('hoh-123');

      expect(result).toEqual(mockFamilyMembers);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return empty array when HOH has no family members', async () => {
      const { db } = await import('@/libs/DB');

      const mockWhere = vi.fn(() => Promise.resolve([]));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getFamilyMembers } = await import('./MembersService');
      const result = await getFamilyMembers('hoh-no-family');

      expect(result).toEqual([]);
    });
  });

  describe('unlinkFamilyMember', () => {
    it('should delete a family member relationship and return result', async () => {
      const { db } = await import('@/libs/DB');
      const mockResult = [{ memberId: 'hoh-123', relatedMemberId: 'fm-456' }];

      const mockReturning = vi.fn(() => Promise.resolve(mockResult));
      const mockWhere = vi.fn(() => ({ returning: mockReturning }));
      (vi.mocked(db) as any).delete.mockReturnValue({ where: mockWhere } as never);

      const { unlinkFamilyMember } = await import('./MembersService');
      const result = await unlinkFamilyMember('hoh-123', 'fm-456');

      expect(result).toEqual(mockResult);
      expect(db.delete).toHaveBeenCalled();
    });

    it('should return empty array when no matching relationship exists', async () => {
      const { db } = await import('@/libs/DB');

      const mockReturning = vi.fn(() => Promise.resolve([]));
      const mockWhere = vi.fn(() => ({ returning: mockReturning }));
      (vi.mocked(db) as any).delete.mockReturnValue({ where: mockWhere } as never);

      const { unlinkFamilyMember } = await import('./MembersService');
      const result = await unlinkFamilyMember('hoh-999', 'fm-999');

      expect(result).toEqual([]);
    });
  });

  describe('getHOHForFamilyMember', () => {
    it('should return HOH data for a family member', async () => {
      const { db } = await import('@/libs/DB');
      const mockHOH = {
        id: 'hoh-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        phone: '555-1234',
        photoUrl: null,
        status: 'active',
      };

      const mockLimit = vi.fn(() => Promise.resolve([mockHOH]));
      const mockWhere = vi.fn(() => ({ limit: mockLimit }));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getHOHForFamilyMember } = await import('./MembersService');
      const result = await getHOHForFamilyMember('fm-123');

      expect(result).toEqual(mockHOH);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when no HOH found for a member', async () => {
      const { db } = await import('@/libs/DB');

      const mockLimit = vi.fn(() => Promise.resolve([]));
      const mockWhere = vi.fn(() => ({ limit: mockLimit }));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getHOHForFamilyMember } = await import('./MembersService');
      const result = await getHOHForFamilyMember('member-not-family');

      expect(result).toBeNull();
    });
  });
});
