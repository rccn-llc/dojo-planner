import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  select: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

vi.mock('@/models/Schema', () => ({
  attendanceSchema: {
    id: 'id',
    organizationId: 'organization_id',
    memberId: 'member_id',
    classScheduleInstanceId: 'class_schedule_instance_id',
    eventSessionId: 'event_session_id',
    attendanceDate: 'attendance_date',
    instructorClerkId: 'instructor_clerk_id',
  },
  memberSchema: {
    id: 'id',
    organizationId: 'organization_id',
  },
  classScheduleInstanceSchema: {
    id: 'id',
    classId: 'class_id',
    startTime: 'start_time',
    endTime: 'end_time',
  },
  classSchema: {
    id: 'id',
    name: 'name',
  },
  eventSessionSchema: {
    id: 'id',
    eventId: 'event_id',
    startTime: 'start_time',
    endTime: 'end_time',
  },
  eventSchema: {
    id: 'id',
    name: 'name',
  },
}));

// Mock chains used by listAttendanceForMember:
//   Member-in-org check:  select.from.where.limit
//   Attendance query:     select.from.leftJoin × 4 .where.orderBy
function memberInOrgChain(rows: unknown[]) {
  const limit = vi.fn(() => Promise.resolve(rows));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { from };
}

function attendanceChain(rows: unknown[]) {
  const orderBy = vi.fn(() => Promise.resolve(rows));
  const where = vi.fn(() => ({ orderBy }));
  const lj4 = vi.fn(() => ({ where }));
  const lj3 = vi.fn(() => ({ leftJoin: lj4 }));
  const lj2 = vi.fn(() => ({ leftJoin: lj3 }));
  const lj1 = vi.fn(() => ({ leftJoin: lj2 }));
  const from = vi.fn(() => ({ leftJoin: lj1 }));
  return { from };
}

describe('AttendanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listAttendanceForMember', () => {
    it('returns [] when the member does not belong to the org', async () => {
      dbMock.select.mockReturnValueOnce(memberInOrgChain([]));

      const { listAttendanceForMember } = await import('./AttendanceService');
      const result = await listAttendanceForMember('member-other-org', 'org-1');

      expect(result).toEqual([]);
    });

    it('returns formatted records when the member has class-based attendance', async () => {
      dbMock.select.mockReturnValueOnce(memberInOrgChain([{ id: 'member-1' }]));
      const date = new Date('2026-01-15T18:00:00Z');
      dbMock.select.mockReturnValueOnce(attendanceChain([
        {
          id: 'att-1',
          attendanceDate: date,
          instructorClerkId: 'user_clerk_123',
          className: 'BJJ Fundamentals I',
          classStartTime: '18:00',
          classEndTime: '19:00',
          eventName: null,
          eventStartTime: null,
          eventEndTime: null,
        },
      ]));

      const { listAttendanceForMember } = await import('./AttendanceService');
      const result = await listAttendanceForMember('member-1', 'org-1');

      expect(result).toEqual([
        {
          id: 'att-1',
          className: 'BJJ Fundamentals I',
          date: '2026-01-15',
          time: '18:00 – 19:00',
          instructor: 'user_clerk_123',
        },
      ]);
    });

    it('falls back to event fields when attendance is event-based', async () => {
      dbMock.select.mockReturnValueOnce(memberInOrgChain([{ id: 'member-1' }]));
      dbMock.select.mockReturnValueOnce(attendanceChain([
        {
          id: 'att-2',
          attendanceDate: new Date('2026-02-10T00:00:00Z'),
          instructorClerkId: null,
          className: null,
          classStartTime: null,
          classEndTime: null,
          eventName: 'Black Belt Seminar',
          eventStartTime: '10:00',
          eventEndTime: '14:00',
        },
      ]));

      const { listAttendanceForMember } = await import('./AttendanceService');
      const result = await listAttendanceForMember('member-1', 'org-1');

      expect(result[0]).toEqual({
        id: 'att-2',
        className: 'Black Belt Seminar',
        date: '2026-02-10',
        time: '10:00 – 14:00',
        instructor: 'N/A',
      });
    });

    it('returns [] when the member has no attendance', async () => {
      dbMock.select.mockReturnValueOnce(memberInOrgChain([{ id: 'member-1' }]));
      dbMock.select.mockReturnValueOnce(attendanceChain([]));

      const { listAttendanceForMember } = await import('./AttendanceService');
      const result = await listAttendanceForMember('member-1', 'org-1');

      expect(result).toEqual([]);
    });
  });
});
