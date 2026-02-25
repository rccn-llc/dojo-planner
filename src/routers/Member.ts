import { randomUUID } from 'node:crypto';
import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { logger } from '@/libs/Logger';
import { audit } from '@/services/AuditService';
import { addMemberMembership, changeMemberMembership, createMember, getAllMembershipPlans, getMemberPaymentMethods, getMembershipPlans, getMemberTransactions, updateMember, updateMemberContactInfo, updateMemberStatus } from '@/services/MembersService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import { DeleteMemberValidation, EditMemberValidation, MemberPaymentMethodsValidation, MemberTransactionsValidation, MemberValidation, UpdateMemberContactInfoValidation } from '@/validations/MemberValidation';
import { guardAuth, guardRole } from './AuthGuards';

export const create = os
  .input(MemberValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      // Create the member record in the database with a generated UUID
      const memberId = randomUUID();

      logger.info(`[Member.create] Creating member for organization: ${context.orgId}`, {
        memberId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      });

      const member = await createMember({
        id: memberId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        dateOfBirth: input.dateOfBirth,
        memberType: input.memberType,
        status: input.status || 'active',
        address: input.address,
        ...(input.photoUrl && { photoUrl: input.photoUrl }),
      }, context.orgId);

      logger.info(`[Member.create] Member created successfully: ${memberId}`, {
        orgId: context.orgId,
        resultId: member[0]?.id,
        resultEmail: member[0]?.email,
      });

      // Audit the member creation
      await audit(context, AUDIT_ACTION.MEMBER_CREATE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: memberId,
        status: 'success',
      });

      // If a membership plan was selected, validate it exists and create the membership
      if (input.membershipPlanId && member[0]?.id) {
        // Skip mock plan IDs (they start with 'mock-')
        if (input.membershipPlanId.startsWith('mock-')) {
          logger.info(`Skipping mock membership plan: ${input.membershipPlanId}`);
        } else {
          // Verify the plan exists before adding membership
          const plans = await getMembershipPlans(context.orgId);
          const planExists = plans.some(p => p.id === input.membershipPlanId);
          if (planExists) {
            await addMemberMembership(member[0].id, input.membershipPlanId);
            logger.info(`Membership added for new member: ${member[0].id}, planId: ${input.membershipPlanId}`);

            // Audit the membership addition
            await audit(context, AUDIT_ACTION.MEMBER_ADD_MEMBERSHIP, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
              entityId: member[0].id,
              status: 'success',
            });
          } else {
            logger.warn(`Membership plan not found, skipping: ${input.membershipPlanId}`);
          }
        }
      }

      return {
        id: member[0]?.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to create member: ${errorMessage}`, {
        error,
        errorString: String(error),
        errorKeys: error instanceof Error ? Object.keys(error) : [],
      });

      // Audit the failure
      await audit(context, AUDIT_ACTION.MEMBER_CREATE, AUDIT_ENTITY_TYPE.MEMBER, {
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to create member. Please try again.', { status: 500 });
    }
  });

export const update = os
  .input(EditMemberValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const result = await updateMember({ ...input, status: 'active' }, context.orgId);

      if (result.length === 0) {
        throw new ORPCError('Member not found', { status: 404 });
      }

      logger.info('A member has been updated');

      // Audit the update
      await audit(context, AUDIT_ACTION.MEMBER_UPDATE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'success',
      });

      return {};
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Audit the failure
      await audit(context, AUDIT_ACTION.MEMBER_UPDATE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'failure',
        error: errorMessage,
      });

      throw error;
    }
  });

export const remove = os
  .input(DeleteMemberValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const result = await updateMemberStatus(input.id, context.orgId, 'cancelled');

      if (result.length === 0) {
        throw new ORPCError('Member not found', { status: 404 });
      }

      logger.info(`Member cancelled: ${input.id}`);

      // Audit the removal
      await audit(context, AUDIT_ACTION.MEMBER_REMOVE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'success',
      });

      return {};
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Audit the failure
      await audit(context, AUDIT_ACTION.MEMBER_REMOVE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'failure',
        error: errorMessage,
      });

      throw error;
    }
  });

export const restore = os
  .input(DeleteMemberValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const result = await updateMemberStatus(input.id, context.orgId, 'active');

      if (result.length === 0) {
        throw new ORPCError('Member not found', { status: 404 });
      }

      logger.info(`Member restored to active: ${input.id}`);

      // Audit the restoration
      await audit(context, AUDIT_ACTION.MEMBER_RESTORE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'success',
      });

      return {};
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Audit the failure
      await audit(context, AUDIT_ACTION.MEMBER_RESTORE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'failure',
        error: errorMessage,
      });

      throw error;
    }
  });

export const updateLastAccessed = os
  .handler(async () => {
    const { userId, orgId } = await guardAuth();

    // Note: This function is a placeholder since members are now independent of Clerk
    // and use UUID-based IDs. To track member access, implement a mapping between
    // Clerk users and member records, or use a separate user activity tracking system.
    logger.info(`Access tracking called for user: ${userId} in org: ${orgId}`);

    // Audit the access tracking attempt
    await audit({ userId, orgId }, AUDIT_ACTION.MEMBER_UPDATE_ACCESS, AUDIT_ENTITY_TYPE.MEMBER, {
      status: 'success',
    });

    return {};
  });

export const updateContactInfo = os
  .input(UpdateMemberContactInfoValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const result = await updateMemberContactInfo(input, context.orgId);

      if (result.length === 0) {
        throw new ORPCError('Member not found', { status: 404 });
      }

      logger.info(`Member contact info updated: ${input.id}`);

      // Audit the contact info update
      await audit(context, AUDIT_ACTION.MEMBER_UPDATE_CONTACT, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'success',
      });

      return {};
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Audit the failure
      await audit(context, AUDIT_ACTION.MEMBER_UPDATE_CONTACT, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'failure',
        error: errorMessage,
      });

      throw error;
    }
  });

// Membership-related validation schemas
const AddMembershipValidation = z.object({
  memberId: z.string().min(1),
  membershipPlanId: z.string().min(1),
});

const ChangeMembershipValidation = z.object({
  memberId: z.string().min(1),
  newMembershipPlanId: z.string().min(1),
});

export const addMembership = os
  .input(AddMembershipValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const result = await addMemberMembership(input.memberId, input.membershipPlanId);

      if (result.length === 0) {
        throw new ORPCError('Failed to add membership', { status: 500 });
      }

      logger.info(`Membership added for member: ${input.memberId}, planId: ${input.membershipPlanId}`);

      // Audit the membership addition
      await audit(context, AUDIT_ACTION.MEMBER_ADD_MEMBERSHIP, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
        entityId: input.memberId,
        status: 'success',
      });

      return { id: result[0]?.id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to add membership: ${errorMessage}`);

      // Audit the failure
      await audit(context, AUDIT_ACTION.MEMBER_ADD_MEMBERSHIP, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
        entityId: input.memberId,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to add membership. Please try again.', { status: 500 });
    }
  });

