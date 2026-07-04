import type { AuditContext } from '@/types/Audit';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('./AuthGuards', () => ({ guardRole: vi.fn() }));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
vi.mock('@/services/InstructorsService', () => ({
  getOrganizationInstructors: vi.fn(),
  upsertInstructorPhoto: vi.fn(),
}));

const academyOwnerContext: AuditContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: ORG_ROLE.ACADEMY_OWNER,
};

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('Instructors Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('guards with FRONT_DESK and returns instructors from the service', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getOrganizationInstructors } = await import('@/services/InstructorsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      const instructors = [{ id: 'u1', name: 'Ann Lee', photoUrl: null }];
      vi.mocked(getOrganizationInstructors).mockResolvedValue(instructors);

      const { list } = await import('./Instructors');
      const result = await callHandler(list);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getOrganizationInstructors).toHaveBeenCalledWith('org-1');
      expect(result).toEqual({ instructors });
    });
  });

  describe('updatePhoto', () => {
    it('guards with ACADEMY_OWNER, upserts the photo, and audits success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { upsertInstructorPhoto } = await import('@/services/InstructorsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(upsertInstructorPhoto).mockResolvedValue(undefined);

      const { updatePhoto } = await import('./Instructors');
      const result = await callHandler(updatePhoto, {
        clerkUserId: 'u1',
        photoUrl: 'data:image/png;base64,AAAA',
      });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(upsertInstructorPhoto).toHaveBeenCalledWith('org-1', 'u1', 'data:image/png;base64,AAAA');
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.INSTRUCTOR_PHOTO_UPDATE,
        AUDIT_ENTITY_TYPE.INSTRUCTOR,
        expect.objectContaining({ entityId: 'u1', status: 'success' }),
      );
      expect(result).toEqual({});
    });

    it('accepts a null photoUrl (clearing the override)', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { upsertInstructorPhoto } = await import('@/services/InstructorsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(upsertInstructorPhoto).mockResolvedValue(undefined);

      const { updatePhoto } = await import('./Instructors');
      await callHandler(updatePhoto, { clerkUserId: 'u1', photoUrl: null });

      expect(upsertInstructorPhoto).toHaveBeenCalledWith('org-1', 'u1', null);
    });

    it('audits failure and rethrows when the service throws', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { upsertInstructorPhoto } = await import('@/services/InstructorsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(upsertInstructorPhoto).mockRejectedValue(new Error('boom'));

      const { updatePhoto } = await import('./Instructors');

      await expect(callHandler(updatePhoto, {
        clerkUserId: 'u1',
        photoUrl: 'data:image/png;base64,AAAA',
      })).rejects.toThrow('boom');

      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.INSTRUCTOR_PHOTO_UPDATE,
        AUDIT_ENTITY_TYPE.INSTRUCTOR,
        expect.objectContaining({ entityId: 'u1', status: 'failure' }),
      );
    });
  });
});
