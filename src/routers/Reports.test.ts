import type { AuditContext } from '@/types/Audit';
import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG_ROLE } from '@/types/Auth';

// Mock all dependencies
vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('@/libs/Logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('./AuthGuards', () => ({
  guardRole: vi.fn(),
}));
vi.mock('@/services/ReportsService', () => ({
  getReportCurrentValues: vi.fn(),
  getReportChartData: vi.fn(),
  getReportInsights: vi.fn(),
}));

const mockContext: AuditContext = {
  userId: 'test-user-123',
  orgId: 'test-org-456',
  role: 'org:front_desk',
};

// Helper to call ORPC handlers
function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('Reports Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('currentValues', () => {
    it('should return current report values on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getReportCurrentValues } = await import('@/services/ReportsService');

      const mockValues = {
        autopaysSuspended: 5,
        expiringCreditCards: 8,
        amountDue: 12500,
        pastDue: 3200,
        paymentsLast30Days: 45000,
        paymentsPending: 8500,
        failedPayments: 3,
        incomePerStudent: 89.5,
      };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getReportCurrentValues).mockResolvedValue(mockValues);

      const { currentValues } = await import('./Reports');
      const result = await callHandler(currentValues);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getReportCurrentValues).toHaveBeenCalledWith('test-org-456');
      expect(result).toEqual(mockValues);
    });

    it('should rethrow ORPCError from guardRole', async () => {
      const { guardRole } = await import('./AuthGuards');
      const error = new ORPCError('UNAUTHORIZED', {
        message: 'Insufficient permissions',
      });
      vi.mocked(guardRole).mockRejectedValue(error);

      const { currentValues } = await import('./Reports');

      await expect(callHandler(currentValues)).rejects.toThrow(error);
    });

    it('should propagate service errors', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getReportCurrentValues } = await import('@/services/ReportsService');

      const serviceError = new Error('Query execution failed');
      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getReportCurrentValues).mockRejectedValue(serviceError);

      const { currentValues } = await import('./Reports');

      await expect(callHandler(currentValues)).rejects.toThrow(serviceError);
    });
  });

  describe('chartData', () => {
    it('should return chart data for revenue report type', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getReportChartData } = await import('@/services/ReportsService');

      const mockChartData = {
        monthly: [
          { month: '2026-01', value: 5000, previousYear: 4500 },
          { month: '2026-02', value: 6200, previousYear: 5800 },
          { month: '2026-03', value: 5800 },
        ],
        yearly: [
          { year: '2025', value: 65000 },
          { year: '2026', value: 70000 },
        ],
      };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getReportChartData).mockResolvedValue(mockChartData);

      const { chartData } = await import('./Reports');
      const input = { reportType: 'revenue' };
      const result = await callHandler(chartData, input);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getReportChartData).toHaveBeenCalledWith('test-org-456', 'revenue', undefined);
      expect(result).toEqual(mockChartData);
    });

    it('forwards the range param to the service when provided (#274)', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getReportChartData } = await import('@/services/ReportsService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getReportChartData).mockResolvedValue({ monthly: [], yearly: [], daily: [] });

      const { chartData } = await import('./Reports');
      await callHandler(chartData, { reportType: 'past-due', range: 'last-30' });

      expect(getReportChartData).toHaveBeenCalledWith('test-org-456', 'past-due', 'last-30');
    });

    it('should return chart data for attendance report type', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getReportChartData } = await import('@/services/ReportsService');

      const mockChartData = {
        monthly: [
          { month: '2026-01', value: 45, previousYear: 42 },
          { month: '2026-02', value: 52, previousYear: 48 },
          { month: '2026-03', value: 48 },
        ],
        yearly: [
          { year: '2025', value: 480 },
          { year: '2026', value: 520 },
        ],
      };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getReportChartData).mockResolvedValue(mockChartData);

      const { chartData } = await import('./Reports');
      const input = { reportType: 'attendance' };
      const result = await callHandler(chartData, input);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getReportChartData).toHaveBeenCalledWith('test-org-456', 'attendance', undefined);
      expect(result).toEqual(mockChartData);
    });

    it('should rethrow ORPCError from guardRole', async () => {
      const { guardRole } = await import('./AuthGuards');
      const error = new ORPCError('UNAUTHORIZED', {
        message: 'Insufficient permissions',
      });
      vi.mocked(guardRole).mockRejectedValue(error);

      const { chartData } = await import('./Reports');

      await expect(callHandler(chartData, { reportType: 'revenue' })).rejects.toThrow(error);
    });

    it('should propagate service errors', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getReportChartData } = await import('@/services/ReportsService');

      const serviceError = new Error('Data aggregation error');
      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getReportChartData).mockRejectedValue(serviceError);

      const { chartData } = await import('./Reports');

      await expect(callHandler(chartData, { reportType: 'revenue' })).rejects.toThrow(serviceError);
    });
  });

  describe('insights', () => {
    it('should return insights for members report type', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getReportInsights } = await import('@/services/ReportsService');

      const mockInsights = [
        'Member growth increased by 8% this month',
        '92% retention rate for 6-month members',
        'Average member tenure is 14 months',
      ];

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getReportInsights).mockResolvedValue(mockInsights);

      const { insights } = await import('./Reports');
      const input = { reportType: 'members' };
      const result = await callHandler(insights, input);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getReportInsights).toHaveBeenCalledWith('test-org-456', 'members');
      expect(result).toEqual(mockInsights);
    });

    it('should return insights for classes report type', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getReportInsights } = await import('@/services/ReportsService');

      const mockInsights = [
        'Evening classes at 95% capacity',
        'Tuesday 6PM class has highest attendance',
        'Kids classes showing 15% growth',
      ];

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getReportInsights).mockResolvedValue(mockInsights);

      const { insights } = await import('./Reports');
      const input = { reportType: 'classes' };
      const result = await callHandler(insights, input);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getReportInsights).toHaveBeenCalledWith('test-org-456', 'classes');
      expect(result).toEqual(mockInsights);
    });

    it('should rethrow ORPCError from guardRole', async () => {
      const { guardRole } = await import('./AuthGuards');
      const error = new ORPCError('UNAUTHORIZED', {
        message: 'Insufficient permissions',
      });
      vi.mocked(guardRole).mockRejectedValue(error);

      const { insights } = await import('./Reports');

      await expect(callHandler(insights, { reportType: 'members' })).rejects.toThrow(error);
    });

    it('should propagate service errors', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getReportInsights } = await import('@/services/ReportsService');

      const serviceError = new Error('AI analysis service unavailable');
      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getReportInsights).mockRejectedValue(serviceError);

      const { insights } = await import('./Reports');

      await expect(callHandler(insights, { reportType: 'members' })).rejects.toThrow(serviceError);
    });
  });
});
