import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  createOrganizationRole,
  deleteOrganizationRole,
  updateOrganizationRole,
} from '@/services/ClerkRolesService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import {
  CreateRoleValidation,
  DeleteRoleValidation,
  UpdateRoleValidation,
} from '@/validations/RolesValidation';
import { guardRole } from './AuthGuards';

/**
 * Maps Clerk Backend API errors to ORPC errors with the right HTTP status.
 *
 * Clerk's API returns 4xx for: duplicate role keys, attempts to edit/delete
 * system roles (`org:admin`, `org:member` etc.), or roles still assigned to
 * members. We surface those as 409 Conflict so the UI can show a useful
 * error message; everything else becomes 500.
 */
function mapClerkError(error: unknown): ORPCError<string, unknown> {
  if (!(error instanceof Error)) {
    return new ORPCError('Internal Server Error', { status: 500 });
  }
  const message = error.message;
  // The service throws "Clerk API error: <status> - <body>"; sniff for 4xx.
  const fourXxMatch = message.match(/Clerk API error: 4\d\d/);
  if (fourXxMatch) {
    return new ORPCError('Conflict', { status: 409, message });
  }
  return new ORPCError('Internal Server Error', { status: 500, message });
}

export const create = os
  .input(CreateRoleValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const role = await createOrganizationRole({
        name: input.name,
        key: input.key,
        description: input.description,
        permissions: input.permissions,
      });

      await audit(context, AUDIT_ACTION.ROLE_CREATE, AUDIT_ENTITY_TYPE.ROLE, {
        entityId: role.id,
        status: 'success',
      });

      return { role };
    } catch (error) {
      await audit(context, AUDIT_ACTION.ROLE_CREATE, AUDIT_ENTITY_TYPE.ROLE, {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw mapClerkError(error);
    }
  });

export const update = os
  .input(UpdateRoleValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const role = await updateOrganizationRole(input.id, {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.permissions !== undefined && { permissions: input.permissions }),
      });

      await audit(context, AUDIT_ACTION.ROLE_UPDATE, AUDIT_ENTITY_TYPE.ROLE, {
        entityId: role.id,
        status: 'success',
      });

      return { role };
    } catch (error) {
      await audit(context, AUDIT_ACTION.ROLE_UPDATE, AUDIT_ENTITY_TYPE.ROLE, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw mapClerkError(error);
    }
  });

export const remove = os
  .input(DeleteRoleValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      await deleteOrganizationRole(input.id);

      await audit(context, AUDIT_ACTION.ROLE_DELETE, AUDIT_ENTITY_TYPE.ROLE, {
        entityId: input.id,
        status: 'success',
      });

      return { success: true };
    } catch (error) {
      await audit(context, AUDIT_ACTION.ROLE_DELETE, AUDIT_ENTITY_TYPE.ROLE, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw mapClerkError(error);
    }
  });
