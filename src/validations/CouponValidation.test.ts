import { describe, expect, it } from 'vitest';
import { CreateCouponValidation, DeleteCouponValidation, UpdateCouponValidation } from './CouponValidation';

const validBase = {
  code: 'TEST20',
  name: 'TEST20',
  description: 'A test coupon',
  discountType: 'percentage' as const,
  discountValue: 20,
  applicableTo: 'membership' as const,
  usageLimit: 100,
  perUserLimit: 1,
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validUntil: new Date('2026-12-31T23:59:59Z'),
  status: 'active' as const,
};

describe('CreateCouponValidation', () => {
  it('accepts a complete valid payload', () => {
    expect(CreateCouponValidation.safeParse(validBase).success).toBe(true);
  });

  it('rejects empty code', () => {
    const result = CreateCouponValidation.safeParse({ ...validBase, code: '' });

    expect(result.success).toBe(false);
  });

  it('rejects invalid discountType enum', () => {
    const result = CreateCouponValidation.safeParse({ ...validBase, discountType: 'percent' });

    expect(result.success).toBe(false);
  });

  it('rejects invalid applicableTo enum', () => {
    const result = CreateCouponValidation.safeParse({ ...validBase, applicableTo: 'memberships' });

    expect(result.success).toBe(false);
  });

  it('rejects invalid status enum', () => {
    const result = CreateCouponValidation.safeParse({ ...validBase, status: 'Active' });

    expect(result.success).toBe(false);
  });

  it('rejects non-positive discountValue', () => {
    expect(CreateCouponValidation.safeParse({ ...validBase, discountValue: 0 }).success).toBe(false);
    expect(CreateCouponValidation.safeParse({ ...validBase, discountValue: -5 }).success).toBe(false);
  });

  it('rejects percentage discountValue greater than 100', () => {
    expect(
      CreateCouponValidation.safeParse({ ...validBase, discountType: 'percentage', discountValue: 150 }).success,
    ).toBe(false);
  });

  it('allows fixed discountValue greater than 100', () => {
    expect(
      CreateCouponValidation.safeParse({ ...validBase, discountType: 'fixed', discountValue: 250 }).success,
    ).toBe(true);
  });

  it('allows null usageLimit (unlimited)', () => {
    expect(CreateCouponValidation.safeParse({ ...validBase, usageLimit: null }).success).toBe(true);
  });

  it('rejects non-positive usageLimit', () => {
    expect(CreateCouponValidation.safeParse({ ...validBase, usageLimit: 0 }).success).toBe(false);
    expect(CreateCouponValidation.safeParse({ ...validBase, usageLimit: -3 }).success).toBe(false);
  });

  it('rejects non-positive perUserLimit', () => {
    expect(CreateCouponValidation.safeParse({ ...validBase, perUserLimit: 0 }).success).toBe(false);
    expect(CreateCouponValidation.safeParse({ ...validBase, perUserLimit: -1 }).success).toBe(false);
  });

  it('rejects non-integer perUserLimit', () => {
    expect(CreateCouponValidation.safeParse({ ...validBase, perUserLimit: 1.5 }).success).toBe(false);
  });

  it('allows null validUntil (never expires)', () => {
    expect(CreateCouponValidation.safeParse({ ...validBase, validUntil: null }).success).toBe(true);
  });

  it('rejects validUntil before validFrom', () => {
    const result = CreateCouponValidation.safeParse({
      ...validBase,
      validFrom: new Date('2026-12-31'),
      validUntil: new Date('2026-01-01'),
    });

    expect(result.success).toBe(false);
  });

  it('allows nullable description', () => {
    expect(CreateCouponValidation.safeParse({ ...validBase, description: null }).success).toBe(true);
    expect(CreateCouponValidation.safeParse({ ...validBase, description: undefined }).success).toBe(true);
  });
});

describe('UpdateCouponValidation', () => {
  it('requires id in addition to the create fields', () => {
    expect(UpdateCouponValidation.safeParse(validBase).success).toBe(false);
    expect(UpdateCouponValidation.safeParse({ id: 'cpn-1', ...validBase }).success).toBe(true);
  });

  it('rejects empty id', () => {
    expect(UpdateCouponValidation.safeParse({ id: '', ...validBase }).success).toBe(false);
  });
});

describe('DeleteCouponValidation', () => {
  it('accepts a non-empty id', () => {
    expect(DeleteCouponValidation.safeParse({ id: 'cpn-1' }).success).toBe(true);
  });

  it('rejects empty or missing id', () => {
    expect(DeleteCouponValidation.safeParse({ id: '' }).success).toBe(false);
    expect(DeleteCouponValidation.safeParse({}).success).toBe(false);
  });
});
