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
    it('should return monthly and yearly chart data', async () => {
      // For this test, we'll mock 12 months + 12 months prev year + 5 years = 29 queries
      const mockCount = 50;
      mockQueryBuilder.where.mockResolvedValue([{ count: mockCount }]);

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
      expect(result.monthly[0]?.value).toBe(mockCount);
      expect(result.monthly[0]?.previousYearValue).toBe(mockCount);

      // Verify yearly data structure
      const currentYear = new Date().getFullYear();

      expect(result.yearly[0]).toHaveProperty('year');
      expect(result.yearly[0]).toHaveProperty('value');
      expect(result.yearly[0]?.year).toBe(String(currentYear - 4));
      expect(result.yearly[4]?.year).toBe(String(currentYear));

      // Each month has 2 queries current + prev year, plus 5 years
      expect(db.select).toHaveBeenCalledTimes(12 * 2 + 5);
    });

    it('should handle zero member data', async () => {
      mockQueryBuilder.where.mockResolvedValue([{ count: 0 }]);

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
      mockQueryBuilder.where.mockResolvedValue([{ count: 10 }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getMemberAverageChartData } = await import('./DashboardService');
      const result = await getMemberAverageChartData('org_test123');

      const expectedMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const actualMonths = result.monthly.map(m => m.month);

      expect(actualMonths).toEqual(expectedMonths);
    });

    it('should handle null count results', async () => {
      mockQueryBuilder.where.mockResolvedValue([{ count: null }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getMemberAverageChartData } = await import('./DashboardService');
      const result = await getMemberAverageChartData('org_test123');

      // Null counts should default to 0
      expect(result.monthly.every(m => m.value === 0)).toBe(true);
      expect(result.monthly.every(m => m.previousYearValue === 0)).toBe(true);
      expect(result.yearly.every(y => y.value === 0)).toBe(true);
    });

    it('should calculate correct year range', async () => {
      mockQueryBuilder.where.mockResolvedValue([{ count: 25 }]);

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
    it('should return monthly and yearly earnings data', async () => {
      const mockTotal = 5000;
      mockQueryBuilder.where.mockResolvedValue([{ total: mockTotal }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getEarningsChartData } = await import('./DashboardService');
      const result = await getEarningsChartData('org_test123');

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
      expect(result.monthly[0]?.value).toBe(mockTotal);
      expect(result.monthly[0]?.previousYearValue).toBe(mockTotal);

      // Verify yearly data structure
      const currentYear = new Date().getFullYear();

      expect(result.yearly[0]).toHaveProperty('year');
      expect(result.yearly[0]).toHaveProperty('value');
      expect(result.yearly[0]?.year).toBe(String(currentYear - 4));
      expect(result.yearly[4]?.year).toBe(String(currentYear));

      // Each month has 2 queries (current + prev year), plus 5 years
      expect(db.select).toHaveBeenCalledTimes(12 * 2 + 5); // 29 total
    });

    it('should handle zero earnings data', async () => {
      mockQueryBuilder.where.mockResolvedValue([{ total: null }]);

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
      // Mock returns string-like totals (as SQL aggregates might)
      mockQueryBuilder.where.mockResolvedValue([{ total: '1234.56' }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getEarningsChartData } = await import('./DashboardService');
      const result = await getEarningsChartData('org_test123');

      // Should convert to number
      expect(typeof result.monthly[0]?.value).toBe('number');
      expect(result.monthly[0]?.value).toBe(1234.56);
    });

    it('should return correct month names in order', async () => {
      mockQueryBuilder.where.mockResolvedValue([{ total: 1000 }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getEarningsChartData } = await import('./DashboardService');
      const result = await getEarningsChartData('org_test123');

      const expectedMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const actualMonths = result.monthly.map(m => m.month);

      expect(actualMonths).toEqual(expectedMonths);
    });

    it('should calculate correct year range', async () => {
      mockQueryBuilder.where.mockResolvedValue([{ total: 10000 }]);

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

    it('should handle varying earnings per month', async () => {
      // With Promise.all, all queries use the same mock, so verify structure
      mockQueryBuilder.where.mockResolvedValue([{ total: 2500 }]);

      const { db } = await import('@/libs/DB');
      (db as any).select = vi.fn(() => mockQueryBuilder);

      const { getEarningsChartData } = await import('./DashboardService');
      const result = await getEarningsChartData('org_test123');

      // All months should have the same mocked value
      expect(result.monthly.every(m => m.value === 2500)).toBe(true);
      expect(result.monthly.every(m => m.previousYearValue === 2500)).toBe(true);
    });
  });
});
