import type { AuditContext } from '@/types/Audit';

import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('./AuthGuards', () => ({ guardRole: vi.fn() }));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
vi.mock('@/services/CouponsService', async () => {
  const actual = await vi.importActual<typeof import('@/services/CouponsService')>('@/services/CouponsService');
  return {
    ...actual,
    createCoupon: vi.fn(),
    updateCoupon: vi.fn(),
    deleteCoupon: vi.fn(),
    getOrganizationTotalSavings: vi.fn(),
  };
});

const academyOwnerContext: AuditContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: ORG_ROLE.ACADEMY_OWNER,
};

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

const fakeCoupon = {
  id: 'cpn-1',
  code: 'TEST20',
  name: 'TEST20',
  description: null,
  discountType: 'percentage',
  discountValue: 20,
  applicableTo: 'membership',
  usageLimit: 100,
  usageCount: 0,
  perUserLimit: 1,
  status: 'active',
  validFrom: new Date('2026-01-01'),
  validUntil: new Date('2099-12-31'),
  createdAt: new Date('2026-01-01'),
};

const validInput = {
  code: 'TEST20',
  name: 'TEST20',
  description: null,
  discountType: 'percentage' as const,
  discountValue: 20,
  applicableTo: 'membership' as const,
  usageLimit: 100,
  perUserLimit: 1,
  validFrom: new Date('2026-01-01'),
  validUntil: new Date('2099-12-31'),
  status: 'active' as const,
};

describe('Coupons Router mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates a coupon and emits a success audit event', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createCoupon } = await import('@/services/CouponsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(createCoupon).mockResolvedValue(fakeCoupon);

      const { create } = await import('./Coupons');
      const result = await callHandler(create, validInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(createCoupon).toHaveBeenCalledWith(expect.objectContaining({ code: 'TEST20' }), 'org-1');
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.COUPON_CREATE,
        AUDIT_ENTITY_TYPE.COUPON,
        expect.objectContaining({ entityId: 'cpn-1', status: 'success' }),
      );
      expect(result).toEqual({ coupon: fakeCoupon });
    });

    it('maps CouponCodeAlreadyExistsError to a 409 ORPCError + emits a failure audit', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createCoupon, CouponCodeAlreadyExistsError } = await import('@/services/CouponsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(createCoupon).mockRejectedValue(new CouponCodeAlreadyExistsError('TEST20'));

      const { create } = await import('./Coupons');

      await expect(callHandler(create, validInput)).rejects.toBeInstanceOf(ORPCError);
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.COUPON_CREATE,
        AUDIT_ENTITY_TYPE.COUPON,
        expect.objectContaining({ status: 'failure' }),
      );
    });
  });

  describe('update', () => {
    it('updates a coupon and emits a success audit event', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateCoupon } = await import('@/services/CouponsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(updateCoupon).mockResolvedValue(fakeCoupon);

      const { update } = await import('./Coupons');
      const result = await callHandler(update, { id: 'cpn-1', ...validInput });

      expect(updateCoupon).toHaveBeenCalledWith('cpn-1', expect.objectContaining({ code: 'TEST20' }), 'org-1');
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.COUPON_UPDATE,
        AUDIT_ENTITY_TYPE.COUPON,
        expect.objectContaining({ entityId: 'cpn-1', status: 'success' }),
      );
      expect(result).toEqual({ coupon: fakeCoupon });
    });

    it('returns 404 when coupon is not in the org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateCoupon } = await import('@/services/CouponsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(updateCoupon).mockResolvedValue(null);

      const { update } = await import('./Coupons');

      await expect(callHandler(update, { id: 'cpn-other', ...validInput })).rejects.toBeInstanceOf(ORPCError);
    });

    it('maps duplicate-code update to a 409 ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateCoupon, CouponCodeAlreadyExistsError } = await import('@/services/CouponsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(updateCoupon).mockRejectedValue(new CouponCodeAlreadyExistsError('TEST20'));

      const { update } = await import('./Coupons');

      await expect(callHandler(update, { id: 'cpn-1', ...validInput })).rejects.toBeInstanceOf(ORPCError);
    });
  });

  describe('remove', () => {
    it('deletes a coupon and emits a success audit event', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteCoupon } = await import('@/services/CouponsService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(deleteCoupon).mockResolvedValue(true);

      const { remove } = await import('./Coupons');
      const result = await callHandler(remove, { id: 'cpn-1' });

      expect(deleteCoupon).toHaveBeenCalledWith('cpn-1', 'org-1');
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.COUPON_DELETE,
        AUDIT_ENTITY_TYPE.COUPON,
        expect.objectContaining({ entityId: 'cpn-1', status: 'success' }),
      );
      expect(result).toEqual({ success: true });
    });

    it('returns 404 when coupon is not in the org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteCoupon } = await import('@/services/CouponsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(deleteCoupon).mockResolvedValue(false);

      const { remove } = await import('./Coupons');

      await expect(callHandler(remove, { id: 'cpn-other' })).rejects.toBeInstanceOf(ORPCError);
    });

    it('maps CouponHasUsagesError to a 409 ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteCoupon, CouponHasUsagesError } = await import('@/services/CouponsService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(deleteCoupon).mockRejectedValue(new CouponHasUsagesError('TEST20', 3));

      const { remove } = await import('./Coupons');

      await expect(callHandler(remove, { id: 'cpn-1' })).rejects.toBeInstanceOf(ORPCError);
    });
  });
});

describe('Coupons Router getTotalSavings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the org total savings under ACADEMY_OWNER guard', async () => {
    const { guardRole } = await import('./AuthGuards');
    const { getOrganizationTotalSavings } = await import('@/services/CouponsService');
    vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
    vi.mocked(getOrganizationTotalSavings).mockResolvedValue(425.5);

    const { getTotalSavings } = await import('./Coupons');
    const result = await callHandler(getTotalSavings);

    expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
    expect(getOrganizationTotalSavings).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({ totalSavings: 425.5 });
  });

  it('returns zero when there are no redemptions', async () => {
    const { guardRole } = await import('./AuthGuards');
    const { getOrganizationTotalSavings } = await import('@/services/CouponsService');
    vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
    vi.mocked(getOrganizationTotalSavings).mockResolvedValue(0);

    const { getTotalSavings } = await import('./Coupons');
    const result = await callHandler(getTotalSavings);

    expect(result).toEqual({ totalSavings: 0 });
  });
});
