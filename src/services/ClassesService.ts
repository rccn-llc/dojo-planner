import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  attendanceSchema,
  classScheduleExceptionSchema,
  classScheduleInstanceSchema,
  classSchema,
  classTagSchema,
  programSchema,
  tagSchema,
} from '@/models/Schema';

// =============================================================================
// TYPES
// =============================================================================

export type ClassSchedule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  instructorClerkId: string | null;
};

export type ClassScheduleException = {
  id: string;
  classScheduleInstanceId: string;
  exceptionDate: Date;
  exceptionType: string;
  newStartTime: string | null;
  newEndTime: string | null;
  newInstructorClerkId: string | null;
  reason: string | null;
};

export type ClassTag = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
};

export type ClassData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  defaultDurationMinutes: number | null;
  minAge: number | null;
  maxAge: number | null;
  maxCapacity: number | null;
  allowWalkIns: string | null;
  isActive: boolean | null;
  program: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
  } | null;
  tags: ClassTag[];
  schedule: ClassSchedule[];
  scheduleExceptions: ClassScheduleException[];
};

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Get all classes for an organization with their schedules, tags, and exceptions
 */
export async function getOrganizationClasses(organizationId: string): Promise<ClassData[]> {
  // Fetch all classes for the organization
  const classes = await db
    .select()
    .from(classSchema)
    .where(eq(classSchema.organizationId, organizationId));

  if (classes.length === 0) {
    return [];
  }

  const classIds = classes.map(c => c.id);
  const programIds = [...new Set(classes.map(c => c.programId).filter(Boolean))] as string[];

  // Fetch related data in parallel
  const [programs, scheduleInstances, classTags, allTags] = await Promise.all([
    // Fetch programs
    programIds.length > 0
      ? db.select().from(programSchema).where(inArray(programSchema.id, programIds))
      : Promise.resolve([]),

    // Fetch schedule instances
    db.select().from(classScheduleInstanceSchema).where(inArray(classScheduleInstanceSchema.classId, classIds)),

    // Fetch class-tag relationships
    db.select().from(classTagSchema).where(inArray(classTagSchema.classId, classIds)),

    // Fetch all class tags for the organization
    db.select().from(tagSchema).where(eq(tagSchema.organizationId, organizationId)),
  ]);

  // Fetch schedule exceptions for all schedule instances
  const scheduleInstanceIds = scheduleInstances.map(s => s.id);
  const scheduleExceptions = scheduleInstanceIds.length > 0
    ? await db
        .select()
        .from(classScheduleExceptionSchema)
        .where(inArray(classScheduleExceptionSchema.classScheduleInstanceId, scheduleInstanceIds))
    : [];

  // Create lookup maps
  const programMap = new Map(programs.map(p => [p.id, p]));
  const tagMap = new Map(allTags.map(t => [t.id, t]));

  // Group schedule instances by class
  const schedulesByClass = new Map<string, ClassSchedule[]>();
  scheduleInstances.forEach((instance) => {
    const existing = schedulesByClass.get(instance.classId) || [];
    existing.push({
      id: instance.id,
      dayOfWeek: instance.dayOfWeek,
      startTime: instance.startTime,
      endTime: instance.endTime,
      instructorClerkId: instance.primaryInstructorClerkId,
    });
    schedulesByClass.set(instance.classId, existing);
  });

  // Group exceptions by class (via schedule instance)
  const scheduleInstanceToClass = new Map(scheduleInstances.map(s => [s.id, s.classId]));
  const exceptionsByClass = new Map<string, ClassScheduleException[]>();
  scheduleExceptions.forEach((exception) => {
    const classId = scheduleInstanceToClass.get(exception.classScheduleInstanceId);
    if (classId) {
      const existing = exceptionsByClass.get(classId) || [];
      existing.push({
        id: exception.id,
        classScheduleInstanceId: exception.classScheduleInstanceId,
        exceptionDate: exception.exceptionDate,
        exceptionType: exception.exceptionType,
        newStartTime: exception.newStartTime,
        newEndTime: exception.newEndTime,
        newInstructorClerkId: exception.newInstructorClerkId,
        reason: exception.reason,
      });
      exceptionsByClass.set(classId, existing);
    }
  });

  // Group tags by class
  const tagsByClass = new Map<string, ClassTag[]>();
  classTags.forEach((ct) => {
    const tag = tagMap.get(ct.tagId);
    if (tag) {
      const existing = tagsByClass.get(ct.classId) || [];
      existing.push({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        color: tag.color,
      });
      tagsByClass.set(ct.classId, existing);
    }
  });

  // Map classes with all related data
  return classes.map((cls) => {
    const program = cls.programId ? programMap.get(cls.programId) : null;
    return {
      id: cls.id,
      name: cls.name,
      slug: cls.slug,
      description: cls.description,
      color: cls.color,
      defaultDurationMinutes: cls.defaultDurationMinutes,
      minAge: cls.minAge,
      maxAge: cls.maxAge,
      maxCapacity: cls.maxCapacity,
      allowWalkIns: cls.allowWalkIns,
      isActive: cls.isActive,
      program: program
        ? {
            id: program.id,
            name: program.name,
            slug: program.slug,
            color: program.color,
          }
        : null,
      tags: tagsByClass.get(cls.id) || [],
      schedule: schedulesByClass.get(cls.id) || [],
      scheduleExceptions: exceptionsByClass.get(cls.id) || [],
    };
  });
}

/**
 * Get a single class by ID
 */
export async function getClassById(classId: string, organizationId: string): Promise<ClassData | null> {
  const classes = await getOrganizationClasses(organizationId);
  return classes.find(c => c.id === classId) || null;
}

// =============================================================================
// SERVICE FUNCTIONS — WRITES
// =============================================================================

export class ClassSlugAlreadyExistsError extends Error {
  constructor(slug: string) {
    super(`A class with slug "${slug}" already exists.`);
    this.name = 'ClassSlugAlreadyExistsError';
  }
}

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

export type ScheduleInstanceInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  primaryInstructorClerkId?: string | null;
  room?: string | null;
};

export type CreateClassServiceInput = {
  name: string;
  description?: string | null;
  programId?: string | null;
  color?: string | null;
  defaultDurationMinutes?: number | null;
  maxCapacity?: number | null;
  minAge?: number | null;
  maxAge?: number | null;
  allowWalkIns?: string | null;
  isActive: boolean;
  schedule: ScheduleInstanceInput[];
  tagIds: string[];
};

export type UpdateClassServiceInput = CreateClassServiceInput;

/**
 * Create a class with its schedule instances and tag links.
 * Slug is derived from the name. Throws ClassSlugAlreadyExistsError on
 * (organizationId, slug) collision.
 */
