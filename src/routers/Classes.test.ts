import type { AuditContext } from '@/types/Audit';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('./AuthGuards', () => ({ guardRole: vi.fn() }));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
vi.mock('@/services/ClassesService', async () => {
  const actual = await vi.importActual<typeof import('@/services/ClassesService')>('@/services/ClassesService');
  return {
    ...actual,
    createClass: vi.fn(),
    updateClass: vi.fn(),
  };
});

const frontDeskContext: AuditContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: ORG_ROLE.FRONT_DESK,
};

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

const fakeClass = {
  id: 'class-1',
  name: 'BJJ Fundamentals',
  slug: 'bjj-fundamentals',
  description: null,
  color: null,
  defaultDurationMinutes: 60,
  minAge: null,
  maxAge: null,
  maxCapacity: null,
  allowWalkIns: 'No',
  isActive: true,
  program: null,
  tags: [],
  schedule: [],
  scheduleExceptions: [],
};

const baseInput = {
  name: 'BJJ Fundamentals',
  isActive: true,
  schedule: [],
  tagIds: [],
};

describe('Classes Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('passes allowWalkIns through to the service', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createClass } = await import('@/services/ClassesService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(createClass).mockResolvedValue(fakeClass);

      const { create } = await import('./Classes');
      const result = await callHandler(create, { ...baseInput, allowWalkIns: 'No' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(createClass).toHaveBeenCalledWith(
        expect.objectContaining({ allowWalkIns: 'No' }),
        'org-1',
      );
      expect(result).toEqual({ class: fakeClass });
    });

    it('defaults allowWalkIns to \'Yes\' when omitted and audits success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createClass } = await import('@/services/ClassesService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(createClass).mockResolvedValue(fakeClass);

      const { create } = await import('./Classes');
      await callHandler(create, baseInput);

      expect(createClass).toHaveBeenCalledWith(
        expect.objectContaining({ allowWalkIns: 'Yes' }),
        'org-1',
      );
      expect(audit).toHaveBeenCalledWith(
        frontDeskContext,
        AUDIT_ACTION.CLASS_CREATE,
        AUDIT_ENTITY_TYPE.CLASS,
        expect.objectContaining({ entityId: 'class-1', status: 'success' }),
      );
    });

    it('maps a cross-tenant ProgramNotFoundError to a 404', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createClass } = await import('@/services/ClassesService');
      const { ProgramNotFoundError } = await import('@/services/ProgramsService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(createClass).mockRejectedValue(new ProgramNotFoundError());

      const { create } = await import('./Classes');

      await expect(
        callHandler(create, { ...baseInput, programId: 'prog-from-other-org' }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('update', () => {
    it('passes allowWalkIns through to the service', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateClass } = await import('@/services/ClassesService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(updateClass).mockResolvedValue(fakeClass);

      const { update } = await import('./Classes');
      const result = await callHandler(update, { id: 'class-1', ...baseInput, allowWalkIns: 'No' });

      expect(updateClass).toHaveBeenCalledWith(
        'class-1',
        expect.objectContaining({ allowWalkIns: 'No' }),
        'org-1',
      );
      expect(result).toEqual({ class: fakeClass });
    });

    it('defaults allowWalkIns to \'Yes\' when omitted', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateClass } = await import('@/services/ClassesService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(updateClass).mockResolvedValue(fakeClass);

      const { update } = await import('./Classes');
      await callHandler(update, { id: 'class-1', ...baseInput });

      expect(updateClass).toHaveBeenCalledWith(
        'class-1',
        expect.objectContaining({ allowWalkIns: 'Yes' }),
        'org-1',
      );
    });
  });
});
