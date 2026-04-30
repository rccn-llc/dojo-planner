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
vi.mock('@/services/NotesService', () => ({
  listNotesForMember: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
}));

const frontDeskContext: AuditContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: ORG_ROLE.FRONT_DESK,
};

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('Notes Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns notes scoped to the org via the service', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { listNotesForMember } = await import('@/services/NotesService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      const stubNotes = [{
        id: 'n1',
        memberId: 'm1',
        content: 'hi',
        createdByUserId: 'user-1',
        createdByName: 'Alice',
        createdAt: new Date(),
        updatedAt: new Date(),
      }];
      vi.mocked(listNotesForMember).mockResolvedValue(stubNotes);

      const { list } = await import('./Notes');
      const result = await callHandler(list, { memberId: 'm1' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(listNotesForMember).toHaveBeenCalledWith('m1', 'org-1');
      expect(result).toEqual({ notes: stubNotes });
    });
  });

  describe('create', () => {
    it('snapshots the author display name from Clerk and audits success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createNote } = await import('@/services/NotesService');
      const { audit } = await import('@/services/AuditService');
      const { currentUser } = await import('@clerk/nextjs/server');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(currentUser).mockResolvedValue({
        firstName: 'Alice',
        lastName: 'Adams',
        username: null,
        primaryEmailAddress: null,
      } as unknown as Awaited<ReturnType<typeof currentUser>>);
      const created = {
        id: 'n1',
        memberId: 'm1',
        content: 'hi',
        createdByUserId: 'user-1',
        createdByName: 'Alice Adams',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(createNote).mockResolvedValue(created);

      const { create } = await import('./Notes');
      const result = await callHandler(create, { memberId: 'm1', content: 'hi' });

      expect(createNote).toHaveBeenCalledWith({
        memberId: 'm1',
        content: 'hi',
        organizationId: 'org-1',
        authorUserId: 'user-1',
        authorName: 'Alice Adams',
      });
      expect(audit).toHaveBeenCalledWith(
        frontDeskContext,
        AUDIT_ACTION.NOTE_CREATE,
        AUDIT_ENTITY_TYPE.NOTE,
        expect.objectContaining({ entityId: 'n1', status: 'success' }),
      );
      expect(result).toEqual({ note: created });
    });

    it('falls back to "Unknown" when Clerk has no name/username/email', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createNote } = await import('@/services/NotesService');
      const { currentUser } = await import('@clerk/nextjs/server');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(currentUser).mockResolvedValue(null);
      vi.mocked(createNote).mockResolvedValue({
        id: 'n1',
        memberId: 'm1',
        content: 'hi',
        createdByUserId: 'user-1',
        createdByName: 'Unknown',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { create } = await import('./Notes');
      await callHandler(create, { memberId: 'm1', content: 'hi' });

      expect(createNote).toHaveBeenCalledWith(expect.objectContaining({ authorName: 'Unknown' }));
    });

    it('throws 404 when the service returns null (member not in org) and audits failure', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createNote } = await import('@/services/NotesService');
      const { audit } = await import('@/services/AuditService');
      const { currentUser } = await import('@clerk/nextjs/server');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(currentUser).mockResolvedValue({
        firstName: 'Alice',
        lastName: null,
        username: null,
        primaryEmailAddress: null,
      } as unknown as Awaited<ReturnType<typeof currentUser>>);
      vi.mocked(createNote).mockResolvedValue(null);

      const { create } = await import('./Notes');

      await expect(callHandler(create, { memberId: 'm-other', content: 'hi' })).rejects.toBeInstanceOf(ORPCError);

      expect(audit).toHaveBeenCalledWith(
        frontDeskContext,
        AUDIT_ACTION.NOTE_CREATE,
        AUDIT_ENTITY_TYPE.NOTE,
        expect.objectContaining({ status: 'failure' }),
      );
    });
  });

  describe('update', () => {
    it('updates the note when authorized and audits success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateNote } = await import('@/services/NotesService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      const updated = {
        id: 'n1',
        memberId: 'm1',
        content: 'new',
        createdByUserId: 'user-1',
        createdByName: 'Alice',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(updateNote).mockResolvedValue(updated);

      const { update } = await import('./Notes');
      const result = await callHandler(update, { id: 'n1', content: 'new' });

      expect(updateNote).toHaveBeenCalledWith('n1', 'new', 'org-1');
      expect(audit).toHaveBeenCalledWith(
        frontDeskContext,
        AUDIT_ACTION.NOTE_UPDATE,
        AUDIT_ENTITY_TYPE.NOTE,
        expect.objectContaining({ entityId: 'n1', status: 'success' }),
      );
      expect(result).toEqual({ note: updated });
    });

    it('throws 404 when the note does not belong to the org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateNote } = await import('@/services/NotesService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(updateNote).mockResolvedValue(null);

      const { update } = await import('./Notes');

      await expect(callHandler(update, { id: 'n-other', content: 'x' })).rejects.toBeInstanceOf(ORPCError);
    });
  });

  describe('remove', () => {
    it('soft-deletes when authorized and audits success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteNote } = await import('@/services/NotesService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(deleteNote).mockResolvedValue(true);

      const { remove } = await import('./Notes');
      const result = await callHandler(remove, { id: 'n1' });

      expect(deleteNote).toHaveBeenCalledWith('n1', 'org-1');
      expect(audit).toHaveBeenCalledWith(
        frontDeskContext,
        AUDIT_ACTION.NOTE_DELETE,
        AUDIT_ENTITY_TYPE.NOTE,
        expect.objectContaining({ entityId: 'n1', status: 'success' }),
      );
      expect(result).toEqual({ success: true });
    });

    it('throws 404 when the note does not belong to the org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteNote } = await import('@/services/NotesService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(deleteNote).mockResolvedValue(false);

      const { remove } = await import('./Notes');

      await expect(callHandler(remove, { id: 'n-other' })).rejects.toBeInstanceOf(ORPCError);
    });
  });
});
