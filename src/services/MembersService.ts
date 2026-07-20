import type { TransactionData } from '@/services/TransactionsService';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { addressSchema, attendanceSchema, classEnrollmentSchema, couponUsageSchema, eventRegistrationSchema, familyMemberSchema, memberMembershipSchema, memberSchema, membershipPlanSchema, noteSchema, paymentMethodSchema, signedWaiverSchema, transactionSchema } from '@/models/Schema';

export type MembershipPlanData = {
  id: string;
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
};

type Address = {
  street: string;
  apartment?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
};

type MembershipPlan = {
  id: string;
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
};

type MemberMembership = {
  id: string;
  membershipPlanId: string;
  membershipPlan?: MembershipPlan | null;
  status: string;
  startDate: Date;
  endDate: Date | null;
  firstPaymentDate: Date | null;
  nextPaymentDate: Date | null;
  createdAt: Date;
};

type MemberWithCustomData = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: Date | null;
  photoUrl: string | null;
  memberType: string | null;
  lastAccessedAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  create_organization_enabled?: boolean;
  address?: Address;
  currentMembership?: MemberMembership | null;
  membershipHistory?: MemberMembership[];
};

type CreateMemberInput = {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth: Date;
  memberType?: string;
  photoUrl?: string;
  status: string;
  address?: {
    street?: string;
    apartment?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
};

type UpdateMemberInput = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  photoUrl?: string;
  memberType?: string;
  dateOfBirth?: Date;
  lastAccessedAt?: Date;
  status?: string;
};

/**
 * Fetch organization members from database
 * @param organizationId - The organization ID
 * @returns Array of members from the database
 */
export async function getOrganizationMembers(
  organizationId: string,
): Promise<MemberWithCustomData[]> {
  // Fetch all members for the organization from the database
  const members = await db
    .select()
    .from(memberSchema)
    .where(eq(memberSchema.organizationId, organizationId));

  logger.info('[MembersService] Fetched members from database', {
    organizationId,
    count: members.length,
  });

  // Fetch addresses for all members
  const memberIds = members.map(m => m.id);
  const addresses = memberIds.length > 0
    ? await db
        .select()
        .from(addressSchema)
        .where(inArray(addressSchema.memberId, memberIds))
    : [];

  // Create a map of member ID to address for quick lookup
  const addressMap = new Map<string, Address>();
  addresses.forEach((addr) => {
    if (addr.memberId && addr.isDefault) {
      addressMap.set(addr.memberId, {
        street: addr.street,
        apartment: undefined,
        city: addr.city,
        state: addr.state,
        zipCode: addr.zipCode,
        country: addr.country,
      });
    }
  });

  // Fetch memberships for all members
  const memberships = memberIds.length > 0
    ? await db
        .select()
        .from(memberMembershipSchema)
        .where(inArray(memberMembershipSchema.memberId, memberIds))
    : [];

  // Fetch all membership plans for the organization to join with memberships
  const membershipPlanIds = [...new Set(memberships.map(m => m.membershipPlanId))];
  const membershipPlans = membershipPlanIds.length > 0
    ? await db
        .select()
        .from(membershipPlanSchema)
        .where(inArray(membershipPlanSchema.id, membershipPlanIds))
    : [];

  // Create a map of plan ID to plan for quick lookup
  const planMap = new Map<string, MembershipPlan>();
  membershipPlans.forEach((plan) => {
    planMap.set(plan.id, {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      category: plan.category,
      program: plan.program,
      price: plan.price,
      signupFee: plan.signupFee,
      cancellationFee: plan.cancellationFee,
      holdFeeAmount: plan.holdFeeAmount,
      holdFeeFrequency: plan.holdFeeFrequency,
      holdLimitPerYear: plan.holdLimitPerYear,
      frequency: plan.frequency,
      contractLength: plan.contractLength,
      accessLevel: plan.accessLevel,
      description: plan.description,
      isTrial: plan.isTrial,
      isActive: plan.isActive,
    });
  });

  // Create maps for current membership and membership history
  const currentMembershipMap = new Map<string, MemberMembership>();
  const membershipHistoryMap = new Map<string, MemberMembership[]>();

  memberships.forEach((membership) => {
    const memberMembership: MemberMembership = {
      id: membership.id,
      membershipPlanId: membership.membershipPlanId,
      membershipPlan: planMap.get(membership.membershipPlanId) || null,
      status: membership.status,
      startDate: membership.startDate,
      endDate: membership.endDate,
      firstPaymentDate: membership.firstPaymentDate,
      nextPaymentDate: membership.nextPaymentDate,
      createdAt: membership.createdAt,
    };

    // Build history
    const history = membershipHistoryMap.get(membership.memberId) || [];
    history.push(memberMembership);
    membershipHistoryMap.set(membership.memberId, history);

    // Set current membership. A held membership is still the member's current
    // one — excluding it made the detail page's "Actions" menu (which owns the
    // Reactivate action) disappear exactly when the member was on hold (#235).
    // Prefer an active membership over a held one; otherwise take the most
    // recent of the same kind.
    if (membership.status === 'active' || membership.status === 'hold') {
      const current = currentMembershipMap.get(membership.memberId);
      const isMoreCurrent
        = !current
          || (current.status === 'hold' && membership.status === 'active')
          || (current.status === membership.status && membership.startDate > current.startDate);
      if (isMoreCurrent) {
        currentMembershipMap.set(membership.memberId, memberMembership);
      }
    }
  });

  return members.map(member => ({
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    phone: member.phone || null,
    dateOfBirth: member.dateOfBirth || null,
    // NOTE: photoUrl is intentionally omitted from the LIST query (it's a large
    // base64 data URL and shipping it for every member bloats the response +
    // client heap). The list renders avatar initials as a fallback; the member
    // detail page fetches the photo via `getMemberById` (#perf). Kept in the
    // shape as null so downstream types don't change.
    photoUrl: null,
    memberType: member.memberType || null,
    lastAccessedAt: member.lastAccessedAt || null,
    status: member.status,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    create_organization_enabled: false, // Members table doesn't have admins
    address: addressMap.get(member.id),
    currentMembership: currentMembershipMap.get(member.id) || null,
    membershipHistory: membershipHistoryMap.get(member.id) || [],
  }));
}

