import type { TransactionData } from '@/services/TransactionsService';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/libs/DB';
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

  console.info('[MembersService] Fetched members from database:', {
    organizationId,
    count: members.length,
    memberIds: members.map(m => m.id),
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
    photoUrl: member.photoUrl || null,
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
 * Create a new member in the database and optional address record
 * @param member - Member data to create
 * @param organizationId - The organization ID
 * @returns The created member record
 */
export async function createMember(member: CreateMemberInput, organizationId: string) {
  const { address, ...memberData } = member;

  const result = await db
    .insert(memberSchema)
    .values({
      ...memberData,
      id: memberData.id || randomUUID(),
      organizationId,
    })
    .returning();

  // Create address record if address data is provided
  if (address && address.street && address.city && address.state && address.zipCode && result[0]) {
    await db
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
      })
      .returning();
  }

  return result;
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
  const { id, email, phone, dateOfBirth, address } = input;

  // Build the partial set so a missing dateOfBirth doesn't overwrite the
  // existing column with undefined.
  const memberUpdates: Record<string, unknown> = {
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
 * Add a membership to a member
 * @param memberId - The member ID
 * @param membershipPlanId - The membership plan ID
 * @returns The created membership record
 */
export async function addMemberMembership(memberId: string, membershipPlanId: string) {
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
export async function changeMemberMembership(memberId: string, newMembershipPlanId: string) {
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
      eq(transactionSchema.memberId, memberId),
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
) {
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
export async function getFamilyMembers(hohMemberId: string): Promise<FamilyMemberData[]> {
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
export async function unlinkFamilyMember(hohMemberId: string, familyMemberId: string) {
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
export async function getHOHForFamilyMember(familyMemberId: string): Promise<HOHMemberData | null> {
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
