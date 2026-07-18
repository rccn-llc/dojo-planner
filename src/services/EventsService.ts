import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  attendanceSchema,
  eventBillingSchema,
  eventRegistrationSchema,
  eventSchema,
  eventSessionSchema,
  eventTagSchema,
  memberSchema,
  tagSchema,
  transactionSchema,
} from '@/models/Schema';

// =============================================================================
// TYPES
// =============================================================================

export type EventSession = {
  id: string;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  instructorClerkId: string | null;
};

export type EventBilling = {
  id: string;
  name: string;
  price: number;
  memberOnly: boolean | null;
  validUntil: Date | null;
};

export type EventTag = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
};

export type EventData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  eventType: string;
  location: string | null;
  note: string | null;
  maxCapacity: number | null;
  isActive: boolean | null;
  tags: EventTag[];
  sessions: EventSession[];
  billing: EventBilling[];
};

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Get all events for an organization with their sessions, billing, and tags
 */
export async function getOrganizationEvents(organizationId: string): Promise<EventData[]> {
  // Fetch all active events for the organization (exclude soft-deleted)
  const events = await db
    .select()
    .from(eventSchema)
    .where(and(eq(eventSchema.organizationId, organizationId), eq(eventSchema.isActive, true)));

  if (events.length === 0) {
    return [];
  }

  const eventIds = events.map(e => e.id);

  // Fetch related data in parallel
  const [sessions, billings, eventTags, allTags] = await Promise.all([
    // Fetch event sessions
    db.select().from(eventSessionSchema).where(inArray(eventSessionSchema.eventId, eventIds)),

    // Fetch event billing
    db.select().from(eventBillingSchema).where(inArray(eventBillingSchema.eventId, eventIds)),

    // Fetch event-tag relationships
    db.select().from(eventTagSchema).where(inArray(eventTagSchema.eventId, eventIds)),

    // Fetch all tags for the organization
    db.select().from(tagSchema).where(eq(tagSchema.organizationId, organizationId)),
  ]);

  // Create lookup maps
  const tagMap = new Map(allTags.map(t => [t.id, t]));

  // Group sessions by event
  const sessionsByEvent = new Map<string, EventSession[]>();
  sessions.forEach((session) => {
    const existing = sessionsByEvent.get(session.eventId) || [];
    existing.push({
      id: session.id,
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      endTime: session.endTime,
      instructorClerkId: session.primaryInstructorClerkId,
    });
    sessionsByEvent.set(session.eventId, existing);
  });

  // Group billing by event
  const billingByEvent = new Map<string, EventBilling[]>();
  billings.forEach((billing) => {
    const existing = billingByEvent.get(billing.eventId) || [];
    existing.push({
      id: billing.id,
      name: billing.name,
      price: billing.price,
      memberOnly: billing.memberOnly,
      validUntil: billing.validUntil,
    });
    billingByEvent.set(billing.eventId, existing);
  });

  // Group tags by event
  const tagsByEvent = new Map<string, EventTag[]>();
  eventTags.forEach((et) => {
    const tag = tagMap.get(et.tagId);
    if (tag) {
      const existing = tagsByEvent.get(et.eventId) || [];
      existing.push({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        color: tag.color,
      });
      tagsByEvent.set(et.eventId, existing);
    }
  });

  // Map events with all related data
  return events.map(event => ({
    id: event.id,
    name: event.name,
    slug: event.slug,
    description: event.description,
    eventType: event.eventType,
    location: event.location,
    note: event.note,
    maxCapacity: event.maxCapacity,
    isActive: event.isActive,
    tags: tagsByEvent.get(event.id) || [],
    sessions: sessionsByEvent.get(event.id) || [],
    billing: billingByEvent.get(event.id) || [],
  }));
}

/**
 * Get a single event by ID
 */
export async function getEventById(eventId: string, organizationId: string): Promise<EventData | null> {
  const events = await getOrganizationEvents(organizationId);
  return events.find(e => e.id === eventId) || null;
}

// =============================================================================
// SERVICE FUNCTIONS — WRITES
// =============================================================================