export async function createClass(input: CreateClassServiceInput, organizationId: string): Promise<ClassData> {
  const id = randomUUID();
  const slug = slugify(input.name);

  try {
    await db.insert(classSchema).values({
      id,
      organizationId,
      programId: input.programId ?? null,
      name: input.name,
      slug,
      description: input.description ?? null,
      color: input.color ?? null,
      defaultDurationMinutes: input.defaultDurationMinutes ?? 60,
      maxCapacity: input.maxCapacity ?? null,
      minAge: input.minAge ?? null,
      maxAge: input.maxAge ?? null,
      allowWalkIns: input.allowWalkIns ?? 'Yes',
      isActive: input.isActive,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ClassSlugAlreadyExistsError(slug);
    }
    throw error;
  }

  if (input.schedule.length > 0) {
    await db.insert(classScheduleInstanceSchema).values(
      input.schedule.map(s => ({
        id: randomUUID(),
        classId: id,
        primaryInstructorClerkId: s.primaryInstructorClerkId ?? null,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room ?? null,
        isActive: true,
      })),
    );
  }

  if (input.tagIds.length > 0) {
    await db.insert(classTagSchema).values(
      input.tagIds.map(tagId => ({ classId: id, tagId })),
    );
  }

  const created = await getClassById(id, organizationId);
  if (!created) {
    throw new Error('Class created but could not be re-read');
  }
  return created;
}

/**
 * Update class basics + replace schedule instances + replace tag links. We
 * use the "delete-and-reinsert" pattern for schedule because matching old
 * instances to new ones by (dayOfWeek, time) is fragile when the operator
 * intentionally moved a class. Returns null when the class doesn't belong
 * to the org.
 */
export async function updateClass(
  classId: string,
  input: UpdateClassServiceInput,
  organizationId: string,
): Promise<ClassData | null> {
  const existing = await db
    .select()
    .from(classSchema)
    .where(and(eq(classSchema.id, classId), eq(classSchema.organizationId, organizationId)))
    .limit(1);
  if (existing.length === 0) {
    return null;
  }

  const slug = slugify(input.name);

  try {
    await db
      .update(classSchema)
      .set({
        programId: input.programId ?? null,
        name: input.name,
        slug,
        description: input.description ?? null,
        color: input.color ?? null,
        defaultDurationMinutes: input.defaultDurationMinutes ?? 60,
        maxCapacity: input.maxCapacity ?? null,
        minAge: input.minAge ?? null,
        maxAge: input.maxAge ?? null,
        allowWalkIns: input.allowWalkIns ?? 'Yes',
        isActive: input.isActive,
      })
      .where(and(eq(classSchema.id, classId), eq(classSchema.organizationId, organizationId)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ClassSlugAlreadyExistsError(slug);
    }
    throw error;
  }

  // Replace schedule instances. We keep instances that have attendance or
  // exception rows pointing at them (deleting would cascade-fail), and only
  // wipe-and-recreate the rest. For the common path (no historical data),
  // this reduces to a full delete-and-reinsert.
  const oldInstances = await db
    .select()
    .from(classScheduleInstanceSchema)
    .where(eq(classScheduleInstanceSchema.classId, classId));

  if (oldInstances.length > 0) {
    const oldIds = oldInstances.map(i => i.id);
    const [refExceptions, refAttendance] = await Promise.all([
      db.select({ id: classScheduleExceptionSchema.classScheduleInstanceId })
        .from(classScheduleExceptionSchema)
        .where(inArray(classScheduleExceptionSchema.classScheduleInstanceId, oldIds)),
      db.select({ id: attendanceSchema.classScheduleInstanceId })
        .from(attendanceSchema)
        .where(inArray(attendanceSchema.classScheduleInstanceId, oldIds)),
    ]);
    const referenced = new Set([
      ...refExceptions.map(r => r.id),
      ...refAttendance.map(r => r.id).filter((id): id is string => id !== null),
    ]);
    const deletable = oldIds.filter(id => !referenced.has(id));
    if (deletable.length > 0) {
      await db
        .delete(classScheduleInstanceSchema)
        .where(inArray(classScheduleInstanceSchema.id, deletable));
    }
    // Mark referenced (but no-longer-current) instances inactive so the
    // calendar stops showing them, but historical joins still resolve.
    const referencedIds = oldIds.filter(id => referenced.has(id));
    if (referencedIds.length > 0) {
      await db
        .update(classScheduleInstanceSchema)
        .set({ isActive: false })
        .where(inArray(classScheduleInstanceSchema.id, referencedIds));
    }
  }

  if (input.schedule.length > 0) {
    await db.insert(classScheduleInstanceSchema).values(
      input.schedule.map(s => ({
        id: randomUUID(),
        classId,
        primaryInstructorClerkId: s.primaryInstructorClerkId ?? null,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room ?? null,
        isActive: true,
      })),
    );
  }

  // Replace tag associations.
  await db.delete(classTagSchema).where(eq(classTagSchema.classId, classId));
  if (input.tagIds.length > 0) {
    await db.insert(classTagSchema).values(
      input.tagIds.map(tagId => ({ classId, tagId })),
    );
  }

  return getClassById(classId, organizationId);
}

/**
 * Soft-delete a class (sets isActive = false). We never hard-delete because
 * attendance rows reference schedule instances; deletion would either cascade
 * or fail. Returns false when the class doesn't belong to the org.
 */
export async function softDeleteClass(classId: string, organizationId: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(classSchema)
    .where(and(eq(classSchema.id, classId), eq(classSchema.organizationId, organizationId)))
    .limit(1);
  if (existing.length === 0) {
    return false;
  }

  await db
    .update(classSchema)
    .set({ isActive: false })
    .where(and(eq(classSchema.id, classId), eq(classSchema.organizationId, organizationId)));
  return true;
}

export type UpsertScheduleExceptionServiceInput = {
  classScheduleInstanceId: string;
  exceptionDate: Date;
  exceptionType: string;
  newStartTime?: string | null;
  newEndTime?: string | null;
  newInstructorClerkId?: string | null;
  newRoom?: string | null;
  reason?: string | null;
};

/**
 * Create or update a schedule exception keyed on
 * (classScheduleInstanceId, exceptionDate). If a row already exists for that
 * date, it's updated in place — operators can change their mind about a
 * cancellation without piling up rows.
 *
 * Returns the upserted row plus a `created` flag so the router can audit
 * create vs. update distinctly.
 */
export async function upsertScheduleException(
  input: UpsertScheduleExceptionServiceInput,
  organizationId: string,
): Promise<{ id: string; created: boolean } | null> {
  // Verify the schedule instance belongs to a class in this org.
  const ownership = await db
    .select({ id: classSchema.id })
    .from(classScheduleInstanceSchema)
    .innerJoin(classSchema, eq(classSchema.id, classScheduleInstanceSchema.classId))
    .where(and(
      eq(classScheduleInstanceSchema.id, input.classScheduleInstanceId),
      eq(classSchema.organizationId, organizationId),
    ))
    .limit(1);
  if (ownership.length === 0) {
    return null;
  }

  const existing = await db
    .select()
    .from(classScheduleExceptionSchema)
    .where(and(
      eq(classScheduleExceptionSchema.classScheduleInstanceId, input.classScheduleInstanceId),
      eq(classScheduleExceptionSchema.exceptionDate, input.exceptionDate),
    ))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0]!;
    await db
      .update(classScheduleExceptionSchema)
      .set({
        exceptionType: input.exceptionType,
        newStartTime: input.newStartTime ?? null,
        newEndTime: input.newEndTime ?? null,
        newInstructorClerkId: input.newInstructorClerkId ?? null,
        newRoom: input.newRoom ?? null,
        reason: input.reason ?? null,
      })
      .where(eq(classScheduleExceptionSchema.id, row.id));
    return { id: row.id, created: false };
  }

  const id = randomUUID();
  await db.insert(classScheduleExceptionSchema).values({
    id,
    classScheduleInstanceId: input.classScheduleInstanceId,
    exceptionDate: input.exceptionDate,
    exceptionType: input.exceptionType,
    newStartTime: input.newStartTime ?? null,
    newEndTime: input.newEndTime ?? null,
    newInstructorClerkId: input.newInstructorClerkId ?? null,
    newRoom: input.newRoom ?? null,
    reason: input.reason ?? null,
  });
  return { id, created: true };
}

