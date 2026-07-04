import { os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import { getOrganizationInstructors, upsertInstructorPhoto } from '@/services/InstructorsService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import { UpdateInstructorPhotoValidation } from '@/validations/InstructorValidation';
import { guardRole } from './AuthGuards';

/**
 * Lists the org's assignable instructors (Clerk members with role
 * `org:instructor` or `org:academy_owner`). Read-only; front desk and above
 * may fetch it to populate instructor selectors on classes/events.
 */
export const list = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);
  const instructors = await getOrganizationInstructors(orgId);
  return { instructors };
});

/**
 * Uploads (or clears, with `photoUrl: null`) an in-app photo override for one
 * instructor. Admin/owner only.
 */
export const updatePhoto = os
  .input(UpdateInstructorPhotoValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      await upsertInstructorPhoto(context.orgId, input.clerkUserId, input.photoUrl);

      await audit(context, AUDIT_ACTION.INSTRUCTOR_PHOTO_UPDATE, AUDIT_ENTITY_TYPE.INSTRUCTOR, {
        entityId: input.clerkUserId,
        status: 'success',
        changes: { photoUrl: { before: '<photo>', after: input.photoUrl === null ? null : '<photo>' } },
      });

      return {};
    } catch (error) {
      await audit(context, AUDIT_ACTION.INSTRUCTOR_PHOTO_UPDATE, AUDIT_ENTITY_TYPE.INSTRUCTOR, {
        entityId: input.clerkUserId,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });
