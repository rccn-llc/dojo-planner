import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  createMembershipPlan,
  deleteMembershipPlan,
  MembershipPlanInUseError,
  MembershipPlanSlugAlreadyExistsError,
  updateMembershipPlan,
} from '@/services/MembershipPlansService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import {
  CreateMembershipPlanValidation,
  DeleteMembershipPlanValidation,
  UpdateMembershipPlanValidation,
} from '@/validations/MembershipPlanValidation';
import { guardRole } from './AuthGuards';

export const create = os
  .input(CreateMembershipPlanValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const plan = await createMembershipPlan({
        name: input.name,
        slug: input.slug,
        category: input.category,
        program: input.program,
        programId: input.programId ?? null,
        price: input.price,
        signupFee: input.signupFee,
        frequency: input.frequency,
        contractLength: input.contractLength,
        accessLevel: input.accessLevel,
        description: input.description ?? null,
        isTrial: input.isTrial,
        isActive: input.isActive,
      }, context.orgId);

      await audit(context, AUDIT_ACTION.MEMBERSHIP_PLAN_CREATE, AUDIT_ENTITY_TYPE.MEMBERSHIP_PLAN, {
        entityId: plan.id,
        status: 'success',
      });

      return { plan };
    } catch (error) {
      await audit(context, AUDIT_ACTION.MEMBERSHIP_PLAN_CREATE, AUDIT_ENTITY_TYPE.MEMBERSHIP_PLAN, {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof MembershipPlanSlugAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const update = os
  .input(UpdateMembershipPlanValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const plan = await updateMembershipPlan(input.id, {
        name: input.name,
        slug: input.slug,
        category: input.category,
        program: input.program,
        programId: input.programId ?? null,
        price: input.price,
        signupFee: input.signupFee,
        frequency: input.frequency,
        contractLength: input.contractLength,
        accessLevel: input.accessLevel,
        description: input.description ?? null,
        isTrial: input.isTrial,
        isActive: input.isActive,
      }, context.orgId);

      if (!plan) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.MEMBERSHIP_PLAN_UPDATE, AUDIT_ENTITY_TYPE.MEMBERSHIP_PLAN, {
        entityId: plan.id,
        status: 'success',
      });

      return { plan };
    } catch (error) {
      await audit(context, AUDIT_ACTION.MEMBERSHIP_PLAN_UPDATE, AUDIT_ENTITY_TYPE.MEMBERSHIP_PLAN, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof MembershipPlanSlugAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const remove = os
  .input(DeleteMembershipPlanValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const deleted = await deleteMembershipPlan(input.id, context.orgId);

      if (!deleted) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.MEMBERSHIP_PLAN_DELETE, AUDIT_ENTITY_TYPE.MEMBERSHIP_PLAN, {
        entityId: input.id,
        status: 'success',
      });

      return { success: true };
    } catch (error) {
      await audit(context, AUDIT_ACTION.MEMBERSHIP_PLAN_DELETE, AUDIT_ENTITY_TYPE.MEMBERSHIP_PLAN, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof MembershipPlanInUseError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });
