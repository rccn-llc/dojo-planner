import type { ClassData } from '@/services/ClassesService';
import type { EventData } from '@/services/EventsService';
import { describe, expect, it } from 'vitest';
import {
  generateMonthlyScheduleFromData,
  generateWeeklyScheduleFromData,
  transformClassesToCardProps,
  transformClassToCardProps,
  transformEventsToCardProps,
  transformEventToCardProps,
} from './classDataTransformers';

// =============================================================================
// TEST HELPERS
// =============================================================================

function makeClass(overrides: Partial<ClassData> & Pick<ClassData, 'id' | 'name' | 'schedule'>): ClassData {
  return {
    slug: overrides.id,
    description: null,
    color: null,
    defaultDurationMinutes: 60,
    minAge: null,
    maxAge: null,
    maxCapacity: null,
    allowWalkIns: 'Yes',
    isActive: true,
    program: null,
    tags: [],
    scheduleExceptions: [],
    ...overrides,
  };
}

// =============================================================================
// generateWeeklyScheduleFromData
// =============================================================================

describe('generateWeeklyScheduleFromData', () => {
  it('places events on the correct day of the week', () => {
    // Wednesday, Feb 5, 2026
    const startDate = new Date(2026, 1, 5);

    const classes: ClassData[] = [
      makeClass({
        id: 'c1',
        name: 'Monday Class',
        schedule: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: null }],
      }),
      makeClass({
        id: 'c2',
        name: 'Friday Class',
        schedule: [{ id: 's2', dayOfWeek: 5, startTime: '18:00', endTime: '19:00', instructorClerkId: null }],
      }),
    ];

    const events = generateWeeklyScheduleFromData(startDate, classes);

    const mondayEvent = events.find(e => e.classId === 'c1');

    expect(mondayEvent).toBeDefined();
    expect(mondayEvent!.dayOfWeek).toBe(1);
    expect(mondayEvent!.hour).toBe(9);
    expect(mondayEvent!.date).toBe('2026-02-02'); // Monday of that week

    const fridayEvent = events.find(e => e.classId === 'c2');

    expect(fridayEvent).toBeDefined();
    expect(fridayEvent!.dayOfWeek).toBe(5);
    expect(fridayEvent!.hour).toBe(18);
    expect(fridayEvent!.date).toBe('2026-02-06'); // Friday of that week
  });

  it('matches exception dates consistently (UTC)', () => {
    // Wednesday, Feb 4, 2026
    const startDate = new Date(2026, 1, 4);

    const classes: ClassData[] = [
      makeClass({
        id: 'c1',
        name: 'Monday Class',
        schedule: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: null }],
        scheduleExceptions: [
          {
            id: 'exc1',
            classScheduleInstanceId: 's1',
            // UTC midnight — this is how PostgreSQL timestamps come back
            exceptionDate: new Date('2026-02-02T00:00:00.000Z'),
            exceptionType: 'deleted',
            newStartTime: null,
            newEndTime: null,
            newInstructorClerkId: null,
            reason: 'Holiday',
          },
        ],
      }),
    ];

    const events = generateWeeklyScheduleFromData(startDate, classes);

    const mondayEvent = events.find(e => e.classId === 'c1');

    expect(mondayEvent).toBeDefined();
    expect(mondayEvent!.exception).toBeDefined();
    expect(mondayEvent!.exception!.type).toBe('deleted');
  });

  it('applies time modifications from exceptions', () => {
    const startDate = new Date(2026, 1, 4);

    const classes: ClassData[] = [
      makeClass({
        id: 'c1',
        name: 'Tuesday Class',
        schedule: [{ id: 's1', dayOfWeek: 2, startTime: '09:00', endTime: '10:00', instructorClerkId: null }],
        scheduleExceptions: [
          {
            id: 'exc1',
            classScheduleInstanceId: 's1',
            exceptionDate: new Date('2026-02-03T00:00:00.000Z'),
            exceptionType: 'modified',
            newStartTime: '14:00',
            newEndTime: '15:30',
            newInstructorClerkId: null,
            reason: 'Rescheduled',
          },
        ],
      }),
    ];

    const events = generateWeeklyScheduleFromData(startDate, classes);

    const tuesdayEvent = events.find(e => e.classId === 'c1');

    expect(tuesdayEvent).toBeDefined();
    expect(tuesdayEvent!.hour).toBe(14);
    expect(tuesdayEvent!.minute).toBe(0);
    expect(tuesdayEvent!.duration).toBe(90);
  });

  it('handles multiple schedule instances on the same day', () => {
    const startDate = new Date(2026, 1, 4);

    const classes: ClassData[] = [
      makeClass({
        id: 'c1',
        name: 'Double Session',
        schedule: [
          { id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: null },
          { id: 's2', dayOfWeek: 1, startTime: '18:00', endTime: '19:00', instructorClerkId: null },
        ],
      }),
    ];

    const events = generateWeeklyScheduleFromData(startDate, classes);

    const mondayEvents = events.filter(e => e.dayOfWeek === 1);

    expect(mondayEvents).toHaveLength(2);
    expect(mondayEvents[0]!.hour).toBe(9);
    expect(mondayEvents[1]!.hour).toBe(18);
  });

  it('skips inactive classes', () => {
    const startDate = new Date(2026, 1, 4);

    const classes: ClassData[] = [
      makeClass({
        id: 'c1',
        name: 'Inactive Class',
        isActive: false,
        schedule: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: null }],
      }),
    ];

    const events = generateWeeklyScheduleFromData(startDate, classes);

    expect(events).toHaveLength(0);
  });
});

