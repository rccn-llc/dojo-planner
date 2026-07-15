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
    transaction: vi.fn(),
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
    firstSix: 'first_six',
    last4: 'last4',
    accountType: 'account_type',
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
  memberMembershipSchema: {
    memberId: 'member_id',
    membershipPlanId: 'membership_plan_id',
    status: 'status',
  },
  membershipPlanSchema: {
    id: 'id',
    name: 'name',
    price: 'price',
    frequency: 'frequency',
  },
}));

vi.mock('@/services/TransactionsService', () => ({}));

describe('MembersService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addMemberMembership', () => {
    it('throws MemberOnHoldError when the member is on hold', async () => {
      const { db } = await import('@/libs/DB');
      // The member-status lookup returns a held member.
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([{ status: 'hold' }])) })),
        })),
      } as never);

      const { addMemberMembership, MemberOnHoldError } = await import('./MembersService');

      await expect(addMemberMembership('member-123', 'plan-1')).rejects.toBeInstanceOf(MemberOnHoldError);
      // The insert must not run for a held member.
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('inserts an active membership when the member is not on hold', async () => {
      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([{ status: 'active' }])) })),
        })),
      } as never);

      const returning = vi.fn(() => Promise.resolve([{ id: 'mm-1' }]));
      const values = vi.fn(() => ({ returning }));
      vi.mocked(db.insert).mockReturnValue({ values } as never);

      const { addMemberMembership } = await import('./MembersService');
      const result = await addMemberMembership('member-123', 'plan-1');

      expect(db.insert).toHaveBeenCalled();
      expect(values).toHaveBeenCalledWith(expect.objectContaining({
        memberId: 'member-123',
        membershipPlanId: 'plan-1',
        status: 'active',
      }));
      expect(result).toEqual([{ id: 'mm-1' }]);
    });
  });

  describe('updateMemberContactInfo', () => {
    it('should update member email and phone', async () => {
      const { updateMemberContactInfo } = await import('./MembersService');
      const input = {
        id: 'member-123',
        firstName: 'Test',
        lastName: 'Member',
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
        firstName: 'Test',
        lastName: 'Member',
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
        firstName: 'Test',
        lastName: 'Member',
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
        firstName: 'Test',
        lastName: 'Member',
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

    it('writes dateOfBirth into the member set payload when provided', async () => {
      const { db } = await import('@/libs/DB');
      const setSpy = vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'member-123', email: 'updated@example.com' }])),
        })),
      }));
      vi.mocked(db.update).mockReturnValueOnce({ set: setSpy } as any);

      const { updateMemberContactInfo } = await import('./MembersService');
      const dob = new Date('1990-01-15');
      await updateMemberContactInfo({
        id: 'member-123',
        firstName: 'Test',
        lastName: 'Member',
        email: 'updated@example.com',
        phone: '(555) 999-8888',
        dateOfBirth: dob,
      }, 'org-123');

      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
        email: 'updated@example.com',
        phone: '(555) 999-8888',
        dateOfBirth: dob,
      }));
    });

    it('does not include dateOfBirth in the set payload when omitted', async () => {
      const { db } = await import('@/libs/DB');
      const setSpy = vi.fn((..._args: unknown[]) => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'member-123', email: 'updated@example.com' }])),
        })),
      }));
      vi.mocked(db.update).mockReturnValueOnce({ set: setSpy } as any);

      const { updateMemberContactInfo } = await import('./MembersService');
      await updateMemberContactInfo({
        id: 'member-123',
        firstName: 'Test',
        lastName: 'Member',
        email: 'updated@example.com',
        phone: '(555) 999-8888',
      }, 'org-123');

      const payload = setSpy.mock.calls[0]?.[0] as Record<string, unknown> | undefined;

      expect(payload).toBeDefined();
      expect(payload).not.toHaveProperty('dateOfBirth');
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

  describe('updateMemberPhoto', () => {
    it('writes the photoUrl and returns the updated id when the member is in the org', async () => {
      const { db } = await import('@/libs/DB');
      const setSpy = vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'member-123' }])),
        })),
      }));
      vi.mocked(db.update).mockReturnValueOnce({ set: setSpy } as any);

      const { updateMemberPhoto } = await import('./MembersService');
      const result = await updateMemberPhoto({
        id: 'member-123',
        photoUrl: 'data:image/jpeg;base64,/9j/AA',
      }, 'org-123');

      expect(setSpy).toHaveBeenCalledWith({ photoUrl: 'data:image/jpeg;base64,/9j/AA' });
      expect(result).toEqual([{ id: 'member-123' }]);
    });

    it('clears the photoUrl when null is passed', async () => {
      const { db } = await import('@/libs/DB');
      const setSpy = vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'member-123' }])),
        })),
      }));
      vi.mocked(db.update).mockReturnValueOnce({ set: setSpy } as any);

      const { updateMemberPhoto } = await import('./MembersService');
      await updateMemberPhoto({ id: 'member-123', photoUrl: null }, 'org-123');

      expect(setSpy).toHaveBeenCalledWith({ photoUrl: null });
    });

    it('returns an empty array when the member is not in the org (cross-tenant guard)', async () => {
      const { db } = await import('@/libs/DB');
      vi.mocked(db.update).mockReturnValueOnce({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([])),
          })),
        })),
      } as any);

      const { updateMemberPhoto } = await import('./MembersService');
      const result = await updateMemberPhoto({ id: 'member-other-org', photoUrl: null }, 'org-123');

      expect(result).toEqual([]);
    });
  });

  describe('getMemberPaymentMethods', () => {
    it('should return payment methods for a member, including firstSix + accountType', async () => {
      const { db } = await import('@/libs/DB');
      const mockPaymentMethods = [
        { id: 'pm-1', type: 'card', firstSix: '424242', last4: '4242', accountType: null, isDefault: true },
        { id: 'pm-2', type: 'bank_transfer', firstSix: null, last4: '6789', accountType: 'Checking', isDefault: false },
      ];

      const mockOrderBy = vi.fn(() => Promise.resolve(mockPaymentMethods));
      const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getMemberPaymentMethods } = await import('./MembersService');
      const result = await getMemberPaymentMethods('member-123', 'org-123');

      expect(result).toEqual(mockPaymentMethods);
      // The BIN + account-type columns must be part of the projection so the
      // member detail page can render the masked card / Checking-Savings label.
      expect(db.select).toHaveBeenCalledWith(
        expect.objectContaining({
          firstSix: expect.anything(),
          accountType: expect.anything(),
        }),
      );
    });

    it('should return empty array when no payment methods exist', async () => {
      const { db } = await import('@/libs/DB');

      const mockOrderBy = vi.fn(() => Promise.resolve([]));
      const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as never);

      const { getMemberPaymentMethods } = await import('./MembersService');
      const result = await getMemberPaymentMethods('member-no-pm', 'org-123');

      expect(result).toEqual([]);
    });
  });

  // Mocks the org-scoped ownership lookup (findOwnedPaymentMethod) to return the
  // given row, and returns a `tx` recorder for db.transaction assertions.
  function mockOwnershipAndTx(owned: { id: string; isDefault: boolean } | null) {
    const ownershipChain = {
      from: () => ({ innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve(owned ? [owned] : []) }) }) }),
    };
    return ownershipChain;
  }

  describe('deleteMemberPaymentMethod', () => {
    it('returns { deleted: false } when the method is not owned by the member/org', async () => {
      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockOwnershipAndTx(null) as never);

      const { deleteMemberPaymentMethod } = await import('./MembersService');
      const result = await deleteMemberPaymentMethod('pm-x', 'member-1', 'org-1');

      expect(result).toEqual({ deleted: false });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('deletes and promotes another method to default when the deleted one was default', async () => {
      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockOwnershipAndTx({ id: 'pm-1', isDefault: true }) as never);

      const txDelete = vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) }));
      const txUpdateWhere = vi.fn(() => Promise.resolve(undefined));
      const txUpdate = vi.fn(() => ({ set: vi.fn(() => ({ where: txUpdateWhere })) }));
      // Inside the tx, the "remaining methods" lookup returns one row to promote.
      const txSelect = vi.fn(() => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'pm-2' }]) }) }) }));
      vi.mocked(db.transaction).mockImplementation(async (cb: any) =>
        cb({ delete: txDelete, update: txUpdate, select: txSelect }));

      const { deleteMemberPaymentMethod } = await import('./MembersService');
      const result = await deleteMemberPaymentMethod('pm-1', 'member-1', 'org-1');

      expect(result).toEqual({ deleted: true });
      expect(txDelete).toHaveBeenCalled();
      // A remaining method is promoted to default.
      expect(txUpdate).toHaveBeenCalled();
    });

    it('does not promote anything when a non-default method is deleted', async () => {
      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockOwnershipAndTx({ id: 'pm-2', isDefault: false }) as never);

      const txDelete = vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) }));
      const txUpdate = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));
      const txSelect = vi.fn();
      vi.mocked(db.transaction).mockImplementation(async (cb: any) =>
        cb({ delete: txDelete, update: txUpdate, select: txSelect }));

      const { deleteMemberPaymentMethod } = await import('./MembersService');
      const result = await deleteMemberPaymentMethod('pm-2', 'member-1', 'org-1');

      expect(result).toEqual({ deleted: true });
      expect(txDelete).toHaveBeenCalled();
      // No default was removed, so no promotion lookup/update runs.
      expect(txSelect).not.toHaveBeenCalled();
      expect(txUpdate).not.toHaveBeenCalled();
    });
  });

  describe('setPrimaryPaymentMethod', () => {
    it('returns { updated: false } when the method is not owned', async () => {
      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockOwnershipAndTx(null) as never);

      const { setPrimaryPaymentMethod } = await import('./MembersService');
      const result = await setPrimaryPaymentMethod('pm-x', 'member-1', 'org-1');

      expect(result).toEqual({ updated: false });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('unsets all defaults then sets the chosen method as default', async () => {
      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockOwnershipAndTx({ id: 'pm-2', isDefault: false }) as never);

      const setWhere = vi.fn(() => Promise.resolve(undefined));
      const txUpdate = vi.fn(() => ({ set: vi.fn(() => ({ where: setWhere })) }));
      vi.mocked(db.transaction).mockImplementation(async (cb: any) => cb({ update: txUpdate }));

      const { setPrimaryPaymentMethod } = await import('./MembersService');
      const result = await setPrimaryPaymentMethod('pm-2', 'member-1', 'org-1');

      expect(result).toEqual({ updated: true });
      // Two updates: clear all defaults, then set the chosen one.
      expect(txUpdate).toHaveBeenCalledTimes(2);
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

      // First select() resolves the member's family links (may be empty).
      const mockFamilyFrom = vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) }));
      // Second select() is the transaction query.
      const mockLimit = vi.fn(() => Promise.resolve(mockTransactions));
      const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
      const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select)
        .mockReturnValueOnce({ from: mockFamilyFrom } as never)
        .mockReturnValueOnce({ from: mockFrom } as never);

      const { getMemberTransactions } = await import('./MembersService');
      const result = await getMemberTransactions('member-123', 'org-123');

      expect(result).toEqual(mockTransactions);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return empty array when no transactions exist', async () => {
      const { db } = await import('@/libs/DB');

      const mockFamilyFrom = vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) }));
      const mockLimit = vi.fn(() => Promise.resolve([]));
      const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
      const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select)
        .mockReturnValueOnce({ from: mockFamilyFrom } as never)
        .mockReturnValueOnce({ from: mockFrom } as never);

      const { getMemberTransactions } = await import('./MembersService');
      const result = await getMemberTransactions('member-no-tx', 'org-123');

      expect(result).toEqual([]);
    });

    it('should respect custom limit parameter', async () => {
      const { db } = await import('@/libs/DB');

      const mockFamilyFrom = vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) }));
      const mockLimit = vi.fn(() => Promise.resolve([]));
      const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
      const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      vi.mocked(db.select)
        .mockReturnValueOnce({ from: mockFamilyFrom } as never)
        .mockReturnValueOnce({ from: mockFrom } as never);

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
    // Helper that mirrors the new query chain:
    //   from.innerJoin.leftJoin.leftJoin.where
    function mockChain(rows: unknown[]) {
      const mockWhere = vi.fn(() => Promise.resolve(rows));
      const mockLeftJoin2 = vi.fn(() => ({ where: mockWhere }));
      const mockLeftJoin1 = vi.fn(() => ({ leftJoin: mockLeftJoin2 }));
      const mockInnerJoin = vi.fn(() => ({ leftJoin: mockLeftJoin1 }));
      const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
      return { from: mockFrom };
    }

    it('should return family members for an HOH with plan info', async () => {
      const { db } = await import('@/libs/DB');
      const mockFamilyMembers = [
        {
          id: 'fm-1',
          firstName: 'Alice',
          lastName: 'Doe',
          email: 'alice@test.com',
          photoUrl: null,
          status: 'active',
          relationship: 'family-member',
          planName: 'Adult BJJ Monthly',
          planPrice: 12000,
          planFrequency: 'monthly',
        },
      ];
      vi.mocked(db.select).mockReturnValue(mockChain(mockFamilyMembers) as never);

      const { getFamilyMembers } = await import('./MembersService');
      const result = await getFamilyMembers('hoh-123');

      expect(result).toEqual(mockFamilyMembers);
    });

    it('should return null plan fields when a family member has no active membership', async () => {
      const { db } = await import('@/libs/DB');
      const mockFamilyMembers = [
        {
          id: 'fm-1',
          firstName: 'Bob',
          lastName: 'Doe',
          email: 'bob@test.com',
          photoUrl: null,
          status: 'active',
          relationship: 'family-member',
          planName: null,
          planPrice: null,
          planFrequency: null,
        },
      ];
      vi.mocked(db.select).mockReturnValue(mockChain(mockFamilyMembers) as never);

      const { getFamilyMembers } = await import('./MembersService');
      const result = await getFamilyMembers('hoh-123');

      expect(result[0]?.planName).toBeNull();
      expect(result[0]?.planPrice).toBeNull();
      expect(result[0]?.planFrequency).toBeNull();
    });

    it('should return empty array when HOH has no family members', async () => {
      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue(mockChain([]) as never);

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
