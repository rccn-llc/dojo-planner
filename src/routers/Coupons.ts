import { os } from '@orpc/server';
import { getActiveCoupons, getOrganizationCoupons } from '@/services/CouponsService';
import { ORG_ROLE } from '@/types/Auth';
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
