import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOrganizationRole,
  deleteOrganizationRole,
  getOrganizationPermission,
  getOrganizationPermissions,
  getOrganizationRole,
  getOrganizationRoles,
  updateOrganizationRole,
} from './ClerkRolesService';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Test-only mock secret key (not a real credential)
const TEST_SECRET_KEY = 'test_secret_key'; // gitleaks:allow

describe('ClerkRolesService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, CLERK_SECRET_KEY: TEST_SECRET_KEY };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getOrganizationPermissions', () => {
    it('should fetch permissions from Clerk API', async () => {
      const mockPermissions = [
        { id: 'perm-1', key: 'org:manage_members', name: 'Manage Members', description: 'Can manage members', type: 'user', created_at: 1234567890, updated_at: 1234567890 },
        { id: 'perm-2', key: 'org:view_members', name: 'View Members', description: 'Can view members', type: 'user', created_at: 1234567890, updated_at: 1234567890 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPermissions, total_count: 2 }),
      });

      const result = await getOrganizationPermissions();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clerk.com/v1/organization_permissions?limit=100',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${TEST_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );
      expect(result).toEqual(mockPermissions);
    });

    it('should throw error when CLERK_SECRET_KEY is not configured', async () => {
      process.env.CLERK_SECRET_KEY = '';

      await expect(getOrganizationPermissions()).rejects.toThrow('CLERK_SECRET_KEY is not configured');
    });

    it('should throw error when API returns non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(getOrganizationPermissions()).rejects.toThrow('Clerk API error: 401 - Unauthorized');
    });
  });

  describe('getOrganizationRoles', () => {
    it('should fetch roles from Clerk API', async () => {
      const mockRoles = [
        {
          id: 'role-1',
          key: 'org:admin',
          name: 'Admin',
          description: 'Full access',
          permissions: [],
          is_creator_eligible: true,
          created_at: 1234567890,
          updated_at: 1234567890,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockRoles, total_count: 1 }),
      });

      const result = await getOrganizationRoles();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clerk.com/v1/organization_roles?limit=100',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${TEST_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );
      expect(result).toEqual(mockRoles);
    });

    it('should throw error when API returns 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(getOrganizationRoles()).rejects.toThrow('Clerk API error: 500 - Internal Server Error');
    });
  });

  describe('getOrganizationRole', () => {
    it('should fetch a single role by ID', async () => {
      const mockRole = {
        id: 'role-123',
        key: 'org:custom_role',
        name: 'Custom Role',
        description: 'A custom role',
        permissions: [],
        is_creator_eligible: false,
        created_at: 1234567890,
        updated_at: 1234567890,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRole),
      });

      const result = await getOrganizationRole('role-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clerk.com/v1/organization_roles/role-123',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${TEST_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );
      expect(result).toEqual(mockRole);
    });

    it('should throw error when role not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Role not found'),
      });

      await expect(getOrganizationRole('nonexistent')).rejects.toThrow('Clerk API error: 404 - Role not found');
    });
  });

  describe('createOrganizationRole', () => {
    const fakeRole = {
      id: 'role_new',
      key: 'org:front_desk',
      name: 'Front Desk',
      description: 'Day-to-day check-in.',
      permissions: [],
      is_creator_eligible: false,
      created_at: 1700000000000,
      updated_at: 1700000000000,
    };

    it('POSTs to /organization_roles with the full body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fakeRole),
      });

      const result = await createOrganizationRole({
        name: 'Front Desk',
        key: 'org:front_desk',
        description: 'Day-to-day check-in.',
        permissions: ['org:members:read'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clerk.com/v1/organization_roles',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TEST_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Front Desk',
            key: 'org:front_desk',
            description: 'Day-to-day check-in.',
            permissions: ['org:members:read'],
          }),
        },
      );
      expect(result).toEqual(fakeRole);
    });

    it('throws when CLERK_SECRET_KEY is missing', async () => {
      process.env.CLERK_SECRET_KEY = '';

      await expect(createOrganizationRole({
        name: 'x',
        key: 'org:x',
        description: 'x',
        permissions: [],
      })).rejects.toThrow('CLERK_SECRET_KEY is not configured');
    });

    it('surfaces Clerk 4xx errors with the response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: () => Promise.resolve('role key already exists'),
      });

      await expect(createOrganizationRole({
        name: 'x',
        key: 'org:dup',
        description: 'x',
        permissions: [],
      })).rejects.toThrow('Clerk API error: 422 - role key already exists');
    });
  });

  describe('updateOrganizationRole', () => {
    const fakeRole = {
      id: 'role_1',
      key: 'org:front_desk',
      name: 'Renamed',
      description: 'd',
      permissions: [],
      is_creator_eligible: false,
      created_at: 1,
      updated_at: 2,
    };

    it('PATCHes only the fields that are present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fakeRole),
      });

      // Only `name` provided — body must NOT include description/permissions
      // (Clerk treats omitted fields as "leave alone").
      await updateOrganizationRole('role_1', { name: 'Renamed' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clerk.com/v1/organization_roles/role_1',
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${TEST_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'Renamed' }),
        },
      );
    });

    it('forwards permissions as a full replacement when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fakeRole),
      });

      await updateOrganizationRole('role_1', { permissions: ['org:foo:read'] });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clerk.com/v1/organization_roles/role_1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ permissions: ['org:foo:read'] }),
        }),
      );
    });

    it('surfaces Clerk 4xx (e.g. system role edit) verbatim', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('cannot edit system role'),
      });

      await expect(updateOrganizationRole('role_admin', { name: 'x' }))
        .rejects
        .toThrow('Clerk API error: 403 - cannot edit system role');
    });
  });

  describe('deleteOrganizationRole', () => {
    it('DELETEs the role and returns void on 204', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
      });

      await expect(deleteOrganizationRole('role_1')).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clerk.com/v1/organization_roles/role_1',
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${TEST_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );
    });

    it('surfaces Clerk 4xx (role still in use)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: () => Promise.resolve('role assigned to members'),
      });

      await expect(deleteOrganizationRole('role_1'))
        .rejects
        .toThrow('Clerk API error: 422 - role assigned to members');
    });
  });

  describe('getOrganizationPermission', () => {
    it('should fetch a single permission by ID', async () => {
      const mockPermission = {
        id: 'perm-123',
        key: 'org:custom_permission',
        name: 'Custom Permission',
        description: 'A custom permission',
        type: 'user' as const,
        created_at: 1234567890,
        updated_at: 1234567890,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPermission),
      });

      const result = await getOrganizationPermission('perm-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clerk.com/v1/organization_permissions/perm-123',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${TEST_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );
      expect(result).toEqual(mockPermission);
    });

    it('should throw error when permission not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Permission not found'),
      });

      await expect(getOrganizationPermission('nonexistent')).rejects.toThrow('Clerk API error: 404 - Permission not found');
    });
  });
});
