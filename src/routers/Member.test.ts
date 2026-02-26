import type { AuditContext } from '@/types/Audit';

import { Buffer } from 'node:buffer';
import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

// Mock all dependencies
vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('@/libs/Logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('./AuthGuards', () => ({
  guardRole: vi.fn(),
  guardAuth: vi.fn(),
}));
vi.mock('@/services/AuditService', () => ({
  audit: vi.fn(),
}));
vi.mock('@/services/MembersService', () => ({
  getHeadOfHouseholdMembers: vi.fn(),
  linkFamilyMember: vi.fn(),
  getFamilyMembers: vi.fn(),
  getMemberPaymentMethods: vi.fn(),
  createMember: vi.fn(),
  updateMember: vi.fn(),
  updateMemberStatus: vi.fn(),
  updateMemberContactInfo: vi.fn(),
  addMemberMembership: vi.fn(),
  changeMemberMembership: vi.fn(),
  getMembershipPlans: vi.fn(),
  getAllMembershipPlans: vi.fn(),
  getMemberTransactions: vi.fn(),
}));
vi.mock('@/services/EmailService', () => ({
  sendMemberConfirmationEmail: vi.fn(),
}));
vi.mock('@/services/WaiverPdfService', () => ({
  generateWaiverPdfBuffer: vi.fn(),
  generatePdfFilename: vi.fn(),
}));

const mockContext: AuditContext = {
  userId: 'test-user-123',
  orgId: 'test-org-456',
  role: ORG_ROLE.ADMIN,
};

const mockFrontDeskContext: AuditContext = {
  userId: 'test-user-123',
  orgId: 'test-org-456',
  role: ORG_ROLE.FRONT_DESK,
};

