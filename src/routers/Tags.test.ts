import type { AuditContext } from '@/types/Audit';

import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('./AuthGuards', () => ({
  guardRole: vi.fn(),
}));
vi.mock('@/services/AuditService', () => ({
  audit: vi.fn(),
}));
vi.mock('@/services/TagsService', async () => {
  const actual = await vi.importActual<typeof import('@/services/TagsService')>('@/services/TagsService');
  return {
    ...actual,
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    getAllTags: vi.fn(),
    getClassTags: vi.fn(),
    getMembershipTags: vi.fn(),
  };
});

const academyOwnerContext: AuditContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: ORG_ROLE.ACADEMY_OWNER,
};

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('Tags Router mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates a tag and emits a success audit event', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createTag } = await import('@/services/TagsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      const tag = {
        id: 'tag-1',
        name: 'Beginner',
        slug: 'beginner',
        color: null,
        entityType: 'class',
        usageCount: 0,
      };
      vi.mocked(createTag).mockResolvedValue(tag);

      const { create } = await import('./Tags');
      const result = await callHandler(create, {
        entityType: 'class',
        name: 'Beginner',
      });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(createTag).toHaveBeenCalledWith({
        organizationId: 'org-1',
        entityType: 'class',
        name: 'Beginner',
        color: undefined,
      });
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.TAG_CREATE,
        AUDIT_ENTITY_TYPE.TAG,
        expect.objectContaining({ entityId: 'tag-1', status: 'success' }),
      );
      expect(result).toEqual({ tag });
    });

    it('maps TagNameAlreadyExistsError to a 409 ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createTag, TagNameAlreadyExistsError } = await import('@/services/TagsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(createTag).mockRejectedValue(new TagNameAlreadyExistsError('Beginner'));

      const { create } = await import('./Tags');

      await expect(
        callHandler(create, { entityType: 'class', name: 'Beginner' }),
      ).rejects.toBeInstanceOf(ORPCError);

      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.TAG_CREATE,
        AUDIT_ENTITY_TYPE.TAG,
        expect.objectContaining({ status: 'failure' }),
      );
    });
  });

  describe('update', () => {
    it('updates a tag and emits a success audit event', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateTag } = await import('@/services/TagsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      const tag = {
        id: 'tag-1',
        name: 'Renamed',
        slug: 'renamed',
        color: '#abc',
        entityType: 'class',
        usageCount: 0,
      };
      vi.mocked(updateTag).mockResolvedValue(tag);

      const { update } = await import('./Tags');
      const result = await callHandler(update, {
        id: 'tag-1',
        name: 'Renamed',
        color: '#abc',
      });

      expect(updateTag).toHaveBeenCalledWith({
        id: 'tag-1',
        organizationId: 'org-1',
        name: 'Renamed',
        color: '#abc',
      });
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.TAG_UPDATE,
        AUDIT_ENTITY_TYPE.TAG,
        expect.objectContaining({ entityId: 'tag-1', status: 'success' }),
      );
      expect(result).toEqual({ tag });
    });

    it('throws 404 when the tag is not in the org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateTag } = await import('@/services/TagsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(updateTag).mockResolvedValue(null);

      const { update } = await import('./Tags');

      await expect(
        callHandler(update, { id: 'tag-other', name: 'X' }),
      ).rejects.toBeInstanceOf(ORPCError);
    });

    it('maps TagNameAlreadyExistsError to a 409 ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateTag, TagNameAlreadyExistsError } = await import('@/services/TagsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(updateTag).mockRejectedValue(new TagNameAlreadyExistsError('Beginner'));

      const { update } = await import('./Tags');

      await expect(
        callHandler(update, { id: 'tag-1', name: 'Beginner' }),
      ).rejects.toBeInstanceOf(ORPCError);
    });
  });

  describe('remove', () => {
    it('soft-deletes (cascades) and reports unlinkedFromCount', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteTag } = await import('@/services/TagsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(deleteTag).mockResolvedValue({ deleted: true, unlinkedFromCount: 3 });

      const { remove } = await import('./Tags');
      const result = await callHandler(remove, { id: 'tag-1' });

      expect(deleteTag).toHaveBeenCalledWith('tag-1', 'org-1');
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.TAG_DELETE,
        AUDIT_ENTITY_TYPE.TAG,
        expect.objectContaining({ entityId: 'tag-1', status: 'success' }),
      );
      expect(result).toEqual({ success: true, unlinkedFromCount: 3 });
    });

    it('throws 404 when the tag is not in the org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteTag } = await import('@/services/TagsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(deleteTag).mockResolvedValue({ deleted: false, unlinkedFromCount: 0 });

      const { remove } = await import('./Tags');

      await expect(
        callHandler(remove, { id: 'tag-other' }),
      ).rejects.toBeInstanceOf(ORPCError);
    });
  });
});
