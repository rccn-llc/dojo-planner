import { describe, expect, it } from 'vitest';

import {
  getPlanPrice,
  getPlanTotalPrice,
  getSaasPlan,
  SaasPlanList,
} from './SaasPlans';

describe('SaasPlanList', () => {
  it('has 2 plans', () => {
    expect(Object.keys(SaasPlanList)).toHaveLength(2);
  });

  it('each plan has the correct structure', () => {
    for (const plan of Object.values(SaasPlanList)) {
      expect(plan).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        monthlyPrice: expect.any(Number),
        annualPricePerMonth: expect.any(Number),
        annualTotal: expect.any(Number),
        description: expect.any(String),
        features: expect.any(Array),
        isContactUs: expect.any(Boolean),
      });
    }
  });

  it('both plans have isContactUs set to false', () => {
    expect(SaasPlanList.basic!.isContactUs).toBe(false);
    expect(SaasPlanList.growth!.isContactUs).toBe(false);
  });
});

describe('getSaasPlan', () => {
  it('returns the basic plan', () => {
    const plan = getSaasPlan('basic');

    expect(plan).toBeDefined();
    expect(plan!.id).toBe('basic');
    expect(plan!.name).toBe('Basic');
  });

  it('returns the growth plan', () => {
    const plan = getSaasPlan('growth');

    expect(plan).toBeDefined();
    expect(plan!.id).toBe('growth');
    expect(plan!.name).toBe('Growth');
  });

  it('returns undefined for an invalid plan id', () => {
    expect(getSaasPlan('invalid')).toBeUndefined();
  });

  it('returns undefined for enterprise', () => {
    expect(getSaasPlan('enterprise')).toBeUndefined();
  });
});

describe('getPlanPrice', () => {
  it('returns monthly price for basic plan', () => {
    expect(getPlanPrice('basic', 'monthly')).toBe(49);
  });

  it('returns annual per-month price for basic plan', () => {
    expect(getPlanPrice('basic', 'annual')).toBe(29);
  });

  it('returns monthly price for growth plan', () => {
    expect(getPlanPrice('growth', 'monthly')).toBe(125);
  });

  it('returns annual per-month price for growth plan', () => {
    expect(getPlanPrice('growth', 'annual')).toBe(99);
  });

  it('throws for an invalid plan id (never silently prices at $0)', () => {
    // @ts-expect-error — deliberately passing an invalid id to assert the throw.
    expect(() => getPlanPrice('invalid', 'monthly')).toThrow();
    // @ts-expect-error — deliberately passing an invalid id to assert the throw.
    expect(() => getPlanPrice('invalid', 'annual')).toThrow();
  });
});

describe('getPlanTotalPrice', () => {
  it('returns monthly price for monthly billing cycle', () => {
    expect(getPlanTotalPrice('basic', 'monthly')).toBe(49);
    expect(getPlanTotalPrice('growth', 'monthly')).toBe(125);
  });

  it('returns annual total for annual billing cycle', () => {
    expect(getPlanTotalPrice('basic', 'annual')).toBe(348);
    expect(getPlanTotalPrice('growth', 'annual')).toBe(1188);
  });

  it('throws for an invalid plan id (never silently prices at $0)', () => {
    // @ts-expect-error — deliberately passing an invalid id to assert the throw.
    expect(() => getPlanTotalPrice('invalid', 'monthly')).toThrow();
    // @ts-expect-error — deliberately passing an invalid id to assert the throw.
    expect(() => getPlanTotalPrice('invalid', 'annual')).toThrow();
  });
});