/**
 * Fetch a single member (with photo, address, memberships) by id, org-scoped.
 * Used by the member detail page so the base64 photo can be dropped from the
 * members-LIST query without losing it on the detail view. Returns null when
 * the member is not in the org (router maps to 404).
 */
export async function getMemberById(
  memberId: string,
  organizationId: string,
): Promise<MemberWithCustomData | null> {
  const [member] = await db
    .select()
    .from(memberSchema)
    .where(and(eq(memberSchema.id, memberId), eq(memberSchema.organizationId, organizationId)))
    .limit(1);

  if (!member) {
    return null;
  }

  const [addresses, memberships] = await Promise.all([
    db.select().from(addressSchema).where(eq(addressSchema.memberId, memberId)),
    db.select().from(memberMembershipSchema).where(eq(memberMembershipSchema.memberId, memberId)),
  ]);

  const membershipPlanIds = [...new Set(memberships.map(m => m.membershipPlanId))];
  const membershipPlans = membershipPlanIds.length > 0
    ? await db.select().from(membershipPlanSchema).where(inArray(membershipPlanSchema.id, membershipPlanIds))
    : [];

  const planMap = new Map<string, MembershipPlan>();
  membershipPlans.forEach((plan) => {
    planMap.set(plan.id, {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      category: plan.category,
      program: plan.program,
      price: plan.price,
      signupFee: plan.signupFee,
      cancellationFee: plan.cancellationFee,
      holdFeeAmount: plan.holdFeeAmount,
      holdFeeFrequency: plan.holdFeeFrequency,
      holdLimitPerYear: plan.holdLimitPerYear,
      frequency: plan.frequency,
      contractLength: plan.contractLength,
      accessLevel: plan.accessLevel,
      description: plan.description,
      isTrial: plan.isTrial,
      isActive: plan.isActive,
    });
  });

  const defaultAddress = addresses.find(a => a.isDefault);
  const address: Address | undefined = defaultAddress
    ? {
        street: defaultAddress.street,
        apartment: undefined,
        city: defaultAddress.city,
        state: defaultAddress.state,
        zipCode: defaultAddress.zipCode,
        country: defaultAddress.country,
      }
    : undefined;

  const history: MemberMembership[] = memberships.map(membership => ({
    id: membership.id,
    membershipPlanId: membership.membershipPlanId,
    membershipPlan: planMap.get(membership.membershipPlanId) || null,
    status: membership.status,
    startDate: membership.startDate,
    endDate: membership.endDate,
    firstPaymentDate: membership.firstPaymentDate,
    nextPaymentDate: membership.nextPaymentDate,
    createdAt: membership.createdAt,
  }));

  // Same "current membership" selection as the list (active preferred over hold).
  let currentMembership: MemberMembership | null = null;
  for (const m of history) {
    if (m.status === 'active' || m.status === 'hold') {
      const isMoreCurrent
        = !currentMembership
          || (currentMembership.status === 'hold' && m.status === 'active')
          || (currentMembership.status === m.status && m.startDate > currentMembership.startDate);
      if (isMoreCurrent) {
        currentMembership = m;
      }
    }
  }

  return {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    phone: member.phone || null,
    dateOfBirth: member.dateOfBirth || null,
    photoUrl: member.photoUrl || null,
    memberType: member.memberType || null,
    lastAccessedAt: member.lastAccessedAt || null,
    status: member.status,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    create_organization_enabled: false,
    address,
    currentMembership,
    membershipHistory: history,
  };
}

/**
 * Create a new member in the database and optional address record
 * @param member - Member data to create
 * @param organizationId - The organization ID
 * @returns The created member record
 */
export async function createMember(member: CreateMemberInput, organizationId: string) {
  const { address, ...memberData } = member;

  // Member row + optional address are one atomic unit: a failure while inserting
  // the address must not leave a half-created member with no address (#WS3).
  return db.transaction(async (tx) => {
    const result = await tx
      .insert(memberSchema)
      .values({
        ...memberData,
        id: memberData.id || randomUUID(),
        organizationId,
      })
      .returning();

    // Create address record if address data is provided
    if (address && address.street && address.city && address.state && address.zipCode && result[0]) {
      await tx
        .insert(addressSchema)
        .values({
          id: randomUUID(),
          memberId: result[0].id,
          type: 'home',
          street: address.street,
          city: address.city,
          state: address.state,
          zipCode: address.zipCode,
          country: address.country || 'US',
          isDefault: true,
        });
    }

    return result;
  });
}

/**
 * Update an existing member
 * @param member - Partial member data to update
 * @param organizationId - The organization ID
 * @returns The updated member record
 */
export function updateMember(member: UpdateMemberInput, organizationId: string) {
  return db
    .update(memberSchema)
    .set(member)
    .where(and(eq(memberSchema.id, member.id), eq(memberSchema.organizationId, organizationId)))
    .returning();
}

/**
 * Update a member's photo (or clear it). photoUrl=null clears the column;
 * a base64 data URL string overwrites it.
 *
 * Returns an array containing `{ id }` of the updated member, or an empty
 * array when the member is not in the org (used by the router to map to 404).
 */
export function updateMemberPhoto(
  input: { id: string; photoUrl: string | null },
  organizationId: string,
): Promise<{ id: string }[]> {
  return db
    .update(memberSchema)
    .set({ photoUrl: input.photoUrl })
    .where(and(eq(memberSchema.id, input.id), eq(memberSchema.organizationId, organizationId)))
    .returning({ id: memberSchema.id });
}

/**
 * Update a member's status
 * @param memberId - The member ID to update
 * @param organizationId - The organization ID
 * @param status - The new status (active, hold, trial, cancelled, past due)
 * @returns The updated member record
 */
export function updateMemberStatus(memberId: string, organizationId: string, status: string) {
  return db
    .update(memberSchema)
    .set({
      status,
      statusChangedAt: new Date(),
    })
    .where(and(eq(memberSchema.id, memberId), eq(memberSchema.organizationId, organizationId)))
    .returning();
}

type UpdateMemberContactInfoInput = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  dateOfBirth?: Date;
  address?: {
    street: string;
    apartment?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
};

/**
 * Update a member's contact information (email, phone, dateOfBirth, address)
 * @param input - Contact info data to update
 * @param organizationId - The organization ID
 * @returns The updated member record
 */
