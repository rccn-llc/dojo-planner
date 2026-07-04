import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

vi.mock('@/models/Schema', () => ({
  instructorProfileSchema: {
    id: 'id',
    organizationId: 'organization_id',
    clerkUserId: 'clerk_user_id',
    photoUrl: 'photo_url',
  },
}));

vi.mock('@/services/ClerkRolesService', () => ({
  clerkApiRequest: vi.fn(),
}));

const membershipsPayload = {
  data: [
    {
      role: 'org:instructor',
      public_user_data: {
        user_id: 'u1',
        first_name: 'Ann',
        last_name: 'Lee',
        image_url: 'http://clerk/ann.png',
      },
    },
    {
      role: 'org:academy_owner',
      public_user_data: {
        user_id: 'u2',
        first_name: 'Bob',
        last_name: null,
        identifier: 'bob@x.com',
      },
    },
    {
      role: 'org:admin',
      public_user_data: { user_id: 'u3', first_name: 'Cy', last_name: 'Ng' },
    },
    {
      role: 'org:front_desk',
      public_user_data: { user_id: 'u4' },
    },
    {
      role: 'org:instructor',
      public_user_data: null,
    },
  ],
  total_count: 5,
};

describe('InstructorsService.getOrganizationInstructors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only instructor + academy_owner members, deduped, with DB photo override', async () => {
    const { clerkApiRequest } = await import('@/services/ClerkRolesService');
    vi.mocked(clerkApiRequest).mockResolvedValue(membershipsPayload as never);

    // instructor_profile override rows for the org.
    dbMock.select.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([
          { clerkUserId: 'u1', photoUrl: 'data:image/png;base64,OVERRIDE' },
        ]),
      }),
    });

    const { getOrganizationInstructors } = await import('./InstructorsService');
    const result = await getOrganizationInstructors('test-org-1');

    // admin (u3), front_desk (u4), and null-user membership are excluded.
    expect(result.map(i => i.id)).toEqual(['u1', 'u2']);

    const ann = result.find(i => i.id === 'u1');
    const bob = result.find(i => i.id === 'u2');

    expect(ann?.name).toBe('Ann Lee');
    // DB override wins over the Clerk avatar.
    expect(ann?.photoUrl).toBe('data:image/png;base64,OVERRIDE');

    // Bob has no last name → falls back to first name 'Bob'.
    expect(bob?.name).toBe('Bob');
    // No override for Bob and no image_url → null.
    expect(bob?.photoUrl).toBeNull();
  });

  it('uses the Clerk avatar when no DB override exists', async () => {
    const { clerkApiRequest } = await import('@/services/ClerkRolesService');
    vi.mocked(clerkApiRequest).mockResolvedValue(membershipsPayload as never);

    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });

    const { getOrganizationInstructors } = await import('./InstructorsService');
    const result = await getOrganizationInstructors('test-org-1');

    expect(result.find(i => i.id === 'u1')?.photoUrl).toBe('http://clerk/ann.png');
  });

  it('does not re-add a duplicate clerk user id', async () => {
    const { clerkApiRequest } = await import('@/services/ClerkRolesService');
    vi.mocked(clerkApiRequest).mockResolvedValue({
      data: [
        { role: 'org:instructor', public_user_data: { user_id: 'u1', first_name: 'Ann', last_name: 'Lee' } },
        { role: 'org:academy_owner', public_user_data: { user_id: 'u1', first_name: 'Ann', last_name: 'Lee' } },
      ],
      total_count: 2,
    } as never);

    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });

    const { getOrganizationInstructors } = await import('./InstructorsService');
    const result = await getOrganizationInstructors('test-org-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('u1');
  });
});

describe('InstructorsService.upsertInstructorPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates an existing row when one is found', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'x' }]) }) }),
    });
    const setSpy = vi.fn().mockReturnValue({ where: () => Promise.resolve(undefined) });
    dbMock.update.mockReturnValueOnce({ set: setSpy });

    const { upsertInstructorPhoto } = await import('./InstructorsService');
    await upsertInstructorPhoto('test-org-1', 'u1', 'data:image/png;base64,AAAA');

    expect(dbMock.update).toHaveBeenCalled();
    expect(setSpy).toHaveBeenCalledWith({ photoUrl: 'data:image/png;base64,AAAA' });
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('inserts a new row when none is found', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValueOnce({ values: valuesSpy });

    const { upsertInstructorPhoto } = await import('./InstructorsService');
    await upsertInstructorPhoto('test-org-1', 'u1', null);

    expect(dbMock.insert).toHaveBeenCalled();
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'test-org-1',
      clerkUserId: 'u1',
      photoUrl: null,
    }));
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});

describe('InstructorsService.getInstructorPhotoOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a Map of clerkUserId → photoUrl', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([
          { clerkUserId: 'u1', photoUrl: 'data:image/png;base64,AAAA' },
          { clerkUserId: 'u2', photoUrl: null },
        ]),
      }),
    });

    const { getInstructorPhotoOverrides } = await import('./InstructorsService');
    const result = await getInstructorPhotoOverrides('test-org-1');

    expect(result).toBeInstanceOf(Map);
    expect(result.get('u1')).toBe('data:image/png;base64,AAAA');
    expect(result.get('u2')).toBeNull();
    expect(result.size).toBe(2);
  });
});
