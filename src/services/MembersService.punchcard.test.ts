import { beforeEach, describe, expect, it, vi } from 'vitest';

// Each `db.select()` call returns the next queued result, so a test can script
// the two queries `getPunchcardUsage` makes: the plan lookup, then the count.
const selectResults: unknown[][] = [];
const whereSpy = vi.fn();

vi.mock('@/libs/DB', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((...args: unknown[]) => {
          whereSpy(...args);
          const rows = selectResults.shift() ?? [];
          // The plan lookup chains `.limit(1)`; the count does not. Return an
          // object that is both awaitable and `.limit()`-able.
          return Object.assign(Promise.resolve(rows), {
            limit: () => Promise.resolve(rows),
          });
        }),
      })),
    })),
  },
}));

vi.mock('@/libs/Logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ op: 'and', a }),
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
  gte: (col: unknown, val: unknown) => ({ op: 'gte', col, val }),
  desc: (c: unknown) => c,
  inArray: (c: unknown, v: unknown) => ({ op: 'inArray', c, v }),
  or: (...a: unknown[]) => ({ op: 'or', a }),
  count: () => ({ op: 'count' }),
}));

vi.mock('@/models/Schema', () => ({
  membershipPlanSchema: { id: 'plan.id', organizationId: 'plan.organization_id', classAllowance: 'plan.class_allowance' },
  attendanceSchema: { memberId: 'att.member_id', organizationId: 'att.organization_id', attendanceDate: 'att.attendance_date' },
  memberSchema: {},
  addressSchema: {},
  memberMembershipSchema: {},
  noteSchema: {},
  paymentMethodSchema: {},
  transactionSchema: {},
  signedWaiverSchema: {},
  familyMemberSchema: {},
  attendanceSchemaAlias: {},
  classEnrollmentSchema: {},
  couponUsageSchema: {},
  eventRegistrationSchema: {},
}));

const START = new Date('2026-01-01T00:00:00Z');

describe('getPunchcardUsage', () => {
  beforeEach(() => {
    selectResults.length = 0;
    whereSpy.mockClear();
    vi.clearAllMocks();
  });

  it('returns null when the plan has no allowance (not a punchcard)', async () => {
    const { getPunchcardUsage } = await import('./MembersService');
    selectResults.push([{ classAllowance: null }]);

    const result = await getPunchcardUsage('m1', 'org1', 'plan1', START);

    expect(result).toBeNull();
  });

  it('returns null when the plan is not found in this organization', async () => {
    const { getPunchcardUsage } = await import('./MembersService');
    selectResults.push([]); // cross-tenant probe or missing row

    const result = await getPunchcardUsage('m1', 'org-other', 'plan1', START);

    expect(result).toBeNull();
  });

  it('derives used and remaining from the attendance count', async () => {
    const { getPunchcardUsage } = await import('./MembersService');
    selectResults.push([{ classAllowance: 10 }]);
    selectResults.push([{ value: 4 }]);

    const result = await getPunchcardUsage('m1', 'org1', 'plan1', START);

    expect(result).toEqual({ totalClasses: 10, classesUsed: 4, classesRemaining: 6 });
  });

  it('reports a full card when there is no attendance yet', async () => {
    const { getPunchcardUsage } = await import('./MembersService');
    selectResults.push([{ classAllowance: 10 }]);
    selectResults.push([{ value: 0 }]);

    const result = await getPunchcardUsage('m1', 'org1', 'plan1', START);

    expect(result).toEqual({ totalClasses: 10, classesUsed: 0, classesRemaining: 10 });
  });

  it('clamps remaining at zero when attendance exceeds the allowance', async () => {
    const { getPunchcardUsage } = await import('./MembersService');
    selectResults.push([{ classAllowance: 10 }]);
    selectResults.push([{ value: 13 }]);

    const result = await getPunchcardUsage('m1', 'org1', 'plan1', START);

    expect(result).toEqual({ totalClasses: 10, classesUsed: 13, classesRemaining: 0 });
  });

  it('treats a zero allowance as a real punchcard with nothing left', async () => {
    const { getPunchcardUsage } = await import('./MembersService');
    selectResults.push([{ classAllowance: 0 }]);
    selectResults.push([{ value: 0 }]);

    const result = await getPunchcardUsage('m1', 'org1', 'plan1', START);

    // 0 is distinct from null: an exhausted card, not "not a punchcard".
    expect(result).toEqual({ totalClasses: 0, classesUsed: 0, classesRemaining: 0 });
  });

  it('defaults a missing count row to zero used', async () => {
    const { getPunchcardUsage } = await import('./MembersService');
    selectResults.push([{ classAllowance: 5 }]);
    selectResults.push([]);

    const result = await getPunchcardUsage('m1', 'org1', 'plan1', START);

    expect(result).toEqual({ totalClasses: 5, classesUsed: 0, classesRemaining: 5 });
  });

  it('scopes the plan lookup by organization and counts from the start date', async () => {
    const { getPunchcardUsage } = await import('./MembersService');
    selectResults.push([{ classAllowance: 10 }]);
    selectResults.push([{ value: 2 }]);

    await getPunchcardUsage('m1', 'org1', 'plan1', START);

    const planWhere = JSON.stringify(whereSpy.mock.calls[0]);

    expect(planWhere).toContain('org1');
    expect(planWhere).toContain('plan1');

    const countWhere = JSON.stringify(whereSpy.mock.calls[1]);

    expect(countWhere).toContain('gte');
    expect(countWhere).toContain('att.attendance_date');
    expect(countWhere).toContain('m1');
  });
});