export class EventSlugAlreadyExistsError extends Error {
  constructor(slug: string) {
    super(`An event with slug "${slug}" already exists.`);
    this.name = 'EventSlugAlreadyExistsError';
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

export type EventSessionInput = {
  sessionDate: Date;
  startTime: string;
  endTime: string;
  primaryInstructorClerkId?: string | null;
  room?: string | null;
  maxCapacity?: number | null;
};

export type EventBillingInput = {
  name: string;
  price: number;
  memberOnly?: boolean;
  validFrom?: Date | null;
  validUntil?: Date | null;
  maxRegistrations?: number | null;
  sortOrder?: number;
};

export type CreateEventServiceInput = {
  name: string;
  description?: string | null;
  eventType: string;
  location?: string | null;
  note?: string | null;
  programId?: string | null;
  imageUrl?: string | null;
  maxCapacity?: number | null;
  registrationDeadline?: Date | null;
  isPublic?: boolean;
  isActive: boolean;
  sessions: EventSessionInput[];
  billing: EventBillingInput[];
  tagIds: string[];
};

export type UpdateEventServiceInput = CreateEventServiceInput;

/**
 * Create an event with its sessions, billing tiers, and tag links.
 */
export async function createEvent(input: CreateEventServiceInput, organizationId: string): Promise<EventData> {
  const id = randomUUID();
  const slug = slugify(input.name);

  try {
    await db.insert(eventSchema).values({
      id,
      organizationId,
      programId: input.programId ?? null,
      name: input.name,
      slug,
      description: input.description ?? null,
      eventType: input.eventType,
      location: input.location ?? null,
      note: input.note ?? null,
      imageUrl: input.imageUrl ?? null,
      maxCapacity: input.maxCapacity ?? null,
      registrationDeadline: input.registrationDeadline ?? null,
      isPublic: input.isPublic ?? true,
      isActive: input.isActive,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EventSlugAlreadyExistsError(slug);
    }
    throw error;
  }

  if (input.sessions.length > 0) {
    await db.insert(eventSessionSchema).values(
      input.sessions.map(s => ({
        id: randomUUID(),
        eventId: id,
        primaryInstructorClerkId: s.primaryInstructorClerkId ?? null,
        sessionDate: s.sessionDate,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room ?? null,
        maxCapacity: s.maxCapacity ?? null,
      })),
    );
  }

  if (input.billing.length > 0) {
    await db.insert(eventBillingSchema).values(
      input.billing.map((b, idx) => ({
        id: randomUUID(),
        eventId: id,
        name: b.name,
        price: b.price,
        memberOnly: b.memberOnly ?? false,
        validFrom: b.validFrom ?? null,
        validUntil: b.validUntil ?? null,
        maxRegistrations: b.maxRegistrations ?? null,
        sortOrder: b.sortOrder ?? idx,
      })),
    );
  }

  if (input.tagIds.length > 0) {
    await db.insert(eventTagSchema).values(
      input.tagIds.map(tagId => ({ eventId: id, tagId })),
    );
  }

  const created = await getEventById(id, organizationId);
  if (!created) {
    throw new Error('Event created but could not be re-read');
  }
  return created;
}

/**
 * Update event basics + replace sessions + replace billing + replace tags.
 *
 * Same delete-and-reinsert strategy as ClassesService.updateClass: sessions
 * with attendance rows are kept (cancelled instead of removed) so historical
 * check-ins still resolve. Billing tiers are always wiped — they don't have
 * referencing rows.
 */
export async function updateEvent(
  eventId: string,
  input: UpdateEventServiceInput,
  organizationId: string,
): Promise<EventData | null> {
  const existing = await db
    .select()
    .from(eventSchema)
    .where(and(eq(eventSchema.id, eventId), eq(eventSchema.organizationId, organizationId)))
    .limit(1);
  if (existing.length === 0) {
    return null;
  }

  const slug = slugify(input.name);

  try {
    await db
      .update(eventSchema)
      .set({
        programId: input.programId ?? null,
        name: input.name,
        slug,
        description: input.description ?? null,
        eventType: input.eventType,
        location: input.location ?? null,
        note: input.note ?? null,
        imageUrl: input.imageUrl ?? null,
        maxCapacity: input.maxCapacity ?? null,
        registrationDeadline: input.registrationDeadline ?? null,
        isPublic: input.isPublic ?? true,
        isActive: input.isActive,
      })
      .where(and(eq(eventSchema.id, eventId), eq(eventSchema.organizationId, organizationId)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EventSlugAlreadyExistsError(slug);
    }
    throw error;
  }

  // Sessions: keep ones with attendance, hard-delete the rest, then reinsert.
  const oldSessions = await db
    .select()
    .from(eventSessionSchema)
    .where(eq(eventSessionSchema.eventId, eventId));

  if (oldSessions.length > 0) {
    const oldIds = oldSessions.map(s => s.id);
    const refAttendance = await db
      .select({ id: attendanceSchema.eventSessionId })
      .from(attendanceSchema)
      .where(inArray(attendanceSchema.eventSessionId, oldIds));
    const referenced = new Set(refAttendance.map(r => r.id).filter((id): id is string => id !== null));
    const deletable = oldIds.filter(id => !referenced.has(id));
    if (deletable.length > 0) {
      await db.delete(eventSessionSchema).where(inArray(eventSessionSchema.id, deletable));
    }
    const referencedIds = oldIds.filter(id => referenced.has(id));
    if (referencedIds.length > 0) {
      await db
        .update(eventSessionSchema)
        .set({ isCancelled: true })
        .where(inArray(eventSessionSchema.id, referencedIds));
    }
  }

  if (input.sessions.length > 0) {
    await db.insert(eventSessionSchema).values(
      input.sessions.map(s => ({
        id: randomUUID(),
        eventId,
        primaryInstructorClerkId: s.primaryInstructorClerkId ?? null,
        sessionDate: s.sessionDate,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room ?? null,
        maxCapacity: s.maxCapacity ?? null,
      })),
    );
  }

  // Billing tiers: replace, but only delete tiers NOT referenced by a
  // registration. event_registration.event_billing_id FKs to these rows, so
  // blindly deleting all of them raised a FK violation and 500'd whenever the
  // event already had registrations — i.e. past events (#254). Referenced tiers
  // are kept as historical records alongside the freshly-submitted tiers.
  const oldBilling = await db
    .select({ id: eventBillingSchema.id })
    .from(eventBillingSchema)
    .where(eq(eventBillingSchema.eventId, eventId));
  if (oldBilling.length > 0) {
    const oldBillingIds = oldBilling.map(b => b.id);
    const refRegistrations = await db
      .select({ id: eventRegistrationSchema.eventBillingId })
      .from(eventRegistrationSchema)
      .where(inArray(eventRegistrationSchema.eventBillingId, oldBillingIds));
    const referenced = new Set(refRegistrations.map(r => r.id).filter((id): id is string => id !== null));
    const deletable = oldBillingIds.filter(id => !referenced.has(id));
    if (deletable.length > 0) {
      await db.delete(eventBillingSchema).where(inArray(eventBillingSchema.id, deletable));
    }
  }
  if (input.billing.length > 0) {
    await db.insert(eventBillingSchema).values(
      input.billing.map((b, idx) => ({
        id: randomUUID(),
        eventId,
        name: b.name,
        price: b.price,
        memberOnly: b.memberOnly ?? false,
        validFrom: b.validFrom ?? null,
        validUntil: b.validUntil ?? null,
        maxRegistrations: b.maxRegistrations ?? null,
        sortOrder: b.sortOrder ?? idx,
      })),
    );
  }

  // Tag associations: full replace.
  await db.delete(eventTagSchema).where(eq(eventTagSchema.eventId, eventId));
  if (input.tagIds.length > 0) {
    await db.insert(eventTagSchema).values(
      input.tagIds.map(tagId => ({ eventId, tagId })),
    );
  }

  return getEventById(eventId, organizationId);
}

/**
 * Soft-delete an event (sets isActive = false). Same reasoning as classes —
 * registrations and attendance reference event/session rows.
 */
export async function softDeleteEvent(eventId: string, organizationId: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(eventSchema)
    .where(and(eq(eventSchema.id, eventId), eq(eventSchema.organizationId, organizationId)))
    .limit(1);
  if (existing.length === 0) {
    return false;
  }

  await db
    .update(eventSchema)
    .set({ isActive: false })
    .where(and(eq(eventSchema.id, eventId), eq(eventSchema.organizationId, organizationId)));
  return true;
}

// =============================================================================
// SERVICE FUNCTIONS — EVENT REGISTRATION (#257 / #279)
// =============================================================================

export type EventRegistrant = {
  id: string;
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  photoUrl: string | null;
  status: string;
  amountPaid: number | null;
  tierName: string | null;
  registeredAt: Date;
};

export type RegisterMemberInput = {
  eventId: string;
  memberId: string;
  eventBillingId?: string | null;
  amountPaid?: number | null;
  /** Optional linked transaction to backfill with the new registration id. */
  transactionId?: string | null;
};

export class MemberAlreadyRegisteredError extends Error {
  constructor() {
    super('This member is already registered for this event.');
    this.name = 'MemberAlreadyRegisteredError';
  }
}

export class EventNotFoundError extends Error {
  constructor() {
    super('Event not found.');
    this.name = 'EventNotFoundError';
  }
}

export class MemberNotFoundError extends Error {
  constructor() {
    super('Member not found.');
    this.name = 'MemberNotFoundError';
  }
}

/**
 * Register a member for an event. Org-scoped via the parent event (the
 * registration row itself carries no organizationId). Rejects a duplicate
 * active registration for the same member+event. If a `transactionId` is
 * supplied (from a preceding saved-card charge), the transaction row is
 * back-linked to the new registration so the charge and enrollment stay tied.
 */
export async function registerMemberForEvent(
  input: RegisterMemberInput,
  organizationId: string,
): Promise<EventRegistrant> {
  // Verify the event belongs to the org (also excludes soft-deleted events).
  const event = await getEventById(input.eventId, organizationId);
  if (!event) {
    throw new EventNotFoundError();
  }

  // Verify the member belongs to the org.
  const members = await db
    .select()
    .from(memberSchema)
    .where(and(eq(memberSchema.id, input.memberId), eq(memberSchema.organizationId, organizationId)))
    .limit(1);
  const member = members[0];
  if (!member) {
    throw new MemberNotFoundError();
  }

  // Dedupe: reject if a non-cancelled registration already exists.
  const existing = await db
    .select()
    .from(eventRegistrationSchema)
    .where(and(
      eq(eventRegistrationSchema.eventId, input.eventId),
      eq(eventRegistrationSchema.memberId, input.memberId),
      ne(eventRegistrationSchema.status, 'cancelled'),
    ))
    .limit(1);
  if (existing.length > 0) {
    throw new MemberAlreadyRegisteredError();
  }

  // Resolve the tier price when a tier is chosen but no explicit amount passed.
  let amountPaid = input.amountPaid ?? null;
  let tierName: string | null = null;
  if (input.eventBillingId) {
    const tier = event.billing.find(b => b.id === input.eventBillingId);
    if (!tier) {
      throw new EventNotFoundError();
    }
    tierName = tier.name;
    if (amountPaid === null) {
      amountPaid = tier.price;
    }
  }

  const id = randomUUID();
  await db.insert(eventRegistrationSchema).values({
    id,
    memberId: input.memberId,
    eventId: input.eventId,
    eventBillingId: input.eventBillingId ?? null,
    status: 'registered',
    amountPaid,
    registeredAt: new Date(),
  });

  // Back-link the charge (if any) to this registration.
  if (input.transactionId) {
    await db
      .update(transactionSchema)
      .set({ eventRegistrationId: id })
      .where(and(
        eq(transactionSchema.id, input.transactionId),
        eq(transactionSchema.organizationId, organizationId),
      ));
  }

  return {
    id,
    memberId: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    photoUrl: member.photoUrl,
    status: 'registered',
    amountPaid,
    tierName,
    registeredAt: new Date(),
  };
}

/**
 * List non-cancelled registrants for an event (org-scoped via the parent
 * event), joined to member identity + the chosen billing tier name.
 */
export async function getEventRegistrations(
  eventId: string,
  organizationId: string,
): Promise<EventRegistrant[]> {
  const event = await getEventById(eventId, organizationId);
  if (!event) {
    return [];
  }

  const rows = await db
    .select({
      id: eventRegistrationSchema.id,
      memberId: eventRegistrationSchema.memberId,
      status: eventRegistrationSchema.status,
      amountPaid: eventRegistrationSchema.amountPaid,
      registeredAt: eventRegistrationSchema.registeredAt,
      eventBillingId: eventRegistrationSchema.eventBillingId,
      firstName: memberSchema.firstName,
      lastName: memberSchema.lastName,
      email: memberSchema.email,
      photoUrl: memberSchema.photoUrl,
    })
    .from(eventRegistrationSchema)
    .innerJoin(memberSchema, eq(eventRegistrationSchema.memberId, memberSchema.id))
    .where(and(
      eq(eventRegistrationSchema.eventId, eventId),
      ne(eventRegistrationSchema.status, 'cancelled'),
    ));

  const tierNameById = new Map(event.billing.map(b => [b.id, b.name]));

  return rows.map(r => ({
    id: r.id,
    memberId: r.memberId,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    photoUrl: r.photoUrl,
    status: r.status,
    amountPaid: r.amountPaid,
    tierName: r.eventBillingId ? tierNameById.get(r.eventBillingId) ?? null : null,
    registeredAt: r.registeredAt,
  }));
}

/**
 * Soft-cancel a registration (status → 'cancelled', stamp cancelledAt).
 * Org-scoped by resolving the parent event first. Returns false when the
 * registration is missing or not in this org.
 */
export async function cancelEventRegistration(
  registrationId: string,
  organizationId: string,
): Promise<boolean> {
  const rows = await db
    .select({ eventId: eventRegistrationSchema.eventId })
    .from(eventRegistrationSchema)
    .where(eq(eventRegistrationSchema.id, registrationId))
    .limit(1);
  const registration = rows[0];
  if (!registration) {
    return false;
  }

  // Confirm the registration's event belongs to the org.
  const event = await getEventById(registration.eventId, organizationId);
  if (!event) {
    return false;
  }

  await db
    .update(eventRegistrationSchema)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(eq(eventRegistrationSchema.id, registrationId));
  return true;
}
