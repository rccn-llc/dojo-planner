import { beforeEach, describe, expect, it, vi } from 'vitest';

// Each test sets up the mock chain it needs by reassigning these factories.
const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

vi.mock('@/models/Schema', () => ({
  tagSchema: {
    id: 'id',
    organizationId: 'organization_id',
    entityType: 'entity_type',
    name: 'name',
    slug: 'slug',
    color: 'color',
  },
  classTagSchema: {
    classId: 'class_id',
    tagId: 'tag_id',
  },
  membershipTagSchema: {
    membershipPlanId: 'membership_plan_id',
    tagId: 'tag_id',
  },
  eventTagSchema: {
    eventId: 'event_id',
    tagId: 'tag_id',
  },
}));

describe('TagsService mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTag', () => {
    it('inserts and returns the new tag with a slugified slug', async () => {
      const inserted = {
        id: 'tag-1',
        organizationId: 'org-1',
        entityType: 'class',
        name: 'Beginner Friendly',
        slug: 'beginner-friendly',
        color: '#4f46e5',
      };
      const valuesMock = vi.fn((..._args: unknown[]) => ({ returning: () => Promise.resolve([inserted]) }));
      dbMock.insert.mockReturnValueOnce({ values: valuesMock });

      const { createTag } = await import('./TagsService');
      const result = await createTag({
        organizationId: 'org-1',
        entityType: 'class',
        name: 'Beginner Friendly',
        color: '#4f46e5',
      });

      expect(result).toEqual({
        id: 'tag-1',
        name: 'Beginner Friendly',
        slug: 'beginner-friendly',
        color: '#4f46e5',
        entityType: 'class',
        usageCount: 0,
      });

      // Verify slug was derived from name
      const insertedValues = valuesMock.mock.calls[0]?.[0] as { slug: string };

      expect(insertedValues.slug).toBe('beginner-friendly');
    });

    it('throws TagNameAlreadyExistsError on Postgres unique-violation', async () => {
      const uniqueViolation: Error & { code: string } = Object.assign(
        new Error('duplicate key'),
        { code: '23505' },
      );
      dbMock.insert.mockReturnValueOnce({
        values: () => ({ returning: () => Promise.reject(uniqueViolation) }),
      });

      const { createTag, TagNameAlreadyExistsError } = await import('./TagsService');

      await expect(
        createTag({ organizationId: 'org-1', entityType: 'class', name: 'Beginner' }),
      ).rejects.toBeInstanceOf(TagNameAlreadyExistsError);
    });

    it('rethrows non-unique-violation errors', async () => {
      dbMock.insert.mockReturnValueOnce({
        values: () => ({ returning: () => Promise.reject(new Error('boom')) }),
      });

      const { createTag } = await import('./TagsService');

      await expect(
        createTag({ organizationId: 'org-1', entityType: 'class', name: 'Beginner' }),
      ).rejects.toThrow('boom');
    });
  });

  describe('updateTag', () => {
    it('returns null when the tag is not in the org (cross-tenant guard)', async () => {
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
      });

      const { updateTag } = await import('./TagsService');
      const result = await updateTag({
        id: 'tag-other-org',
        organizationId: 'org-1',
        name: 'New name',
      });

      expect(result).toBeNull();
    });

    it('updates and returns the tag when authorized', async () => {
      // existence check returns the tag
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'tag-1' }]) }) }),
      });

      const updated = {
        id: 'tag-1',
        organizationId: 'org-1',
        entityType: 'class',
        name: 'Renamed',
        slug: 'renamed',
        color: null,
      };
      dbMock.update.mockReturnValueOnce({
        set: () => ({ where: () => ({ returning: () => Promise.resolve([updated]) }) }),
      });

      const { updateTag } = await import('./TagsService');
      const result = await updateTag({
        id: 'tag-1',
        organizationId: 'org-1',
        name: 'Renamed',
      });

      expect(result).toEqual({
        id: 'tag-1',
        name: 'Renamed',
        slug: 'renamed',
        color: null,
        entityType: 'class',
        usageCount: 0,
      });
    });

    it('throws TagNameAlreadyExistsError on slug collision during update', async () => {
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'tag-1' }]) }) }),
      });
      const uniqueViolation: Error & { code: string } = Object.assign(
        new Error('duplicate key'),
        { code: '23505' },
      );
      dbMock.update.mockReturnValueOnce({
        set: () => ({ where: () => ({ returning: () => Promise.reject(uniqueViolation) }) }),
      });

      const { updateTag, TagNameAlreadyExistsError } = await import('./TagsService');

      await expect(
        updateTag({ id: 'tag-1', organizationId: 'org-1', name: 'Beginner' }),
      ).rejects.toBeInstanceOf(TagNameAlreadyExistsError);
    });
  });

  describe('deleteTag', () => {
    it('returns deleted=false when the tag is not in the org', async () => {
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
      });

      const { deleteTag } = await import('./TagsService');
      const result = await deleteTag('tag-other-org', 'org-1');

      expect(result).toEqual({ deleted: false, unlinkedFromCount: 0 });
      expect(dbMock.transaction).not.toHaveBeenCalled();
    });

    it('cascades through junction tables and returns the unlink count', async () => {
      // existence check
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'tag-1' }]) }) }),
      });

      // Inside the transaction we run 3 count queries (each returns
      // { count: number }) followed by 4 deletes. The mock tx implements just
      // enough surface for the function under test.
      const counts = [3, 1, 0];
      type MockTx = {
        select: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      const tx: MockTx = {
        select: vi.fn(() => ({
          from: () => ({
            where: () => Promise.resolve([{ count: counts.shift() ?? 0 }]),
          }),
        })),
        delete: vi.fn(() => ({ where: () => Promise.resolve() })),
      };
      dbMock.transaction.mockImplementationOnce(async (cb: (txArg: MockTx) => Promise<unknown>) => cb(tx));

      const { deleteTag } = await import('./TagsService');
      const result = await deleteTag('tag-1', 'org-1');

      expect(result).toEqual({ deleted: true, unlinkedFromCount: 4 });
      // class + membership + event + tag itself = 4 deletes
      expect(tx.delete).toHaveBeenCalledTimes(4);
    });
  });
});

describe('TagsService.assertTagsInOrg', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op for an empty tag list', async () => {
    const { assertTagsInOrg } = await import('./TagsService');

    await expect(assertTagsInOrg([], 'org-1', 'class')).resolves.toBeUndefined();
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('resolves when every tag belongs to the org + entity type', async () => {
    // Two unique ids requested → two matching rows returned.
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ id: 't-1' }, { id: 't-2' }]) }),
    });

    const { assertTagsInOrg } = await import('./TagsService');

    await expect(assertTagsInOrg(['t-1', 't-2'], 'org-1', 'class')).resolves.toBeUndefined();
  });

  it('throws TagNotFoundError when a tag is missing / foreign / wrong entity type', async () => {
    // Requested 2, only 1 matched.
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ id: 't-1' }]) }),
    });

    const { assertTagsInOrg, TagNotFoundError } = await import('./TagsService');

    await expect(assertTagsInOrg(['t-1', 't-foreign'], 'org-1', 'class')).rejects.toBeInstanceOf(TagNotFoundError);
  });
});
