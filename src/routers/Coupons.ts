import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  CouponCodeAlreadyExistsError,
  CouponHasUsagesError,
  createCoupon,
  deleteCoupon,
  getActiveCoupons,
  getOrganizationCoupons,
  updateCoupon,
} from '@/services/CouponsService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import {
  CreateCouponValidation,
  DeleteCouponValidation,
  UpdateCouponValidation,
} from '@/validations/CouponValidation';
import { guardRole } from './AuthGuards';

export const list = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.ACADEMY_OWNER);

  const coupons = await getOrganizationCoupons(orgId);

  return { coupons };
});

export const listActive = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

  const coupons = await getActiveCoupons(orgId);

  return { coupons };
});

export const create = os
  .input(CreateCouponValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const coupon = await createCoupon({
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        applicableTo: input.applicableTo,
        usageLimit: input.usageLimit,
        perUserLimit: input.perUserLimit,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        status: input.status,
      }, context.orgId);

      await audit(context, AUDIT_ACTION.COUPON_CREATE, AUDIT_ENTITY_TYPE.COUPON, {
        entityId: coupon.id,
        status: 'success',
      });

      return { coupon };
    } catch (error) {
      await audit(context, AUDIT_ACTION.COUPON_CREATE, AUDIT_ENTITY_TYPE.COUPON, {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof CouponCodeAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const update = os
  .input(UpdateCouponValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const coupon = await updateCoupon(input.id, {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        applicableTo: input.applicableTo,
        usageLimit: input.usageLimit,
        perUserLimit: input.perUserLimit,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        status: input.status,
      }, context.orgId);

      if (!coupon) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.COUPON_UPDATE, AUDIT_ENTITY_TYPE.COUPON, {
        entityId: coupon.id,
        status: 'success',
      });

      return { coupon };
    } catch (error) {
      await audit(context, AUDIT_ACTION.COUPON_UPDATE, AUDIT_ENTITY_TYPE.COUPON, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof CouponCodeAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const remove = os
  .input(DeleteCouponValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const deleted = await deleteCoupon(input.id, context.orgId);

      if (!deleted) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.COUPON_DELETE, AUDIT_ENTITY_TYPE.COUPON, {
        entityId: input.id,
        status: 'success',
      });

      return { success: true };
    } catch (error) {
      await audit(context, AUDIT_ACTION.COUPON_DELETE, AUDIT_ENTITY_TYPE.COUPON, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof CouponHasUsagesError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });
