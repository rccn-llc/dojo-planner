import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

vi.mock('@/models/Schema', () => ({
  attendanceSchema: { classScheduleInstanceId: 'attendance_instance_id' },
  classScheduleExceptionSchema: { classScheduleInstanceId: 'exc_instance_id' },
  classScheduleInstanceSchema: { id: 'csi_id', classId: 'csi_class_id' },
  classSchema: { id: 'class_id', organizationId: 'class_org_id' },
  classTagSchema: { classId: 'ct_class_id', tagId: 'ct_tag_id' },
  programSchema: { id: 'program_id' },
  tagSchema: { id: 'tag_id', organizationId: 'tag_org_id' },
}));

const baseServiceInput = {
  name: 'BJJ Fundamentals',
  description: null,
  programId: null,
  color: null,
  defaultDurationMinutes: 60,
  maxCapacity: null,
  minAge: null,
  maxAge: null,
  isActive: true,
  schedule: [],
  tagIds: [],
};

const reReadRow = {
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
  programId: null,
};

/**
 * Wires up the mocks that getClassById → getOrganizationClasses needs after a
 * write. Returns a single class with the given allowWalkIns value.
 *
 * `getId` is resolved lazily so the re-read row's id matches the (randomly
 * generated) id the create/update path filters getClassById on.
 */
function stubReRead(allowWalkIns: string | null, getId: () => string) {
  // getOrganizationClasses: first select = classes for org.
  dbMock.select.mockReturnValueOnce({
    from: () => ({ where: () => Promise.resolve([{ ...reReadRow, id: getId(), allowWalkIns }]) }),
  });
  // Then Promise.all of [programs, scheduleInstances, classTags, allTags].
  dbMock.select.mockReturnValueOnce({
    from: () => ({ where: () => Promise.resolve([]) }),
  }); // scheduleInstances
  dbMock.select.mockReturnValueOnce({
    from: () => ({ where: () => Promise.resolve([]) }),
  }); // classTags
  dbMock.select.mockReturnValueOnce({
    from: () => ({ where: () => Promise.resolve([]) }),
  }); // allTags
}

describe('ClassesService.createClass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists allowWalkIns as provided', async () => {
    let insertedId = '';
    const valuesSpy = vi.fn().mockImplementation((row: { id: string }) => {
      insertedId = row.id;
      return Promise.resolve(undefined);
    });
    dbMock.insert.mockReturnValueOnce({ values: valuesSpy });
    stubReRead('No', () => insertedId);

    const { createClass } = await import('./ClassesService');
    const result = await createClass({ ...baseServiceInput, allowWalkIns: 'No' }, 'org-1');

    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({ allowWalkIns: 'No' }));
    expect(result.allowWalkIns).toBe('No');
  });

  it('defaults allowWalkIns to \'Yes\' when not provided', async () => {
    let insertedId = '';
    const valuesSpy = vi.fn().mockImplementation((row: { id: string }) => {
      insertedId = row.id;
      return Promise.resolve(undefined);
    });
    dbMock.insert.mockReturnValueOnce({ values: valuesSpy });
    stubReRead('Yes', () => insertedId);

    const { createClass } = await import('./ClassesService');
    await createClass({ ...baseServiceInput, allowWalkIns: undefined }, 'org-1');

    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({ allowWalkIns: 'Yes' }));
  });
});

describe('ClassesService.updateClass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists allowWalkIns on the update set', async () => {
    // Ownership check select → existing class row.
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([reReadRow]) }) }),
    });

    const setSpy = vi.fn().mockReturnValue({ where: () => Promise.resolve(undefined) });
    dbMock.update.mockReturnValueOnce({ set: setSpy });

    // Old schedule instances select → none, so no delete/reinsert branch.
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });

    // Replace tag associations delete.
    dbMock.delete.mockReturnValueOnce({ where: () => Promise.resolve(undefined) });

    stubReRead('No', () => 'class-1');

    const { updateClass } = await import('./ClassesService');
    const result = await updateClass('class-1', { ...baseServiceInput, allowWalkIns: 'No' }, 'org-1');

    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ allowWalkIns: 'No' }));
    expect(result?.allowWalkIns).toBe('No');
  });

  it('returns null when the class is not in the org', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    const { updateClass } = await import('./ClassesService');
    const result = await updateClass('class-other', { ...baseServiceInput, allowWalkIns: 'Yes' }, 'org-1');

    expect(result).toBeNull();
  });
});
