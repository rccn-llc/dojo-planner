import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  createTag,
  deleteTag,
  getAllTags,
  getClassTags,
  getMembershipTags,
  TagNameAlreadyExistsError,
  updateTag,
} from '@/services/TagsService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import {
  CreateTagValidation,
  DeleteTagValidation,
  UpdateTagValidation,
} from '@/validations/TagsValidation';
import { guardRole } from './AuthGuards';

export const listAll = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

  const tags = await getAllTags(orgId);

  return { tags };
});

export const listClassTags = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

  const tags = await getClassTags(orgId);

  return { tags };
});

export const listMembershipTags = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

  const tags = await getMembershipTags(orgId);

  return { tags };
});

export const create = os
  .input(CreateTagValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const tag = await createTag({
        organizationId: context.orgId,
        entityType: input.entityType,
        name: input.name,
        color: input.color,
      });

      await audit(context, AUDIT_ACTION.TAG_CREATE, AUDIT_ENTITY_TYPE.TAG, {
        entityId: tag.id,
        status: 'success',
      });

      return { tag };
    } catch (error) {
      await audit(context, AUDIT_ACTION.TAG_CREATE, AUDIT_ENTITY_TYPE.TAG, {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof TagNameAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const update = os
  .input(UpdateTagValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const tag = await updateTag({
        id: input.id,
        organizationId: context.orgId,
        name: input.name,
        color: input.color,
      });

      if (!tag) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.TAG_UPDATE, AUDIT_ENTITY_TYPE.TAG, {
        entityId: tag.id,
        status: 'success',
      });

      return { tag };
    } catch (error) {
      await audit(context, AUDIT_ACTION.TAG_UPDATE, AUDIT_ENTITY_TYPE.TAG, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof TagNameAlreadyExistsError) {
        throw new ORPCError('Conflict', { status: 409, message: error.message });
      }
      throw error;
    }
  });

export const remove = os
  .input(DeleteTagValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const result = await deleteTag(input.id, context.orgId);

      if (!result.deleted) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.TAG_DELETE, AUDIT_ENTITY_TYPE.TAG, {
        entityId: input.id,
        status: 'success',
      });

      return { success: true, unlinkedFromCount: result.unlinkedFromCount };
    } catch (error) {
      await audit(context, AUDIT_ACTION.TAG_DELETE, AUDIT_ENTITY_TYPE.TAG, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });
