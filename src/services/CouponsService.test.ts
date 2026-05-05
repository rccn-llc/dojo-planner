import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

vi.mock('@/models/Schema', () => ({
  couponSchema: {
    id: 'id',
    organizationId: 'organization_id',
    code: 'code',
    name: 'name',
    usageCount: 'usage_count',
  },
  couponUsageSchema: {
    couponId: 'coupon_id',
    discountApplied: 'discount_applied',
  },
}));

const baseRow = {
  id: 'cpn-1',
  code: 'TEST20',
  name: 'TEST20',
  description: 'Twenty off',
  discountType: 'percentage',
  discountValue: 20,
  applicableTo: 'membership',
  usageLimit: 100,
  usageCount: 0,
  perUserLimit: 1,
  status: 'active',
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validUntil: new Date('2099-12-31T23:59:59Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('CouponsService.effectiveStatus (via getOrganizationCoupons)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active when stored active and within bounds', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([baseRow]) }),
    });

    const { getOrganizationCoupons } = await import('./CouponsService');
    const coupons = await getOrganizationCoupons('org-1');

    expect(coupons[0]?.status).toBe('active');
  });

  it('returns inactive when stored inactive (overrides expiry checks)', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([{
          ...baseRow,
          status: 'inactive',
          validUntil: new Date('2020-01-01'),
        }]),
      }),
    });

    const { getOrganizationCoupons } = await import('./CouponsService');
    const coupons = await getOrganizationCoupons('org-1');

    expect(coupons[0]?.status).toBe('inactive');
  });

  it('returns expired when validUntil is past', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([{
          ...baseRow,
          validUntil: new Date('2020-01-01'),
        }]),
      }),
    });

    const { getOrganizationCoupons } = await import('./CouponsService');
    const coupons = await getOrganizationCoupons('org-1');

    expect(coupons[0]?.status).toBe('expired');
  });

  it('returns expired when usageCount has reached usageLimit', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([{ ...baseRow, usageCount: 100, usageLimit: 100 }]),
      }),
    });

    const { getOrganizationCoupons } = await import('./CouponsService');
    const coupons = await getOrganizationCoupons('org-1');

    expect(coupons[0]?.status).toBe('expired');
  });

  it('treats null usageLimit as unlimited (does not expire on usage)', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([{ ...baseRow, usageCount: 9999, usageLimit: null }]),
      }),
    });

    const { getOrganizationCoupons } = await import('./CouponsService');
    const coupons = await getOrganizationCoupons('org-1');

    expect(coupons[0]?.status).toBe('active');
  });
});

describe('CouponsService.createCoupon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validInput = {
    code: 'TEST20',
    name: 'TEST20',
    description: 'Twenty off',
    discountType: 'percentage' as const,
    discountValue: 20,
    applicableTo: 'membership' as const,
    usageLimit: 100,
    perUserLimit: 1,
    validFrom: new Date('2026-01-01'),
    validUntil: new Date('2099-12-31'),
    status: 'active' as const,
  };

  it('inserts the coupon and returns it in service shape', async () => {
    dbMock.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.resolve([baseRow]) }),
    });

    const { createCoupon } = await import('./CouponsService');
    const result = await createCoupon(validInput, 'org-1');

    expect(result.id).toBe('cpn-1');
    expect(result.code).toBe('TEST20');
    expect(result.perUserLimit).toBe(1);
    expect(result.status).toBe('active');
  });

  it('throws CouponCodeAlreadyExistsError on Postgres unique-violation (23505)', async () => {
    const uniqueViolation: Error & { code: string } = Object.assign(
      new Error('duplicate key'),
      { code: '23505' },
    );
    dbMock.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.reject(uniqueViolation) }),
    });

    const { createCoupon, CouponCodeAlreadyExistsError } = await import('./CouponsService');

    await expect(createCoupon(validInput, 'org-1')).rejects.toBeInstanceOf(CouponCodeAlreadyExistsError);
  });

  it('rethrows non-unique-violation errors', async () => {
    dbMock.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.reject(new Error('boom')) }),
    });

    const { createCoupon } = await import('./CouponsService');

    await expect(createCoupon(validInput, 'org-1')).rejects.toThrow('boom');
  });
});

