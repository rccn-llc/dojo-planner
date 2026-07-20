import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the DB and Schema modules
vi.mock('@/libs/DB');
vi.mock('@/models/Schema', () => ({
  memberSchema: {
    id: 'id',
    organizationId: 'organizationId',
    status: 'status',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  memberMembershipSchema: {
    id: 'id',
    memberId: 'memberId',
    membershipPlanId: 'membershipPlanId',
    status: 'status',
    billingType: 'billingType',
  },
  membershipPlanSchema: {
    id: 'id',
    price: 'price',
  },
  transactionSchema: {
    id: 'id',
    organizationId: 'organizationId',
    status: 'status',
    amount: 'amount',
    createdAt: 'createdAt',
  },
}));

describe('DashboardService', () => {
  let mockQueryBuilder: {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Create a chainable mock query builder
    mockQueryBuilder = {
      select: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      groupBy: vi.fn(),
      orderBy: vi.fn(),
    };

    // Make all methods return the builder for chaining
    mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.from.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.innerJoin.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.groupBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy.mockReturnValue(mockQueryBuilder);
  });

  describe('getMembershipStats', () => {
    it('should return correct membership stats with all fields', { timeout: 15000 }, async () => {
      // All 7 queries run in parallel via Promise.all, so mock returns a consistent value
      mockQueryBuilder.where.mockResolvedValue([{ count: 50 }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getMembershipStats } = await import('./DashboardService');
      const result = await getMembershipStats('org_test123');

      expect(result).toEqual({
        totalPeople: 50,
        totalStudents: 50,
        totalFamilies: 50,
        newStudentsLast30Days: 50,
        autopayOn: 50,
        autopayOff: 50,
        membershipsOnHold: 50,
        cancelledLast30Days: 50,
        membershipNetChange30Days: 0, // 50 - 50
      });

      // Verify select was called 7 times (one for each stat)
      expect(db.select).toHaveBeenCalledTimes(7);
    });

    it('should handle zero results (empty database)', async () => {
      mockQueryBuilder.where.mockResolvedValue([{ count: 0 }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getMembershipStats } = await import('./DashboardService');
      const result = await getMembershipStats('org_empty');

      expect(result).toEqual({
        totalPeople: 0,
        totalStudents: 0,
        totalFamilies: 0,
        newStudentsLast30Days: 0,
        autopayOn: 0,
        autopayOff: 0,
        membershipsOnHold: 0,
        cancelledLast30Days: 0,
        membershipNetChange30Days: 0,
      });
    });

    it('should handle null count results gracefully', async () => {
      mockQueryBuilder.where.mockResolvedValue([{ count: null }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getMembershipStats } = await import('./DashboardService');
      const result = await getMembershipStats('org_test123');

      expect(result.totalPeople).toBe(0);
      expect(result.totalStudents).toBe(0);
      expect(result.autopayOn).toBe(0);
      expect(result.autopayOff).toBe(0);
      expect(result.membershipsOnHold).toBe(0);
      expect(result.membershipNetChange30Days).toBe(0);
    });

    it('should calculate membershipNetChange30Days correctly', async () => {
      // Net change = newStudentsLast30Days - cancelledLast30Days
      // With uniform mocking, both are equal so net change is 0
      mockQueryBuilder.where.mockResolvedValue([{ count: 20 }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getMembershipStats } = await import('./DashboardService');
      const result = await getMembershipStats('org_test123');

      expect(result.newStudentsLast30Days).toBe(20);
      expect(result.cancelledLast30Days).toBe(20);
      expect(result.membershipNetChange30Days).toBe(0); // 20 - 20
    });
  });

  describe('getFinancialStats', () => {
    it('should return correct financial stats', async () => {
      // All 7 queries run in parallel; mock returns consistent value
      // The where mock handles both count and total/price queries
      mockQueryBuilder.where.mockResolvedValue([{ count: 5, total: 500, price: 100 }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getFinancialStats } = await import('./DashboardService');
      const result = await getFinancialStats('org_test123');

      expect(result.autopaysSuspended).toBe(5);
      expect(result.expiringCreditCards60Days).toBe(0);
      expect(result.amountDueNext30Days).toBe(100); // Single row with price: 100
      expect(result.pastDueTotal).toBe(500);
      expect(result.paymentsLast30Days).toBe(500);
      expect(result.paymentsPending).toBe(500);
      expect(result.failedPaymentsLast30Days).toBe(500);
      expect(result.incomePerStudent30Days).toBe(100); // 500 / 5

      expect(db.select).toHaveBeenCalledTimes(7);
    });

    it('should handle zero financial data', async () => {
      mockQueryBuilder.where.mockResolvedValue([{ count: 0, total: null, price: null }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getFinancialStats } = await import('./DashboardService');
      const result = await getFinancialStats('org_empty');

      expect(result).toEqual({
        autopaysSuspended: 0,
        expiringCreditCards60Days: 0,
        amountDueNext30Days: 0,
        pastDueTotal: 0,
        paymentsLast30Days: 0,
        paymentsPending: 0,
        failedPaymentsLast30Days: 0,
        incomePerStudent30Days: 0,
      });
    });

    it('should avoid division by zero when no students', async () => {
      mockQueryBuilder.where.mockResolvedValue([{ count: 0, total: 5000 }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getFinancialStats } = await import('./DashboardService');
      const result = await getFinancialStats('org_test123');

      expect(result.incomePerStudent30Days).toBe(0); // Should not be NaN or Infinity
    });
  });

  describe('getMemberAverageChartData', () => {
    it('should return monthly and yearly chart data from a single fetch', async () => {
      // N+1 consolidation: ONE query fetches all member rows; every bucket count
      // is computed in JS. A member created before the earliest bucket and never
      // cancelled is counted in every bucket.
      const currentYear = new Date().getFullYear();
      const longAgo = new Date(currentYear - 10, 0, 1);
      mockQueryBuilder.where.mockResolvedValue([
        { createdAt: longAgo, status: 'active', updatedAt: longAgo },
      ]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getMemberAverageChartData } = await import('./DashboardService');
      const result = await getMemberAverageChartData('org_test123');

      // Verify structure
      expect(result).toHaveProperty('monthly');
      expect(result).toHaveProperty('yearly');
      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);

      // Verify monthly data structure
      expect(result.monthly[0]).toHaveProperty('month');
      expect(result.monthly[0]).toHaveProperty('value');
      expect(result.monthly[0]).toHaveProperty('previousYearValue');
      expect(result.monthly[0]?.month).toBe('Jan');
      expect(result.monthly[0]?.value).toBe(1);
      expect(result.monthly[0]?.previousYearValue).toBe(1);

      // Verify yearly data structure
      expect(result.yearly[0]).toHaveProperty('year');
      expect(result.yearly[0]).toHaveProperty('value');
      expect(result.yearly[0]?.year).toBe(String(currentYear - 4));
      expect(result.yearly[4]?.year).toBe(String(currentYear));

      // N+1 → 1: a single member fetch replaces the 29-query fan-out.
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('should handle zero member data', async () => {
      mockQueryBuilder.where.mockResolvedValue([]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getMemberAverageChartData } = await import('./DashboardService');
      const result = await getMemberAverageChartData('org_empty');

      // All months should have 0 values
      expect(result.monthly.every(m => m.value === 0)).toBe(true);
      expect(result.monthly.every(m => m.previousYearValue === 0)).toBe(true);

      // All years should have 0 values
      expect(result.yearly.every(y => y.value === 0)).toBe(true);
    });

    it('should return correct month names in order', async () => {
      mockQueryBuilder.where.mockResolvedValue([]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getMemberAverageChartData } = await import('./DashboardService');
      const result = await getMemberAverageChartData('org_test123');

      const expectedMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const actualMonths = result.monthly.map(m => m.month);

      expect(actualMonths).toEqual(expectedMonths);
    });

    it('should exclude members created after the bucket and cancelled-before members', async () => {
      const currentYear = new Date().getFullYear();
      // Cancelled well before any bucket → never counted.
      const cancelledEarly = {
        createdAt: new Date(currentYear - 10, 0, 1),
        status: 'cancelled',
        updatedAt: new Date(currentYear - 9, 0, 1),
      };
      mockQueryBuilder.where.mockResolvedValue([cancelledEarly]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getMemberAverageChartData } = await import('./DashboardService');
      const result = await getMemberAverageChartData('org_test123');

      expect(result.monthly.every(m => m.value === 0)).toBe(true);
      expect(result.yearly.every(y => y.value === 0)).toBe(true);
    });

    it('should calculate correct year range', async () => {
      mockQueryBuilder.where.mockResolvedValue([]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getMemberAverageChartData } = await import('./DashboardService');
      const result = await getMemberAverageChartData('org_test123');

      const currentYear = new Date().getFullYear();
      const expectedYears = [
        String(currentYear - 4),
        String(currentYear - 3),
        String(currentYear - 2),
        String(currentYear - 1),
        String(currentYear),
      ];
      const actualYears = result.yearly.map(y => y.year);

      expect(actualYears).toEqual(expectedYears);
    });
  });

  describe('getEarningsChartData', () => {
    // The grouped date_trunc query is awaited off `.groupBy(...)`. Helper to
    // point every grouped query at a fixed set of `{ bucket, total }` rows.
    const mockGroupedRows = (rows: Array<{ bucket: Date; total: number | string | null }>) => {
      mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.groupBy.mockResolvedValue(rows);
    };

    it('should return monthly and yearly earnings data via grouped queries', async () => {
      const currentYear = new Date().getFullYear();
      // A grouped result covering Jan of the current year (current-month series),
      // Jan of the previous year (prev-year series), and the current year's
      // yearly bucket. Because all three grouped queries share one mock, we
      // include all three bucket keys.
      mockGroupedRows([
        { bucket: new Date(currentYear, 0, 1), total: 5000 },
        { bucket: new Date(currentYear - 1, 0, 1), total: 5000 },
      ]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getEarningsChartData } = await import('./DashboardService');
      const result = await getEarningsChartData('org_test123');

      // Verify structure
      expect(result).toHaveProperty('monthly');
      expect(result).toHaveProperty('yearly');
      expect(result.monthly).toHaveLength(12);
      expect(result.yearly).toHaveLength(5);

      // Jan maps to the Jan bucket; the rest of the year is a missing bucket → 0.
      expect(result.monthly[0]?.month).toBe('Jan');
      expect(result.monthly[0]?.value).toBe(5000);
      expect(result.monthly[0]?.previousYearValue).toBe(5000);
      expect(result.monthly[1]?.value).toBe(0);
      expect(result.monthly[1]?.previousYearValue).toBe(0);

      // Verify yearly data structure
      expect(result.yearly[0]?.year).toBe(String(currentYear - 4));
      expect(result.yearly[4]?.year).toBe(String(currentYear));

      // N+1 → 3: one grouped query per series (current months, prev-year, yearly).
      expect(db.select).toHaveBeenCalledTimes(3);
    });

    it('should handle zero earnings data', async () => {
      mockGroupedRows([]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getEarningsChartData } = await import('./DashboardService');
      const result = await getEarningsChartData('org_empty');

      // All months should have 0 values
      expect(result.monthly.every(m => m.value === 0)).toBe(true);
      expect(result.monthly.every(m => m.previousYearValue === 0)).toBe(true);

      // All years should have 0 values
      expect(result.yearly.every(y => y.value === 0)).toBe(true);
    });

    it('should convert total amounts to numbers', async () => {
      const currentYear = new Date().getFullYear();
      // Mock returns string-like totals (as SQL aggregates might)
      mockGroupedRows([{ bucket: new Date(currentYear, 0, 1), total: '1234.56' }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getEarningsChartData } = await import('./DashboardService');
      const result = await getEarningsChartData('org_test123');

      // Should convert to number
      expect(typeof result.monthly[0]?.value).toBe('number');
      expect(result.monthly[0]?.value).toBe(1234.56);
    });

    it('maps a missing bucket to 0', async () => {
      const currentYear = new Date().getFullYear();
      // Only February has a grouped row → January (a missing bucket) must be 0.
      mockGroupedRows([{ bucket: new Date(currentYear, 1, 1), total: 900 }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getEarningsChartData } = await import('./DashboardService');
      const result = await getEarningsChartData('org_test123');

      expect(result.monthly[0]?.month).toBe('Jan');
      expect(result.monthly[0]?.value).toBe(0);
      expect(result.monthly[1]?.month).toBe('Feb');
      expect(result.monthly[1]?.value).toBe(900);
    });

    it('should return correct month names in order', async () => {
      mockGroupedRows([]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getEarningsChartData } = await import('./DashboardService');
      const result = await getEarningsChartData('org_test123');

      const expectedMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const actualMonths = result.monthly.map(m => m.month);

      expect(actualMonths).toEqual(expectedMonths);
    });

    it('should calculate correct year range', async () => {
      mockGroupedRows([]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getEarningsChartData } = await import('./DashboardService');
      const result = await getEarningsChartData('org_test123');

      const currentYear = new Date().getFullYear();
      const expectedYears = [
        String(currentYear - 4),
        String(currentYear - 3),
        String(currentYear - 2),
        String(currentYear - 1),
        String(currentYear),
      ];
      const actualYears = result.yearly.map(y => y.year);

      expect(actualYears).toEqual(expectedYears);
    });
  });

  describe('countMembersAsOf (pure)', () => {
    it('counts members created at or before the point and not yet cancelled', async () => {
      const { countMembersAsOf } = await import('./DashboardService');
      const at = new Date('2026-06-15T00:00:00Z');
      const rows = [
        // active, created before → counted
        { createdAt: new Date('2026-01-01T00:00:00Z'), status: 'active', updatedAt: new Date('2026-01-01T00:00:00Z') },
        // created after the point → excluded
        { createdAt: new Date('2026-07-01T00:00:00Z'), status: 'active', updatedAt: new Date('2026-07-01T00:00:00Z') },
        // cancelled BEFORE the point (updatedAt <= at) → excluded
        { createdAt: new Date('2026-01-01T00:00:00Z'), status: 'cancelled', updatedAt: new Date('2026-05-01T00:00:00Z') },
        // cancelled AFTER the point (updatedAt > at) → still counted (was active as of `at`)
        { createdAt: new Date('2026-01-01T00:00:00Z'), status: 'cancelled', updatedAt: new Date('2026-08-01T00:00:00Z') },
      ];

      expect(countMembersAsOf(rows, at)).toBe(2);
    });

    it('treats createdAt exactly equal to the point as included (<=)', async () => {
      const { countMembersAsOf } = await import('./DashboardService');
      const at = new Date('2026-06-15T00:00:00Z');
      const rows = [
        { createdAt: new Date('2026-06-15T00:00:00Z'), status: 'active', updatedAt: new Date('2026-06-15T00:00:00Z') },
      ];

      expect(countMembersAsOf(rows, at)).toBe(1);
    });

    it('returns 0 for an empty roster', async () => {
      const { countMembersAsOf } = await import('./DashboardService');

      expect(countMembersAsOf([], new Date('2026-06-15T00:00:00Z'))).toBe(0);
    });
  });
});
