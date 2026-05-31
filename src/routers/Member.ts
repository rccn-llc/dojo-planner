import type { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { logger } from '@/libs/Logger';
import { audit } from '@/services/AuditService';
import { sendMemberConfirmationEmail } from '@/services/EmailService';
import { resolveIQProConfig } from '@/services/IQProConfigService';
import { cancelMembershipLifecycle, getLifecycleContext, HoldLimitReachedError, holdMembershipLifecycle, reactivateMembershipLifecycle } from '@/services/MemberPaymentService';
import { addMemberMembership, changeMemberMembership, createMember, getAllMembershipPlans, getFamilyMembers, getHeadOfHouseholdMembers, getHOHForFamilyMember, getMemberPaymentMethods, getMembershipPlans, getMemberTransactions, linkFamilyMember, removeFully, unlinkFamilyMember, updateMember, updateMemberContactInfo, updateMemberPhoto, updateMemberStatus } from '@/services/MembersService';
import { generatePdfFilename } from '@/services/WaiverPdfService';
import { generateWaiverPdfBuffer } from '@/services/WaiverPdfService.server';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import { CancelMembershipValidation, DeleteMemberValidation, EditMemberValidation, GetHOHForMemberValidation, GetHOHPaymentMethodsValidation, HoldMembershipValidation, LinkFamilyMemberValidation, ListFamilyMembersValidation, MemberPaymentMethodsValidation, MemberTransactionsValidation, MemberValidation, ReactivateMembershipValidation, RemoveFullyMemberValidation, SearchHOHValidation, SendConfirmationEmailValidation, UnlinkFamilyMemberValidation, UpdateMemberContactInfoValidation, UpdateMemberPhotoValidation, UpdateMemberTypeValidation } from '@/validations/MemberValidation';
import { guardAuth, guardRole } from './AuthGuards';

export const create = os
  .input(MemberValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

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

      // If a membership plan was selected, validate it exists and create the membership.
      // We capture the new member_membership.id so downstream payment processing can
      // attach the IQPro subscription id + first/next payment dates to the right row.
      let memberMembershipId: string | undefined;
      if (input.membershipPlanId && member[0]?.id) {
        // Skip mock plan IDs (they start with 'mock-')
        if (input.membershipPlanId.startsWith('mock-')) {
          logger.info(`Skipping mock membership plan: ${input.membershipPlanId}`);
        } else {
          // Verify the plan exists before adding membership
          const plans = await getMembershipPlans(context.orgId);
          const planExists = plans.some(p => p.id === input.membershipPlanId);
          if (planExists) {
            const memberships = await addMemberMembership(member[0].id, input.membershipPlanId);
            memberMembershipId = memberships[0]?.id;
            logger.info(`Membership added for new member: ${member[0].id}, planId: ${input.membershipPlanId}, memberMembershipId: ${memberMembershipId}`);

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
        memberMembershipId,
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
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

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
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

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

/**
 * Cancel a specific member membership. Charges the plan's cancellationFee via
 * IQPro using the saved payment method on the existing subscription (unless
 * `waiveFee` is true), cancels the IQPro subscription, and updates DB rows.
 *
 * Separate from `member.remove` so the IQPro side effects + cancellation-fee
 * audit trail are distinct from the legacy soft-archive endpoint. Mirrors
 * the kiosk's PATCH /api/members/[memberId]/membership behavior.
 */
export const cancelMembership = os
  .input(CancelMembershipValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const ctx = await getLifecycleContext(input.memberId, input.memberMembershipId, context.orgId);
      if (!ctx) {
        throw new ORPCError('Membership not found', { status: 404 });
      }

      const iqproConfig = await resolveIQProConfig(context.orgId);

      const result = await cancelMembershipLifecycle({
        config: iqproConfig,
        ctx,
        waiveFee: input.waiveFee,
      });

      await audit(context, AUDIT_ACTION.MEMBERSHIP_CANCEL, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
        entityId: input.memberMembershipId,
        status: 'success',
      });

      if (result.cancellationFeeCharged > 0) {
        await audit(context, AUDIT_ACTION.CANCELLATION_FEE_CHARGE, AUDIT_ENTITY_TYPE.TRANSACTION, {
          entityId: result.cancellationTransactionId,
          status: 'success',
        });
      }

      return {
        cancellationFeeCharged: result.cancellationFeeCharged,
        cancellationTransactionId: result.cancellationTransactionId,
        subscriptionCancelled: result.subscriptionCancelled,
        feeChargeError: result.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await audit(context, AUDIT_ACTION.MEMBERSHIP_CANCEL, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
        entityId: input.memberMembershipId,
        status: 'failure',
        error: errorMessage,
      });
      throw error;
    }
  });

/**
 * Place a member's membership on hold. Charges the plan's hold fee
 * (one-time or recurring) via IQPro, pauses the original subscription, and
 * updates statuses. Mirrors the kiosk's hold action.
 */
export const holdMembership = os
  .input(HoldMembershipValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const ctx = await getLifecycleContext(input.memberId, input.memberMembershipId, context.orgId);
      if (!ctx) {
        throw new ORPCError('Membership not found', { status: 404 });
      }

      const iqproConfig = await resolveIQProConfig(context.orgId);

      const result = await holdMembershipLifecycle({ config: iqproConfig, ctx });

      await audit(context, AUDIT_ACTION.MEMBERSHIP_HOLD, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
        entityId: input.memberMembershipId,
        status: 'success',
      });

      if (result.holdFeeCharged > 0 || result.holdFeeSubscriptionId) {
        await audit(context, AUDIT_ACTION.HOLD_FEE_CHARGE, AUDIT_ENTITY_TYPE.TRANSACTION, {
          entityId: result.holdFeeTransactionId ?? result.holdFeeSubscriptionId,
          status: 'success',
        });
      }

      return {
        holdFeeCharged: result.holdFeeCharged,
        holdFeeTransactionId: result.holdFeeTransactionId,
        holdFeeSubscriptionId: result.holdFeeSubscriptionId,
        feeChargeError: result.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await audit(context, AUDIT_ACTION.MEMBERSHIP_HOLD, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
        entityId: input.memberMembershipId,
        status: 'failure',
        error: errorMessage,
      });
      // The plan's hold_limit_per_year refused this request — surface as 409
      // so the UI can show a clear "limit reached" message instead of a
      // generic 500.
      if (error instanceof HoldLimitReachedError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

/**
 * Reactivate a held membership. Cancels any recurring hold-fee subscription
 * and resumes the original membership subscription.
 */
export const reactivateMembership = os
  .input(ReactivateMembershipValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const ctx = await getLifecycleContext(input.memberId, input.memberMembershipId, context.orgId);
      if (!ctx) {
        throw new ORPCError('Membership not found', { status: 404 });
      }

      const iqproConfig = await resolveIQProConfig(context.orgId);

      await reactivateMembershipLifecycle({ config: iqproConfig, ctx });

      await audit(context, AUDIT_ACTION.MEMBERSHIP_REACTIVATE, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
        entityId: input.memberMembershipId,
        status: 'success',
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await audit(context, AUDIT_ACTION.MEMBERSHIP_REACTIVATE, AUDIT_ENTITY_TYPE.MEMBERSHIP, {
        entityId: input.memberMembershipId,
        status: 'failure',
        error: errorMessage,
      });
      throw error;
    }
  });

/**
 * Hard-delete a member and every row that references them.
 *
 * Use case: payment-declined rollback in the Add Member wizard (#132). The
 * operator chose "Cancel & Roll Back" instead of "Add Anyway" after a card
 * decline. Unlike `remove` (which soft-archives and preserves history), this
 * leaves no trace.
 *
 * Guarded by FRONT_DESK rather than ACADEMY_OWNER because this is part of
 * the member-creation undo flow that any front-desk staff can trigger. The
 * service-layer `removeFully` enforces org scope (no cross-tenant access).
 */
export const removeFullyMember = os
  .input(RemoveFullyMemberValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const result = await removeFully(input.id, context.orgId);

      if (!result.deleted) {
        throw new ORPCError('Member not found', { status: 404 });
      }

      logger.info(`[Member.removeFully] Member rolled back`, {
        memberId: input.id,
        rowsRemoved: result.rowsRemoved,
      });

      await audit(context, AUDIT_ACTION.MEMBER_REMOVE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'success',
      });

      return { rowsRemoved: result.rowsRemoved };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

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

export const updateMemberType = os
  .input(UpdateMemberTypeValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const result = await updateMember({ id: input.id, memberType: input.memberType }, context.orgId);

      if (result.length === 0) {
        throw new ORPCError('Member not found', { status: 404 });
      }

      logger.info(`Member type updated: ${input.id} -> ${input.memberType}`);

      await audit(context, AUDIT_ACTION.MEMBER_UPDATE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'success',
      });

      return {};
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await audit(context, AUDIT_ACTION.MEMBER_UPDATE, AUDIT_ENTITY_TYPE.MEMBER, {
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
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

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

export const updatePhoto = os
  .input(UpdateMemberPhotoValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);
    const photoCleared = input.photoUrl === null;
    // Don't store the actual base64 in audit logs — they're large and we only
    // need to know set vs clear for compliance. Use a sentinel.
    const photoChange = {
      photoUrl: {
        before: '<photo>',
        after: photoCleared ? null : '<photo>',
      },
    };

    try {
      const result = await updateMemberPhoto(input, context.orgId);

      if (result.length === 0) {
        throw new ORPCError('Member not found', { status: 404 });
      }

      logger.info(`Member photo updated: ${input.id}`, { photoCleared });

      // Reuse MEMBER_UPDATE_CONTACT — photos are contact info; the changes
      // field captures whether the photo was set or cleared.
      await audit(context, AUDIT_ACTION.MEMBER_UPDATE_CONTACT, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'success',
        changes: photoChange,
      });

      return {};
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await audit(context, AUDIT_ACTION.MEMBER_UPDATE_CONTACT, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: input.id,
        status: 'failure',
        changes: photoChange,
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
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

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
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

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
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

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
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

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

// ===== Family member / HOH endpoints =====

export const searchHOH = os
  .input(SearchHOHValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);
    const hohMembers = await getHeadOfHouseholdMembers(orgId);

    if (input.query && input.query.trim()) {
      const q = input.query.trim().toLowerCase();
      return {
        members: hohMembers.filter(m =>
          `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
          || m.email.toLowerCase().includes(q),
        ),
      };
    }
    return { members: hohMembers };
  });

export const linkFamily = os
  .input(LinkFamilyMemberValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      await linkFamilyMember(input.hohMemberId, input.memberId, input.relationship);

      await audit(context, AUDIT_ACTION.FAMILY_MEMBER_LINK, AUDIT_ENTITY_TYPE.FAMILY_MEMBER, {
        entityId: input.memberId,
        status: 'success',
      });

      logger.info(`Family member linked: ${input.memberId} → HOH: ${input.hohMemberId}`);
      return { linked: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to link family member: ${errorMessage}`);

      await audit(context, AUDIT_ACTION.FAMILY_MEMBER_LINK, AUDIT_ENTITY_TYPE.FAMILY_MEMBER, {
        entityId: input.memberId,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError
        ? error
        : new ORPCError('Failed to link family member. Please try again.', { status: 500 });
    }
  });

export const listFamily = os
  .input(ListFamilyMembersValidation)
  .handler(async ({ input }) => {
    await guardRole(ORG_ROLE.FRONT_DESK);
    const familyMembers = await getFamilyMembers(input.memberId);
    return { familyMembers };
  });

export const getHOHPaymentMethods = os
  .input(GetHOHPaymentMethodsValidation)
  .handler(async ({ input }) => {
    await guardRole(ORG_ROLE.FRONT_DESK);
    const paymentMethods = await getMemberPaymentMethods(input.hohMemberId);
    return { paymentMethods };
  });

export const unlinkFamily = os
  .input(UnlinkFamilyMemberValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      await unlinkFamilyMember(input.hohMemberId, input.memberId);

      await audit(context, AUDIT_ACTION.FAMILY_MEMBER_UNLINK, AUDIT_ENTITY_TYPE.FAMILY_MEMBER, {
        entityId: input.memberId,
        status: 'success',
      });

      logger.info(`Family member unlinked: ${input.memberId} from HOH: ${input.hohMemberId}`);
      return { unlinked: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to unlink family member: ${errorMessage}`);

      await audit(context, AUDIT_ACTION.FAMILY_MEMBER_UNLINK, AUDIT_ENTITY_TYPE.FAMILY_MEMBER, {
        entityId: input.memberId,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError
        ? error
        : new ORPCError('Failed to unlink family member. Please try again.', { status: 500 });
    }
  });

export const getHOHForMember = os
  .input(GetHOHForMemberValidation)
  .handler(async ({ input }) => {
    await guardRole(ORG_ROLE.FRONT_DESK);
    const hoh = await getHOHForFamilyMember(input.memberId);
    return { hoh };
  });

export const sendConfirmationEmail = os
  .input(SendConfirmationEmailValidation)
  .handler(async ({ input }) => {
    await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      // Generate waiver PDF server-side if data provided
      let waiverPdfBuffer: Buffer | undefined;
      let waiverPdfFilename: string | undefined;

      if (input.waiverPdfData) {
        const pdfInput = {
          ...input.waiverPdfData,
          signedByRelationship: input.waiverPdfData.signedByRelationship ?? null,
          signedAt: new Date(input.waiverPdfData.signedAt),
          ipAddress: null,
          membershipPlanName: input.waiverPdfData.membershipPlanName ?? null,
          membershipPlanPrice: input.waiverPdfData.membershipPlanPrice ?? null,
          membershipPlanFrequency: input.waiverPdfData.membershipPlanFrequency ?? null,
          membershipPlanContractLength: input.waiverPdfData.membershipPlanContractLength ?? null,
          membershipPlanSignupFee: input.waiverPdfData.membershipPlanSignupFee ?? null,
          membershipPlanIsTrial: input.waiverPdfData.membershipPlanIsTrial ?? null,
          couponCode: input.waiverPdfData.couponCode ?? null,
          couponType: input.waiverPdfData.couponType ?? null,
          couponAmount: input.waiverPdfData.couponAmount ?? null,
          couponDiscountedPrice: input.waiverPdfData.couponDiscountedPrice ?? null,
        };

        waiverPdfBuffer = generateWaiverPdfBuffer(pdfInput);
        waiverPdfFilename = generatePdfFilename({
          memberFirstName: input.waiverPdfData.memberFirstName,
          memberLastName: input.waiverPdfData.memberLastName,
          signedAt: new Date(input.waiverPdfData.signedAt),
        });
      }

      const sent = await sendMemberConfirmationEmail({
        memberEmail: input.memberEmail,
        memberName: input.memberName,
        membershipPlanName: input.membershipPlanName,
        membershipPlanPrice: input.membershipPlanPrice,
        membershipPlanFrequency: input.membershipPlanFrequency,
        memberType: input.memberType,
        hohName: input.hohName,
        waiverPdfBuffer,
        waiverPdfFilename,
      });

      return { sent };
    } catch (error) {
      // Email failures should not block the wizard — log and return false
      logger.error('[sendConfirmationEmail] Failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { sent: false };
    }
  });
