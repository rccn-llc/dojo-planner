import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capturing mocks for the drizzle predicate builders so we can assert that the
// list query filters out soft-deleted (isActive = false) events.
const eqMock = vi.fn((col: unknown, value: unknown) => ({ __op: 'eq', col, value }));
const andMock = vi.fn((...conds: unknown[]) => ({ __op: 'and', conds }));
const inArrayMock = vi.fn((col: unknown, values: unknown) => ({ __op: 'inArray', col, values }));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => andMock(...args),
  eq: (col: unknown, value: unknown) => eqMock(col, value),
  inArray: (col: unknown, values: unknown) => inArrayMock(col, values),
}));

const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

vi.mock('@/models/Schema', () => ({
  attendanceSchema: {},
  eventBillingSchema: { eventId: 'eb_event_id' },
  eventSchema: { id: 'event_id', organizationId: 'event_org_id', isActive: 'event_is_active' },
  eventSessionSchema: { eventId: 'es_event_id' },
  eventTagSchema: { eventId: 'et_event_id', tagId: 'et_tag_id' },
  tagSchema: { id: 'tag_id', organizationId: 'tag_org_id' },
}));

describe('EventsService.getOrganizationEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('filters the list query to active events (excludes soft-deleted)', async () => {
    // First select() resolves the events for the org; capture its where predicate.
    let capturedWhere: any;
    dbMock.select.mockReturnValueOnce({
      from: () => ({
        where: (predicate: unknown) => {
          capturedWhere = predicate;
          return Promise.resolve([]); // no events → short-circuits related fetches
        },
      }),
    });

    const { getOrganizationEvents } = await import('./EventsService');
    const result = await getOrganizationEvents('org-123');

    expect(result).toEqual([]);
    // The where clause must AND together the org filter and an isActive = true filter.
    expect(andMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith('event_org_id', 'org-123');
    expect(eqMock).toHaveBeenCalledWith('event_is_active', true);
    expect(capturedWhere).toEqual({
      __op: 'and',
      conds: [
        { __op: 'eq', col: 'event_org_id', value: 'org-123' },
        { __op: 'eq', col: 'event_is_active', value: true },
      ],
    });
  });
});
