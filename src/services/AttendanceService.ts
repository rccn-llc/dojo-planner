import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  attendanceSchema,
  classScheduleInstanceSchema,
  classSchema,
  eventSchema,
  eventSessionSchema,
  memberSchema,
} from '@/models/Schema';

export type AttendanceRecord = {
  id: string;
  className: string; // class.name OR event.name
  date: string; // ISO date string ('YYYY-MM-DD'); the component formats for display
  time: string; // 'HH:MM – HH:MM' from the schedule instance OR event session
  instructor: string; // Clerk user id, or 'N/A' when none recorded
};

/**
 * List attendance records for a member, scoped to the given organization.
 * Returns an empty array when the member doesn't belong to the org (cross-tenant
 * safety), or when the member simply has no attendance recorded yet.
 *
 * Joins:
 *   attendance → class_schedule_instance → class   (when class-based)
 *             → event_session            → event   (when event-based)
 *
 * One left-join chain per source so a row missing one side still appears.
 */
export async function listAttendanceForMember(
  memberId: string,
  organizationId: string,
): Promise<AttendanceRecord[]> {
  // Confirm the member is in the org before reading their attendance. Mirrors
  // the cross-tenant guard pattern used in NotesService.listNotesForMember.
  const memberRows = await db
    .select({ id: memberSchema.id })
    .from(memberSchema)
    .where(and(eq(memberSchema.id, memberId), eq(memberSchema.organizationId, organizationId)))
    .limit(1);

  if (memberRows.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: attendanceSchema.id,
      attendanceDate: attendanceSchema.attendanceDate,
      instructorClerkId: attendanceSchema.instructorClerkId,
      // Class-based fields (null when this attendance was for an event)
      className: classSchema.name,
      classStartTime: classScheduleInstanceSchema.startTime,
      classEndTime: classScheduleInstanceSchema.endTime,
      // Event-based fields (null when this attendance was for a class)
      eventName: eventSchema.name,
      eventStartTime: eventSessionSchema.startTime,
      eventEndTime: eventSessionSchema.endTime,
    })
    .from(attendanceSchema)
    .leftJoin(classScheduleInstanceSchema, eq(attendanceSchema.classScheduleInstanceId, classScheduleInstanceSchema.id))
    .leftJoin(classSchema, eq(classScheduleInstanceSchema.classId, classSchema.id))
    .leftJoin(eventSessionSchema, eq(attendanceSchema.eventSessionId, eventSessionSchema.id))
    .leftJoin(eventSchema, eq(eventSessionSchema.eventId, eventSchema.id))
    .where(and(
      eq(attendanceSchema.memberId, memberId),
      eq(attendanceSchema.organizationId, organizationId),
    ))
    .orderBy(desc(attendanceSchema.attendanceDate));

  return rows.map((r) => {
    const name = r.className ?? r.eventName ?? 'Unknown class';
    const start = r.classStartTime ?? r.eventStartTime;
    const end = r.classEndTime ?? r.eventEndTime;
    const time = start && end ? `${start} – ${end}` : '';
    return {
      id: r.id,
      className: name,
      date: r.attendanceDate.toISOString().slice(0, 10),
      time,
      instructor: r.instructorClerkId || 'N/A',
    };
  });
}
