import type { AuditContext } from '@/types/Audit';

import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('./AuthGuards', () => ({ guardRole: vi.fn() }));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
vi.mock('@/services/MembershipPlansService', async () => {
  const actual = await vi.importActual<typeof import('@/services/MembershipPlansService')>('@/services/MembershipPlansService');
  return {
    ...actual,
    createMembershipPlan: vi.fn(),
    updateMembershipPlan: vi.fn(),
    deleteMembershipPlan: vi.fn(),
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

const fakePlan = {
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
  frequency: 'Monthly' as const,
  contractLength: 'Month-to-Month',
  accessLevel: 'Unlimited',
  description: null,
  isTrial: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validInput = {
  name: fakePlan.name,
  slug: fakePlan.slug,
  category: fakePlan.category,
  program: fakePlan.program,
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

describe('MembershipPlans Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates a plan and emits a success audit event', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createMembershipPlan } = await import('@/services/MembershipPlansService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(createMembershipPlan).mockResolvedValue(fakePlan);

      const { create } = await import('./MembershipPlans');
      const result = await callHandler(create, validInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(createMembershipPlan).toHaveBeenCalledWith(expect.objectContaining({ slug: 'adult-monthly-gold' }), 'org-1');
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.MEMBERSHIP_PLAN_CREATE,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_PLAN,
        expect.objectContaining({ entityId: 'plan-1', status: 'success' }),
      );
      expect(result).toEqual({ plan: fakePlan });
    });

    it('maps slug-conflict to a 409 ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createMembershipPlan, MembershipPlanSlugAlreadyExistsError } = await import('@/services/MembershipPlansService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(createMembershipPlan).mockRejectedValue(new MembershipPlanSlugAlreadyExistsError('adult-monthly-gold'));

      const { create } = await import('./MembershipPlans');

      await expect(callHandler(create, validInput)).rejects.toBeInstanceOf(ORPCError);
    });
  });

  describe('update', () => {
    it('returns 404 when plan is not in the org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMembershipPlan } = await import('@/services/MembershipPlansService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(updateMembershipPlan).mockResolvedValue(null);

      const { update } = await import('./MembershipPlans');

      await expect(callHandler(update, { id: 'plan-other', ...validInput })).rejects.toBeInstanceOf(ORPCError);
    });

    it('updates and emits success audit', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMembershipPlan } = await import('@/services/MembershipPlansService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(updateMembershipPlan).mockResolvedValue(fakePlan);

      const { update } = await import('./MembershipPlans');
      const result = await callHandler(update, { id: 'plan-1', ...validInput });

      expect(updateMembershipPlan).toHaveBeenCalledWith('plan-1', expect.any(Object), 'org-1');
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.MEMBERSHIP_PLAN_UPDATE,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_PLAN,
        expect.objectContaining({ entityId: 'plan-1', status: 'success' }),
      );
      expect(result).toEqual({ plan: fakePlan });
    });
  });

  describe('remove', () => {
    it('returns 404 when plan is not in the org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteMembershipPlan } = await import('@/services/MembershipPlansService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(deleteMembershipPlan).mockResolvedValue(false);

      const { remove } = await import('./MembershipPlans');

      await expect(callHandler(remove, { id: 'plan-other' })).rejects.toBeInstanceOf(ORPCError);
    });

    it('deletes and emits success audit', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteMembershipPlan } = await import('@/services/MembershipPlansService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(deleteMembershipPlan).mockResolvedValue(true);

      const { remove } = await import('./MembershipPlans');
      const result = await callHandler(remove, { id: 'plan-1' });

      expect(deleteMembershipPlan).toHaveBeenCalledWith('plan-1', 'org-1');
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.MEMBERSHIP_PLAN_DELETE,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_PLAN,
        expect.objectContaining({ entityId: 'plan-1', status: 'success' }),
      );
      expect(result).toEqual({ success: true });
    });

    it('maps in-use error to 409', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteMembershipPlan, MembershipPlanInUseError } = await import('@/services/MembershipPlansService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(deleteMembershipPlan).mockRejectedValue(new MembershipPlanInUseError('Adult Monthly Gold', 5));

      const { remove } = await import('./MembershipPlans');

      await expect(callHandler(remove, { id: 'plan-1' })).rejects.toBeInstanceOf(ORPCError);
    });
  });
});
