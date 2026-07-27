import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  ClassSlugAlreadyExistsError,
  createClass,
  deleteScheduleException,
  getClassAttendance,
  getClassTags,
  getOrganizationClasses,
  softDeleteClass,
  updateClass,
  upsertScheduleException,
} from '@/services/ClassesService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import {
  CreateClassValidation,
  DeleteClassValidation,
  DeleteScheduleExceptionValidation,
  GetClassAttendanceValidation,
  UpdateClassValidation,
  UpsertScheduleExceptionValidation,
} from '@/validations/ClassesValidation';
import { guardRole } from './AuthGuards';
import { toTenancyOrpcError } from './OrpcErrors';

export const list = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

  const classes = await getOrganizationClasses(orgId);

  return { classes };
});

export const tags = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

  const classTags = await getClassTags(orgId);

  return { tags: classTags };
});

export const getAttendance = os
  .input(GetClassAttendanceValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

    return getClassAttendance(input.classId, orgId);
  });

export const create = os
  .input(CreateClassValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const created = await createClass({
        name: input.name,
        description: input.description ?? null,
        programId: input.programId ?? null,
        color: input.color ?? null,
        defaultDurationMinutes: input.defaultDurationMinutes ?? null,
        maxCapacity: input.maxCapacity ?? null,
        minAge: input.minAge ?? null,
        maxAge: input.maxAge ?? null,
        allowWalkIns: input.allowWalkIns ?? 'Yes',
        isActive: input.isActive,
        schedule: input.schedule,
        tagIds: input.tagIds,
      }, context.orgId);

      await audit(context, AUDIT_ACTION.CLASS_CREATE, AUDIT_ENTITY_TYPE.CLASS, {
        entityId: created.id,
        status: 'success',
      });

      return { class: created };
    } catch (error) {
      await audit(context, AUDIT_ACTION.CLASS_CREATE, AUDIT_ENTITY_TYPE.CLASS, {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      const tenancy = toTenancyOrpcError(error);
      if (tenancy) {
        throw tenancy;
      }
      if (error instanceof ClassSlugAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const update = os
  .input(UpdateClassValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const updated = await updateClass(input.id, {
        name: input.name,
        description: input.description ?? null,
        programId: input.programId ?? null,
        color: input.color ?? null,
        defaultDurationMinutes: input.defaultDurationMinutes ?? null,
        maxCapacity: input.maxCapacity ?? null,
        minAge: input.minAge ?? null,
        maxAge: input.maxAge ?? null,
        allowWalkIns: input.allowWalkIns ?? 'Yes',
        isActive: input.isActive,
        schedule: input.schedule,
        tagIds: input.tagIds,
      }, context.orgId);

      if (!updated) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.CLASS_UPDATE, AUDIT_ENTITY_TYPE.CLASS, {
        entityId: updated.id,
        status: 'success',
      });

      return { class: updated };
    } catch (error) {
      await audit(context, AUDIT_ACTION.CLASS_UPDATE, AUDIT_ENTITY_TYPE.CLASS, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      const tenancy = toTenancyOrpcError(error);
      if (tenancy) {
        throw tenancy;
      }
      if (error instanceof ClassSlugAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const remove = os
  .input(DeleteClassValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const ok = await softDeleteClass(input.id, context.orgId);
      if (!ok) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.CLASS_DELETE, AUDIT_ENTITY_TYPE.CLASS, {
        entityId: input.id,
        status: 'success',
      });

      return { success: true };
    } catch (error) {
      await audit(context, AUDIT_ACTION.CLASS_DELETE, AUDIT_ENTITY_TYPE.CLASS, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });

export const upsertException = os
  .input(UpsertScheduleExceptionValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const result = await upsertScheduleException({
        classScheduleInstanceId: input.classScheduleInstanceId,
        exceptionDate: input.exceptionDate,
        exceptionType: input.exceptionType,
        newStartTime: input.newStartTime ?? null,
        newEndTime: input.newEndTime ?? null,
        newInstructorClerkId: input.newInstructorClerkId ?? null,
        newRoom: input.newRoom ?? null,
        reason: input.reason ?? null,
      }, context.orgId);

      if (!result) {
        throw new ORPCError('Not Found', { status: 404, message: 'Schedule instance not found in this organization' });
      }

      const action = result.created
        ? AUDIT_ACTION.CLASS_SCHEDULE_EXCEPTION_CREATE
        : AUDIT_ACTION.CLASS_SCHEDULE_EXCEPTION_UPDATE;

      await audit(context, action, AUDIT_ENTITY_TYPE.CLASS_SCHEDULE_EXCEPTION, {
        entityId: result.id,
        status: 'success',
      });

      return { id: result.id, created: result.created };
    } catch (error) {
      await audit(context, AUDIT_ACTION.CLASS_SCHEDULE_EXCEPTION_CREATE, AUDIT_ENTITY_TYPE.CLASS_SCHEDULE_EXCEPTION, {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });

export const removeException = os
  .input(DeleteScheduleExceptionValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const ok = await deleteScheduleException(input.id, context.orgId);
      if (!ok) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.CLASS_SCHEDULE_EXCEPTION_DELETE, AUDIT_ENTITY_TYPE.CLASS_SCHEDULE_EXCEPTION, {
        entityId: input.id,
        status: 'success',
      });

      return { success: true };
    } catch (error) {
      await audit(context, AUDIT_ACTION.CLASS_SCHEDULE_EXCEPTION_DELETE, AUDIT_ENTITY_TYPE.CLASS_SCHEDULE_EXCEPTION, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });
