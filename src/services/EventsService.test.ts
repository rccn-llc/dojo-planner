import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capturing mocks for the drizzle predicate builders so we can assert that the
// list query filters out soft-deleted (isActive = false) events.
const eqMock = vi.fn((col: unknown, value: unknown) => ({ __op: 'eq', col, value }));
const andMock = vi.fn((...conds: unknown[]) => ({ __op: 'and', conds }));
const inArrayMock = vi.fn((col: unknown, values: unknown) => ({ __op: 'inArray', col, values }));
const neMock = vi.fn((col: unknown, value: unknown) => ({ __op: 'ne', col, value }));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => andMock(...args),
  eq: (col: unknown, value: unknown) => eqMock(col, value),
  inArray: (col: unknown, values: unknown) => inArrayMock(col, values),
  ne: (col: unknown, value: unknown) => neMock(col, value),
}));

const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

// createEvent/updateEvent now wrap their writes in db.transaction; run the
// callback with a `tx` that reuses the same spies so existing assertions keep
// working.
dbMock.transaction.mockImplementation(async (cb: any) =>
  cb({
    insert: dbMock.insert,
    update: dbMock.update,
    select: dbMock.select,
    delete: dbMock.delete,
  }),
);

vi.mock('@/models/Schema', () => ({
  attendanceSchema: {},
  eventBillingSchema: { eventId: 'eb_event_id' },
  eventRegistrationSchema: {
    id: 'er_id',
    memberId: 'er_member_id',
    eventId: 'er_event_id',
    eventBillingId: 'er_billing_id',
    status: 'er_status',
    registeredAt: 'er_registered_at',
  },
  eventSchema: { id: 'event_id', organizationId: 'event_org_id', isActive: 'event_is_active' },
  eventSessionSchema: { eventId: 'es_event_id' },
  eventTagSchema: { eventId: 'et_event_id', tagId: 'et_tag_id' },
  tagSchema: { id: 'tag_id', organizationId: 'tag_org_id' },
  memberSchema: {
    id: 'm_id',
    organizationId: 'm_org_id',
    firstName: 'm_first',
    lastName: 'm_last',
    email: 'm_email',
    photoUrl: 'm_photo',
  },
  transactionSchema: { id: 'tx_id', organizationId: 'tx_org_id' },
}));

// -----------------------------------------------------------------------------
// Helpers to script the db.select()/insert()/update() chains used by the
// registration functions. getEventById → getOrganizationEvents issues, in
// order: the events select, then a Promise.all of [sessions, billing, tags,
// allTags]. queueEvent() enqueues those 5 selects so a subsequent registration
// query resolves against a known event.
// -----------------------------------------------------------------------------
type SelectResult = unknown[];

function selectResolving(rows: SelectResult) {
  return {
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  };
}

// getOrganizationEvents chain: an event with one billing tier.
function queueGetOrganizationEvents(event: Record<string, unknown>, billing: Array<Record<string, unknown>> = []) {
  const eventRow = { isActive: true, ...event };
  dbMock.select
    .mockReturnValueOnce(selectResolving([eventRow])) // events
    .mockReturnValueOnce(selectResolving([])) // sessions
    .mockReturnValueOnce(selectResolving(billing)) // billing
    .mockReturnValueOnce(selectResolving([])) // eventTags
    .mockReturnValueOnce(selectResolving([])); // allTags
}

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

const EVENT = { id: 'ev-1', name: 'Seminar', slug: 'seminar', description: null, eventType: 'seminar', location: null, note: null, maxCapacity: 50 };
const MEMBER = { id: 'mem-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', photoUrl: null };
const TIER = { id: 'tier-1', eventId: 'ev-1', name: 'Early Bird', price: 40, memberOnly: false, validUntil: null };

describe('EventsService.registerMemberForEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('inserts a registration and returns the registrant (with tier price)', async () => {
    queueGetOrganizationEvents(EVENT, [TIER]);
    dbMock.select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([MEMBER]) }) }) }) // member
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }); // existing reg (none)
    const insertValues = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValue({ values: insertValues });

    const { registerMemberForEvent } = await import('./EventsService');
    const result = await registerMemberForEvent(
      { eventId: 'ev-1', memberId: 'mem-1', eventBillingId: 'tier-1' },
      'org-1',
    );

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      memberId: 'mem-1',
      eventId: 'ev-1',
      eventBillingId: 'tier-1',
      status: 'registered',
      amountPaid: 40, // resolved from the tier
    }));
    expect(result).toMatchObject({
      memberId: 'mem-1',
      firstName: 'Jane',
      lastName: 'Doe',
      status: 'registered',
      amountPaid: 40,
      tierName: 'Early Bird',
    });
  });

  it('records amountPaid = 0 / null tier when no billing tier is chosen', async () => {
    queueGetOrganizationEvents(EVENT, [TIER]);
    dbMock.select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([MEMBER]) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) });
    const insertValues = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValue({ values: insertValues });

    const { registerMemberForEvent } = await import('./EventsService');
    const result = await registerMemberForEvent(
      { eventId: 'ev-1', memberId: 'mem-1' },
      'org-1',
    );

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      eventBillingId: null,
      amountPaid: null,
    }));
    expect(result.tierName).toBeNull();
  });

  it('back-links a supplied transaction to the new registration', async () => {
    queueGetOrganizationEvents(EVENT, [TIER]);
    dbMock.select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([MEMBER]) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) });
    dbMock.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    dbMock.update.mockReturnValue({ set: updateSet });

    const { registerMemberForEvent } = await import('./EventsService');
    await registerMemberForEvent(
      { eventId: 'ev-1', memberId: 'mem-1', eventBillingId: 'tier-1', transactionId: 'tx-99' },
      'org-1',
    );

    expect(dbMock.update).toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ eventRegistrationId: expect.any(String) }));
  });

  it('rejects a duplicate non-cancelled registration', async () => {
    queueGetOrganizationEvents(EVENT, [TIER]);
    dbMock.select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([MEMBER]) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'existing' }]) }) }) });

    const { registerMemberForEvent, MemberAlreadyRegisteredError } = await import('./EventsService');

    await expect(
      registerMemberForEvent({ eventId: 'ev-1', memberId: 'mem-1' }, 'org-1'),
    ).rejects.toBeInstanceOf(MemberAlreadyRegisteredError);
  });

  it('throws EventNotFoundError when the event is not in the org', async () => {
    // getOrganizationEvents returns no events → getEventById → null
    dbMock.select.mockReturnValueOnce(selectResolving([]));

    const { registerMemberForEvent, EventNotFoundError } = await import('./EventsService');

    await expect(
      registerMemberForEvent({ eventId: 'ev-1', memberId: 'mem-1' }, 'org-1'),
    ).rejects.toBeInstanceOf(EventNotFoundError);
  });

  it('throws MemberNotFoundError when the member is not in the org', async () => {
    queueGetOrganizationEvents(EVENT, [TIER]);
    dbMock.select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }); // member missing

    const { registerMemberForEvent, MemberNotFoundError } = await import('./EventsService');

    await expect(
      registerMemberForEvent({ eventId: 'ev-1', memberId: 'mem-1' }, 'org-1'),
    ).rejects.toBeInstanceOf(MemberNotFoundError);
  });
});

describe('EventsService.getEventRegistrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns joined registrants with the tier name resolved', async () => {
    queueGetOrganizationEvents(EVENT, [TIER]);
    dbMock.select.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve([
            {
              id: 'reg-1',
              memberId: 'mem-1',
              status: 'registered',
              amountPaid: 40,
              registeredAt: new Date('2026-01-01'),
              eventBillingId: 'tier-1',
              firstName: 'Jane',
              lastName: 'Doe',
              email: 'jane@example.com',
              photoUrl: null,
            },
          ]),
        }),
      }),
    });

    const { getEventRegistrations } = await import('./EventsService');
    const result = await getEventRegistrations('ev-1', 'org-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'reg-1',
      memberId: 'mem-1',
      firstName: 'Jane',
      tierName: 'Early Bird',
      amountPaid: 40,
    });
  });

  it('returns [] when the event is not in the org', async () => {
    dbMock.select.mockReturnValueOnce(selectResolving([]));

    const { getEventRegistrations } = await import('./EventsService');
    const result = await getEventRegistrations('ev-1', 'org-1');

    expect(result).toEqual([]);
  });
});

describe('EventsService.cancelEventRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('soft-cancels the registration (status=cancelled, cancelledAt set)', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ eventId: 'ev-1' }]) }) }),
    });
    queueGetOrganizationEvents(EVENT, [TIER]);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    dbMock.update.mockReturnValue({ set: updateSet });

    const { cancelEventRegistration } = await import('./EventsService');
    const ok = await cancelEventRegistration('reg-1', 'org-1');

    expect(ok).toBe(true);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'cancelled',
      cancelledAt: expect.any(Date),
    }));
  });

  it('returns false when the registration does not exist', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    const { cancelEventRegistration } = await import('./EventsService');
    const ok = await cancelEventRegistration('missing', 'org-1');

    expect(ok).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('returns false when the registration belongs to another org', async () => {
    dbMock.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ eventId: 'ev-1' }]) }) }),
    });
    // getEventById resolves no events for this org → cross-org guard
    dbMock.select.mockReturnValueOnce(selectResolving([]));

    const { cancelEventRegistration } = await import('./EventsService');
    const ok = await cancelEventRegistration('reg-1', 'other-org');

    expect(ok).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});