export async function updateMemberContactInfo(input: UpdateMemberContactInfoInput, organizationId: string) {
  const { id, firstName, lastName, email, phone, dateOfBirth, address } = input;

  // Build the partial set so a missing dateOfBirth doesn't overwrite the
  // existing column with undefined.
  const memberUpdates: Record<string, unknown> = {
    firstName,
    lastName,
    email,
    phone: phone ?? null,
  };
  if (dateOfBirth !== undefined) {
    memberUpdates.dateOfBirth = dateOfBirth;
  }

  const memberResult = await db
    .update(memberSchema)
    .set(memberUpdates)
    .where(and(eq(memberSchema.id, id), eq(memberSchema.organizationId, organizationId)))
    .returning();

  if (memberResult.length === 0) {
    return [];
  }

  // Handle address update
  if (address && address.street && address.city && address.state && address.zipCode) {
    // Check if member has an existing default address
    const existingAddress = await db
      .select()
      .from(addressSchema)
      .where(and(eq(addressSchema.memberId, id), eq(addressSchema.isDefault, true)));

    if (existingAddress.length > 0) {
      // Update existing address
      await db
        .update(addressSchema)
        .set({
          street: address.street,
          city: address.city,
          state: address.state,
          zipCode: address.zipCode,
          country: address.country || 'US',
        })
        .where(and(eq(addressSchema.memberId, id), eq(addressSchema.isDefault, true)));
    } else {
      // Create new address
      await db
        .insert(addressSchema)
        .values({
          id: randomUUID(),
          memberId: id,
          type: 'home',
          street: address.street,
          city: address.city,
          state: address.state,
          zipCode: address.zipCode,
          country: address.country || 'US',
          isDefault: true,
        });
    }
  }

  return memberResult;
}

/**
 * Thrown when a new membership is added to a member who is currently on hold.
 * Held members must be reactivated before taking on a new active membership,
 * otherwise they'd be both 'hold' and 'active' at once. Mapped to a 409 by the
 * router.
 */
export class MemberOnHoldError extends Error {
  constructor() {
    super('This member is on hold. Reactivate their membership before adding a new one.');
    this.name = 'MemberOnHoldError';
  }
}

/**
 * Thrown when a member or membership plan referenced by a membership/family
 * operation cannot be resolved within the caller's organization. Routers map
 * this to a 404 so a cross-tenant probe is indistinguishable from a genuinely
 * missing row.
 */
export class MemberNotFoundError extends Error {
  constructor(message = 'Member not found') {
    super(message);
    this.name = 'MemberNotFoundError';
  }
}

/**
 * Verify a member belongs to the given organization. Throws
 * MemberNotFoundError (→ 404) on miss.
 */
async function assertMemberInOrg(memberId: string, organizationId: string): Promise<void> {
  const rows = await db
    .select({ id: memberSchema.id })
    .from(memberSchema)
    .where(and(eq(memberSchema.id, memberId), eq(memberSchema.organizationId, organizationId)))
    .limit(1);

  if (rows.length === 0) {
    throw new MemberNotFoundError('Member not found');
  }
}

/**
 * Verify a membership plan belongs to the given organization. Throws
 * MemberNotFoundError (→ 404) on miss.
 */
async function assertPlanInOrg(membershipPlanId: string, organizationId: string): Promise<void> {
  const rows = await db
    .select({ id: membershipPlanSchema.id })
    .from(membershipPlanSchema)
    .where(and(eq(membershipPlanSchema.id, membershipPlanId), eq(membershipPlanSchema.organizationId, organizationId)))
    .limit(1);

  if (rows.length === 0) {
    throw new MemberNotFoundError('Membership plan not found');
  }
}

/**
 * Add a membership to a member
 * @param memberId - The member ID
 * @param membershipPlanId - The membership plan ID
 * @returns The created membership record
 */
export async function addMemberMembership(memberId: string, membershipPlanId: string, organizationId: string) {
  // Org-scope: both the member and the plan must belong to the caller's org.
  await assertMemberInOrg(memberId, organizationId);
  await assertPlanInOrg(membershipPlanId, organizationId);

  // A held member can't take on a new active membership — that would leave them
  // simultaneously on hold and active (#262). Require a reactivation first.
  const member = await db
    .select({ status: memberSchema.status })
    .from(memberSchema)
    .where(eq(memberSchema.id, memberId))
    .limit(1);

  if (member[0]?.status === 'hold') {
    throw new MemberOnHoldError();
  }

  const result = await db
    .insert(memberMembershipSchema)
    .values({
      id: randomUUID(),
      memberId,
      membershipPlanId,
      status: 'active',
      startDate: new Date(),
    })
    .returning();

  return result;
}

/**
 * Change a member's membership (marks old one as converted and creates new one)
 * @param memberId - The member ID
 * @param newMembershipPlanId - The new membership plan ID
 * @returns The new membership record
 */
export async function changeMemberMembership(memberId: string, newMembershipPlanId: string, organizationId: string) {
  // Org-scope: both the member and the target plan must belong to the org.
  await assertMemberInOrg(memberId, organizationId);
  await assertPlanInOrg(newMembershipPlanId, organizationId);

  // Mark all active memberships as converted
  await db
    .update(memberMembershipSchema)
    .set({
      status: 'converted',
      endDate: new Date(),
    })
    .where(and(
      eq(memberMembershipSchema.memberId, memberId),
      eq(memberMembershipSchema.status, 'active'),
    ));

  // Create new membership
  const result = await db
    .insert(memberMembershipSchema)
    .values({
      id: randomUUID(),
      memberId,
      membershipPlanId: newMembershipPlanId,
      status: 'active',
      startDate: new Date(),
    })
    .returning();

  return result;
}

/**
 * Get all active membership plans for an organization
 * @param organizationId - The organization ID
 * @returns Array of active membership plans
 */
export async function getMembershipPlans(organizationId: string): Promise<MembershipPlanData[]> {
  const plans = await db
    .select()
    .from(membershipPlanSchema)
    .where(and(
      eq(membershipPlanSchema.organizationId, organizationId),
      eq(membershipPlanSchema.isActive, true),
    ));

  return plans.map(plan => ({
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    category: plan.category,
    program: plan.program,
    price: plan.price,
    signupFee: plan.signupFee,
    cancellationFee: plan.cancellationFee,
    holdFeeAmount: plan.holdFeeAmount,
    holdFeeFrequency: plan.holdFeeFrequency,
    holdLimitPerYear: plan.holdLimitPerYear,
    frequency: plan.frequency,
    contractLength: plan.contractLength,
    accessLevel: plan.accessLevel,
    description: plan.description,
    isTrial: plan.isTrial,
    isActive: plan.isActive,
  }));
}

/**
 * Get all membership plans for an organization (including inactive)
 * @param organizationId - The organization ID
 * @returns Array of all membership plans
 */
export async function getAllMembershipPlans(organizationId: string): Promise<MembershipPlanData[]> {
  const plans = await db
    .select()
    .from(membershipPlanSchema)
    .where(eq(membershipPlanSchema.organizationId, organizationId));

  return plans.map(plan => ({
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    category: plan.category,
    program: plan.program,
    price: plan.price,
    signupFee: plan.signupFee,
    cancellationFee: plan.cancellationFee,
    holdFeeAmount: plan.holdFeeAmount,
    holdFeeFrequency: plan.holdFeeFrequency,
    holdLimitPerYear: plan.holdLimitPerYear,
    frequency: plan.frequency,
    contractLength: plan.contractLength,
    accessLevel: plan.accessLevel,
    description: plan.description,
    isTrial: plan.isTrial,
    isActive: plan.isActive,
  }));
}

// ===== Member payment data queries =====

export type MemberPaymentMethodData = {
  id: string;
  type: string;
  firstSix: string | null;
  last4: string | null;
  accountType: string | null;
  isDefault: boolean | null;
};

/**
 * Get payment methods for a specific member
 * @param memberId - The member ID
 * @param organizationId - The organization ID (tenant scope — payment_method has no
 *   org column, so we join through the member to enforce isolation)
 * @returns Array of payment methods, default method first
 */
export async function getMemberPaymentMethods(
  memberId: string,
  organizationId: string,
): Promise<MemberPaymentMethodData[]> {
  return db
    .select({
      id: paymentMethodSchema.id,
      type: paymentMethodSchema.type,
      firstSix: paymentMethodSchema.firstSix,
      last4: paymentMethodSchema.last4,
      accountType: paymentMethodSchema.accountType,
      isDefault: paymentMethodSchema.isDefault,
    })
    .from(paymentMethodSchema)
    .innerJoin(memberSchema, eq(paymentMethodSchema.memberId, memberSchema.id))
    .where(and(
      eq(paymentMethodSchema.memberId, memberId),
      eq(memberSchema.organizationId, organizationId),
    ))
    .orderBy(desc(paymentMethodSchema.isDefault));
}

/**
 * Look up a payment method by id and confirm it belongs to the given member in
 * the given org (payment_method has no org column, so we join through member).
 * Returns the row (id + isDefault) or null.
 */