export const changeMembership = os
  .input(ChangeMembershipValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const result = await changeMemberMembership(input.memberId, input.newMembershipPlanId);

      if (result.length === 0) {
        throw new ORPCError('Failed to change membership', { status: 500 });
      }

      logger.info(`Membership changed for member: ${input.memberId}, new planId: ${input.newMembershipPlanId}`);

      // Audit the membership change
      await audit(context, AUDIT_ACTION.MEMBER_CHANGE_MEMBERSHIP, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
        entityId: input.memberId,
        status: 'success',
      });

      return { id: result[0]?.id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to change membership: ${errorMessage}`);

      // Audit the failure
      await audit(context, AUDIT_ACTION.MEMBER_CHANGE_MEMBERSHIP, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
        entityId: input.memberId,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to change membership. Please try again.', { status: 500 });
    }
  });

export const listMembershipPlans = os
  .handler(async () => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const plans = await getMembershipPlans(context.orgId);
      return { plans };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch membership plans: ${errorMessage}`);
      throw error instanceof ORPCError ? error : new ORPCError('Failed to fetch membership plans. Please try again.', { status: 500 });
    }
  });

export const listAllMembershipPlans = os
  .handler(async () => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const plans = await getAllMembershipPlans(context.orgId);
      return { plans };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch membership plans: ${errorMessage}`);
      throw error instanceof ORPCError ? error : new ORPCError('Failed to fetch membership plans. Please try again.', { status: 500 });
    }
  });

export const listPaymentMethods = os
  .input(MemberPaymentMethodsValidation)
  .handler(async ({ input }) => {
    await guardRole(ORG_ROLE.FRONT_DESK);
    const paymentMethods = await getMemberPaymentMethods(input.memberId);
    return { paymentMethods };
  });

export const listMemberTransactions = os
  .input(MemberTransactionsValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);
    const transactions = await getMemberTransactions(input.memberId, orgId, input.limit);
    return { transactions };
  });
