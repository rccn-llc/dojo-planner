import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { memberMembershipSchema, membershipPlanSchema } from '@/models/Schema';
import { assertProgramInOrg } from './ProgramsService';

// =============================================================================
// TYPES
// =============================================================================

export type MembershipPlanFrequency = 'Weekly' | 'Monthly' | 'Semi-Annual' | 'Annual' | 'None';
export type HoldFeeFrequency = 'one-time' | 'Weekly' | 'Monthly' | 'Semi-Annual' | 'Annual';

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
  cancellationFee: number;
  holdFeeAmount: number;
  holdFeeFrequency: HoldFeeFrequency | null;
  holdLimitPerYear: number | null;
  frequency: MembershipPlanFrequency | null;
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
  cancellationFee: number;
  holdFeeAmount: number;
  holdFeeFrequency: HoldFeeFrequency | null;
  holdLimitPerYear: number | null;
  frequency: MembershipPlanFrequency | null;
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

export class InvalidProgramReferenceError extends Error {
  constructor(programId: string | null) {
    super(`The selected program (${programId ?? 'unknown'}) does not exist. Refresh and choose a program from the list.`);
    this.name = 'InvalidProgramReferenceError';
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

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code: string }).code === '23503'
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
  cancellationFee: number;
  holdFeeAmount: number;
  holdFeeFrequency: string | null;
  holdLimitPerYear: number | null;
  frequency: string | null;
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
    cancellationFee: row.cancellationFee,
    holdFeeAmount: row.holdFeeAmount,
    holdFeeFrequency: row.holdFeeFrequency as HoldFeeFrequency | null,
    holdLimitPerYear: row.holdLimitPerYear,
    frequency: row.frequency as MembershipPlanFrequency | null,
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
  // Tenancy: a client-supplied programId must belong to this org. The FK
  // constraint alone is satisfied by ANY org's program, so it can't enforce
  // tenancy — verify explicitly (→ ProgramNotFoundError → 404).
  if (input.programId) {
    await assertProgramInOrg(input.programId, organizationId);
  }
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
        cancellationFee: input.cancellationFee,
        holdFeeAmount: input.holdFeeAmount,
        holdFeeFrequency: input.holdFeeFrequency,
        holdLimitPerYear: input.holdLimitPerYear,
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
    if (isForeignKeyViolation(error)) {
      throw new InvalidProgramReferenceError(input.programId ?? null);
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

  // Tenancy: a client-supplied programId must belong to this org.
  if (input.programId) {
    await assertProgramInOrg(input.programId, organizationId);
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
        cancellationFee: input.cancellationFee,
        holdFeeAmount: input.holdFeeAmount,
        holdFeeFrequency: input.holdFeeFrequency,
        holdLimitPerYear: input.holdLimitPerYear,
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
    if (isForeignKeyViolation(error)) {
      throw new InvalidProgramReferenceError(input.programId ?? null);
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
