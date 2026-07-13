import * as z from 'zod';

const NAME_MAX = 100;
const DESCRIPTION_MAX = 2000;
const TIER_NAME_MAX = 100;

const TimeOfDay = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM (24-hour)');

const EventType = z.enum(['seminar', 'workshop', 'tournament', 'camp', 'other']);

const SessionShape = z.object({
  sessionDate: z.coerce.date(),
  startTime: TimeOfDay,
  endTime: TimeOfDay,
  primaryInstructorClerkId: z.string().min(1).nullable().optional(),
  room: z.string().max(100).nullable().optional(),
  maxCapacity: z.number().int().min(1).nullable().optional(),
});

const BillingTierShape = z.object({
  name: z.string().min(1).max(TIER_NAME_MAX),
  price: z.number().min(0),
  memberOnly: z.boolean().optional().default(false),
  validFrom: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  maxRegistrations: z.number().int().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional().default(0),
});

const LOCATION_MAX = 200;
const NOTE_MAX = 2000;

const EventShape = z.object({
  name: z.string().min(1).max(NAME_MAX),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  eventType: EventType,
  location: z.string().max(LOCATION_MAX).nullable().optional(),
  note: z.string().max(NOTE_MAX).nullable().optional(),
  programId: z.string().min(1).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  maxCapacity: z.number().int().min(1).nullable().optional(),
  registrationDeadline: z.coerce.date().nullable().optional(),
  isPublic: z.boolean().optional().default(true),
  isActive: z.boolean(),
  sessions: z.array(SessionShape).optional().default([]),
  billing: z.array(BillingTierShape).optional().default([]),
  tagIds: z.array(z.string().min(1)).optional().default([]),
});

export const CreateEventValidation = EventShape;

export const UpdateEventValidation = EventShape.extend({
  id: z.string().min(1),
});

export const DeleteEventValidation = z.object({
  id: z.string().min(1),
});

export type CreateEventInput = z.infer<typeof CreateEventValidation>;
export type UpdateEventInput = z.infer<typeof UpdateEventValidation>;
