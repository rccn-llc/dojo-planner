import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { memberSchema, noteSchema } from '@/models/Schema';

export type Note = {
  id: string;
  memberId: string;
  content: string;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Verifies a member belongs to the org. Returns the member id when authorized,
 * null otherwise. Used to scope every note operation by orgId.
 */
async function getMemberInOrg(memberId: string, organizationId: string): Promise<string | null> {
  const rows = await db
    .select({ id: memberSchema.id })
    .from(memberSchema)
    .where(and(eq(memberSchema.id, memberId), eq(memberSchema.organizationId, organizationId)))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function getNoteInOrg(noteId: string, organizationId: string): Promise<Note | null> {
  const rows = await db
    .select({
      id: noteSchema.id,
      memberId: noteSchema.memberId,
      content: noteSchema.content,
      createdByUserId: noteSchema.createdByUserId,
      createdByName: noteSchema.createdByName,
      createdAt: noteSchema.createdAt,
      updatedAt: noteSchema.updatedAt,
      organizationId: memberSchema.organizationId,
      status: noteSchema.status,
    })
    .from(noteSchema)
    .innerJoin(memberSchema, eq(memberSchema.id, noteSchema.memberId))
    .where(eq(noteSchema.id, noteId))
    .limit(1);

  const row = rows[0];
  if (!row || row.organizationId !== organizationId || row.status !== 'active') {
    return null;
  }
  return {
    id: row.id,
    memberId: row.memberId,
    content: row.content,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listNotesForMember(memberId: string, organizationId: string): Promise<Note[]> {
  const authorizedMemberId = await getMemberInOrg(memberId, organizationId);
  if (!authorizedMemberId) {
    return [];
  }

  const rows = await db
    .select({
      id: noteSchema.id,
      memberId: noteSchema.memberId,
      content: noteSchema.content,
      createdByUserId: noteSchema.createdByUserId,
      createdByName: noteSchema.createdByName,
      createdAt: noteSchema.createdAt,
      updatedAt: noteSchema.updatedAt,
    })
    .from(noteSchema)
    .where(and(eq(noteSchema.memberId, memberId), eq(noteSchema.status, 'active')))
    .orderBy(desc(noteSchema.createdAt));

  return rows;
}

export async function createNote(input: {
  memberId: string;
  content: string;
  organizationId: string;
  authorUserId: string;
  authorName: string;
}): Promise<Note | null> {
  const authorizedMemberId = await getMemberInOrg(input.memberId, input.organizationId);
  if (!authorizedMemberId) {
    return null;
  }

  const id = randomUUID();
  const inserted = await db
    .insert(noteSchema)
    .values({
      id,
      memberId: input.memberId,
      content: input.content,
      createdByUserId: input.authorUserId,
      createdByName: input.authorName,
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    memberId: row.memberId,
    content: row.content,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function updateNote(
  noteId: string,
  content: string,
  organizationId: string,
): Promise<Note | null> {
  const existing = await getNoteInOrg(noteId, organizationId);
  if (!existing) {
    return null;
  }

  const updated = await db
    .update(noteSchema)
    .set({ content })
    .where(eq(noteSchema.id, noteId))
    .returning();

  const row = updated[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    memberId: row.memberId,
    content: row.content,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function deleteNote(noteId: string, organizationId: string): Promise<boolean> {
  const existing = await getNoteInOrg(noteId, organizationId);
  if (!existing) {
    return false;
  }
  // Soft delete via status flag (matches schema pattern: status active|archived)
  await db
    .update(noteSchema)
    .set({ status: 'archived' })
    .where(eq(noteSchema.id, noteId));
  return true;
}
