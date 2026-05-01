import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  classTagSchema,
  eventTagSchema,
  membershipTagSchema,
  tagSchema,
} from '@/models/Schema';

// =============================================================================
// TYPES
// =============================================================================

export type Tag = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  entityType: string;
  usageCount: number;
};

export type ClassTag = Tag & {
  classNames: string[];
};

export type MembershipTag = Tag & {
  membershipNames: string[];
};

export type TagEntityType = 'class' | 'membership' | 'event';

export class TagNameAlreadyExistsError extends Error {
  constructor(name: string) {
    super(`A tag named "${name}" already exists for this entity type.`);
    this.name = 'TagNameAlreadyExistsError';
  }
}

// =============================================================================
// SERVICE FUNCTIONS — READS (existing)
// =============================================================================

/**
 * Get all class tags for an organization with usage counts
 */
export async function getClassTags(organizationId: string): Promise<ClassTag[]> {
  // Get all class tags
  const tags = await db
    .select()
    .from(tagSchema)
    .where(and(
      eq(tagSchema.organizationId, organizationId),
      eq(tagSchema.entityType, 'class'),
    ));

  if (tags.length === 0) {
    return [];
  }

  // Get usage counts for each tag using inArray instead of ANY
  const tagIds = tags.map(t => t.id);
  const usageCounts = await db
    .select({
      tagId: classTagSchema.tagId,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(classTagSchema)
    .where(inArray(classTagSchema.tagId, tagIds))
    .groupBy(classTagSchema.tagId);

  const countMap = new Map(usageCounts.map(u => [u.tagId, u.count]));

  return tags.map(t => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    color: t.color,
    entityType: t.entityType,
    usageCount: countMap.get(t.id) || 0,
    classNames: [], // Would need additional join to populate
  }));
}

/**
 * Get all membership tags for an organization with usage counts
 */
export async function getMembershipTags(organizationId: string): Promise<MembershipTag[]> {
  // Get all membership tags
  const tags = await db
    .select()
    .from(tagSchema)
    .where(and(
      eq(tagSchema.organizationId, organizationId),
      eq(tagSchema.entityType, 'membership'),
    ));

  if (tags.length === 0) {
    return [];
  }

  // Get usage counts for each tag using inArray instead of ANY
  const tagIds = tags.map(t => t.id);
  const usageCounts = await db
    .select({
      tagId: membershipTagSchema.tagId,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(membershipTagSchema)
    .where(inArray(membershipTagSchema.tagId, tagIds))
    .groupBy(membershipTagSchema.tagId);

  const countMap = new Map(usageCounts.map(u => [u.tagId, u.count]));

  return tags.map(t => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    color: t.color,
    entityType: t.entityType,
    usageCount: countMap.get(t.id) || 0,
    membershipNames: [], // Would need additional join to populate
  }));
}

/**
 * Get all tags for an organization
 */
export async function getAllTags(organizationId: string): Promise<Tag[]> {
  const tags = await db
    .select()
    .from(tagSchema)
    .where(eq(tagSchema.organizationId, organizationId));

  return tags.map(t => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    color: t.color,
    entityType: t.entityType,
    usageCount: 0, // Would need additional queries to populate
  }));
}

// =============================================================================
// SERVICE FUNCTIONS — MUTATIONS
// =============================================================================

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'tag';
}

/**
 * Maps a Postgres unique-violation (23505) into our typed error so the router
 * can return a 409 to the client.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code: string }).code === '23505'
  );
}

/**
 * Create a new tag for the given org/entityType. The slug is derived from name;
 * if a tag with the same slug already exists for this org+entityType, throws
 * TagNameAlreadyExistsError so the caller can surface a 409.
 */
export async function createTag(input: {
  organizationId: string;
  entityType: TagEntityType;
  name: string;
  color?: string | null;
}): Promise<Tag> {
  const id = randomUUID();
  const slug = slugify(input.name);
  try {
    const inserted = await db
      .insert(tagSchema)
      .values({
        id,
        organizationId: input.organizationId,
        entityType: input.entityType,
        name: input.name,
        slug,
        color: input.color ?? null,
      })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new Error('Failed to insert tag');
    }
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      color: row.color,
      entityType: row.entityType,
      usageCount: 0,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TagNameAlreadyExistsError(input.name);
    }
    throw error;
  }
}

/**
 * Update a tag's name and/or color. Returns null when the tag does not belong
 * to the given org. Throws TagNameAlreadyExistsError on slug collision.
 */
export async function updateTag(input: {
  id: string;
  organizationId: string;
  name: string;
  color?: string | null;
}): Promise<Tag | null> {
  // First confirm the tag exists in this org
  const existing = await db
    .select()
    .from(tagSchema)
    .where(and(eq(tagSchema.id, input.id), eq(tagSchema.organizationId, input.organizationId)))
    .limit(1);

  if (existing.length === 0) {
    return null;
  }

  const slug = slugify(input.name);

  try {
    const updated = await db
      .update(tagSchema)
      .set({
        name: input.name,
        slug,
        color: input.color ?? null,
      })
      .where(and(eq(tagSchema.id, input.id), eq(tagSchema.organizationId, input.organizationId)))
      .returning();
    const row = updated[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      color: row.color,
      entityType: row.entityType,
      usageCount: 0,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TagNameAlreadyExistsError(input.name);
    }
    throw error;
  }
}

/**
 * Delete a tag. Cascades through the three junction tables (class_tag,
 * membership_tag, event_tag) inside a transaction so the tag and its links
 * disappear atomically. Returns false when the tag does not belong to the org.
 *
 * Returns the number of junction rows that were unlinked alongside the deletion
 * (useful for audit detail).
 */
export async function deleteTag(
  id: string,
  organizationId: string,
): Promise<{ deleted: boolean; unlinkedFromCount: number }> {
  // Confirm cross-tenant safety
  const existing = await db
    .select()
    .from(tagSchema)
    .where(and(eq(tagSchema.id, id), eq(tagSchema.organizationId, organizationId)))
    .limit(1);

  if (existing.length === 0) {
    return { deleted: false, unlinkedFromCount: 0 };
  }

  return await db.transaction(async (tx) => {
    // Count junction rows we're about to nuke (for audit detail)
    const counts = await Promise.all([
      tx.select({ count: sql<number>`cast(count(*) as integer)` })
        .from(classTagSchema)
        .where(eq(classTagSchema.tagId, id)),
      tx.select({ count: sql<number>`cast(count(*) as integer)` })
        .from(membershipTagSchema)
        .where(eq(membershipTagSchema.tagId, id)),
      tx.select({ count: sql<number>`cast(count(*) as integer)` })
        .from(eventTagSchema)
        .where(eq(eventTagSchema.tagId, id)),
    ]);
    const unlinkedFromCount
      = (counts[0][0]?.count ?? 0)
        + (counts[1][0]?.count ?? 0)
        + (counts[2][0]?.count ?? 0);

    await tx.delete(classTagSchema).where(eq(classTagSchema.tagId, id));
    await tx.delete(membershipTagSchema).where(eq(membershipTagSchema.tagId, id));
    await tx.delete(eventTagSchema).where(eq(eventTagSchema.tagId, id));
    await tx.delete(tagSchema).where(and(eq(tagSchema.id, id), eq(tagSchema.organizationId, organizationId)));

    return { deleted: true, unlinkedFromCount };
  });
}
