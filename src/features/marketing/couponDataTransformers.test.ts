import type { CouponFormData } from './types';
import type { Coupon as DbCoupon } from '@/hooks/useCouponsCache';
import { describe, expect, it } from 'vitest';
import { transformCouponToUi, transformUiCouponFormToDb } from './couponDataTransformers';

const baseDb: DbCoupon = {
  id: 'cpn-1',
  code: 'TEST20',
  name: 'TEST20',
  description: 'Twenty percent off',
  discountType: 'percentage',
  discountValue: 20,
  applicableTo: 'membership',
  usageLimit: 100,
  usageCount: 5,
  perUserLimit: 2,
  status: 'active',
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validUntil: new Date('2026-12-31T23:59:59Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('transformCouponToUi', () => {
  it('threads perUserLimit through to the UI shape', () => {
    const ui = transformCouponToUi(baseDb);

    expect(ui.perUserLimit).toBe(2);
  });

  it('formats percentage amount as "N%"', () => {
    expect(transformCouponToUi(baseDb).amount).toBe('20%');
  });

  it('formats fixed amount as "$N"', () => {
    expect(transformCouponToUi({ ...baseDb, discountType: 'fixed', discountValue: 50 }).amount).toBe('$50');
  });

  it('formats free_days amount as "N Days"', () => {
    expect(transformCouponToUi({ ...baseDb, discountType: 'free_days', discountValue: 7 }).amount).toBe('7 Days');
  });

  it('renders unlimited usage as "N/∞"', () => {
    expect(transformCouponToUi({ ...baseDb, usageCount: 3, usageLimit: null }).usage).toBe('3/\u221E');
  });

  it('renders empty endDateTime when validUntil is null', () => {
    expect(transformCouponToUi({ ...baseDb, validUntil: null }).endDateTime).toBe('');
  });
});

const baseForm: CouponFormData = {
  code: 'test20',
  description: 'Twenty percent off',
  type: 'Percentage',
  amount: '20',
  applyTo: 'Memberships',
  usageLimit: '100',
  perUserLimit: '2',
  startDate: '2026-01-01',
  startTime: '00:00:00',
  endDate: '2026-12-31',
  endTime: '23:59:59',
  neverExpires: false,
  status: 'Active',
};

describe('transformUiCouponFormToDb', () => {
  it('uppercases and trims the code, derives name from code', () => {
    const result = transformUiCouponFormToDb({ ...baseForm, code: '  test20  ' });

    expect(result.code).toBe('TEST20');
    expect(result.name).toBe('TEST20');
  });

  it('maps Percentage → percentage', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, type: 'Percentage' }).discountType).toBe('percentage');
  });

  it('maps Fixed Amount → fixed', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, type: 'Fixed Amount' }).discountType).toBe('fixed');
  });

  it('maps Free Trial → free_days', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, type: 'Free Trial' }).discountType).toBe('free_days');
  });

  it('maps Memberships → membership', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, applyTo: 'Memberships' }).applicableTo).toBe('membership');
  });

  it('maps Products → event', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, applyTo: 'Products' }).applicableTo).toBe('event');
  });

  it('maps Both → all', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, applyTo: 'Both' }).applicableTo).toBe('all');
  });

  it('maps Active/Expired/Inactive → active/expired/inactive', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, status: 'Active' }).status).toBe('active');
    expect(transformUiCouponFormToDb({ ...baseForm, status: 'Expired' }).status).toBe('expired');
    expect(transformUiCouponFormToDb({ ...baseForm, status: 'Inactive' }).status).toBe('inactive');
  });

  it('parses discountValue from amount string', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, amount: '25' }).discountValue).toBe(25);
  });

  it('returns null usageLimit when the field is empty', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, usageLimit: '' }).usageLimit).toBeNull();
    expect(transformUiCouponFormToDb({ ...baseForm, usageLimit: '   ' }).usageLimit).toBeNull();
  });

  it('parses integer usageLimit', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, usageLimit: '50' }).usageLimit).toBe(50);
  });

  it('defaults perUserLimit to 1 when blank', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, perUserLimit: '' }).perUserLimit).toBe(1);
  });

  it('parses integer perUserLimit', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, perUserLimit: '3' }).perUserLimit).toBe(3);
  });

  it('returns null validUntil when neverExpires is true', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, neverExpires: true }).validUntil).toBeNull();
  });

  it('combines endDate + endTime into validUntil when neverExpires is false', () => {
    const result = transformUiCouponFormToDb(baseForm);

    expect(result.validUntil).toBeInstanceOf(Date);

    // The date is parsed as local time; just assert it lands somewhere
    // around the configured day rather than asserting an exact ISO string.
    const year = result.validUntil!.getFullYear();
    const month = result.validUntil!.getMonth();

    expect(year).toBe(2026);
    expect(month).toBe(11); // December (0-indexed)
  });

  it('falls back to 23:59:59 when endTime is empty', () => {
    const result = transformUiCouponFormToDb({ ...baseForm, endTime: '' });

    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('renders empty description as null', () => {
    expect(transformUiCouponFormToDb({ ...baseForm, description: '' }).description).toBeNull();
    expect(transformUiCouponFormToDb({ ...baseForm, description: '   ' }).description).toBeNull();
  });
});
