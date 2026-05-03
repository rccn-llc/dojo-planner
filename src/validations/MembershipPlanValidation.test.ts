import { describe, expect, it } from 'vitest';
import {
  CreateMembershipPlanValidation,
  DeleteMembershipPlanValidation,
  UpdateMembershipPlanValidation,
} from './MembershipPlanValidation';

const validBase = {
  name: 'Adult Monthly Gold',
  slug: 'adult-monthly-gold',
  category: 'Adult BJJ',
  program: 'Adult',
  programId: null,
  price: 149,
  signupFee: 99,
  frequency: 'Monthly' as const,
  contractLength: 'Month-to-Month',
  accessLevel: 'Unlimited',
  description: 'Premium adult plan',
  isTrial: false,
  isActive: true,
};

describe('CreateMembershipPlanValidation', () => {
  it('accepts a complete valid payload', () => {
    expect(CreateMembershipPlanValidation.safeParse(validBase).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateMembershipPlanValidation.safeParse({ ...validBase, name: '' }).success).toBe(false);
  });

  it('rejects empty slug', () => {
    expect(CreateMembershipPlanValidation.safeParse({ ...validBase, slug: '' }).success).toBe(false);
  });

  it('rejects invalid frequency enum', () => {
    expect(CreateMembershipPlanValidation.safeParse({ ...validBase, frequency: 'Quarterly' }).success).toBe(false);
  });

  it('accepts each valid frequency', () => {
    for (const f of ['Monthly', 'Annual', 'Weekly', 'None'] as const) {
      expect(CreateMembershipPlanValidation.safeParse({ ...validBase, frequency: f }).success).toBe(true);
    }
  });

  it('rejects negative price', () => {
    expect(CreateMembershipPlanValidation.safeParse({ ...validBase, price: -1 }).success).toBe(false);
  });

  it('accepts zero price (free trial)', () => {
    expect(CreateMembershipPlanValidation.safeParse({ ...validBase, price: 0 }).success).toBe(true);
  });

  it('rejects negative signupFee', () => {
    expect(CreateMembershipPlanValidation.safeParse({ ...validBase, signupFee: -10 }).success).toBe(false);
  });

  it('allows null programId', () => {
    expect(CreateMembershipPlanValidation.safeParse({ ...validBase, programId: null }).success).toBe(true);
  });

  it('allows null description', () => {
    expect(CreateMembershipPlanValidation.safeParse({ ...validBase, description: null }).success).toBe(true);
  });
});

describe('UpdateMembershipPlanValidation', () => {
  it('requires id', () => {
    expect(UpdateMembershipPlanValidation.safeParse(validBase).success).toBe(false);
    expect(UpdateMembershipPlanValidation.safeParse({ id: 'plan-1', ...validBase }).success).toBe(true);
  });
});

describe('DeleteMembershipPlanValidation', () => {
  it('accepts a non-empty id', () => {
    expect(DeleteMembershipPlanValidation.safeParse({ id: 'plan-1' }).success).toBe(true);
  });

  it('rejects empty id', () => {
    expect(DeleteMembershipPlanValidation.safeParse({ id: '' }).success).toBe(false);
  });
});
