import { describe, expect, it } from 'vitest';
import {
  CreateEventValidation,
  DeleteEventValidation,
  UpdateEventValidation,
} from './EventsValidation';

const validEvent = {
  name: 'Black Belt Seminar',
  description: 'A weekend seminar.',
  eventType: 'seminar' as const,
  programId: 'prog-1',
  imageUrl: 'https://example.com/banner.jpg',
  maxCapacity: 50,
  registrationDeadline: new Date('2026-06-01T00:00:00Z'),
  isPublic: true,
  isActive: true,
  sessions: [
    {
      sessionDate: new Date('2026-06-15T00:00:00Z'),
      startTime: '10:00',
      endTime: '14:00',
      primaryInstructorClerkId: 'user_1',
      room: 'Main Mat',
      maxCapacity: 50,
    },
  ],
  billing: [
    { name: 'Early Bird', price: 99.99, memberOnly: false, sortOrder: 0 },
  ],
  tagIds: ['tag-1'],
};

describe('CreateEventValidation', () => {
  it('accepts a valid payload', () => {
    expect(CreateEventValidation.safeParse(validEvent).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateEventValidation.safeParse({ ...validEvent, name: '' }).success).toBe(false);
  });

  it('rejects unknown eventType', () => {
    expect(CreateEventValidation.safeParse({ ...validEvent, eventType: 'party' }).success).toBe(false);
  });

  it('rejects malformed imageUrl', () => {
    expect(CreateEventValidation.safeParse({ ...validEvent, imageUrl: 'not-a-url' }).success).toBe(false);
  });

  it('allows null imageUrl', () => {
    expect(CreateEventValidation.safeParse({ ...validEvent, imageUrl: null }).success).toBe(true);
  });

  it('rejects negative price', () => {
    expect(CreateEventValidation.safeParse({
      ...validEvent,
      billing: [{ name: 'Bad', price: -10 }],
    }).success).toBe(false);
  });

  it('rejects malformed session times', () => {
    expect(CreateEventValidation.safeParse({
      ...validEvent,
      sessions: [{
        sessionDate: new Date(),
        startTime: '99:99',
        endTime: '14:00',
      }],
    }).success).toBe(false);
  });

  it('coerces ISO strings to dates', () => {
    const r = CreateEventValidation.safeParse({
      ...validEvent,
      registrationDeadline: '2026-06-01',
    });

    expect(r.success).toBe(true);

    if (r.success) {
      expect(r.data.registrationDeadline).toBeInstanceOf(Date);
    }
  });

  it('defaults sessions, billing, and tagIds when omitted', () => {
    const { sessions: _s, billing: _b, tagIds: _t, ...minimal } = validEvent;
    const r = CreateEventValidation.safeParse(minimal);

    expect(r.success).toBe(true);

    if (r.success) {
      expect(r.data.sessions).toEqual([]);
      expect(r.data.billing).toEqual([]);
      expect(r.data.tagIds).toEqual([]);
    }
  });
});

describe('UpdateEventValidation', () => {
  it('requires id', () => {
    expect(UpdateEventValidation.safeParse(validEvent).success).toBe(false);
    expect(UpdateEventValidation.safeParse({ id: 'e-1', ...validEvent }).success).toBe(true);
  });
});

describe('DeleteEventValidation', () => {
  it('rejects empty id', () => {
    expect(DeleteEventValidation.safeParse({ id: '' }).success).toBe(false);
  });

  it('accepts non-empty id', () => {
    expect(DeleteEventValidation.safeParse({ id: 'e-1' }).success).toBe(true);
  });
});
