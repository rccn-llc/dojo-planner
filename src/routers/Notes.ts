import { currentUser } from '@clerk/nextjs/server';
import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import { createNote, deleteNote, listNotesForMember, updateNote } from '@/services/NotesService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import {
  CreateNoteValidation,
  DeleteNoteValidation,
  ListNotesValidation,
  UpdateNoteValidation,
} from '@/validations/NotesValidation';
import { guardRole } from './AuthGuards';

function buildAuthorName(user: Awaited<ReturnType<typeof currentUser>>): string {
  if (!user) {
    return 'Unknown';
  }
  const parts = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (parts) {
    return parts;
  }
  return user.username || user.primaryEmailAddress?.emailAddress || 'Unknown';
}

export const list = os
  .input(ListNotesValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);
    const notes = await listNotesForMember(input.memberId, orgId);
    return { notes };
  });

export const create = os
  .input(CreateNoteValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    const user = await currentUser();
    const authorName = buildAuthorName(user);

    try {
      const note = await createNote({
        memberId: input.memberId,
        content: input.content,
        organizationId: context.orgId,
        authorUserId: context.userId,
        authorName,
      });

      if (!note) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.NOTE_CREATE, AUDIT_ENTITY_TYPE.NOTE, {
        entityId: note.id,
        status: 'success',
      });

      return { note };
    } catch (error) {
      await audit(context, AUDIT_ACTION.NOTE_CREATE, AUDIT_ENTITY_TYPE.NOTE, {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });

export const update = os
  .input(UpdateNoteValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const note = await updateNote(input.id, input.content, context.orgId);

      if (!note) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.NOTE_UPDATE, AUDIT_ENTITY_TYPE.NOTE, {
        entityId: note.id,
        status: 'success',
      });

      return { note };
    } catch (error) {
      await audit(context, AUDIT_ACTION.NOTE_UPDATE, AUDIT_ENTITY_TYPE.NOTE, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });

export const remove = os
  .input(DeleteNoteValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const ok = await deleteNote(input.id, context.orgId);
      if (!ok) {
        throw new ORPCError('Not Found', { status: 404 });
      }

      await audit(context, AUDIT_ACTION.NOTE_DELETE, AUDIT_ENTITY_TYPE.NOTE, {
        entityId: input.id,
        status: 'success',
      });

      return { success: true };
    } catch (error) {
      await audit(context, AUDIT_ACTION.NOTE_DELETE, AUDIT_ENTITY_TYPE.NOTE, {
        entityId: input.id,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });
