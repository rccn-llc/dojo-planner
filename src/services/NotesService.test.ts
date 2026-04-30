import { beforeEach, describe, expect, it, vi } from 'vitest';

// Each test sets up the mock chain it needs by reassigning these factories.
const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

vi.mock('@/models/Schema', () => ({
  noteSchema: {
    id: 'id',
    memberId: 'member_id',
    content: 'content',
    status: 'status',
    createdByUserId: 'created_by_user_id',
    createdByName: 'created_by_name',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  memberSchema: {
    id: 'id',
    organizationId: 'organization_id',
  },
}));

describe('NotesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listNotesForMember', () => {
    it('returns [] when member is not in the org', async () => {
      // First select() resolves the member-in-org check with no rows
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
      });

      const { listNotesForMember } = await import('./NotesService');
      const result = await listNotesForMember('member-other-org', 'org-1');

      expect(result).toEqual([]);
    });

    it('returns notes when the member belongs to the org', async () => {
      const noteRow = {
        id: 'note-1',
        memberId: 'member-1',
        content: 'Hello',
        createdByUserId: 'user-1',
        createdByName: 'Alice',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      };
      // 1st select: member-in-org check (returns the member)
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'member-1' }]) }) }),
      });
      // 2nd select: actual notes list
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => ({ orderBy: () => Promise.resolve([noteRow]) }) }),
      });

      const { listNotesForMember } = await import('./NotesService');
      const result = await listNotesForMember('member-1', 'org-1');

      expect(result).toEqual([noteRow]);
    });
  });

  describe('createNote', () => {
    it('returns null when the member is not in the org', async () => {
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
      });

      const { createNote } = await import('./NotesService');
      const result = await createNote({
        memberId: 'member-other-org',
        content: 'hi',
        organizationId: 'org-1',
        authorUserId: 'user-1',
        authorName: 'Alice',
      });

      expect(result).toBeNull();
    });

    it('inserts and returns the new note when the member belongs to the org', async () => {
      const inserted = {
        id: 'note-new',
        memberId: 'member-1',
        content: 'hi',
        createdByUserId: 'user-1',
        createdByName: 'Alice',
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'member-1' }]) }) }),
      });
      dbMock.insert.mockReturnValueOnce({
        values: () => ({ returning: () => Promise.resolve([inserted]) }),
      });

      const { createNote } = await import('./NotesService');
      const result = await createNote({
        memberId: 'member-1',
        content: 'hi',
        organizationId: 'org-1',
        authorUserId: 'user-1',
        authorName: 'Alice',
      });

      expect(result).toEqual(inserted);
    });
  });

  describe('updateNote', () => {
    it('returns null when the note does not belong to the org', async () => {
      // The cross-org join returns nothing
      dbMock.select.mockReturnValueOnce({
        from: () => ({ innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
      });

      const { updateNote } = await import('./NotesService');
      const result = await updateNote('note-other-org', 'new', 'org-1');

      expect(result).toBeNull();
    });

    it('updates and returns the note when authorized', async () => {
      // Existing note from the same org, status active
      dbMock.select.mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve([{
                id: 'note-1',
                memberId: 'member-1',
                content: 'old',
                createdByUserId: 'user-1',
                createdByName: 'Alice',
                createdAt: new Date('2026-01-01T00:00:00Z'),
                updatedAt: new Date('2026-01-01T00:00:00Z'),
                organizationId: 'org-1',
                status: 'active',
              }]),
            }),
          }),
        }),
      });
      const updated = {
        id: 'note-1',
        memberId: 'member-1',
        content: 'new',
        createdByUserId: 'user-1',
        createdByName: 'Alice',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };
      dbMock.update.mockReturnValueOnce({
        set: () => ({ where: () => ({ returning: () => Promise.resolve([updated]) }) }),
      });

      const { updateNote } = await import('./NotesService');
      const result = await updateNote('note-1', 'new', 'org-1');

      expect(result).toEqual(updated);
    });
  });

  describe('deleteNote', () => {
    it('returns false when the note does not belong to the org', async () => {
      dbMock.select.mockReturnValueOnce({
        from: () => ({ innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
      });

      const { deleteNote } = await import('./NotesService');
      const result = await deleteNote('note-other', 'org-1');

      expect(result).toBe(false);
    });

    it('soft-deletes (status=archived) and returns true when authorized', async () => {
      dbMock.select.mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve([{
                id: 'note-1',
                memberId: 'member-1',
                content: 'x',
                createdByUserId: null,
                createdByName: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                organizationId: 'org-1',
                status: 'active',
              }]),
            }),
          }),
        }),
      });
      const setSpy = vi.fn(() => ({ where: () => Promise.resolve() }));
      dbMock.update.mockReturnValueOnce({ set: setSpy });

      const { deleteNote } = await import('./NotesService');
      const result = await deleteNote('note-1', 'org-1');

      expect(result).toBe(true);
      expect(setSpy).toHaveBeenCalledWith({ status: 'archived' });
    });
  });
});