// Helper to call ORPC handlers
function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('Member Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchHOH', () => {
    const mockHOHMembers = [
      { id: 'hoh-1', firstName: 'John', lastName: 'Doe', email: 'john@test.com', phone: '555-0001', photoUrl: null, status: 'active' },
      { id: 'hoh-2', firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', phone: null, photoUrl: null, status: 'active' },
      { id: 'hoh-3', firstName: 'Bob', lastName: 'Johnson', email: 'bob@test.com', phone: '555-0003', photoUrl: null, status: 'active' },
    ];

    it('should return all HOH members when no query is provided', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getHeadOfHouseholdMembers } = await import('@/services/MembersService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getHeadOfHouseholdMembers).mockResolvedValue(mockHOHMembers);

      const { searchHOH } = await import('./Member');
      const result = await callHandler(searchHOH, {});

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ADMIN);
      expect(getHeadOfHouseholdMembers).toHaveBeenCalledWith('test-org-456');
      expect(result).toEqual({ members: mockHOHMembers });
    });

    it('should filter HOH members by query (case-insensitive name match)', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getHeadOfHouseholdMembers } = await import('@/services/MembersService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getHeadOfHouseholdMembers).mockResolvedValue(mockHOHMembers);

      const { searchHOH } = await import('./Member');
      const result = await callHandler(searchHOH, { query: 'jane' });

      expect(result).toEqual({
        members: [{ id: 'hoh-2', firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', phone: null, photoUrl: null, status: 'active' }],
      });
    });

    it('should filter HOH members by email match', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getHeadOfHouseholdMembers } = await import('@/services/MembersService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getHeadOfHouseholdMembers).mockResolvedValue(mockHOHMembers);

      const { searchHOH } = await import('./Member');
      const result = await callHandler(searchHOH, { query: 'bob@test' });

      expect(result).toEqual({
        members: [{ id: 'hoh-3', firstName: 'Bob', lastName: 'Johnson', email: 'bob@test.com', phone: '555-0003', photoUrl: null, status: 'active' }],
      });
    });

    it('should return all members when query is whitespace only', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getHeadOfHouseholdMembers } = await import('@/services/MembersService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getHeadOfHouseholdMembers).mockResolvedValue(mockHOHMembers);

      const { searchHOH } = await import('./Member');
      const result = await callHandler(searchHOH, { query: '   ' });

      expect(result).toEqual({ members: mockHOHMembers });
    });
  });

  describe('linkFamily', () => {
    const linkInput = {
      hohMemberId: 'hoh-member-123',
      memberId: 'family-member-456',
      relationship: 'child',
    };

    it('should link family member and audit success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { linkFamilyMember } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(linkFamilyMember).mockResolvedValue(undefined as never);

      const { linkFamily } = await import('./Member');
      const result = await callHandler(linkFamily, linkInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ADMIN);
      expect(linkFamilyMember).toHaveBeenCalledWith('hoh-member-123', 'family-member-456', 'child');
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.FAMILY_MEMBER_LINK,
        AUDIT_ENTITY_TYPE.FAMILY_MEMBER,
        {
          entityId: 'family-member-456',
          status: 'success',
        },
      );
      expect(result).toEqual({ linked: true });
    });

    it('should audit failure and throw ORPCError when linkFamilyMember throws', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { linkFamilyMember } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(linkFamilyMember).mockRejectedValue(new Error('Database constraint violation'));

      const { linkFamily } = await import('./Member');

      await expect(callHandler(linkFamily, linkInput)).rejects.toThrow(
        new ORPCError('Failed to link family member. Please try again.', { status: 500 }),
      );

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.FAMILY_MEMBER_LINK,
        AUDIT_ENTITY_TYPE.FAMILY_MEMBER,
        {
          entityId: 'family-member-456',
          status: 'failure',
          error: 'Database constraint violation',
        },
      );
    });

    it('should rethrow ORPCError from service without wrapping', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { linkFamilyMember } = await import('@/services/MembersService');

      const orpcError = new ORPCError('Member not found', { status: 404 });

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(linkFamilyMember).mockRejectedValue(orpcError);

      const { linkFamily } = await import('./Member');

      await expect(callHandler(linkFamily, linkInput)).rejects.toThrow(orpcError);
    });

    it('should handle non-Error thrown values in catch block', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { linkFamilyMember } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(linkFamilyMember).mockRejectedValue('string error');

      const { linkFamily } = await import('./Member');

      await expect(callHandler(linkFamily, linkInput)).rejects.toThrow(
        new ORPCError('Failed to link family member. Please try again.', { status: 500 }),
      );

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.FAMILY_MEMBER_LINK,
        AUDIT_ENTITY_TYPE.FAMILY_MEMBER,
        {
          entityId: 'family-member-456',
          status: 'failure',
          error: 'Unknown error',
        },
      );
    });
  });

  describe('listFamily', () => {
    it('should return family members for a given member', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getFamilyMembers } = await import('@/services/MembersService');

      const mockFamilyMembers = [
        { id: 'fm-1', firstName: 'Alice', lastName: 'Doe', relationship: 'child' },
        { id: 'fm-2', firstName: 'Charlie', lastName: 'Doe', relationship: 'spouse' },
      ];

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getFamilyMembers).mockResolvedValue(mockFamilyMembers as never);

      const { listFamily } = await import('./Member');
      const result = await callHandler(listFamily, { memberId: 'hoh-member-123' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getFamilyMembers).toHaveBeenCalledWith('hoh-member-123');
      expect(result).toEqual({ familyMembers: mockFamilyMembers });
    });
  });

  describe('getHOHPaymentMethods', () => {
    it('should return payment methods for a HOH member', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getMemberPaymentMethods } = await import('@/services/MembersService');

      const mockPaymentMethods = [
        { id: 'pm-1', type: 'card', lastFour: '4242', brand: 'visa' },
        { id: 'pm-2', type: 'bank_transfer', lastFour: '6789', brand: null },
      ];

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getMemberPaymentMethods).mockResolvedValue(mockPaymentMethods as never);

      const { getHOHPaymentMethods } = await import('./Member');
      const result = await callHandler(getHOHPaymentMethods, { hohMemberId: 'hoh-member-123' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ADMIN);
      expect(getMemberPaymentMethods).toHaveBeenCalledWith('hoh-member-123');
      expect(result).toEqual({ paymentMethods: mockPaymentMethods });
    });
  });

  describe('sendConfirmationEmail', () => {
    const baseEmailInput = {
      memberId: 'member-123',
      memberEmail: 'member@test.com',
      memberName: 'John Doe',
      membershipPlanName: 'Monthly BJJ',
      membershipPlanPrice: 7900,
      membershipPlanFrequency: 'monthly',
      memberType: 'individual' as const,
    };

    it('should send email without waiver data', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { sendMemberConfirmationEmail } = await import('@/services/EmailService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(sendMemberConfirmationEmail).mockResolvedValue(true);

      const { sendConfirmationEmail } = await import('./Member');
      const result = await callHandler(sendConfirmationEmail, baseEmailInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ADMIN);
      expect(sendMemberConfirmationEmail).toHaveBeenCalledWith({
        memberEmail: 'member@test.com',
        memberName: 'John Doe',
        membershipPlanName: 'Monthly BJJ',
        membershipPlanPrice: 7900,
        membershipPlanFrequency: 'monthly',
        memberType: 'individual',
        hohName: undefined,
        waiverPdfBuffer: undefined,
        waiverPdfFilename: undefined,
      });
      expect(result).toEqual({ sent: true });
    });

    it('should send email with waiver PDF generation', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { sendMemberConfirmationEmail } = await import('@/services/EmailService');
      const { generateWaiverPdfBuffer, generatePdfFilename } = await import('@/services/WaiverPdfService');

      const mockBuffer = Buffer.from('mock-pdf-content');
      const mockFilename = 'waiver_Doe_John_2025-01-15.pdf';

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(generateWaiverPdfBuffer).mockReturnValue(mockBuffer);
      vi.mocked(generatePdfFilename).mockReturnValue(mockFilename);
      vi.mocked(sendMemberConfirmationEmail).mockResolvedValue(true);

      const waiverPdfData = {
        organizationName: 'Test Dojo',
        waiverName: 'Standard Adult Waiver',
        waiverVersion: 1,
        renderedContent: '<p>Waiver content here</p>',
        memberFirstName: 'John',
        memberLastName: 'Doe',
        memberEmail: 'member@test.com',
        signatureDataUrl: 'data:image/png;base64,abc123',
        signedByName: 'John Doe',
        signedAt: new Date('2025-01-15T10:00:00Z'),
      };

      const { sendConfirmationEmail } = await import('./Member');
      const result = await callHandler(sendConfirmationEmail, {
        ...baseEmailInput,
        waiverPdfData,
      });

      expect(generateWaiverPdfBuffer).toHaveBeenCalledWith({
        ...waiverPdfData,
        signedByRelationship: null,
        signedAt: expect.any(Date),
        ipAddress: null,
        membershipPlanName: null,
        membershipPlanPrice: null,
        membershipPlanFrequency: null,
        membershipPlanContractLength: null,
        membershipPlanSignupFee: null,
        membershipPlanIsTrial: null,
        couponCode: null,
        couponType: null,
        couponAmount: null,
        couponDiscountedPrice: null,
      });
      expect(generatePdfFilename).toHaveBeenCalledWith({
        memberFirstName: 'John',
        memberLastName: 'Doe',
        signedAt: expect.any(Date),
      });
      expect(sendMemberConfirmationEmail).toHaveBeenCalledWith({
        memberEmail: 'member@test.com',
        memberName: 'John Doe',
        membershipPlanName: 'Monthly BJJ',
        membershipPlanPrice: 7900,
        membershipPlanFrequency: 'monthly',
        memberType: 'individual',
        hohName: undefined,
        waiverPdfBuffer: mockBuffer,
        waiverPdfFilename: mockFilename,
      });
      expect(result).toEqual({ sent: true });
    });

    it('should return sent: false on email error without throwing', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { sendMemberConfirmationEmail } = await import('@/services/EmailService');
      const { logger } = await import('@/libs/Logger');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(sendMemberConfirmationEmail).mockRejectedValue(new Error('SMTP connection failed'));

      const { sendConfirmationEmail } = await import('./Member');
      const result = await callHandler(sendConfirmationEmail, baseEmailInput);

      expect(result).toEqual({ sent: false });
      expect(logger.error).toHaveBeenCalledWith('[sendConfirmationEmail] Failed:', {
        error: 'SMTP connection failed',
      });
    });

    it('should handle non-Error thrown values gracefully', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { sendMemberConfirmationEmail } = await import('@/services/EmailService');
      const { logger } = await import('@/libs/Logger');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(sendMemberConfirmationEmail).mockRejectedValue('string error');

      const { sendConfirmationEmail } = await import('./Member');
      const result = await callHandler(sendConfirmationEmail, baseEmailInput);

      expect(result).toEqual({ sent: false });
      expect(logger.error).toHaveBeenCalledWith('[sendConfirmationEmail] Failed:', {
        error: 'Unknown error',
      });
    });

    it('should pass hohName when provided', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { sendMemberConfirmationEmail } = await import('@/services/EmailService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(sendMemberConfirmationEmail).mockResolvedValue(true);

      const { sendConfirmationEmail } = await import('./Member');
      const result = await callHandler(sendConfirmationEmail, {
        ...baseEmailInput,
        memberType: 'family-member' as const,
        hohName: 'Jane Doe',
      });

      expect(sendMemberConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          memberType: 'family-member',
          hohName: 'Jane Doe',
        }),
      );
      expect(result).toEqual({ sent: true });
    });
  });

  describe('updateMemberType', () => {
    it('should update member type and audit success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMember } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(updateMember).mockResolvedValue([{ id: 'member-1' }] as any);

      const { updateMemberType } = await import('./Member');
      const result = await callHandler(updateMemberType, {
        id: 'member-1',
        memberType: 'head-of-household',
      });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ADMIN);
      expect(updateMember).toHaveBeenCalledWith(
        { id: 'member-1', memberType: 'head-of-household' },
        mockContext.orgId,
      );
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBER_UPDATE,
        AUDIT_ENTITY_TYPE.MEMBER,
        { entityId: 'member-1', status: 'success' },
      );
      expect(result).toEqual({});
    });

    it('should throw when member not found', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMember } = await import('@/services/MembersService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(updateMember).mockResolvedValue([] as any);

      const { updateMemberType } = await import('./Member');

      await expect(
        callHandler(updateMemberType, { id: 'nonexistent', memberType: 'individual' }),
      ).rejects.toThrow(ORPCError);
    });

    it('should audit failure when update throws', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMember } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(updateMember).mockRejectedValue(new Error('DB error'));

      const { updateMemberType } = await import('./Member');

      await expect(
        callHandler(updateMemberType, { id: 'member-1', memberType: 'family-member' }),
      ).rejects.toThrow('DB error');

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBER_UPDATE,
        AUDIT_ENTITY_TYPE.MEMBER,
        { entityId: 'member-1', status: 'failure', error: 'DB error' },
      );
    });
  });
});