describe('CouponsService.updateCoupon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validInput = {
    code: 'TEST20',
    name: 'TEST20',
    description: 'Updated',
    discountType: 'percentage' as const,
    discountValue: 25,
    applicableTo: 'membership' as const,
    usageLimit: 100,
    perUserLimit: 1,
    validFrom: new Date('2026-01-01'),
    validUntil: new Date('2099-12-31'),
    status: 'active' as const,
  };

  it('returns null when the coupon is not in the org (cross-tenant guard)', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    const { updateCoupon } = await import('./CouponsService');
    const result = await updateCoupon('cpn-other-org', validInput, 'org-1');

    expect(result).toBeNull();
  });

  it('updates and returns the new coupon shape', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    dbMock.update.mockReturnValueOnce({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ ...baseRow, discountValue: 25, description: 'Updated' }]),
        }),
      }),
    });

    const { updateCoupon } = await import('./CouponsService');
    const result = await updateCoupon('cpn-1', validInput, 'org-1');

    expect(result?.discountValue).toBe(25);
    expect(result?.description).toBe('Updated');
  });

  it('throws CouponCodeAlreadyExistsError on duplicate-code update', async () => {
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

    const { updateCoupon, CouponCodeAlreadyExistsError } = await import('./CouponsService');

    await expect(updateCoupon('cpn-1', validInput, 'org-1')).rejects.toBeInstanceOf(CouponCodeAlreadyExistsError);
  });
});

describe('CouponsService.deleteCoupon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when the coupon is not in the org (cross-tenant guard)', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    const { deleteCoupon } = await import('./CouponsService');
    const result = await deleteCoupon('cpn-other-org', 'org-1');

    expect(result).toBe(false);
  });

  it('deletes the coupon when no usages exist', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
    });
    dbMock.delete.mockReturnValueOnce({ where: () => Promise.resolve(undefined) });

    const { deleteCoupon } = await import('./CouponsService');
    const result = await deleteCoupon('cpn-1', 'org-1');

    expect(result).toBe(true);
    expect(dbMock.delete).toHaveBeenCalled();
  });

  it('throws CouponHasUsagesError when redemptions exist', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([baseRow]) }) }),
    });
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ count: 3 }]) }),
    });

    const { deleteCoupon, CouponHasUsagesError } = await import('./CouponsService');

    await expect(deleteCoupon('cpn-1', 'org-1')).rejects.toBeInstanceOf(CouponHasUsagesError);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });
});

describe('CouponsService.getOrganizationTotalSavings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the summed discountApplied joined through coupon for the org', async () => {
    const where = vi.fn(() => Promise.resolve([{ total: 137.5 }]));
    const innerJoin = vi.fn(() => ({ where }));
    const from = vi.fn(() => ({ innerJoin }));
    dbMock.select.mockReturnValueOnce({ from });

    const { getOrganizationTotalSavings } = await import('./CouponsService');
    const total = await getOrganizationTotalSavings('org-1');

    expect(total).toBe(137.5);
    expect(from).toHaveBeenCalled();
    expect(innerJoin).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
  });

  it('returns 0 when there are no redemptions (COALESCE result)', async () => {
    const where = vi.fn(() => Promise.resolve([{ total: 0 }]));
    dbMock.select.mockReturnValueOnce({
      from: () => ({ innerJoin: () => ({ where }) }),
    });

    const { getOrganizationTotalSavings } = await import('./CouponsService');
    const total = await getOrganizationTotalSavings('org-empty');

    expect(total).toBe(0);
  });

  it('returns 0 when the query returns an empty result', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([]) }) }),
    });

    const { getOrganizationTotalSavings } = await import('./CouponsService');
    const total = await getOrganizationTotalSavings('org-empty');

    expect(total).toBe(0);
  });

  it('coerces numeric strings to numbers (postgres SUM can return text)', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([{ total: '99.99' }]) }) }),
    });

    const { getOrganizationTotalSavings } = await import('./CouponsService');
    const total = await getOrganizationTotalSavings('org-1');

    expect(total).toBe(99.99);
  });
});
