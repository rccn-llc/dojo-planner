import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { memberMembershipSchema, membershipPlanSchema } from '@/models/Schema';

// =============================================================================
// TYPES
// =============================================================================

export type MembershipPlan = {
  id: string;
  organizationId: string;
  programId: string | null;
  name: string;
  slug: string;
  category: string;
  program: string;
  price: number;
  signupFee: number;
  frequency: string;
  contractLength: string;
  accessLevel: string;
  description: string | null;
  isTrial: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type MembershipPlanInput = {
  name: string;
  slug: string;
  category: string;
  program: string;
  programId?: string | null;
  price: number;
  signupFee: number;
  frequency: 'Monthly' | 'Annual' | 'Weekly' | 'None';
  contractLength: string;
  accessLevel: string;
  description?: string | null;
  isTrial: boolean;
  isActive: boolean;
};

export class MembershipPlanSlugAlreadyExistsError extends Error {
  constructor(slug: string) {
    super(`A membership plan with slug "${slug}" already exists.`);
    this.name = 'MembershipPlanSlugAlreadyExistsError';
  }
}

export class MembershipPlanInUseError extends Error {
  constructor(name: string, count: number) {
    super(`Cannot delete membership plan "${name}": ${count} member memberships still reference it. Mark the plan inactive instead.`);
    this.name = 'MembershipPlanInUseError';
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

type MembershipPlanRow = {
  id: string;
  organizationId: string;
  programId: string | null;
  name: string;
  slug: string;
  category: string;
  program: string;
  price: number;
  signupFee: number;
  frequency: string;
  contractLength: string;
  accessLevel: string;
  description: string | null;
  isTrial: boolean | null;
  isActive: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

function toMembershipPlan(row: MembershipPlanRow): MembershipPlan {
  return {
    id: row.id,
    organizationId: row.organizationId,
    programId: row.programId,
    name: row.name,
    slug: row.slug,
    category: row.category,
    program: row.program,
    price: row.price,
    signupFee: row.signupFee,
    frequency: row.frequency,
    contractLength: row.contractLength,
    accessLevel: row.accessLevel,
    description: row.description,
    isTrial: row.isTrial ?? false,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// =============================================================================
// SERVICE FUNCTIONS — WRITES
// =============================================================================

/**
 * Create a new membership plan. Throws MembershipPlanSlugAlreadyExistsError
 * when (organizationId, slug) collides with the unique index.
 */
export async function createMembershipPlan(input: MembershipPlanInput, organizationId: string): Promise<MembershipPlan> {
  const id = randomUUID();
  try {
    const inserted = await db
      .insert(membershipPlanSchema)
      .values({
        id,
        organizationId,
        programId: input.programId ?? null,
        name: input.name,
        slug: input.slug,
        category: input.category,
        program: input.program,
        price: input.price,
        signupFee: input.signupFee,
        frequency: input.frequency,
        contractLength: input.contractLength,
        accessLevel: input.accessLevel,
        description: input.description ?? null,
        isTrial: input.isTrial,
        isActive: input.isActive,
      })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new Error('Failed to insert membership plan');
    }
    return toMembershipPlan(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new MembershipPlanSlugAlreadyExistsError(input.slug);
    }
    throw error;
  }
}

/**
 * Update a membership plan by id. Returns null when the plan doesn't belong
 * to the org. Throws MembershipPlanSlugAlreadyExistsError on slug collision.
 */
export async function updateMembershipPlan(
  planId: string,
  input: MembershipPlanInput,
  organizationId: string,
): Promise<MembershipPlan | null> {
  const existing = await db
    .select()
    .from(membershipPlanSchema)
    .where(and(eq(membershipPlanSchema.id, planId), eq(membershipPlanSchema.organizationId, organizationId)))
    .limit(1);
  if (existing.length === 0) {
    return null;
  }

  try {
    const updated = await db
      .update(membershipPlanSchema)
      .set({
        programId: input.programId ?? null,
        name: input.name,
        slug: input.slug,
        category: input.category,
        program: input.program,
        price: input.price,
        signupFee: input.signupFee,
        frequency: input.frequency,
        contractLength: input.contractLength,
        accessLevel: input.accessLevel,
        description: input.description ?? null,
        isTrial: input.isTrial,
        isActive: input.isActive,
      })
      .where(and(eq(membershipPlanSchema.id, planId), eq(membershipPlanSchema.organizationId, organizationId)))
      .returning();
    const row = updated[0];
    if (!row) {
      return null;
    }
    return toMembershipPlan(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new MembershipPlanSlugAlreadyExistsError(input.slug);
    }
    throw error;
  }
}

/**
 * Delete a membership plan by id within the org. Refuses (MembershipPlanInUseError)
 * when any `member_membership` rows reference it — operators should mark the
 * plan inactive instead so historical records stay intact.
 *
 * Returns false when the plan doesn't belong to the org.
 */
export async function deleteMembershipPlan(planId: string, organizationId: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(membershipPlanSchema)
    .where(and(eq(membershipPlanSchema.id, planId), eq(membershipPlanSchema.organizationId, organizationId)))
    .limit(1);
  const plan = existing[0];
  if (!plan) {
    return false;
  }

  const refs = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(memberMembershipSchema)
    .where(eq(memberMembershipSchema.membershipPlanId, planId));
  const refCount = refs[0]?.count ?? 0;
  if (refCount > 0) {
    throw new MembershipPlanInUseError(plan.name, refCount);
  }

  await db
    .delete(membershipPlanSchema)
    .where(and(eq(membershipPlanSchema.id, planId), eq(membershipPlanSchema.organizationId, organizationId)));
  return true;
}
