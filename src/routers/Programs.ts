import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  createProgram,
  deleteProgram,
  getOrganizationPrograms,
  ProgramInUseError,
  ProgramSlugAlreadyExistsError,
  updateProgram,
} from '@/services/ProgramsService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import {
  CreateProgramValidation,
  DeleteProgramValidation,
  UpdateProgramValidation,
} from '@/validations/ProgramValidation';
import { guardRole } from './AuthGuards';

export const list = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);
  const programs = await getOrganizationPrograms(orgId);
  return { programs };
});

export const create = os
  .input(CreateProgramValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const program = await createProgram({
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      }, context.orgId);

      await audit(context, AUDIT_ACTION.PROGRAM_CREATE, AUDIT_ENTITY_TYPE.PROGRAM, {
        entityId: program.id,
        status: 'success',
      });

      return { program };
    } catch (error) {
      await audit(context, AUDIT_ACTION.PROGRAM_CREATE, AUDIT_ENTITY_TYPE.PROGRAM, {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof ProgramSlugAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const update = os
  .input(UpdateProgramValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const program = await updateProgram(input.id, {
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      }, context.orgId);

      if (!program) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.PROGRAM_UPDATE, AUDIT_ENTITY_TYPE.PROGRAM, {
        entityId: program.id,
        status: 'success',
      });

      return { program };
    } catch (error) {
      await audit(context, AUDIT_ACTION.PROGRAM_UPDATE, AUDIT_ENTITY_TYPE.PROGRAM, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof ProgramSlugAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const remove = os
  .input(DeleteProgramValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const deleted = await deleteProgram(input.id, context.orgId);

      if (!deleted) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.PROGRAM_DELETE, AUDIT_ENTITY_TYPE.PROGRAM, {
        entityId: input.id,
        status: 'success',
      });

      return { success: true };
    } catch (error) {
      await audit(context, AUDIT_ACTION.PROGRAM_DELETE, AUDIT_ENTITY_TYPE.PROGRAM, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof ProgramInUseError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });
