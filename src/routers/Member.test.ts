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
  unlinkFamilyMember: vi.fn(),
  getHOHForFamilyMember: vi.fn(),
  getFamilyMembers: vi.fn(),
  getMemberPaymentMethods: vi.fn(),
  createMember: vi.fn(),
  updateMember: vi.fn(),
  updateMemberStatus: vi.fn(),
  updateMemberContactInfo: vi.fn(),
  updateMemberPhoto: vi.fn(),
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
  generatePdfFilename: vi.fn(),
}));
vi.mock('@/services/WaiverPdfService.server', () => ({
  generateWaiverPdfBuffer: vi.fn(),
}));

const mockAcademyOwnerContext: AuditContext = {
  userId: 'test-user-123',
  orgId: 'test-org-456',
  role: ORG_ROLE.ACADEMY_OWNER,
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

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getHeadOfHouseholdMembers).mockResolvedValue(mockHOHMembers);

      const { searchHOH } = await import('./Member');
      const result = await callHandler(searchHOH, {});

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getHeadOfHouseholdMembers).toHaveBeenCalledWith('test-org-456');
      expect(result).toEqual({ members: mockHOHMembers });
    });

    it('should filter HOH members by query (case-insensitive name match)', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getHeadOfHouseholdMembers } = await import('@/services/MembersService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
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

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
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

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
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

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(linkFamilyMember).mockResolvedValue(undefined as never);

      const { linkFamily } = await import('./Member');
      const result = await callHandler(linkFamily, linkInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(linkFamilyMember).toHaveBeenCalledWith('hoh-member-123', 'family-member-456', 'child');
      expect(audit).toHaveBeenCalledWith(
        mockFrontDeskContext,
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

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(linkFamilyMember).mockRejectedValue(new Error('Database constraint violation'));

      const { linkFamily } = await import('./Member');

      await expect(callHandler(linkFamily, linkInput)).rejects.toThrow(
        new ORPCError('Failed to link family member. Please try again.', { status: 500 }),
      );

      expect(audit).toHaveBeenCalledWith(
        mockFrontDeskContext,
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

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(linkFamilyMember).mockRejectedValue(orpcError);

      const { linkFamily } = await import('./Member');

      await expect(callHandler(linkFamily, linkInput)).rejects.toThrow(orpcError);
    });

    it('should handle non-Error thrown values in catch block', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { linkFamilyMember } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(linkFamilyMember).mockRejectedValue('string error');

      const { linkFamily } = await import('./Member');

      await expect(callHandler(linkFamily, linkInput)).rejects.toThrow(
        new ORPCError('Failed to link family member. Please try again.', { status: 500 }),
      );

      expect(audit).toHaveBeenCalledWith(
        mockFrontDeskContext,
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

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getMemberPaymentMethods).mockResolvedValue(mockPaymentMethods as never);

      const { getHOHPaymentMethods } = await import('./Member');
      const result = await callHandler(getHOHPaymentMethods, { hohMemberId: 'hoh-member-123' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getMemberPaymentMethods).toHaveBeenCalledWith('hoh-member-123', 'test-org-456');
      expect(result).toEqual({ paymentMethods: mockPaymentMethods });
    });
  });

  describe('listPaymentMethods', () => {
    it('should return org-scoped payment methods and audit the read access', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getMemberPaymentMethods } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getMemberPaymentMethods).mockResolvedValue([{ id: 'pm-1' }] as never);

      const { listPaymentMethods } = await import('./Member');
      const result = await callHandler(listPaymentMethods, { memberId: 'member-123' });

      expect(getMemberPaymentMethods).toHaveBeenCalledWith('member-123', 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockFrontDeskContext,
        AUDIT_ACTION.PAYMENT_METHOD_VIEW,
        AUDIT_ENTITY_TYPE.MEMBER,
        { entityId: 'member-123', status: 'success' },
      );
      expect(result).toEqual({ paymentMethods: [{ id: 'pm-1' }] });
    });
  });

  describe('listMemberTransactions', () => {
    it('should return member transactions and audit the read access', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getMemberTransactions } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getMemberTransactions).mockResolvedValue([{ id: 'txn-1' }] as never);

      const { listMemberTransactions } = await import('./Member');
      const result = await callHandler(listMemberTransactions, { memberId: 'member-123' });

      expect(getMemberTransactions).toHaveBeenCalledWith('member-123', 'test-org-456', undefined);
      expect(audit).toHaveBeenCalledWith(
        mockFrontDeskContext,
        AUDIT_ACTION.TRANSACTION_VIEW,
        AUDIT_ENTITY_TYPE.MEMBER,
        { entityId: 'member-123', status: 'success' },
      );
      expect(result).toEqual({ transactions: [{ id: 'txn-1' }] });
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

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(sendMemberConfirmationEmail).mockResolvedValue(true);

      const { sendConfirmationEmail } = await import('./Member');
      const result = await callHandler(sendConfirmationEmail, baseEmailInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
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
      const { generatePdfFilename } = await import('@/services/WaiverPdfService');
      const { generateWaiverPdfBuffer } = await import('@/services/WaiverPdfService.server');

      const mockBuffer = Buffer.from('mock-pdf-content');
      const mockFilename = 'waiver_Doe_John_2025-01-15.pdf';

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
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

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
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

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
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

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
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

  describe('unlinkFamily', () => {
    const unlinkInput = {
      hohMemberId: 'hoh-member-123',
      memberId: 'family-member-456',
    };

    it('should unlink family member and audit success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { unlinkFamilyMember } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockAcademyOwnerContext);
      vi.mocked(unlinkFamilyMember).mockResolvedValue(undefined as never);

      const { unlinkFamily } = await import('./Member');
      const result = await callHandler(unlinkFamily, unlinkInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(unlinkFamilyMember).toHaveBeenCalledWith('hoh-member-123', 'family-member-456');
      expect(audit).toHaveBeenCalledWith(
        mockAcademyOwnerContext,
        AUDIT_ACTION.FAMILY_MEMBER_UNLINK,
        AUDIT_ENTITY_TYPE.FAMILY_MEMBER,
        {
          entityId: 'family-member-456',
          status: 'success',
        },
      );
      expect(result).toEqual({ unlinked: true });
    });

    it('should audit failure and throw ORPCError when unlinkFamilyMember throws', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { unlinkFamilyMember } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockAcademyOwnerContext);
      vi.mocked(unlinkFamilyMember).mockRejectedValue(new Error('Database constraint violation'));

      const { unlinkFamily } = await import('./Member');

      await expect(callHandler(unlinkFamily, unlinkInput)).rejects.toThrow(
        new ORPCError('Failed to unlink family member. Please try again.', { status: 500 }),
      );

      expect(audit).toHaveBeenCalledWith(
        mockAcademyOwnerContext,
        AUDIT_ACTION.FAMILY_MEMBER_UNLINK,
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
      const { unlinkFamilyMember } = await import('@/services/MembersService');

      const orpcError = new ORPCError('Member not found', { status: 404 });

      vi.mocked(guardRole).mockResolvedValue(mockAcademyOwnerContext);
      vi.mocked(unlinkFamilyMember).mockRejectedValue(orpcError);

      const { unlinkFamily } = await import('./Member');

      await expect(callHandler(unlinkFamily, unlinkInput)).rejects.toThrow(orpcError);
    });

    it('should handle non-Error thrown values in catch block', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { unlinkFamilyMember } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockAcademyOwnerContext);
      vi.mocked(unlinkFamilyMember).mockRejectedValue('string error');

      const { unlinkFamily } = await import('./Member');

      await expect(callHandler(unlinkFamily, unlinkInput)).rejects.toThrow(
        new ORPCError('Failed to unlink family member. Please try again.', { status: 500 }),
      );

      expect(audit).toHaveBeenCalledWith(
        mockAcademyOwnerContext,
        AUDIT_ACTION.FAMILY_MEMBER_UNLINK,
        AUDIT_ENTITY_TYPE.FAMILY_MEMBER,
        {
          entityId: 'family-member-456',
          status: 'failure',
          error: 'Unknown error',
        },
      );
    });
  });

  describe('getHOHForMember', () => {
    it('should return HOH data for a family member', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getHOHForFamilyMember } = await import('@/services/MembersService');

      const mockHOH = {
        id: 'hoh-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        phone: '555-1234',
        photoUrl: null,
        status: 'active',
      };

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getHOHForFamilyMember).mockResolvedValue(mockHOH);

      const { getHOHForMember } = await import('./Member');
      const result = await callHandler(getHOHForMember, { memberId: 'fm-123' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getHOHForFamilyMember).toHaveBeenCalledWith('fm-123');
      expect(result).toEqual({ hoh: mockHOH });
    });

    it('should return null hoh when member has no HOH', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getHOHForFamilyMember } = await import('@/services/MembersService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getHOHForFamilyMember).mockResolvedValue(null);

      const { getHOHForMember } = await import('./Member');
      const result = await callHandler(getHOHForMember, { memberId: 'individual-123' });

      expect(result).toEqual({ hoh: null });
    });
  });

  describe('updateMemberType', () => {
    it('should update member type and audit success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMember } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockAcademyOwnerContext);
      vi.mocked(updateMember).mockResolvedValue([{ id: 'member-1' }] as any);

      const { updateMemberType } = await import('./Member');
      const result = await callHandler(updateMemberType, {
        id: 'member-1',
        memberType: 'head-of-household',
      });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(updateMember).toHaveBeenCalledWith(
        { id: 'member-1', memberType: 'head-of-household' },
        mockAcademyOwnerContext.orgId,
      );
      expect(audit).toHaveBeenCalledWith(
        mockAcademyOwnerContext,
        AUDIT_ACTION.MEMBER_UPDATE,
        AUDIT_ENTITY_TYPE.MEMBER,
        { entityId: 'member-1', status: 'success' },
      );
      expect(result).toEqual({});
    });

    it('should throw when member not found', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMember } = await import('@/services/MembersService');

      vi.mocked(guardRole).mockResolvedValue(mockAcademyOwnerContext);
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

      vi.mocked(guardRole).mockResolvedValue(mockAcademyOwnerContext);
      vi.mocked(updateMember).mockRejectedValue(new Error('DB error'));

      const { updateMemberType } = await import('./Member');

      await expect(
        callHandler(updateMemberType, { id: 'member-1', memberType: 'family-member' }),
      ).rejects.toThrow('DB error');

      expect(audit).toHaveBeenCalledWith(
        mockAcademyOwnerContext,
        AUDIT_ACTION.MEMBER_UPDATE,
        AUDIT_ENTITY_TYPE.MEMBER,
        { entityId: 'member-1', status: 'failure', error: 'DB error' },
      );
    });
  });

  describe('updatePhoto', () => {
    const validPhoto = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD';

    it('updates the photo, requires ACADEMY_OWNER, and emits a success audit with after-set sentinel', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMemberPhoto } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockAcademyOwnerContext);
      vi.mocked(updateMemberPhoto).mockResolvedValue([{ id: 'member-1' }]);

      const { updatePhoto } = await import('./Member');
      const result = await callHandler(updatePhoto, { id: 'member-1', photoUrl: validPhoto });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(updateMemberPhoto).toHaveBeenCalledWith({ id: 'member-1', photoUrl: validPhoto }, 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockAcademyOwnerContext,
        AUDIT_ACTION.MEMBER_UPDATE_CONTACT,
        AUDIT_ENTITY_TYPE.MEMBER,
        expect.objectContaining({
          entityId: 'member-1',
          status: 'success',
          changes: { photoUrl: { before: '<photo>', after: '<photo>' } },
        }),
      );
      expect(result).toEqual({});
    });

    it('clears the photo and emits a success audit with after=null', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMemberPhoto } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockAcademyOwnerContext);
      vi.mocked(updateMemberPhoto).mockResolvedValue([{ id: 'member-1' }]);

      const { updatePhoto } = await import('./Member');
      await callHandler(updatePhoto, { id: 'member-1', photoUrl: null });

      expect(updateMemberPhoto).toHaveBeenCalledWith({ id: 'member-1', photoUrl: null }, 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockAcademyOwnerContext,
        AUDIT_ACTION.MEMBER_UPDATE_CONTACT,
        AUDIT_ENTITY_TYPE.MEMBER,
        expect.objectContaining({
          entityId: 'member-1',
          status: 'success',
          changes: { photoUrl: { before: '<photo>', after: null } },
        }),
      );
    });

    it('throws 404 when the member is not in the org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMemberPhoto } = await import('@/services/MembersService');

      vi.mocked(guardRole).mockResolvedValue(mockAcademyOwnerContext);
      vi.mocked(updateMemberPhoto).mockResolvedValue([]);

      const { updatePhoto } = await import('./Member');

      await expect(
        callHandler(updatePhoto, { id: 'member-other-org', photoUrl: validPhoto }),
      ).rejects.toThrow(ORPCError);
    });

    it('emits a failure audit when the service throws', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMemberPhoto } = await import('@/services/MembersService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockAcademyOwnerContext);
      vi.mocked(updateMemberPhoto).mockRejectedValue(new Error('DB error'));

      const { updatePhoto } = await import('./Member');

      await expect(
        callHandler(updatePhoto, { id: 'member-1', photoUrl: validPhoto }),
      ).rejects.toThrow('DB error');

      expect(audit).toHaveBeenCalledWith(
        mockAcademyOwnerContext,
        AUDIT_ACTION.MEMBER_UPDATE_CONTACT,
        AUDIT_ENTITY_TYPE.MEMBER,
        expect.objectContaining({
          entityId: 'member-1',
          status: 'failure',
          error: 'DB error',
        }),
      );
    });
  });
});
