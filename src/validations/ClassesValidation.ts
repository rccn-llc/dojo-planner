import * as z from 'zod';

const NAME_MAX = 100;
const DESCRIPTION_MAX = 1000;
const ROOM_MAX = 100;
const REASON_MAX = 500;

const HexColor = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, 'Color must be a hex value like #4f46e5');

// HH:MM (24-hour). Accepts 0:00 through 23:59.
const TimeOfDay = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM (24-hour)');

const DayOfWeek = z.number().int().min(0).max(6);

const ScheduleInstanceShape = z.object({
  dayOfWeek: DayOfWeek,
  startTime: TimeOfDay,
  endTime: TimeOfDay,
  primaryInstructorClerkId: z.string().min(1).nullable().optional(),
  room: z.string().max(ROOM_MAX).nullable().optional(),
});

const ClassShape = z.object({
  name: z.string().min(1).max(NAME_MAX),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  programId: z.string().min(1).nullable().optional(),
  color: HexColor.nullable().optional(),
  defaultDurationMinutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  maxCapacity: z.number().int().min(1).nullable().optional(),
  minAge: z.number().int().min(0).max(120).nullable().optional(),
  maxAge: z.number().int().min(0).max(120).nullable().optional(),
  isActive: z.boolean(),
  schedule: z.array(ScheduleInstanceShape).optional().default([]),
  tagIds: z.array(z.string().min(1)).optional().default([]),
});

export const CreateClassValidation = ClassShape;

export const UpdateClassValidation = ClassShape.extend({
  id: z.string().min(1),
});

export const DeleteClassValidation = z.object({
  id: z.string().min(1),
});

// Accepts both the original schema vocabulary and the UI's vocabulary —
// the column is a text field and existing seeded data uses the second set.
const ExceptionType = z.enum([
  'cancelled',
  'time_change',
  'instructor_change',
  'room_change',
  'deleted',
  'modified',
  'modified-forward',
]);

export const UpsertScheduleExceptionValidation = z.object({
  classScheduleInstanceId: z.string().min(1),
  exceptionDate: z.coerce.date(),
  exceptionType: ExceptionType,
  newStartTime: TimeOfDay.nullable().optional(),
  newEndTime: TimeOfDay.nullable().optional(),
  newInstructorClerkId: z.string().min(1).nullable().optional(),
  newRoom: z.string().max(ROOM_MAX).nullable().optional(),
  reason: z.string().max(REASON_MAX).nullable().optional(),
});

export const DeleteScheduleExceptionValidation = z.object({
  id: z.string().min(1),
});

export type CreateClassInput = z.infer<typeof CreateClassValidation>;
export type UpdateClassInput = z.infer<typeof UpdateClassValidation>;
export type UpsertScheduleExceptionInput = z.infer<typeof UpsertScheduleExceptionValidation>;
