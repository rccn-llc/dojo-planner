import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DashboardService. The N+1 refactor moved the shared "members as of"
// helpers here; the chart builders import them, so we mock them too. Their
// default implementations delegate to the same `mockDbResult`/`mockGroupedRows`
// data the DB mock uses, so existing tests keep working with minimal changes.
let mockDbResult: unknown[] = [];
// Rows returned by grouped date_trunc queries (`{ bucket, total }`). Defaults to
// `mockDbResult` when not explicitly set.
let mockGroupedRows: unknown[] | null = null;
// Rows returned by the "members as of" fetch (`{ createdAt, status, updatedAt }`).
let mockMemberAsOfRows: Array<{ createdAt: Date; status: string; updatedAt: Date }> = [];

vi.mock('./DashboardService', () => ({
  getFinancialStats: vi.fn(),
  fetchMemberAsOfRows: vi.fn(async () => mockMemberAsOfRows),
  countMembersAsOf: vi.fn((rows: Array<{ createdAt: Date; status: string; updatedAt: Date }>, at: Date) => {
    const atMs = at.getTime();
    let n = 0;
    for (const row of rows) {
      if (row.createdAt.getTime() <= atMs && (row.status !== 'cancelled' || row.updatedAt.getTime() > atMs)) {
        n++;
      }
    }
    return n;
  }),
}));

// A promise that also exposes `.groupBy()` (resolving grouped rows) and
// `.orderBy()`, so both a bare `await db…where(...)` and a
// `db…where(...).groupBy(...)` (awaited) resolve correctly.
const createAwaitableChainWithMethods = () => {
  const promise = Promise.resolve(mockDbResult);
  return Object.assign(promise, {
    groupBy: vi.fn(() => {
      const inner = Promise.resolve(mockGroupedRows ?? mockDbResult);
      return Object.assign(inner, {
        orderBy: vi.fn().mockResolvedValue(mockGroupedRows ?? mockDbResult),
      });
    }),
    orderBy: vi.fn().mockResolvedValue(mockGroupedRows ?? mockDbResult),
  });
};

const createSelectChain = () => ({
  from: vi.fn().mockReturnValue({
    where: vi.fn(() => createAwaitableChainWithMethods()),
    innerJoin: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(mockDbResult),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockDbResult),
      }),
    }),
    groupBy: vi.fn(() => Promise.resolve(mockGroupedRows ?? mockDbResult)),
  }),
});

vi.mock('@/libs/DB', () => ({
  db: {
    select: vi.fn(() => createSelectChain()),
  },
}));

// Build `{ bucket, total }` grouped rows for the last N day-buckets (matching
// the day-start keys the service maps against), each with the same total.
function dailyGroupedRows(days: number, total: number): Array<{ bucket: Date; total: number }> {
  const today = new Date();
  const rows: Array<{ bucket: Date; total: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    rows.push({ bucket: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0), total });
  }
  return rows;
}

vi.mock('@/models/Schema', () => ({
  memberSchema: {
    id: 'id',
    organizationId: 'organizationId',
    status: 'status',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  transactionSchema: {
    organizationId: 'organizationId',
    status: 'status',
    amount: 'amount',
    createdAt: 'createdAt',
    memberId: 'memberId',
    paymentMethod: 'paymentMethod',
  },
  memberMembershipSchema: {
    memberId: 'memberId',
    membershipPlanId: 'membershipPlanId',
    status: 'status',
    billingType: 'billingType',
  },
  membershipPlanSchema: {
    id: 'id',
    organizationId: 'organizationId',
    price: 'price',
  },
}));

describe('ReportsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockDbResult = [];
    mockGroupedRows = null;
    mockMemberAsOfRows = [];
  });

  // ===========================================================================
  // getReportCurrentValues
  // ===========================================================================

  describe('getReportCurrentValues', () => {
    it('should map financial stats to report current values', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      const mockFinancialStats = {
        autopaysSuspended: 5,
        expiringCreditCards60Days: 3,
        amountDueNext30Days: 1500.5,
        pastDueTotal: 250.75,
        paymentsLast30Days: 5000.25,
        paymentsPending: 100.0,
        failedPaymentsLast30Days: 75.5,
        incomePerStudent30Days: 125.0,
      };

      vi.mocked(getFinancialStats).mockResolvedValue(mockFinancialStats);

      const { getReportCurrentValues } = await import('./ReportsService');
      const result = await getReportCurrentValues('test-org-123');

      expect(getFinancialStats).toHaveBeenCalledWith('test-org-123');
      expect(result).toEqual({
        autopaysSuspended: 5,
        expiringCreditCards: 3,
        amountDue: 1500.5,
        pastDue: 250.75,
        paymentsLast30Days: 5000.25,
        paymentsPending: 100.0,
        failedPayments: 75.5,
        incomePerStudent: 125.0,
      });
    });

    it('should handle zero values correctly', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      const mockFinancialStats = {
        autopaysSuspended: 0,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        pastDueTotal: 0,
        paymentsLast30Days: 0,
        paymentsPending: 0,
        failedPaymentsLast30Days: 0,
        incomePerStudent30Days: 0,
      };

      vi.mocked(getFinancialStats).mockResolvedValue(mockFinancialStats);

      const { getReportCurrentValues } = await import('./ReportsService');
      const result = await getReportCurrentValues('test-org-123');

      expect(result).toEqual({
        autopaysSuspended: 0,
        expiringCreditCards: 0,
        amountDue: 0,
        pastDue: 0,
        paymentsLast30Days: 0,
        paymentsPending: 0,
        failedPayments: 0,
        incomePerStudent: 0,
      });
    });
  });

  // ===========================================================================
  // getReportChartData
  // ===========================================================================

  describe('getReportChartData', () => {
    it('should return chart data for payments-last-30-days report type', async () => {
      mockDbResult = [{ total: 1000 }];
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'payments-last-30-days');

      expect(result).toHaveProperty('monthly');
      expect(result).toHaveProperty('yearly');
      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);
      expect(result.monthly[0]).toHaveProperty('month');
      expect(result.monthly[0]).toHaveProperty('value');
      expect(result.monthly[0]).toHaveProperty('previousYear');
    });

    it('should return chart data for accounts-autopay-suspended report type', async () => {
      // As-of point-in-time count: rows carry createdAt (fetch-once + JS bucketing).
      mockDbResult = [{ createdAt: new Date(new Date().getFullYear() - 5, 0, 1) }];
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'accounts-autopay-suspended');

      expect(result).toHaveProperty('monthly');
      expect(result).toHaveProperty('yearly');
      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);
    });

    it('should return chart data for past-due report type', async () => {
      mockDbResult = [{ total: 500 }];
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'past-due');

      expect(result).toHaveProperty('monthly');
      expect(result).toHaveProperty('yearly');
      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);
    });

    it('should return chart data for income-per-student report type', async () => {
      mockDbResult = [{ total: 10000, count: 100 }];
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'income-per-student');

      expect(result).toHaveProperty('monthly');
      expect(result).toHaveProperty('yearly');
      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);
    });

    it('should return chart data for expiring-credit-cards report type', async () => {
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'expiring-credit-cards');

      expect(result).toHaveProperty('monthly');
      expect(result).toHaveProperty('yearly');
      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);
      // Should return empty data
      expect(result.monthly[0]?.value).toBe(0);
      expect(result.monthly[0]?.previousYear).toBe(0);
    });

    it('should return chart data for amount-due report type', async () => {
      mockDbResult = [{ total: 2000 }];
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'amount-due');

      expect(result).toHaveProperty('monthly');
      expect(result).toHaveProperty('yearly');
      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);
    });

    it('should return chart data for payments-pending report type', async () => {
      mockDbResult = [{ total: 150 }];
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'payments-pending');

      expect(result).toHaveProperty('monthly');
      expect(result).toHaveProperty('yearly');
      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);
    });

    it('should return chart data for failed-payments report type', async () => {
      mockDbResult = [{ total: 75 }];
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'failed-payments');

      expect(result).toHaveProperty('monthly');
      expect(result).toHaveProperty('yearly');
      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);
    });

    it('should return empty chart data for unknown report type', async () => {
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'unknown-report-type');

      expect(result).toHaveProperty('monthly');
      expect(result).toHaveProperty('yearly');
      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);
      expect(result.monthly[0]?.value).toBe(0);
      expect(result.yearly[0]?.value).toBe(0);
    });
  });

  // ===========================================================================
  // getReportChartData — daily "last N days" range (#274)
  // ===========================================================================

  describe('getReportChartData daily range', () => {
    it('does not add a daily series when no range is passed', async () => {
      mockDbResult = [{ total: 1000 }];
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'payments-last-30-days');

      expect(result.daily).toBeUndefined();
    });

    it.each([
      ['last-7', 7],
      ['last-30', 30],
      ['last-90', 90],
    ] as const)('adds a %s daily series with %i buckets, preserving monthly/yearly', async (range, buckets) => {
      mockDbResult = [{ total: 1000 }];
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'payments-last-30-days', range);

      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);
      expect(result.daily).toHaveLength(buckets);
      expect(result.daily?.[0]).toHaveProperty('day');
      expect(result.daily?.[0]).toHaveProperty('value');

      // ends today (last bucket is the most recent day)
      const lastLabel = result.daily?.[buckets - 1]?.day;
      const today = new Date();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      expect(lastLabel).toBe(`${monthNames[today.getMonth()]} ${today.getDate()}`);
    });

    it('sums paid transactions for payments-last-30-days daily buckets', async () => {
      mockGroupedRows = dailyGroupedRows(7, 250);
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'payments-last-30-days', 'last-7');

      expect(result.daily).toHaveLength(7);
      expect(result.daily?.every(d => d.value === 250)).toBe(true);
    });

    it('takes the absolute value of summed amounts (refunds/adjustments)', async () => {
      mockGroupedRows = dailyGroupedRows(7, -500);
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'past-due', 'last-7');

      expect(result.daily?.every(d => d.value === 500)).toBe(true);
    });

    it('counts point-in-time members for accounts-autopay-suspended daily buckets', async () => {
      // 3 past_due members all created before the earliest bucket → every bucket
      // counts all 3 (fetch-once + JS bucketing).
      const longAgo = new Date(new Date().getFullYear() - 5, 0, 1);
      mockDbResult = [{ createdAt: longAgo }, { createdAt: longAgo }, { createdAt: longAgo }];
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'accounts-autopay-suspended', 'last-7');

      expect(result.daily).toHaveLength(7);
      expect(result.daily?.every(d => d.value === 3)).toBe(true);
    });

    it('computes per-student income for income-per-student daily buckets', async () => {
      // 1000 income per day; 4 active members existing before all buckets.
      mockGroupedRows = dailyGroupedRows(7, 1000);
      const longAgo = new Date(new Date().getFullYear() - 5, 0, 1);
      mockMemberAsOfRows = Array.from({ length: 4 }, () => ({ createdAt: longAgo, status: 'active', updatedAt: longAgo }));
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'income-per-student', 'last-7');

      expect(result.daily).toHaveLength(7);
      // 1000 / 4 = 250 per student
      expect(result.daily?.every(d => d.value === 250)).toBe(true);
    });

    it('returns zero-valued daily buckets for expiring-credit-cards', async () => {
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'expiring-credit-cards', 'last-30');

      expect(result.daily).toHaveLength(30);
      expect(result.daily?.every(d => d.value === 0)).toBe(true);
    });

    it('returns zero-valued daily buckets for unknown report types', async () => {
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'unknown-report-type', 'last-7');

      expect(result.daily).toHaveLength(7);
      expect(result.daily?.every(d => d.value === 0)).toBe(true);
    });
  });

  // ===========================================================================
  // countPastDueAsOf — exported pure counter (N+1 consolidation)
  // ===========================================================================

  describe('countPastDueAsOf (pure)', () => {
    it('counts past_due members created at or before the point', async () => {
      const { countPastDueAsOf } = await import('./ReportsService');
      const at = new Date('2026-06-15T00:00:00Z');
      const createdAts = [
        new Date('2026-01-01T00:00:00Z'), // before → counted
        new Date('2026-06-15T00:00:00Z'), // exactly at → counted (<=)
        new Date('2026-07-01T00:00:00Z'), // after → excluded
      ];

      expect(countPastDueAsOf(createdAts, at)).toBe(2);
    });

    it('is cumulative — a later point counts at least as many rows', async () => {
      const { countPastDueAsOf } = await import('./ReportsService');
      const createdAts = [
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-03-01T00:00:00Z'),
        new Date('2026-05-01T00:00:00Z'),
      ];

      expect(countPastDueAsOf(createdAts, new Date('2026-02-01T00:00:00Z'))).toBe(1);
      expect(countPastDueAsOf(createdAts, new Date('2026-04-01T00:00:00Z'))).toBe(2);
      expect(countPastDueAsOf(createdAts, new Date('2026-06-01T00:00:00Z'))).toBe(3);
    });

    it('returns 0 for an empty roster', async () => {
      const { countPastDueAsOf } = await import('./ReportsService');

      expect(countPastDueAsOf([], new Date('2026-06-15T00:00:00Z'))).toBe(0);
    });
  });

  // ===========================================================================
  // date_trunc grouped mapping — a missing bucket maps to 0
  // ===========================================================================

  describe('grouped monthly mapping', () => {
    it('maps a month with no grouped row to 0 (missing bucket → 0)', async () => {
      const currentYear = new Date().getFullYear();
      // Only February of the current year has a grouped sum; every other month
      // (incl. January) is a missing bucket and must map to 0. All three series
      // (current months, prev-year months, yearly) share this mocked result.
      mockGroupedRows = [{ bucket: new Date(currentYear, 1, 1), total: 900 }];
      const { getReportChartData } = await import('./ReportsService');

      const result = await getReportChartData('test-org-123', 'payments-last-30-days');

      expect(result.monthly[0]?.month).toBe('Jan');
      expect(result.monthly[0]?.value).toBe(0); // missing bucket → 0
      expect(result.monthly[1]?.month).toBe('Feb');
      expect(result.monthly[1]?.value).toBe(900);
      expect(result.monthly[2]?.value).toBe(0); // missing bucket → 0
    });
  });

  // ===========================================================================
  // getReportInsights
  // ===========================================================================

  describe('getReportInsights', () => {
    it('should return insights for accounts-autopay-suspended report type', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        autopaysSuspended: 10,
        pastDueTotal: 1250.5,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        paymentsLast30Days: 0,
        paymentsPending: 0,
        failedPaymentsLast30Days: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 100 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'accounts-autopay-suspended');

      expect(insights).toHaveLength(4);
      expect(insights[0]).toContain('10 accounts');
      expect(insights[1]).toContain('10.0%');
      expect(insights[2]).toContain('$1,250.50');
      expect(insights[3]).toContain('active students');
    });

    it('should return insights for payments-last-30-days report type', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        paymentsLast30Days: 5000.25,
        autopaysSuspended: 0,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        pastDueTotal: 0,
        paymentsPending: 0,
        failedPaymentsLast30Days: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 50 }, { method: 'card', count: 40 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'payments-last-30-days');

      expect(insights).toHaveLength(4);
      expect(insights[0]).toContain('$5,000.25');
      expect(insights[1]).toContain('50 successful transactions');
      expect(insights[2]).toContain('Average transaction value');
      expect(insights[3]).toContain('card payments');
    });

    it('should return insights for past-due report type', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        pastDueTotal: 750.0,
        failedPaymentsLast30Days: 200.0,
        autopaysSuspended: 0,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        paymentsLast30Days: 0,
        paymentsPending: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 5 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'past-due');

      expect(insights).toHaveLength(4);
      expect(insights[0]).toContain('$750.00');
      expect(insights[0]).toContain('5 members');
      expect(insights[1]).toContain('Average past due per member');
      expect(insights[2]).toContain('$200.00');
      expect(insights[3]).toContain('payment plans');
    });

    it('should return insights for income-per-student report type', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        incomePerStudent30Days: 150.0,
        paymentsLast30Days: 6000.0,
        autopaysSuspended: 0,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        pastDueTotal: 0,
        paymentsPending: 0,
        failedPaymentsLast30Days: 0,
      });

      mockDbResult = [{ count: 40 }, { total: 5500 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'income-per-student');

      expect(insights).toHaveLength(4);
      expect(insights[0]).toContain('$150.00');
      expect(insights[1]).toContain('40 active students');
      expect(insights[2]).toContain('change from previous period');
      expect(insights[3]).toContain('$6,000.00');
    });

    it('should return insights for expiring-credit-cards report type', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        expiringCreditCards60Days: 8,
        autopaysSuspended: 0,
        amountDueNext30Days: 0,
        pastDueTotal: 0,
        paymentsLast30Days: 0,
        paymentsPending: 0,
        failedPaymentsLast30Days: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 50 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'expiring-credit-cards');

      expect(insights).toHaveLength(4);
      expect(insights[0]).toContain('8 cards');
      expect(insights[1]).toContain('payment processor integration');
      expect(insights[2]).toContain('50 active students');
      expect(insights[3]).toContain('Proactive outreach');
    });

    it('should return insights for amount-due report type', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        amountDueNext30Days: 3000.0,
        paymentsLast30Days: 2700.0,
        pastDueTotal: 450.0,
        autopaysSuspended: 0,
        expiringCreditCards60Days: 0,
        paymentsPending: 0,
        failedPaymentsLast30Days: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 30 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'amount-due');

      expect(insights).toHaveLength(4);
      expect(insights[0]).toContain('$3,000.00');
      expect(insights[1]).toContain('30 active memberships');
      expect(insights[2]).toContain('collection rate: 90.0%');
      expect(insights[3]).toContain('$450.00');
    });

    it('should return insights for payments-pending report type', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        paymentsPending: 200.0,
        paymentsLast30Days: 5000.0,
        autopaysSuspended: 0,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        pastDueTotal: 0,
        failedPaymentsLast30Days: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 30 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'payments-pending');

      expect(insights).toHaveLength(4);
      expect(insights[0]).toContain('$200.00');
      expect(insights[1]).toContain('1-3 business days');
      expect(insights[2]).toContain('ACH transfers');
      expect(insights[3]).toContain('$5,000.00');
    });

    it('should return insights for failed-payments report type', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        failedPaymentsLast30Days: 300.0,
        paymentsLast30Days: 5000.0,
        autopaysSuspended: 3,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        pastDueTotal: 0,
        paymentsPending: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 15 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'failed-payments');

      expect(insights).toHaveLength(4);
      expect(insights[0]).toContain('$300.00');
      expect(insights[1]).toContain('15 failed transactions');
      expect(insights[2]).toContain('Failure rate: 5.7%');
      expect(insights[3]).toContain('3 members with suspended autopay');
    });

    it('should return empty array for unknown report type', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        autopaysSuspended: 0,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        pastDueTotal: 0,
        paymentsLast30Days: 0,
        paymentsPending: 0,
        failedPaymentsLast30Days: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 0 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'unknown-report-type');

      expect(insights).toEqual([]);
    });

    it('should handle singular vs plural forms correctly', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        autopaysSuspended: 1,
        pastDueTotal: 100.0,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        paymentsLast30Days: 0,
        paymentsPending: 0,
        failedPaymentsLast30Days: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 1 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'accounts-autopay-suspended');

      expect(insights[0]).toContain('1 account');
      expect(insights[0]).not.toContain('accounts');
    });

    it('should handle zero past due members correctly', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        pastDueTotal: 0,
        failedPaymentsLast30Days: 0,
        autopaysSuspended: 0,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        paymentsLast30Days: 0,
        paymentsPending: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 0 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'past-due');

      expect(insights).toHaveLength(4);
      expect(insights[0]).toContain('0 members');
      expect(insights[3]).toContain('No members currently past due');
    });

    it('should handle zero pending payments correctly', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        paymentsPending: 0,
        paymentsLast30Days: 5000.0,
        autopaysSuspended: 0,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        pastDueTotal: 0,
        failedPaymentsLast30Days: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 0 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'payments-pending');

      expect(insights).toHaveLength(4);
      expect(insights[1]).toContain('No payments currently awaiting processing');
    });

    it('should format currency values with correct precision', async () => {
      const { getFinancialStats } = await import('./DashboardService');
      vi.mocked(getFinancialStats).mockResolvedValue({
        paymentsLast30Days: 1234.567, // Should round to 1,234.57
        autopaysSuspended: 0,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        pastDueTotal: 0,
        paymentsPending: 0,
        failedPaymentsLast30Days: 0,
        incomePerStudent30Days: 0,
      });

      mockDbResult = [{ count: 10 }, { method: 'card', count: 8 }];
      const { getReportInsights } = await import('./ReportsService');

      const insights = await getReportInsights('test-org-123', 'payments-last-30-days');

      expect(insights[0]).toContain('$1,234.57');
    });
  });
});