async function findOwnedPaymentMethod(paymentMethodId: string, memberId: string, organizationId: string) {
  const rows = await db
    .select({ id: paymentMethodSchema.id, isDefault: paymentMethodSchema.isDefault })
    .from(paymentMethodSchema)
    .innerJoin(memberSchema, eq(paymentMethodSchema.memberId, memberSchema.id))
    .where(and(
      eq(paymentMethodSchema.id, paymentMethodId),
      eq(paymentMethodSchema.memberId, memberId),
      eq(memberSchema.organizationId, organizationId),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Delete a saved payment method (#218). Org-scoped for safety. If the deleted
 * method was the default and other methods remain, promotes the most-recent
 * remaining one to default so the member always has a usable default.
 *
 * Returns `{ deleted: false }` when the method doesn't exist or isn't owned by
 * this member/org. Local DB only — the IQPro vault entry is left in place
 * (nothing else in the app deletes vault entries either).
 */
export async function deleteMemberPaymentMethod(
  paymentMethodId: string,
  memberId: string,
  organizationId: string,
): Promise<{ deleted: boolean }> {
  const owned = await findOwnedPaymentMethod(paymentMethodId, memberId, organizationId);
  if (!owned) {
    return { deleted: false };
  }

  return db.transaction(async (tx) => {
    await tx.delete(paymentMethodSchema).where(eq(paymentMethodSchema.id, paymentMethodId));

    // If we removed the default, promote another remaining method so there's
    // still a default to charge against.
    if (owned.isDefault) {
      const remaining = await tx
        .select({ id: paymentMethodSchema.id })
        .from(paymentMethodSchema)
        .where(eq(paymentMethodSchema.memberId, memberId))
        .limit(1);
      const next = remaining[0];
      if (next) {
        await tx
          .update(paymentMethodSchema)
          .set({ isDefault: true })
          .where(eq(paymentMethodSchema.id, next.id));
      }
    }

    return { deleted: true };
  });
}

/**
 * Mark a saved payment method as the member's default (#226), unsetting the
 * default flag on all their other methods so exactly one is default.
 * Org-scoped. Returns `{ updated: false }` when the method isn't owned.
 */
export async function setPrimaryPaymentMethod(
  paymentMethodId: string,
  memberId: string,
  organizationId: string,
): Promise<{ updated: boolean }> {
  const owned = await findOwnedPaymentMethod(paymentMethodId, memberId, organizationId);
  if (!owned) {
    return { updated: false };
  }

  return db.transaction(async (tx) => {
    await tx
      .update(paymentMethodSchema)
      .set({ isDefault: false })
      .where(eq(paymentMethodSchema.memberId, memberId));
    await tx
      .update(paymentMethodSchema)
      .set({ isDefault: true })
      .where(eq(paymentMethodSchema.id, paymentMethodId));
    return { updated: true };
  });
}

/**
 * Get transactions for a specific member within an organization
 * @param memberId - The member ID
 * @param organizationId - The organization ID
 * @param limit - Max number of transactions to return (default 50)
 * @returns Array of transactions, most recent first
 */
export async function getMemberTransactions(
  memberId: string,
  organizationId: string,
  limit: number = 50,
): Promise<TransactionData[]> {
  // Include this member's OWN transactions plus those of any family members
  // linked under them as a head of household. When a HOH pays for a family
  // member's membership, the transaction row is keyed to the family member, so
  // without this the HOH's billing history would be empty (#223). Each row
  // still shows the actual charged member's name via the join below.
  const familyLinks = await db
    .select({ relatedMemberId: familyMemberSchema.relatedMemberId })
    .from(familyMemberSchema)
    .where(eq(familyMemberSchema.memberId, memberId));
  const memberIds = [memberId, ...familyLinks.map(f => f.relatedMemberId)];

  return db
    .select({
      id: transactionSchema.id,
      memberId: transactionSchema.memberId,
      memberFirstName: memberSchema.firstName,
      memberLastName: memberSchema.lastName,
      transactionType: transactionSchema.transactionType,
      amount: transactionSchema.amount,
      currency: transactionSchema.currency,
      status: transactionSchema.status,
      paymentMethod: transactionSchema.paymentMethod,
      description: transactionSchema.description,
      processedAt: transactionSchema.processedAt,
      createdAt: transactionSchema.createdAt,
    })
    .from(transactionSchema)
    .innerJoin(memberSchema, eq(transactionSchema.memberId, memberSchema.id))
    .where(and(
      inArray(transactionSchema.memberId, memberIds),
      eq(transactionSchema.organizationId, organizationId),
    ))
    .orderBy(desc(transactionSchema.createdAt))
    .limit(limit);
}

// ===== Family member queries =====

export type HOHMemberData = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  status: string | null;
};

/**
 * Get all Head of Household members for an organization.
 * Filters to active/trial members only.
 */
export async function getHeadOfHouseholdMembers(organizationId: string): Promise<HOHMemberData[]> {
  return db
    .select({
      id: memberSchema.id,
      firstName: memberSchema.firstName,
      lastName: memberSchema.lastName,
      email: memberSchema.email,
      phone: memberSchema.phone,
      photoUrl: memberSchema.photoUrl,
      status: memberSchema.status,
    })
    .from(memberSchema)
    .where(
      and(
        eq(memberSchema.organizationId, organizationId),
        eq(memberSchema.memberType, 'head-of-household'),
        inArray(memberSchema.status, ['active', 'trial']),
      ),
    );
}

/**
 * Link a family member to a Head of Household.
 * The HOH goes in memberId (parent side), family member in relatedMemberId.
 */
export async function linkFamilyMember(
  hohMemberId: string,
  familyMemberId: string,
  relationship: string,
  organizationId: string,
) {
  // Org-scope: both the HOH and the family member must belong to the org.
  await assertMemberInOrg(hohMemberId, organizationId);
  await assertMemberInOrg(familyMemberId, organizationId);

  return db
    .insert(familyMemberSchema)
    .values({
      memberId: hohMemberId,
      relatedMemberId: familyMemberId,
      relationship,
    })
    .returning();
}

export type FamilyMemberData = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  photoUrl: string | null;
  status: string | null;
  relationship: string;
  /** Currently-active membership plan name, or null if the family member has none. */
  planName: string | null;
  /** Plan price as a number, or null when there's no active membership. */
  planPrice: number | null;
  /** Plan billing frequency (e.g. 'monthly', 'annual'), or null. */
  planFrequency: string | null;
};

/**
 * Get family members linked to a Head of Household.
 * Joins family_member with member, then left-joins the family member's
 * currently-active membership and its plan so the row can render plan name +
 * price without a follow-up query per member.
 */
export async function getFamilyMembers(hohMemberId: string, organizationId: string): Promise<FamilyMemberData[]> {
  // Org-scope: reject a cross-tenant HOH id before reading its family roster.
  await assertMemberInOrg(hohMemberId, organizationId);

  return db
    .select({
      id: memberSchema.id,
      firstName: memberSchema.firstName,
      lastName: memberSchema.lastName,
      email: memberSchema.email,
      photoUrl: memberSchema.photoUrl,
      status: memberSchema.status,
      relationship: familyMemberSchema.relationship,
      planName: membershipPlanSchema.name,
      planPrice: membershipPlanSchema.price,
      planFrequency: membershipPlanSchema.frequency,
    })
    .from(familyMemberSchema)
    .innerJoin(memberSchema, eq(familyMemberSchema.relatedMemberId, memberSchema.id))
    .leftJoin(memberMembershipSchema, and(
      eq(memberMembershipSchema.memberId, memberSchema.id),
      eq(memberMembershipSchema.status, 'active'),
    ))
    .leftJoin(membershipPlanSchema, eq(memberMembershipSchema.membershipPlanId, membershipPlanSchema.id))
    .where(eq(familyMemberSchema.memberId, hohMemberId));
}

/**
 * Unlink a family member from their Head of Household.
 * Deletes the relationship row from the family_member table.
 */
export async function unlinkFamilyMember(hohMemberId: string, familyMemberId: string, organizationId: string) {
  // Org-scope: both the HOH and the family member must belong to the org.
  await assertMemberInOrg(hohMemberId, organizationId);
  await assertMemberInOrg(familyMemberId, organizationId);

  return db
    .delete(familyMemberSchema)
    .where(
      and(
        eq(familyMemberSchema.memberId, hohMemberId),
        eq(familyMemberSchema.relatedMemberId, familyMemberId),
      ),
    )
    .returning();
}

/**
 * Get the Head of Household for a given family member.
 * Looks up the family_member table where relatedMemberId = familyMemberId.
 */
export async function getHOHForFamilyMember(familyMemberId: string, organizationId: string): Promise<HOHMemberData | null> {
  // Org-scope: reject a cross-tenant family member id before resolving its HOH.
  await assertMemberInOrg(familyMemberId, organizationId);

  const result = await db
    .select({
      id: memberSchema.id,
      firstName: memberSchema.firstName,
      lastName: memberSchema.lastName,
      email: memberSchema.email,
      phone: memberSchema.phone,
      photoUrl: memberSchema.photoUrl,
      status: memberSchema.status,
    })
    .from(familyMemberSchema)
    .innerJoin(memberSchema, eq(familyMemberSchema.memberId, memberSchema.id))
    .where(eq(familyMemberSchema.relatedMemberId, familyMemberId))
    .limit(1);

  return result[0] ?? null;
}

export type RemoveFullyResult = {
  deleted: boolean;
  rowsRemoved: {
    signedWaiver: number;
    paymentMethod: number;
    transaction: number;
    couponUsage: number;
    classEnrollment: number;
    eventRegistration: number;
    attendance: number;
    note: number;
    memberMembership: number;
    address: number;
    familyMember: number;
  };
};

/**
 * Hard-delete a member and every row that references them, in FK-safe order,
 * inside a single DB transaction.
 *
 * Use case: payment-declined rollback in the Add Member wizard (#132). The
 * member was just created seconds ago; the operator chose "Cancel & Roll
 * Back" instead of "Add Anyway". Unlike `softDeleteMember` (which sets
 * status='archived' and preserves history), this leaves no trace — the
 * member's whole signup-aftermath chain is gone.
 *
 * Scoped to the org for safety: returns `{ deleted: false }` if the member
 * doesn't exist or doesn't belong to the org. Callers should check the
 * return value to surface "member not found" errors distinctly from
 * "permission denied".
 */
export async function removeFully(
  memberId: string,
  organizationId: string,
): Promise<RemoveFullyResult> {
  const existing = await db
    .select({ id: memberSchema.id })
    .from(memberSchema)
    .where(and(
      eq(memberSchema.id, memberId),
      eq(memberSchema.organizationId, organizationId),
    ))
    .limit(1);
  if (existing.length === 0) {
    return {
      deleted: false,
      rowsRemoved: {
        signedWaiver: 0,
        paymentMethod: 0,
        transaction: 0,
        couponUsage: 0,
        classEnrollment: 0,
        eventRegistration: 0,
        attendance: 0,
        note: 0,
        memberMembership: 0,
        address: 0,
        familyMember: 0,
      },
    };
  }

  return await db.transaction(async (tx) => {
    // Delete in FK dependency order. Tables that reference member_membership
    // (signed_waiver, transaction) come before member_membership. Tables that
    // reference member directly come next. Member row is last.
    const sw = await tx.delete(signedWaiverSchema)
      .where(eq(signedWaiverSchema.memberId, memberId))
      .returning({ id: signedWaiverSchema.id });
    const pm = await tx.delete(paymentMethodSchema)
      .where(eq(paymentMethodSchema.memberId, memberId))
      .returning({ id: paymentMethodSchema.id });
    const tr = await tx.delete(transactionSchema)
      .where(eq(transactionSchema.memberId, memberId))
      .returning({ id: transactionSchema.id });
    const cu = await tx.delete(couponUsageSchema)
      .where(eq(couponUsageSchema.memberId, memberId))
      .returning({ id: couponUsageSchema.id });
    const ce = await tx.delete(classEnrollmentSchema)
      .where(eq(classEnrollmentSchema.memberId, memberId))
      .returning({ id: classEnrollmentSchema.id });
    const er = await tx.delete(eventRegistrationSchema)
      .where(eq(eventRegistrationSchema.memberId, memberId))
      .returning({ id: eventRegistrationSchema.id });
    const at = await tx.delete(attendanceSchema)
      .where(eq(attendanceSchema.memberId, memberId))
      .returning({ id: attendanceSchema.id });
    const no = await tx.delete(noteSchema)
      .where(eq(noteSchema.memberId, memberId))
      .returning({ id: noteSchema.id });
    const mm = await tx.delete(memberMembershipSchema)
      .where(eq(memberMembershipSchema.memberId, memberId))
      .returning({ id: memberMembershipSchema.id });
    const ad = await tx.delete(addressSchema)
      .where(eq(addressSchema.memberId, memberId))
      .returning({ id: addressSchema.id });
    // family_member has TWO FKs to member (memberId + relatedMemberId); both
    // must be cleaned up so we don't leave dangling references.
    const fm = await tx.delete(familyMemberSchema)
      .where(or(
        eq(familyMemberSchema.memberId, memberId),
        eq(familyMemberSchema.relatedMemberId, memberId),
      ))
      .returning({ memberId: familyMemberSchema.memberId });
    await tx.delete(memberSchema)
      .where(and(
        eq(memberSchema.id, memberId),
        eq(memberSchema.organizationId, organizationId),
      ));

    return {
      deleted: true,
      rowsRemoved: {
        signedWaiver: sw.length,
        paymentMethod: pm.length,
        transaction: tr.length,
        couponUsage: cu.length,
        classEnrollment: ce.length,
        eventRegistration: er.length,
        attendance: at.length,
        note: no.length,
        memberMembership: mm.length,
        address: ad.length,
        familyMember: fm.length,
      },
    };
  });
}
