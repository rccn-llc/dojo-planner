import { describe, expect, it } from 'vitest';
import {
  CreateClassValidation,
  DeleteClassValidation,
  DeleteScheduleExceptionValidation,
  UpdateClassValidation,
  UpsertScheduleExceptionValidation,
} from './ClassesValidation';

const validClass = {
  name: 'BJJ Fundamentals',
  description: 'Beginner-friendly BJJ.',
  programId: 'prog-1',
  color: '#4f46e5',
  defaultDurationMinutes: 60,
  maxCapacity: 30,
  minAge: 18,
  maxAge: null,
  isActive: true,
  schedule: [
    { dayOfWeek: 1, startTime: '18:00', endTime: '19:00', primaryInstructorClerkId: 'user_1', room: 'Mat 1' },
  ],
  tagIds: ['tag-1'],
};

describe('CreateClassValidation', () => {
  it('accepts a valid payload', () => {
    expect(CreateClassValidation.safeParse(validClass).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateClassValidation.safeParse({ ...validClass, name: '' }).success).toBe(false);
  });

  it('rejects invalid hex color', () => {
    expect(CreateClassValidation.safeParse({ ...validClass, color: 'red' }).success).toBe(false);
  });

  it('allows null color and description', () => {
    const r = CreateClassValidation.safeParse({ ...validClass, color: null, description: null });

    expect(r.success).toBe(true);
  });

  it('rejects negative ages', () => {
    expect(CreateClassValidation.safeParse({ ...validClass, minAge: -1 }).success).toBe(false);
  });

  it('rejects malformed time-of-day', () => {
    expect(CreateClassValidation.safeParse({
      ...validClass,
      schedule: [{ dayOfWeek: 1, startTime: '25:00', endTime: '26:00' }],
    }).success).toBe(false);
  });

  it('rejects out-of-range dayOfWeek', () => {
    expect(CreateClassValidation.safeParse({
      ...validClass,
      schedule: [{ dayOfWeek: 7, startTime: '18:00', endTime: '19:00' }],
    }).success).toBe(false);
  });

  it('defaults schedule and tagIds when omitted', () => {
    const { schedule: _s, tagIds: _t, ...minimal } = validClass;
    const r = CreateClassValidation.safeParse(minimal);

    expect(r.success).toBe(true);

    if (r.success) {
      expect(r.data.schedule).toEqual([]);
      expect(r.data.tagIds).toEqual([]);
    }
  });
});

describe('UpdateClassValidation', () => {
  it('requires id', () => {
    expect(UpdateClassValidation.safeParse(validClass).success).toBe(false);
    expect(UpdateClassValidation.safeParse({ id: 'c-1', ...validClass }).success).toBe(true);
  });
});

describe('DeleteClassValidation', () => {
  it('rejects empty id', () => {
    expect(DeleteClassValidation.safeParse({ id: '' }).success).toBe(false);
  });

  it('accepts a non-empty id', () => {
    expect(DeleteClassValidation.safeParse({ id: 'c-1' }).success).toBe(true);
  });
});

describe('UpsertScheduleExceptionValidation', () => {
  const valid = {
    classScheduleInstanceId: 'sched-1',
    exceptionDate: new Date('2026-05-15T00:00:00Z'),
    exceptionType: 'cancelled' as const,
  };

  it('accepts a minimal cancellation', () => {
    expect(UpsertScheduleExceptionValidation.safeParse(valid).success).toBe(true);
  });

  it('coerces ISO strings to dates', () => {
    const r = UpsertScheduleExceptionValidation.safeParse({ ...valid, exceptionDate: '2026-05-15' });

    expect(r.success).toBe(true);

    if (r.success) {
      expect(r.data.exceptionDate).toBeInstanceOf(Date);
    }
  });

  it('rejects unknown exception types', () => {
    expect(UpsertScheduleExceptionValidation.safeParse({
      ...valid,
      exceptionType: 'whatever',
    }).success).toBe(false);
  });

  it('accepts time_change with new start/end', () => {
    expect(UpsertScheduleExceptionValidation.safeParse({
      ...valid,
      exceptionType: 'time_change',
      newStartTime: '19:00',
      newEndTime: '20:00',
    }).success).toBe(true);
  });

  it('rejects malformed new time', () => {
    expect(UpsertScheduleExceptionValidation.safeParse({
      ...valid,
      exceptionType: 'time_change',
      newStartTime: '25:00',
    }).success).toBe(false);
  });
});

describe('DeleteScheduleExceptionValidation', () => {
  it('rejects empty id', () => {
    expect(DeleteScheduleExceptionValidation.safeParse({ id: '' }).success).toBe(false);
  });

  it('accepts non-empty id', () => {
    expect(DeleteScheduleExceptionValidation.safeParse({ id: 'exc-1' }).success).toBe(true);
  });
});
