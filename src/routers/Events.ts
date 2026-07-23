import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  cancelEventRegistration,
  createEvent,
  EventNotFoundError,
  EventSlugAlreadyExistsError,
  getEventRegistrations,
  getOrganizationEvents,
  MemberAlreadyRegisteredError,
  MemberNotFoundError,
  registerMemberForEvent,
  softDeleteEvent,
  updateEvent,
} from '@/services/EventsService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import {
  CancelEventRegistrationValidation,
  CreateEventValidation,
  DeleteEventValidation,
  EventRegistrationsValidation,
  RegisterForEventValidation,
  UpdateEventValidation,
} from '@/validations/EventsValidation';
import { guardRole } from './AuthGuards';
import { toTenancyOrpcError } from './OrpcErrors';

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
      const tenancy = toTenancyOrpcError(error);
      if (tenancy) {
        throw tenancy;
      }
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
      const tenancy = toTenancyOrpcError(error);
      if (tenancy) {
        throw tenancy;
      }
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

// =============================================================================
// EVENT REGISTRATION (#257 / #279)
// =============================================================================

export const register = os
  .input(RegisterForEventValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const registrant = await registerMemberForEvent({
        eventId: input.eventId,
        memberId: input.memberId,
        eventBillingId: input.eventBillingId ?? null,
        amountPaid: input.amountPaid ?? null,
        transactionId: input.transactionId ?? null,
      }, context.orgId);

      await audit(context, AUDIT_ACTION.EVENT_REGISTRATION_CREATE, AUDIT_ENTITY_TYPE.EVENT_REGISTRATION, {
        entityId: registrant.id,
        status: 'success',
      });

      return { registrant };
    } catch (error) {
      await audit(context, AUDIT_ACTION.EVENT_REGISTRATION_CREATE, AUDIT_ENTITY_TYPE.EVENT_REGISTRATION, {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof MemberAlreadyRegisteredError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      if (error instanceof EventNotFoundError || error instanceof MemberNotFoundError) {
        throw new ORPCError('Not Found', { status: 404, message: error.message });
      }
      throw error;
    }
  });

export const registrations = os
  .input(EventRegistrationsValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

    const registrants = await getEventRegistrations(input.eventId, orgId);

    return { registrants };
  });

export const cancelRegistration = os
  .input(CancelEventRegistrationValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const ok = await cancelEventRegistration(input.id, context.orgId);
      if (!ok) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.EVENT_REGISTRATION_CANCEL, AUDIT_ENTITY_TYPE.EVENT_REGISTRATION, {
        entityId: input.id,
        status: 'success',
      });

      return { success: true };
    } catch (error) {
      await audit(context, AUDIT_ACTION.EVENT_REGISTRATION_CANCEL, AUDIT_ENTITY_TYPE.EVENT_REGISTRATION, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });
