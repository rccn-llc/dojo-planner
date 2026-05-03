import type { AuditContext } from '@/types/Audit';

import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('./AuthGuards', () => ({ guardRole: vi.fn() }));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
vi.mock('@/services/ProgramsService', async () => {
  const actual = await vi.importActual<typeof import('@/services/ProgramsService')>('@/services/ProgramsService');
  return {
    ...actual,
    getOrganizationPrograms: vi.fn(),
    createProgram: vi.fn(),
    updateProgram: vi.fn(),
    deleteProgram: vi.fn(),
  };
});

const academyOwnerContext: AuditContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: ORG_ROLE.ACADEMY_OWNER,
};
const frontDeskContext: AuditContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: ORG_ROLE.FRONT_DESK,
};

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

const fakeProgram = {
  id: 'p-1',
  organizationId: 'org-1',
  name: 'Adult BJJ',
  slug: 'adult-bjj',
  description: null,
  color: null,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  classCount: 0,
};

const validCreateInput = {
  name: 'Adult BJJ',
  description: null,
  color: null,
  isActive: true,
};

describe('Programs Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns programs for the org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getOrganizationPrograms } = await import('@/services/ProgramsService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(getOrganizationPrograms).mockResolvedValue([fakeProgram]);

      const { list } = await import('./Programs');
      const result = await callHandler(list);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(result).toEqual({ programs: [fakeProgram] });
    });
  });

  describe('create', () => {
    it('creates a program and emits success audit', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createProgram } = await import('@/services/ProgramsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(createProgram).mockResolvedValue(fakeProgram);

      const { create } = await import('./Programs');
      const result = await callHandler(create, validCreateInput);

      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.PROGRAM_CREATE,
        AUDIT_ENTITY_TYPE.PROGRAM,
        expect.objectContaining({ entityId: 'p-1', status: 'success' }),
      );
      expect(result).toEqual({ program: fakeProgram });
    });

    it('maps slug-conflict to 409', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createProgram, ProgramSlugAlreadyExistsError } = await import('@/services/ProgramsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(createProgram).mockRejectedValue(new ProgramSlugAlreadyExistsError('adult-bjj'));

      const { create } = await import('./Programs');

      await expect(callHandler(create, validCreateInput)).rejects.toBeInstanceOf(ORPCError);
    });
  });

  describe('update', () => {
    it('returns 404 when program not in org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateProgram } = await import('@/services/ProgramsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(updateProgram).mockResolvedValue(null);

      const { update } = await import('./Programs');

      await expect(callHandler(update, { id: 'p-other', ...validCreateInput })).rejects.toBeInstanceOf(ORPCError);
    });
  });

  describe('remove', () => {
    it('deletes and emits success audit', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteProgram } = await import('@/services/ProgramsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(deleteProgram).mockResolvedValue(true);

      const { remove } = await import('./Programs');
      const result = await callHandler(remove, { id: 'p-1' });

      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.PROGRAM_DELETE,
        AUDIT_ENTITY_TYPE.PROGRAM,
        expect.objectContaining({ entityId: 'p-1', status: 'success' }),
      );
      expect(result).toEqual({ success: true });
    });

    it('maps in-use error to 409', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteProgram, ProgramInUseError } = await import('@/services/ProgramsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(deleteProgram).mockRejectedValue(new ProgramInUseError('Adult BJJ', 5));

      const { remove } = await import('./Programs');

      await expect(callHandler(remove, { id: 'p-1' })).rejects.toBeInstanceOf(ORPCError);
    });
  });
});
