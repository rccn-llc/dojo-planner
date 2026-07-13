import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  createEvent,
  EventSlugAlreadyExistsError,
  getOrganizationEvents,
  softDeleteEvent,
  updateEvent,
} from '@/services/EventsService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import {
  CreateEventValidation,
  DeleteEventValidation,
  UpdateEventValidation,
} from '@/validations/EventsValidation';
import { guardRole } from './AuthGuards';

export const list = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

  const events = await getOrganizationEvents(orgId);

  return { events };
});

export const create = os
  .input(CreateEventValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const created = await createEvent({
        name: input.name,
        description: input.description ?? null,
        eventType: input.eventType,
        location: input.location ?? null,
        note: input.note ?? null,
        programId: input.programId ?? null,
        imageUrl: input.imageUrl ?? null,
        maxCapacity: input.maxCapacity ?? null,
        registrationDeadline: input.registrationDeadline ?? null,
        isPublic: input.isPublic,
        isActive: input.isActive,
        sessions: input.sessions,
        billing: input.billing,
        tagIds: input.tagIds,
      }, context.orgId);

      await audit(context, AUDIT_ACTION.EVENT_CREATE, AUDIT_ENTITY_TYPE.EVENT, {
        entityId: created.id,
        status: 'success',
      });

      return { event: created };
    } catch (error) {
      await audit(context, AUDIT_ACTION.EVENT_CREATE, AUDIT_ENTITY_TYPE.EVENT, {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof EventSlugAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const update = os
  .input(UpdateEventValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const updated = await updateEvent(input.id, {
        name: input.name,
        description: input.description ?? null,
        eventType: input.eventType,
        location: input.location ?? null,
        note: input.note ?? null,
        programId: input.programId ?? null,
        imageUrl: input.imageUrl ?? null,
        maxCapacity: input.maxCapacity ?? null,
        registrationDeadline: input.registrationDeadline ?? null,
        isPublic: input.isPublic,
        isActive: input.isActive,
        sessions: input.sessions,
        billing: input.billing,
        tagIds: input.tagIds,
      }, context.orgId);

      if (!updated) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.EVENT_UPDATE, AUDIT_ENTITY_TYPE.EVENT, {
        entityId: updated.id,
        status: 'success',
      });

      return { event: updated };
    } catch (error) {
      await audit(context, AUDIT_ACTION.EVENT_UPDATE, AUDIT_ENTITY_TYPE.EVENT, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof EventSlugAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const remove = os
  .input(DeleteEventValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const ok = await softDeleteEvent(input.id, context.orgId);
      if (!ok) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.EVENT_DELETE, AUDIT_ENTITY_TYPE.EVENT, {
        entityId: input.id,
        status: 'success',
      });

      return { success: true };
    } catch (error) {
      await audit(context, AUDIT_ACTION.EVENT_DELETE, AUDIT_ENTITY_TYPE.EVENT, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });
