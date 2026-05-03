import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { classSchema, membershipPlanSchema, programSchema } from '@/models/Schema';

// =============================================================================
// TYPES
// =============================================================================

export type Program = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  classCount: number;
};

export type ProgramInput = {
  name: string;
  description?: string | null;
  color?: string | null;
  isActive: boolean;
  sortOrder?: number;
};

export class ProgramSlugAlreadyExistsError extends Error {
  constructor(slug: string) {
    super(`A program with slug "${slug}" already exists.`);
    this.name = 'ProgramSlugAlreadyExistsError';
  }
}

export class ProgramInUseError extends Error {
  constructor(name: string, count: number) {
    super(`Cannot delete program "${name}": ${count} class(es) and/or membership plan(s) still reference it. Mark the program inactive instead.`);
    this.name = 'ProgramInUseError';
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code: string }).code === '23505'
  );
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type ProgramRow = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isActive: boolean | null;
  sortOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
};

function toProgram(row: ProgramRow, classCount = 0): Program {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    isActive: row.isActive ?? true,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    classCount,
  };
}

// =============================================================================
// SERVICE FUNCTIONS — READS
// =============================================================================

export async function getOrganizationPrograms(organizationId: string): Promise<Program[]> {
  const rows = await db
    .select()
    .from(programSchema)
    .where(eq(programSchema.organizationId, organizationId));

  // Bulk-count classes per program in one query.
  const classCounts = await db
    .select({
      programId: classSchema.programId,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(classSchema)
    .where(eq(classSchema.organizationId, organizationId))
    .groupBy(classSchema.programId);

  const countMap = new Map<string, number>();
  for (const c of classCounts) {
    if (c.programId) {
      countMap.set(c.programId, c.count);
    }
  }

  return rows.map(row => toProgram(row, countMap.get(row.id) ?? 0));
}

export async function getProgramById(programId: string, organizationId: string): Promise<Program | null> {
  const rows = await db
    .select()
    .from(programSchema)
    .where(and(eq(programSchema.id, programId), eq(programSchema.organizationId, organizationId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  return toProgram(row);
}

// =============================================================================
// SERVICE FUNCTIONS — WRITES
// =============================================================================

export async function createProgram(input: ProgramInput, organizationId: string): Promise<Program> {
  const id = randomUUID();
  const slug = slugify(input.name);
  try {
    const inserted = await db
      .insert(programSchema)
      .values({
        id,
        organizationId,
        name: input.name,
        slug,
        description: input.description ?? null,
        color: input.color ?? null,
        isActive: input.isActive,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new Error('Failed to insert program');
    }
    return toProgram(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ProgramSlugAlreadyExistsError(slug);
    }
    throw error;
  }
}

export async function updateProgram(
  programId: string,
  input: ProgramInput,
  organizationId: string,
): Promise<Program | null> {
  const existing = await db
    .select()
    .from(programSchema)
    .where(and(eq(programSchema.id, programId), eq(programSchema.organizationId, organizationId)))
    .limit(1);
  if (existing.length === 0) {
    return null;
  }

  const slug = slugify(input.name);
  try {
    const updated = await db
      .update(programSchema)
      .set({
        name: input.name,
        slug,
        description: input.description ?? null,
        color: input.color ?? null,
        isActive: input.isActive,
        sortOrder: input.sortOrder ?? 0,
      })
      .where(and(eq(programSchema.id, programId), eq(programSchema.organizationId, organizationId)))
      .returning();
    const row = updated[0];
    if (!row) {
      return null;
    }
    return toProgram(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ProgramSlugAlreadyExistsError(slug);
    }
    throw error;
  }
}

export async function deleteProgram(programId: string, organizationId: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(programSchema)
    .where(and(eq(programSchema.id, programId), eq(programSchema.organizationId, organizationId)))
    .limit(1);
  const program = existing[0];
  if (!program) {
    return false;
  }

  // Refuse delete when classes or membership plans still reference the program.
  const classRefs = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(classSchema)
    .where(eq(classSchema.programId, programId));
  const planRefs = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(membershipPlanSchema)
    .where(eq(membershipPlanSchema.programId, programId));
  const refCount = (classRefs[0]?.count ?? 0) + (planRefs[0]?.count ?? 0);
  if (refCount > 0) {
    throw new ProgramInUseError(program.name, refCount);
  }

  await db
    .delete(programSchema)
    .where(and(eq(programSchema.id, programId), eq(programSchema.organizationId, organizationId)));
  return true;
}
