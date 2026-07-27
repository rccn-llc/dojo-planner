import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

vi.mock('@/models/Schema', () => ({
  programSchema: {
    id: 'id',
    organizationId: 'organization_id',
  },
  classSchema: {
    organizationId: 'organization_id',
    programId: 'program_id',
  },
  membershipPlanSchema: {
    programId: 'program_id',
  },
}));

const baseRow = {
  id: 'p-1',
  organizationId: 'org-1',
  name: 'Adult BJJ',
  slug: 'adult-bjj',
  description: 'Adult program',
  color: '#4f46e5',
  isActive: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validInput = {
  name: 'Adult BJJ',
  description: 'Adult program',
  color: '#4f46e5',
  isActive: true,
  sortOrder: 0,
};

describe('ProgramsService.createProgram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts and returns the program in service shape', async () => {
    dbMock.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.resolve([baseRow]) }),
    });

    const { createProgram } = await import('./ProgramsService');
    const result = await createProgram(validInput, 'org-1');

    expect(result.slug).toBe('adult-bjj');
    expect(result.classCount).toBe(0);
  });

  it('throws ProgramSlugAlreadyExistsError on Postgres unique-violation', async () => {
    const uniqueViolation: Error & { code: string } = Object.assign(
      new Error('duplicate key'),
      { code: '23505' },
    );
    dbMock.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.reject(uniqueViolation) }),
    });

    const { createProgram, ProgramSlugAlreadyExistsError } = await import('./ProgramsService');

    await expect(createProgram(validInput, 'org-1')).rejects.toBeInstanceOf(ProgramSlugAlreadyExistsError);
  });
});

describe('ProgramsService.updateProgram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when program is not in the org', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    const { updateProgram } = await import('./ProgramsService');

    expect(await updateProgram('p-other', validInput, 'org-1')).toBeNull();
  });

  it('updates and returns the new program shape', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    dbMock.update.mockReturnValueOnce({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ ...baseRow, name: 'Updated' }]),
        }),
      }),
    });

    const { updateProgram } = await import('./ProgramsService');
    const result = await updateProgram('p-1', { ...validInput, name: 'Updated' }, 'org-1');

    expect(result?.name).toBe('Updated');
  });
});

describe('ProgramsService.deleteProgram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when program is not in the org', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    const { deleteProgram } = await import('./ProgramsService');

    expect(await deleteProgram('p-other', 'org-1')).toBe(false);
  });

  it('deletes when no classes or plans reference it', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
    });
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
    });
    dbMock.delete.mockReturnValueOnce({ where: () => Promise.resolve(undefined) });

    const { deleteProgram } = await import('./ProgramsService');

    expect(await deleteProgram('p-1', 'org-1')).toBe(true);
    expect(dbMock.delete).toHaveBeenCalled();
  });

  it('throws ProgramInUseError when classes reference it', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ count: 3 }]) }),
    });
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
    });

    const { deleteProgram, ProgramInUseError } = await import('./ProgramsService');

    await expect(deleteProgram('p-1', 'org-1')).rejects.toBeInstanceOf(ProgramInUseError);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it('throws ProgramInUseError when membership plans reference it', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
    });
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ count: 2 }]) }),
    });

    const { deleteProgram, ProgramInUseError } = await import('./ProgramsService');

    await expect(deleteProgram('p-1', 'org-1')).rejects.toBeInstanceOf(ProgramInUseError);
  });
});

describe('ProgramsService.assertProgramInOrg', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves when the program belongs to the org', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'p-1' }]) }) }),
    });

    const { assertProgramInOrg } = await import('./ProgramsService');

    await expect(assertProgramInOrg('p-1', 'org-1')).resolves.toBeUndefined();
  });

  it('throws ProgramNotFoundError when the program is missing or in another org', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    const { assertProgramInOrg, ProgramNotFoundError } = await import('./ProgramsService');

    await expect(assertProgramInOrg('p-foreign', 'org-1')).rejects.toBeInstanceOf(ProgramNotFoundError);
  });
});