/**
 * Delete a schedule exception. Verifies the exception belongs to a class
 * owned by the org. Returns false when not found.
 */
export async function deleteScheduleException(
  exceptionId: string,
  organizationId: string,
): Promise<boolean> {
  const owned = await db
    .select({ id: classScheduleExceptionSchema.id })
    .from(classScheduleExceptionSchema)
    .innerJoin(
      classScheduleInstanceSchema,
      eq(classScheduleInstanceSchema.id, classScheduleExceptionSchema.classScheduleInstanceId),
    )
    .innerJoin(classSchema, eq(classSchema.id, classScheduleInstanceSchema.classId))
    .where(and(
      eq(classScheduleExceptionSchema.id, exceptionId),
      eq(classSchema.organizationId, organizationId),
    ))
    .limit(1);
  if (owned.length === 0) {
    return false;
  }

  await db.delete(classScheduleExceptionSchema).where(eq(classScheduleExceptionSchema.id, exceptionId));
  return true;
}

/**
 * Get all class tags for an organization
 */
export async function getClassTags(organizationId: string): Promise<ClassTag[]> {
  const tags = await db
    .select()
    .from(tagSchema)
    .where(eq(tagSchema.organizationId, organizationId));

  return tags
    .filter(t => t.entityType === 'class')
    .map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      color: t.color ?? null,
    }));
}
