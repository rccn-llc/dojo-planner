import { os } from '@orpc/server';
import { getReportChartData, getReportCurrentValues, getReportInsights } from '@/services/ReportsService';
import { ORG_ROLE } from '@/types/Auth';
import { ReportTypeValidation } from '@/validations/TransactionValidation';
import { guardRole } from './AuthGuards';

export const currentValues = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);
  return getReportCurrentValues(orgId);
});

export const chartData = os
  .input(ReportTypeValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);
    return getReportChartData(orgId, input.reportType, input.range);
  });

export const insights = os
  .input(ReportTypeValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);
    return getReportInsights(orgId, input.reportType);
  });
