import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStaffRoles, inviteStaffMember, removeStaffMember, updateStaffMember } from './staff';

// Mock Clerk auth
const mockAuth = vi.fn();
const mockCreateInvitation = vi.fn();
const mockUpdateMembership = vi.fn();
const mockDeleteMembership = vi.fn();
const mockUpdateUser = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
  clerkClient: () => Promise.resolve({
    organizations: {
      createOrganizationInvitation: mockCreateInvitation,
      updateOrganizationMembership: mockUpdateMembership,
      deleteOrganizationMembership: mockDeleteMembership,
    },
    users: {
      updateUser: mockUpdateUser,
    },
  }),
}));

// Mock ClerkRolesService
const mockGetOrganizationRoles = vi.fn();
vi.mock('@/services/ClerkRolesService', () => ({
  getOrganizationRoles: () => mockGetOrganizationRoles(),
}));

// Mock next/cache (revalidatePath is called after invite/update/remove)
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock the audit logger so writes don't blow up.
vi.mock('@/services/AuditService', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

describe('Staff Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchStaffRoles', () => {
    it('should return error when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null, orgId: null, orgRole: null });

      const result = await fetchStaffRoles();

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is not authenticated or not part of an organization');
    });

    it('should return error when user is not part of an organization', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123', orgId: null, orgRole: null });

      const result = await fetchStaffRoles();

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is not authenticated or not part of an organization');
    });

    it('should fetch and filter roles for admin users', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
        orgRole: 'org:admin',
      });

      mockGetOrganizationRoles.mockResolvedValue([
        { id: 'role_1', key: 'org:admin', name: 'Admin', description: 'Full access' },
        { id: 'role_2', key: 'org:instructor', name: 'Instructor', description: 'Teaching access' },
        { id: 'role_3', key: 'org:individual_member', name: 'Individual Member', description: 'Member' },
      ]);

      const result = await fetchStaffRoles();

      expect(result.success).toBe(true);
      expect(result.roles).toHaveLength(2); // individual_member is filtered out
      expect(result.roles?.find(r => r.key === 'org:admin')).toBeTruthy();
      expect(result.roles?.find(r => r.key === 'org:instructor')).toBeTruthy();
      expect(result.roles?.find(r => r.key === 'org:individual_member')).toBeFalsy();
    });

    it('should filter out admin role for non-admin users', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
        orgRole: 'org:instructor',
      });

      mockGetOrganizationRoles.mockResolvedValue([
        { id: 'role_1', key: 'org:admin', name: 'Admin', description: 'Full access' },
        { id: 'role_2', key: 'org:instructor', name: 'Instructor', description: 'Teaching access' },
        { id: 'role_3', key: 'org:front_desk', name: 'Front Desk', description: 'Reception' },
      ]);

      const result = await fetchStaffRoles();

      expect(result.success).toBe(true);
      expect(result.roles).toHaveLength(2); // admin is filtered out
      expect(result.roles?.find(r => r.key === 'org:admin')).toBeFalsy();
      expect(result.roles?.find(r => r.key === 'org:instructor')).toBeTruthy();
      expect(result.roles?.find(r => r.key === 'org:front_desk')).toBeTruthy();
    });

    it('should return error when getOrganizationRoles fails', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
        orgRole: 'org:admin',
      });

      mockGetOrganizationRoles.mockRejectedValue(new Error('API Error'));

      const result = await fetchStaffRoles();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to fetch roles. Please try again.');
    });

    it('should map roles to the correct format', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
        orgRole: 'org:admin',
      });

      mockGetOrganizationRoles.mockResolvedValue([
        {
          id: 'role_1',
          key: 'org:instructor',
          name: 'Instructor',
          description: 'Teaching access',
          permissions: [{ id: 'perm_1', key: 'org:manage_classes' }],
          is_creator_eligible: false,
        },
      ]);

      const result = await fetchStaffRoles();

      expect(result.success).toBe(true);
      expect(result.roles).toHaveLength(1);
      expect(result.roles?.[0]).toEqual({
        id: 'role_1',
        key: 'org:instructor',
        name: 'Instructor',
        description: 'Teaching access',
      });
    });
  });

  describe('inviteStaffMember', () => {
    it('should return error when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null, orgId: null });

      const result = await inviteStaffMember({
        emailAddress: 'test@example.com',
        roleKey: 'org:admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is not authenticated or not part of an organization');
    });

    it('should return error when user is not part of an organization', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123', orgId: null });

      const result = await inviteStaffMember({
        emailAddress: 'test@example.com',
        roleKey: 'org:admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is not authenticated or not part of an organization');
    });

    it('should call createOrganizationInvitation with correct parameters', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
      });

      mockCreateInvitation.mockResolvedValue({
        id: 'inv_123',
      });

      const result = await inviteStaffMember({
        emailAddress: 'test@example.com',
        roleKey: 'org:admin',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.success).toBe(true);
      expect(result.invitationId).toBe('inv_123');
      expect(mockCreateInvitation).toHaveBeenCalledWith({
        organizationId: 'org_123',
        inviterUserId: 'user_123',
        emailAddress: 'test@example.com',
        role: 'org:admin',
        publicMetadata: {
          invitedFirstName: 'John',
          invitedLastName: 'Doe',
        },
      });
    });

    it('should return error when invitation fails', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
      });

      mockCreateInvitation.mockRejectedValue(new Error('Invitation failed'));

      const result = await inviteStaffMember({
        emailAddress: 'test@example.com',
        roleKey: 'org:admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send invitation. Please try again.');
    });

    it('should handle already a member error', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
      });

      mockCreateInvitation.mockRejectedValue(new Error('already a member'));

      const result = await inviteStaffMember({
        emailAddress: 'test@example.com',
        roleKey: 'org:admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('This email address is already a member of this organization.');
    });

    it('should handle already invited error', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
      });

      mockCreateInvitation.mockRejectedValue(new Error('already invited'));

      const result = await inviteStaffMember({
        emailAddress: 'test@example.com',
        roleKey: 'org:admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('An invitation has already been sent to this email address.');
    });
  });

  describe('updateStaffMember', () => {
    it('should return error when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null, orgId: null });

      const result = await updateStaffMember({
        userId: 'user_456',
        roleKey: 'org:admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is not authenticated or not part of an organization');
    });

    it('should return error when user is not part of an organization', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123', orgId: null });

      const result = await updateStaffMember({
        userId: 'user_456',
        roleKey: 'org:admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is not authenticated or not part of an organization');
    });

    it('should update membership and user profile successfully', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
      });

      mockUpdateMembership.mockResolvedValue({});
      mockUpdateUser.mockResolvedValue({});

      const result = await updateStaffMember({
        userId: 'user_456',
        roleKey: 'org:instructor',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.success).toBe(true);
      expect(mockUpdateMembership).toHaveBeenCalledWith({
        organizationId: 'org_123',
        userId: 'user_456',
        role: 'org:instructor',
      });
      expect(mockUpdateUser).toHaveBeenCalledWith('user_456', {
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    it('should return error when update fails', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
      });

      mockUpdateMembership.mockRejectedValue(new Error('Update failed'));

      const result = await updateStaffMember({
        userId: 'user_456',
        roleKey: 'org:admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update staff member. Please try again.');
    });

    it('should handle not found error', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
      });

      mockUpdateMembership.mockRejectedValue(new Error('not found'));

      const result = await updateStaffMember({
        userId: 'user_456',
        roleKey: 'org:admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Staff member not found.');
    });

    it('should handle permission error', async () => {
      mockAuth.mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_123',
      });

      mockUpdateMembership.mockRejectedValue(new Error('permission denied'));

      const result = await updateStaffMember({
        userId: 'user_456',
        roleKey: 'org:admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('You do not have permission to update this staff member.');
    });
  });

  describe('removeStaffMember', () => {
    it('returns error when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null, orgId: null });

      const result = await removeStaffMember({ userId: 'user_target' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not authenticated/i);
    });

    it('refuses to remove self', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_self', orgId: 'org_1' });

      const result = await removeStaffMember({ userId: 'user_self' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cannot remove yourself/i);
      expect(mockDeleteMembership).not.toHaveBeenCalled();
    });

    it('removes the staff member when authorized', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_self', orgId: 'org_1' });
      mockDeleteMembership.mockResolvedValue({ id: 'membership_1' });

      const result = await removeStaffMember({ userId: 'user_target' });

      expect(result.success).toBe(true);
      expect(mockDeleteMembership).toHaveBeenCalledWith({
        organizationId: 'org_1',
        userId: 'user_target',
      });
    });

    it('translates Clerk not-found error', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_self', orgId: 'org_1' });
      mockDeleteMembership.mockRejectedValue(new Error('User not found'));

      const result = await removeStaffMember({ userId: 'user_missing' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Staff member not found.');
    });

    it('returns generic error on unknown failures', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_self', orgId: 'org_1' });
      mockDeleteMembership.mockRejectedValue(new Error('Internal server error'));

      const result = await removeStaffMember({ userId: 'user_target' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to remove staff member. Please try again.');
    });
  });
});
