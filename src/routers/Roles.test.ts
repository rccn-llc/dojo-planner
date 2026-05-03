import type { AuditContext } from '@/types/Audit';

import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('./AuthGuards', () => ({ guardRole: vi.fn() }));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
vi.mock('@/services/ClerkRolesService', async () => {
  const actual = await vi.importActual<typeof import('@/services/ClerkRolesService')>('@/services/ClerkRolesService');
  return {
    ...actual,
    createOrganizationRole: vi.fn(),
    updateOrganizationRole: vi.fn(),
    deleteOrganizationRole: vi.fn(),
  };
});

const adminContext: AuditContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: ORG_ROLE.ADMIN,
};

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

const fakeRole = {
  id: 'role_1',
  key: 'org:front_desk',
  name: 'Front Desk',
  description: 'Day-to-day check-in.',
  permissions: [],
  is_creator_eligible: false,
  created_at: 1700000000000,
  updated_at: 1700000000000,
};

const validCreateInput = {
  name: 'Front Desk',
  key: 'org:front_desk',
  description: 'Day-to-day check-in.',
  permissions: ['org:members:read'],
};

describe('Roles Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('requires the ADMIN role', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createOrganizationRole } = await import('@/services/ClerkRolesService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(createOrganizationRole).mockResolvedValue(fakeRole);

      const { create } = await import('./Roles');
      await callHandler(create, validCreateInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ADMIN);
    });

    it('creates a role and emits success audit', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createOrganizationRole } = await import('@/services/ClerkRolesService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(createOrganizationRole).mockResolvedValue(fakeRole);

      const { create } = await import('./Roles');
      const result = await callHandler(create, validCreateInput);

      expect(audit).toHaveBeenCalledWith(
        adminContext,
        AUDIT_ACTION.ROLE_CREATE,
        AUDIT_ENTITY_TYPE.ROLE,
        expect.objectContaining({ entityId: 'role_1', status: 'success' }),
      );
      expect(result).toEqual({ role: fakeRole });
    });

    it('maps Clerk 4xx to 409 Conflict', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createOrganizationRole } = await import('@/services/ClerkRolesService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(createOrganizationRole).mockRejectedValue(new Error('Clerk API error: 422 - role key already exists'));

      const { create } = await import('./Roles');

      await expect(callHandler(create, validCreateInput)).rejects.toBeInstanceOf(ORPCError);
    });

    it('emits failure audit when service throws', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createOrganizationRole } = await import('@/services/ClerkRolesService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(createOrganizationRole).mockRejectedValue(new Error('Clerk API error: 500 - boom'));

      const { create } = await import('./Roles');

      await expect(callHandler(create, validCreateInput)).rejects.toBeInstanceOf(ORPCError);

      expect(audit).toHaveBeenCalledWith(
        adminContext,
        AUDIT_ACTION.ROLE_CREATE,
        AUDIT_ENTITY_TYPE.ROLE,
        expect.objectContaining({ status: 'failure' }),
      );
    });
  });

  describe('update', () => {
    it('updates and returns the new role', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateOrganizationRole } = await import('@/services/ClerkRolesService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(updateOrganizationRole).mockResolvedValue({ ...fakeRole, name: 'Renamed Role' });

      const { update } = await import('./Roles');
      const result = await callHandler(update, { id: 'role_1', name: 'Renamed Role' });

      expect(updateOrganizationRole).toHaveBeenCalledWith('role_1', { name: 'Renamed Role' });
      expect(result).toEqual({ role: { ...fakeRole, name: 'Renamed Role' } });
    });

    it('only forwards fields that are present in the input', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateOrganizationRole } = await import('@/services/ClerkRolesService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(updateOrganizationRole).mockResolvedValue(fakeRole);

      const { update } = await import('./Roles');
      // Only `permissions` is set — name + description should NOT be passed
      // through (Clerk treats omitted fields as "leave alone").
      await callHandler(update, { id: 'role_1', permissions: ['org:foo:read'] });

      expect(updateOrganizationRole).toHaveBeenCalledWith('role_1', { permissions: ['org:foo:read'] });
    });

    it('maps Clerk 4xx (e.g. system role edit attempt) to 409', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateOrganizationRole } = await import('@/services/ClerkRolesService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(updateOrganizationRole).mockRejectedValue(new Error('Clerk API error: 403 - cannot edit system role'));

      const { update } = await import('./Roles');

      await expect(callHandler(update, { id: 'role_admin', name: 'foo' })).rejects.toBeInstanceOf(ORPCError);
    });
  });

  describe('remove', () => {
    it('deletes and emits success audit', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteOrganizationRole } = await import('@/services/ClerkRolesService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(deleteOrganizationRole).mockResolvedValue(undefined);

      const { remove } = await import('./Roles');
      const result = await callHandler(remove, { id: 'role_1' });

      expect(audit).toHaveBeenCalledWith(
        adminContext,
        AUDIT_ACTION.ROLE_DELETE,
        AUDIT_ENTITY_TYPE.ROLE,
        expect.objectContaining({ entityId: 'role_1', status: 'success' }),
      );
      expect(result).toEqual({ success: true });
    });

    it('maps Clerk 4xx (role still in use) to 409', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteOrganizationRole } = await import('@/services/ClerkRolesService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(deleteOrganizationRole).mockRejectedValue(new Error('Clerk API error: 422 - role assigned to members'));

      const { remove } = await import('./Roles');

      await expect(callHandler(remove, { id: 'role_1' })).rejects.toBeInstanceOf(ORPCError);
    });
  });
});
