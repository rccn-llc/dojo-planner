import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

vi.mock('@/models/Schema', () => ({
  membershipPlanSchema: {
    id: 'id',
    organizationId: 'organization_id',
    slug: 'slug',
  },
  memberMembershipSchema: {
    membershipPlanId: 'membership_plan_id',
  },
}));

const baseRow = {
  id: 'plan-1',
  organizationId: 'org-1',
  programId: null,
  name: 'Adult Monthly Gold',
  slug: 'adult-monthly-gold',
  category: 'Adult BJJ',
  program: 'Adult',
  price: 149,
  signupFee: 99,
  cancellationFee: 0,
  holdFeeAmount: 0,
  holdFeeFrequency: null,
  holdLimitPerYear: null,
  frequency: 'Monthly',
  contractLength: 'Month-to-Month',
  accessLevel: 'Unlimited',
  description: null,
  isTrial: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validInput = {
  name: baseRow.name,
  slug: baseRow.slug,
  category: baseRow.category,
  program: baseRow.program,
  programId: null,
  price: 149,
  signupFee: 99,
  cancellationFee: 0,
  holdFeeAmount: 0,
  holdFeeFrequency: null,
  holdLimitPerYear: null,
  frequency: 'Monthly' as const,
  contractLength: 'Month-to-Month',
  accessLevel: 'Unlimited',
  description: null,
  isTrial: false,
  isActive: true,
};

describe('MembershipPlansService.createMembershipPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts and returns the plan in service shape', async () => {
    dbMock.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.resolve([baseRow]) }),
    });

    const { createMembershipPlan } = await import('./MembershipPlansService');
    const result = await createMembershipPlan(validInput, 'org-1');

    expect(result.id).toBe('plan-1');
    expect(result.slug).toBe('adult-monthly-gold');
    expect(result.isActive).toBe(true);
  });

  it('throws MembershipPlanSlugAlreadyExistsError on Postgres unique-violation', async () => {
    const uniqueViolation: Error & { code: string } = Object.assign(
      new Error('duplicate key'),
      { code: '23505' },
    );
    dbMock.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.reject(uniqueViolation) }),
    });

    const { createMembershipPlan, MembershipPlanSlugAlreadyExistsError } = await import('./MembershipPlansService');

    await expect(createMembershipPlan(validInput, 'org-1')).rejects.toBeInstanceOf(MembershipPlanSlugAlreadyExistsError);
  });

  it('throws InvalidProgramReferenceError on Postgres foreign-key violation', async () => {
    const fkViolation: Error & { code: string } = Object.assign(
      new Error('insert or update violates foreign key constraint'),
      { code: '23503' },
    );
    dbMock.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.reject(fkViolation) }),
    });

    const { createMembershipPlan, InvalidProgramReferenceError } = await import('./MembershipPlansService');

    await expect(createMembershipPlan({ ...validInput, programId: 'nope' }, 'org-1')).rejects.toBeInstanceOf(InvalidProgramReferenceError);
  });

  it('rethrows non-unique-violation errors', async () => {
    dbMock.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.reject(new Error('boom')) }),
    });

    const { createMembershipPlan } = await import('./MembershipPlansService');

    await expect(createMembershipPlan(validInput, 'org-1')).rejects.toThrow('boom');
  });
});

describe('MembershipPlansService.updateMembershipPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when plan is not in the org (cross-tenant guard)', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    const { updateMembershipPlan } = await import('./MembershipPlansService');
    const result = await updateMembershipPlan('plan-other-org', validInput, 'org-1');

    expect(result).toBeNull();
  });

  it('updates and returns the new plan shape', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    dbMock.update.mockReturnValueOnce({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ ...baseRow, price: 199 }]),
        }),
      }),
    });

    const { updateMembershipPlan } = await import('./MembershipPlansService');
    const result = await updateMembershipPlan('plan-1', { ...validInput, price: 199 }, 'org-1');

    expect(result?.price).toBe(199);
  });

  it('throws MembershipPlanSlugAlreadyExistsError on slug conflict', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    const uniqueViolation: Error & { code: string } = Object.assign(
      new Error('duplicate key'),
      { code: '23505' },
    );
    dbMock.update.mockReturnValueOnce({
      set: () => ({ where: () => ({ returning: () => Promise.reject(uniqueViolation) }) }),
    });

    const { updateMembershipPlan, MembershipPlanSlugAlreadyExistsError } = await import('./MembershipPlansService');

    await expect(updateMembershipPlan('plan-1', validInput, 'org-1')).rejects.toBeInstanceOf(MembershipPlanSlugAlreadyExistsError);
  });

  it('throws InvalidProgramReferenceError on foreign-key violation', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    const fkViolation: Error & { code: string } = Object.assign(
      new Error('insert or update violates foreign key constraint'),
      { code: '23503' },
    );
    dbMock.update.mockReturnValueOnce({
      set: () => ({ where: () => ({ returning: () => Promise.reject(fkViolation) }) }),
    });

    const { updateMembershipPlan, InvalidProgramReferenceError } = await import('./MembershipPlansService');

    await expect(updateMembershipPlan('plan-1', { ...validInput, programId: 'nope' }, 'org-1')).rejects.toBeInstanceOf(InvalidProgramReferenceError);
  });
});

describe('MembershipPlansService.deleteMembershipPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when plan is not in the org', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    const { deleteMembershipPlan } = await import('./MembershipPlansService');
    const result = await deleteMembershipPlan('plan-other-org', 'org-1');

    expect(result).toBe(false);
  });

  it('deletes the plan when no member memberships reference it', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
    });
    dbMock.delete.mockReturnValueOnce({ where: () => Promise.resolve(undefined) });

    const { deleteMembershipPlan } = await import('./MembershipPlansService');
    const result = await deleteMembershipPlan('plan-1', 'org-1');

    expect(result).toBe(true);
    expect(dbMock.delete).toHaveBeenCalled();
  });

  it('throws MembershipPlanInUseError when member memberships reference the plan', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ count: 5 }]) }),
    });

    const { deleteMembershipPlan, MembershipPlanInUseError } = await import('./MembershipPlansService');

    await expect(deleteMembershipPlan('plan-1', 'org-1')).rejects.toBeInstanceOf(MembershipPlanInUseError);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });
});