// =============================================================================
// generateMonthlyScheduleFromData
// =============================================================================

describe('generateMonthlyScheduleFromData', () => {
  it('places events on the correct calendar days', () => {
    // February 2026: starts on Sunday (day 0)
    const classes: ClassData[] = [
      makeClass({
        id: 'c1',
        name: 'Monday Class',
        schedule: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: null }],
      }),
    ];

    const events = generateMonthlyScheduleFromData(2026, 1, classes);

    // Feb 2026: Mondays are 2, 9, 16, 23
    expect(events['2']).toHaveLength(1);
    expect(events['9']).toHaveLength(1);
    expect(events['16']).toHaveLength(1);
    expect(events['23']).toHaveLength(1);

    // Tuesdays should have no events for this class
    expect(events['3']).toHaveLength(0);
  });

  it('matches exception dates consistently (UTC)', () => {
    const classes: ClassData[] = [
      makeClass({
        id: 'c1',
        name: 'Monday Class',
        schedule: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: null }],
        scheduleExceptions: [
          {
            id: 'exc1',
            classScheduleInstanceId: 's1',
            exceptionDate: new Date('2026-02-09T00:00:00.000Z'),
            exceptionType: 'deleted',
            newStartTime: null,
            newEndTime: null,
            newInstructorClerkId: null,
            reason: 'Holiday',
          },
        ],
      }),
    ];

    const events = generateMonthlyScheduleFromData(2026, 1, classes);

    // Feb 9 is a Monday — should have the exception
    const feb9Events = events['9']!;

    expect(feb9Events).toHaveLength(1);
    expect(feb9Events[0]!.exception).toBeDefined();
    expect(feb9Events[0]!.exception!.type).toBe('deleted');

    // Other Mondays should have no exception
    expect(events['2']![0]!.exception).toBeUndefined();
    expect(events['16']![0]!.exception).toBeUndefined();
  });

  it('generates events for every day of the month', () => {
    const classes: ClassData[] = [
      makeClass({
        id: 'c1',
        name: 'Daily Class',
        schedule: [
          { id: 's0', dayOfWeek: 0, startTime: '09:00', endTime: '10:00', instructorClerkId: null },
          { id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: null },
          { id: 's2', dayOfWeek: 2, startTime: '09:00', endTime: '10:00', instructorClerkId: null },
          { id: 's3', dayOfWeek: 3, startTime: '09:00', endTime: '10:00', instructorClerkId: null },
          { id: 's4', dayOfWeek: 4, startTime: '09:00', endTime: '10:00', instructorClerkId: null },
          { id: 's5', dayOfWeek: 5, startTime: '09:00', endTime: '10:00', instructorClerkId: null },
          { id: 's6', dayOfWeek: 6, startTime: '09:00', endTime: '10:00', instructorClerkId: null },
        ],
      }),
    ];

    // February 2026 has 28 days
    const events = generateMonthlyScheduleFromData(2026, 1, classes);

    for (let day = 1; day <= 28; day++) {
      expect(events[day.toString()]).toHaveLength(1);
    }
  });

  it('handles multiple classes on the same day', () => {
    const classes: ClassData[] = [
      makeClass({
        id: 'c1',
        name: 'Morning Class',
        schedule: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: null }],
      }),
      makeClass({
        id: 'c2',
        name: 'Evening Class',
        schedule: [{ id: 's2', dayOfWeek: 1, startTime: '18:00', endTime: '19:00', instructorClerkId: null }],
      }),
    ];

    const events = generateMonthlyScheduleFromData(2026, 1, classes);

    // Feb 2 is a Monday
    expect(events['2']).toHaveLength(2);
  });

  it('skips inactive classes', () => {
    const classes: ClassData[] = [
      makeClass({
        id: 'c1',
        name: 'Inactive Class',
        isActive: false,
        schedule: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: null }],
      }),
    ];

    const events = generateMonthlyScheduleFromData(2026, 1, classes);

    // All days should be empty
    for (let day = 1; day <= 28; day++) {
      expect(events[day.toString()]).toHaveLength(0);
    }
  });
});

// =============================================================================
// LOCATION THREADING
// =============================================================================

const baseEvent: EventData = {
  id: 'evt-1',
  name: 'Spring Seminar',
  description: 'desc',
  isActive: true,
  eventType: 'seminar',
  sessions: [],
  billing: [],
} as unknown as EventData;

describe('location threading', () => {
  it('transformClassToCardProps uses the passed-in location', () => {
    const cls = makeClass({
      id: 'c1',
      name: 'Class',
      schedule: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: null }],
    });

    expect(transformClassToCardProps(cls, '500 Market St').location).toBe('500 Market St');
  });

  it('transformClassToCardProps defaults to empty string when location omitted', () => {
    const cls = makeClass({ id: 'c1', name: 'Class', schedule: [] });

    expect(transformClassToCardProps(cls).location).toBe('');
  });

  it('transformClassesToCardProps threads location into every transformed item', () => {
    const cls1 = makeClass({ id: 'c1', name: 'A', schedule: [] });
    const cls2 = makeClass({ id: 'c2', name: 'B', schedule: [] });
    const result = transformClassesToCardProps([cls1, cls2], '1 Pine Ave');

    expect(result).toHaveLength(2);
    expect(result.every(c => c.location === '1 Pine Ave')).toBe(true);
  });

  it('transformEventToCardProps uses the passed-in location', () => {
    expect(transformEventToCardProps(baseEvent, '500 Market St').location).toBe('500 Market St');
  });

  it('transformEventToCardProps defaults to empty string when location omitted', () => {
    expect(transformEventToCardProps(baseEvent).location).toBe('');
  });

  it('transformEventsToCardProps threads location into every transformed event', () => {
    const events = [baseEvent, { ...baseEvent, id: 'evt-2' }];
    const result = transformEventsToCardProps(events, '1 Pine Ave');

    expect(result).toHaveLength(2);
    expect(result.every(e => e.location === '1 Pine Ave')).toBe(true);
  });
});

describe('custom tags in the grid (#247)', () => {
  it('carries non-category tags into ClassCardProps.tags', () => {
    const cls = makeClass({
      id: 'c1',
      name: 'Class',
      schedule: [],
      tags: [
        { id: 't1', name: 'Beginner', slug: 'beginner', color: null }, // level → excluded
        { id: 't2', name: 'Gi', slug: 'gi', color: null }, // style → excluded
        { id: 't3', name: 'Fundamentals', slug: 'fundamentals', color: null }, // custom → included
        { id: 't4', name: 'Morning', slug: 'morning', color: null }, // custom → included
      ],
    });

    const result = transformClassToCardProps(cls);

    expect(result.tags).toEqual(['Fundamentals', 'Morning']);
    // The level/type/style badges are still derived, not duplicated as extra tags.
    expect(result.level).toBe('Beginner');
    expect(result.style).toBe('Gi');
    expect(result.tags).not.toContain('Beginner');
    expect(result.tags).not.toContain('Gi');
  });

  it('yields an empty tags array when there are no custom tags', () => {
    const cls = makeClass({ id: 'c1', name: 'Class', schedule: [], tags: [] });

    expect(transformClassToCardProps(cls).tags).toEqual([]);
  });
});

// =============================================================================
// INSTRUCTOR RESOLUTION
// =============================================================================

describe('instructor resolution', () => {
  it('falls back to a generic "Instructor" with empty photoUrl when no lookup is provided', () => {
    const cls = makeClass({
      id: 'c1',
      name: 'Class',
      schedule: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: 'coach-1' }],
    });

    const result = transformClassToCardProps(cls);

    expect(result.instructors).toHaveLength(1);
    expect(result.instructors[0]!.name).toBe('Instructor');
    expect(result.instructors[0]!.photoUrl).toBe('');
  });

  it('falls back to the TBD placeholder when a class has no instructor clerk ids', () => {
    const cls = makeClass({
      id: 'c1',
      name: 'Class',
      schedule: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: null }],
    });

    const result = transformClassToCardProps(cls);

    expect(result.instructors).toHaveLength(1);
    expect(result.instructors[0]!.name).toBe('TBD');
    expect(result.instructors[0]!.photoUrl).toBe('');
  });

  it('uses the real name and photoUrl from the instructorLookup map when provided', () => {
    const cls = makeClass({
      id: 'c1',
      name: 'Class',
      schedule: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', instructorClerkId: 'coach-1' }],
    });
    const lookup = new Map([
      ['coach-1', { name: 'Coach Alex', photoUrl: 'https://example.com/alex.jpg' }],
    ]);

    const result = transformClassToCardProps(cls, '', lookup);

    expect(result.instructors).toHaveLength(1);
    expect(result.instructors[0]!.name).toBe('Coach Alex');
    expect(result.instructors[0]!.photoUrl).toBe('https://example.com/alex.jpg');
  });

  it('resolves event instructors from the instructorLookup map when provided', () => {
    const event = {
      ...baseEvent,
      sessions: [
        { id: 'sess-1', sessionDate: '2026-02-05', startTime: '09:00', endTime: '10:00', instructorClerkId: 'coach-2' },
      ],
    } as unknown as EventData;
    const lookup = new Map([
      ['coach-2', { name: 'Coach Sam', photoUrl: 'https://example.com/sam.jpg' }],
    ]);

    const result = transformEventToCardProps(event, '', lookup);

    expect(result.instructors).toHaveLength(1);
    expect(result.instructors[0]!.name).toBe('Coach Sam');
    expect(result.instructors[0]!.photoUrl).toBe('https://example.com/sam.jpg');
  });
});
