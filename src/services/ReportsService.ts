import { and, count, eq, gte, inArray, sql, sum } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { memberMembershipSchema, memberSchema, membershipPlanSchema, transactionSchema } from '@/models/Schema';
import { getFinancialStats } from './DashboardService';

export type ReportCurrentValues = {
  autopaysSuspended: number;
  expiringCreditCards: number;
  amountDue: number;
  pastDue: number;
  paymentsLast30Days: number;
  paymentsPending: number;
  failedPayments: number;
  incomePerStudent: number;
};

type MonthlyDataPoint = {
  month: string;
  value: number;
  previousYear?: number;
};

type YearlyDataPoint = {
  year: string;
  value: number;
};

type DailyDataPoint = {
  day: string; // 'MMM D' label, e.g. 'Jul 3'
  value: number;
};

export type ReportRange = 'last-7' | 'last-30' | 'last-90';

const RANGE_DAYS: Record<ReportRange, number> = {
  'last-7': 7,
  'last-30': 30,
  'last-90': 90,
};

export type ReportChartData = {
  monthly: MonthlyDataPoint[];
  yearly: YearlyDataPoint[];
  daily?: DailyDataPoint[];
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Build the last-N calendar days ending today, each as a { start-of-day,
// end-of-day, label } bucket. Used by the daily report series (#274).
function lastNDayBuckets(days: number): Array<{ start: Date; end: Date; label: string }> {
  const buckets: Array<{ start: Date; end: Date; label: string }> = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    buckets.push({ start, end, label: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}` });
  }
  return buckets;
}

export async function getReportCurrentValues(organizationId: string): Promise<ReportCurrentValues> {
  const stats = await getFinancialStats(organizationId);
  return {
    autopaysSuspended: stats.autopaysSuspended,
    expiringCreditCards: stats.expiringCreditCards60Days,
    amountDue: stats.amountDueNext30Days,
    pastDue: stats.pastDueTotal,
    paymentsLast30Days: stats.paymentsLast30Days,
    paymentsPending: stats.paymentsPending,
    failedPayments: stats.failedPaymentsLast30Days,
    incomePerStudent: stats.incomePerStudent30Days,
  };
}

export async function getReportChartData(
  organizationId: string,
  reportType: string,
  range?: ReportRange | null,
): Promise<ReportChartData> {
  const currentYear = new Date().getFullYear();

  const base = await (async (): Promise<ReportChartData> => {
    switch (reportType) {
      case 'accounts-autopay-suspended':
        return getAutopayChartData(organizationId, currentYear);
      case 'expiring-credit-cards':
        return getEmptyChartData(currentYear);
      case 'amount-due':
        return getAmountDueChartData(organizationId, currentYear);
      case 'past-due':
        return getStatusChartData(organizationId, currentYear, 'declined');
      case 'payments-last-30-days':
        return getStatusChartData(organizationId, currentYear, 'paid');
      case 'payments-pending':
        return getPendingChartData(organizationId, currentYear);
      case 'failed-payments':
        return getStatusChartData(organizationId, currentYear, 'declined');
      case 'income-per-student':
        return getIncomePerStudentChartData(organizationId, currentYear);
      default:
        return getEmptyChartData(currentYear);
    }
  })();

  // A range only adds a daily series; monthly/yearly are unchanged (#274).
  if (range) {
    base.daily = await getDailyChartData(organizationId, reportType, RANGE_DAYS[range]);
  }
  return base;
}

// Daily series for the "last N days" report filter. Reuses each report's
// underlying per-bucket query (range-sum or point-in-time count) over the
// last-N-day buckets. Kept separate from the monthly/yearly helpers so those
// remain untouched (zero regression risk).
async function getDailyChartData(
  organizationId: string,
  reportType: string,
  days: number,
): Promise<DailyDataPoint[]> {
  const buckets = lastNDayBuckets(days);

  // Sum transaction.amount in [start,end] for a given status set.
  const txSumInRange = (start: Date, end: Date, statuses: string[]) =>
    db.select({ total: sum(transactionSchema.amount) })
      .from(transactionSchema)
      .where(and(
        eq(transactionSchema.organizationId, organizationId),
        inArray(transactionSchema.status, statuses),
        gte(transactionSchema.createdAt, start),
        sql`${transactionSchema.createdAt} <= ${end}`,
      ));

  // Count members in status 'past_due' as of a point in time.
  const pastDueCountAt = (at: Date) =>
    db.select({ count: count() })
      .from(memberSchema)
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        eq(memberSchema.status, 'past_due'),
        sql`${memberSchema.createdAt} <= ${at}`,
      ));

  const mapSum = (results: Array<{ total: string | number | null }[]>): DailyDataPoint[] =>
    buckets.map((b, i) => ({ day: b.label, value: Math.abs(Number(results[i]?.[0]?.total ?? 0)) }));

  switch (reportType) {
    case 'accounts-autopay-suspended': {
      const results = await Promise.all(buckets.map(b => pastDueCountAt(b.end)));
      return buckets.map((b, i) => ({ day: b.label, value: results[i]?.[0]?.count ?? 0 }));
    }
    case 'amount-due':
    case 'payments-last-30-days':
      return mapSum(await Promise.all(buckets.map(b => txSumInRange(b.start, b.end, ['paid']))));
    case 'past-due':
    case 'failed-payments':
      return mapSum(await Promise.all(buckets.map(b => txSumInRange(b.start, b.end, ['declined']))));
    case 'payments-pending':
      return mapSum(await Promise.all(buckets.map(b => txSumInRange(b.start, b.end, ['pending', 'processing']))));
    case 'income-per-student': {
      // Per-day income divided by member count at end of day.
      const memberCountAt = (at: Date) =>
        db.select({ count: count() })
          .from(memberSchema)
          .where(and(
            eq(memberSchema.organizationId, organizationId),
            sql`${memberSchema.createdAt} <= ${at}`,
            sql`(${memberSchema.status} != 'cancelled' OR ${memberSchema.updatedAt} > ${at})`,
          ));
      const [incomeResults, memberResults] = await Promise.all([
        Promise.all(buckets.map(b => txSumInRange(b.start, b.end, ['paid']))),
        Promise.all(buckets.map(b => memberCountAt(b.end))),
      ]);
      return buckets.map((b, i) => {
        const income = Number(incomeResults[i]?.[0]?.total ?? 0);
        const members = memberResults[i]?.[0]?.count ?? 1;
        return { day: b.label, value: members > 0 ? Math.round((income / members) * 100) / 100 : 0 };
      });
    }
    case 'expiring-credit-cards':
    default:
      return buckets.map(b => ({ day: b.label, value: 0 }));
  }
}

export async function getReportInsights(
  organizationId: string,
  reportType: string,
): Promise<string[]> {
  const stats = await getFinancialStats(organizationId);

  const [studentsResult] = await db
    .select({ count: count() })
    .from(memberSchema)
    .where(and(
      eq(memberSchema.organizationId, organizationId),
      inArray(memberSchema.status, ['active', 'trial']),
    ));
  const totalStudents = studentsResult?.count ?? 0;

  const [totalMembersResult] = await db
    .select({ count: count() })
    .from(memberSchema)
    .where(eq(memberSchema.organizationId, organizationId));
  const totalMembers = totalMembersResult?.count ?? 0;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  switch (reportType) {
    case 'accounts-autopay-suspended': {
      const pct = totalMembers > 0 ? ((stats.autopaysSuspended / totalMembers) * 100).toFixed(1) : '0';
      return [
        `${stats.autopaysSuspended} account${stats.autopaysSuspended !== 1 ? 's' : ''} currently have autopay suspended`,
        `Suspended accounts represent ${pct}% of total memberships`,
        `Past due balance from suspended accounts: $${stats.pastDueTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${totalStudents} active students currently enrolled`,
      ];
    }
    case 'expiring-credit-cards':
      return [
        `${stats.expiringCreditCards60Days} cards expiring in the next 60 days`,
        'Card expiration tracking requires payment processor integration',
        `${totalStudents} active students with memberships`,
        'Proactive outreach to members with expiring cards improves retention',
      ];
    case 'amount-due': {
      const collectionRate = stats.amountDueNext30Days > 0
        ? ((stats.paymentsLast30Days / stats.amountDueNext30Days) * 100).toFixed(1)
        : '0';
      return [
        `$${stats.amountDueNext30Days.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} expected in the next 30 days`,
        `Based on ${totalStudents} active memberships with autopay`,
        `Historical collection rate: ${collectionRate}%`,
        `$${stats.pastDueTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} currently past due`,
      ];
    }
    case 'past-due': {
      // Count members with declined transactions
      const [pastDueMembersResult] = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${transactionSchema.memberId})` })
        .from(transactionSchema)
        .where(and(
          eq(transactionSchema.organizationId, organizationId),
          eq(transactionSchema.status, 'declined'),
        ));
      const pastDueMembers = Number(pastDueMembersResult?.count ?? 0);
      const avgPerMember = pastDueMembers > 0 ? stats.pastDueTotal / pastDueMembers : 0;
      return [
        `Total past due: $${stats.pastDueTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${pastDueMembers} member${pastDueMembers !== 1 ? 's' : ''}`,
        `Average past due per member: $${avgPerMember.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `Failed payments in last 30 days: $${stats.failedPaymentsLast30Days.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${pastDueMembers > 0 ? 'Consider personalized payment plans for affected members' : 'No members currently past due'}`,
      ];
    }
    case 'payments-last-30-days': {
      // Count paid transactions in last 30 days
      const [paidCountResult] = await db
        .select({ count: count() })
        .from(transactionSchema)
        .where(and(
          eq(transactionSchema.organizationId, organizationId),
          eq(transactionSchema.status, 'paid'),
          gte(transactionSchema.createdAt, thirtyDaysAgo),
        ));
      const paidCount = paidCountResult?.count ?? 0;
      const avgTx = paidCount > 0 ? stats.paymentsLast30Days / paidCount : 0;

      // Count by payment method
      const methodCounts = await db
        .select({
          method: transactionSchema.paymentMethod,
          count: count(),
        })
        .from(transactionSchema)
        .where(and(
          eq(transactionSchema.organizationId, organizationId),
          eq(transactionSchema.status, 'paid'),
          gte(transactionSchema.createdAt, thirtyDaysAgo),
        ))
        .groupBy(transactionSchema.paymentMethod)
        .orderBy(sql`count(*) DESC`);

      const topMethod = methodCounts[0]?.method ?? 'card';
      const topMethodPct = paidCount > 0 ? ((Number(methodCounts[0]?.count ?? 0) / paidCount) * 100).toFixed(0) : '0';

      return [
        `$${stats.paymentsLast30Days.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} collected in the last 30 days`,
        `${paidCount} successful transactions processed`,
        `Average transaction value: $${avgTx.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${topMethod} payments account for ${topMethodPct}% of collections`,
      ];
    }
    case 'payments-pending':
      return [
        `$${stats.paymentsPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in pending payments`,
        `${stats.paymentsPending === 0 ? 'No payments currently awaiting processing' : 'Payments typically clear within 1-3 business days'}`,
        'ACH transfers may take 3-5 business days to settle',
        `$${stats.paymentsLast30Days.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} successfully collected in the last 30 days`,
      ];
    case 'failed-payments': {
      const [failedCountResult] = await db
        .select({ count: count() })
        .from(transactionSchema)
        .where(and(
          eq(transactionSchema.organizationId, organizationId),
          eq(transactionSchema.status, 'declined'),
          gte(transactionSchema.createdAt, thirtyDaysAgo),
        ));
      const failedCount = failedCountResult?.count ?? 0;
      const failureRate = stats.paymentsLast30Days + stats.failedPaymentsLast30Days > 0
        ? ((stats.failedPaymentsLast30Days / (stats.paymentsLast30Days + stats.failedPaymentsLast30Days)) * 100).toFixed(1)
        : '0';
      return [
        `$${stats.failedPaymentsLast30Days.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in failed payments over the last 30 days`,
        `${failedCount} failed transaction${failedCount !== 1 ? 's' : ''} recorded`,
        `Failure rate: ${failureRate}% of attempted payments`,
        `${stats.autopaysSuspended} member${stats.autopaysSuspended !== 1 ? 's' : ''} with suspended autopay`,
      ];
    }
    case 'income-per-student': {
      const prevMonthStart = new Date();
      prevMonthStart.setMonth(prevMonthStart.getMonth() - 2);
      prevMonthStart.setDate(1);
      const prevMonthEnd = new Date();
      prevMonthEnd.setMonth(prevMonthEnd.getMonth() - 1);
      prevMonthEnd.setDate(0);

      const [prevResult] = await db
        .select({ total: sum(transactionSchema.amount) })
        .from(transactionSchema)
        .where(and(
          eq(transactionSchema.organizationId, organizationId),
          eq(transactionSchema.status, 'paid'),
          gte(transactionSchema.createdAt, prevMonthStart),
          sql`${transactionSchema.createdAt} <= ${prevMonthEnd}`,
        ));
      const prevIncome = totalStudents > 0 ? Number(prevResult?.total ?? 0) / totalStudents : 0;
      const change = prevIncome > 0
        ? (((stats.incomePerStudent30Days - prevIncome) / prevIncome) * 100).toFixed(1)
        : '0';

      return [
        `Average income per student: $${stats.incomePerStudent30Days.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} over 30 days`,
        `${totalStudents} active student${totalStudents !== 1 ? 's' : ''} currently enrolled`,
        `${Number(change) >= 0 ? '+' : ''}${change}% change from previous period`,
        `Total revenue last 30 days: $${stats.paymentsLast30Days.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ];
    }
    default:
      return [];
  }
}

// Helper functions for chart data

async function getAutopayChartData(organizationId: string, currentYear: number): Promise<ReportChartData> {
  const monthlyDates = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    endOfMonth: new Date(currentYear, m + 1, 0, 23, 59, 59),
    endOfMonthPrev: new Date(currentYear - 1, m + 1, 0, 23, 59, 59),
  }));

  const yearlyDates = Array.from({ length: 5 }, (_, i) => ({
    year: currentYear - 4 + i,
    endOfYear: new Date(currentYear - 4 + i, 11, 31, 23, 59, 59),
  }));

  const pastDueCountAt = (datePoint: Date) =>
    db.select({ count: count() })
      .from(memberSchema)
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        eq(memberSchema.status, 'past_due'),
        sql`${memberSchema.createdAt} <= ${datePoint}`,
      ));

  const [monthlyCurrentResults, monthlyPrevResults, yearlyResults] = await Promise.all([
    Promise.all(monthlyDates.map(d => pastDueCountAt(d.endOfMonth))),
    Promise.all(monthlyDates.map(d => pastDueCountAt(d.endOfMonthPrev))),
    Promise.all(yearlyDates.map(d => pastDueCountAt(d.endOfYear))),
  ]);

  const monthly: MonthlyDataPoint[] = monthlyDates.map((d, i) => ({
    month: MONTH_NAMES[d.month]!,
    value: monthlyCurrentResults[i]![0]?.count ?? 0,
    previousYear: monthlyPrevResults[i]![0]?.count ?? 0,
  }));

  const yearly: YearlyDataPoint[] = yearlyDates.map((d, i) => ({
    year: String(d.year),
    value: yearlyResults[i]![0]?.count ?? 0,
  }));

  return { monthly, yearly };
}

function getEmptyChartData(currentYear: number): ReportChartData {
  const monthly = MONTH_NAMES.map(month => ({ month, value: 0, previousYear: 0 }));
  const yearly: YearlyDataPoint[] = [];
  for (let y = currentYear - 4; y <= currentYear; y++) {
    yearly.push({ year: String(y), value: 0 });
  }
  return { monthly, yearly };
}

async function getAmountDueChartData(organizationId: string, currentYear: number): Promise<ReportChartData> {
  // Sum active autopay membership plan prices per month (constant based on active members)
  const [currentDue] = await db
    .select({ total: sql<number>`COALESCE(SUM(${membershipPlanSchema.price}), 0)` })
    .from(memberMembershipSchema)
    .innerJoin(memberSchema, eq(memberMembershipSchema.memberId, memberSchema.id))
    .innerJoin(membershipPlanSchema, eq(memberMembershipSchema.membershipPlanId, membershipPlanSchema.id))
    .where(and(
      eq(memberSchema.organizationId, organizationId),
      eq(memberMembershipSchema.status, 'active'),
      eq(memberMembershipSchema.billingType, 'autopay'),
    ));

  const due = Number(currentDue?.total ?? 0);

  // For chart, use actual paid amounts per month as a proxy for "amount due"
  return getStatusChartData(organizationId, currentYear, 'paid', due);
}

async function getStatusChartData(
  organizationId: string,
  currentYear: number,
  status: string,
  currentMonthOverride?: number,
): Promise<ReportChartData> {
  const currentMonth = new Date().getMonth();

  const monthlyDates = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    startOfMonth: new Date(currentYear, m, 1),
    endOfMonth: new Date(currentYear, m + 1, 0, 23, 59, 59),
    startOfMonthPrev: new Date(currentYear - 1, m, 1),
    endOfMonthPrev: new Date(currentYear - 1, m + 1, 0, 23, 59, 59),
  }));

  const yearlyDates = Array.from({ length: 5 }, (_, i) => ({
    year: currentYear - 4 + i,
    startOfYear: new Date(currentYear - 4 + i, 0, 1),
    endOfYear: new Date(currentYear - 4 + i, 11, 31, 23, 59, 59),
  }));

  const txSumInRange = (start: Date, end: Date) =>
    db.select({ total: sum(transactionSchema.amount) })
      .from(transactionSchema)
      .where(and(
        eq(transactionSchema.organizationId, organizationId),
        eq(transactionSchema.status, status),
        gte(transactionSchema.createdAt, start),
        sql`${transactionSchema.createdAt} <= ${end}`,
      ));

  // Only query months that don't have an override
  const monthsToQuery = monthlyDates.filter(d =>
    !(currentMonthOverride !== undefined && d.month === currentMonth),
  );

  const [currentResults, prevResults, yearlyResults] = await Promise.all([
    Promise.all(monthsToQuery.map(d => txSumInRange(d.startOfMonth, d.endOfMonth))),
    Promise.all(monthlyDates.map(d => txSumInRange(d.startOfMonthPrev, d.endOfMonthPrev))),
    Promise.all(yearlyDates.map(d => txSumInRange(d.startOfYear, d.endOfYear))),
  ]);

  // Map queried results back, using override for the overridden month
  let queryIdx = 0;
  const monthly: MonthlyDataPoint[] = monthlyDates.map((d, i) => {
    let currentValue: number;
    if (currentMonthOverride !== undefined && d.month === currentMonth) {
      currentValue = currentMonthOverride;
    } else {
      currentValue = Number(currentResults[queryIdx]![0]?.total ?? 0);
      queryIdx++;
    }
    return {
      month: MONTH_NAMES[d.month]!,
      value: Math.abs(currentValue),
      previousYear: Math.abs(Number(prevResults[i]![0]?.total ?? 0)),
    };
  });

  const yearly: YearlyDataPoint[] = yearlyDates.map((d, i) => ({
    year: String(d.year),
    value: Math.abs(Number(yearlyResults[i]![0]?.total ?? 0)),
  }));

  return { monthly, yearly };
}

async function getPendingChartData(organizationId: string, currentYear: number): Promise<ReportChartData> {
  const monthlyDates = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    startOfMonth: new Date(currentYear, m, 1),
    endOfMonth: new Date(currentYear, m + 1, 0, 23, 59, 59),
    startOfMonthPrev: new Date(currentYear - 1, m, 1),
    endOfMonthPrev: new Date(currentYear - 1, m + 1, 0, 23, 59, 59),
  }));

  const yearlyDates = Array.from({ length: 5 }, (_, i) => ({
    year: currentYear - 4 + i,
    startOfYear: new Date(currentYear - 4 + i, 0, 1),
    endOfYear: new Date(currentYear - 4 + i, 11, 31, 23, 59, 59),
  }));

  const pendingSumInRange = (start: Date, end: Date) =>
    db.select({ total: sum(transactionSchema.amount) })
      .from(transactionSchema)
      .where(and(
        eq(transactionSchema.organizationId, organizationId),
        inArray(transactionSchema.status, ['pending', 'processing']),
        gte(transactionSchema.createdAt, start),
        sql`${transactionSchema.createdAt} <= ${end}`,
      ));

  const [monthlyCurrentResults, monthlyPrevResults, yearlyResults] = await Promise.all([
    Promise.all(monthlyDates.map(d => pendingSumInRange(d.startOfMonth, d.endOfMonth))),
    Promise.all(monthlyDates.map(d => pendingSumInRange(d.startOfMonthPrev, d.endOfMonthPrev))),
    Promise.all(yearlyDates.map(d => pendingSumInRange(d.startOfYear, d.endOfYear))),
  ]);

  const monthly: MonthlyDataPoint[] = monthlyDates.map((d, i) => ({
    month: MONTH_NAMES[d.month]!,
    value: Number(monthlyCurrentResults[i]![0]?.total ?? 0),
    previousYear: Number(monthlyPrevResults[i]![0]?.total ?? 0),
  }));

  const yearly: YearlyDataPoint[] = yearlyDates.map((d, i) => ({
    year: String(d.year),
    value: Number(yearlyResults[i]![0]?.total ?? 0),
  }));

  return { monthly, yearly };
}

async function getIncomePerStudentChartData(organizationId: string, currentYear: number): Promise<ReportChartData> {
  const monthlyDates = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    startOfMonth: new Date(currentYear, m, 1),
    endOfMonth: new Date(currentYear, m + 1, 0, 23, 59, 59),
    startOfMonthPrev: new Date(currentYear - 1, m, 1),
    endOfMonthPrev: new Date(currentYear - 1, m + 1, 0, 23, 59, 59),
  }));

  const yearlyDates = Array.from({ length: 5 }, (_, i) => ({
    year: currentYear - 4 + i,
    startOfYear: new Date(currentYear - 4 + i, 0, 1),
    endOfYear: new Date(currentYear - 4 + i, 11, 31, 23, 59, 59),
  }));

  const incomeInRange = (start: Date, end: Date) =>
    db.select({ total: sum(transactionSchema.amount) })
      .from(transactionSchema)
      .where(and(
        eq(transactionSchema.organizationId, organizationId),
        eq(transactionSchema.status, 'paid'),
        gte(transactionSchema.createdAt, start),
        sql`${transactionSchema.createdAt} <= ${end}`,
      ));

  const memberCountAt = (datePoint: Date) =>
    db.select({ count: count() })
      .from(memberSchema)
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        sql`${memberSchema.createdAt} <= ${datePoint}`,
        sql`(${memberSchema.status} != 'cancelled' OR ${memberSchema.updatedAt} > ${datePoint})`,
      ));

  const [
    monthlyIncomeResults,
    monthlyMemberResults,
    monthlyPrevIncomeResults,
    monthlyPrevMemberResults,
    yearlyIncomeResults,
    yearlyMemberResults,
  ] = await Promise.all([
    Promise.all(monthlyDates.map(d => incomeInRange(d.startOfMonth, d.endOfMonth))),
    Promise.all(monthlyDates.map(d => memberCountAt(d.endOfMonth))),
    Promise.all(monthlyDates.map(d => incomeInRange(d.startOfMonthPrev, d.endOfMonthPrev))),
    Promise.all(monthlyDates.map(d => memberCountAt(d.endOfMonthPrev))),
    Promise.all(yearlyDates.map(d => incomeInRange(d.startOfYear, d.endOfYear))),
    Promise.all(yearlyDates.map(d => memberCountAt(d.endOfYear))),
  ]);

  const monthly: MonthlyDataPoint[] = monthlyDates.map((d, i) => {
    const income = Number(monthlyIncomeResults[i]![0]?.total ?? 0);
    const members = monthlyMemberResults[i]![0]?.count ?? 1;
    const prevIncome = Number(monthlyPrevIncomeResults[i]![0]?.total ?? 0);
    const prevMembers = monthlyPrevMemberResults[i]![0]?.count ?? 1;
    return {
      month: MONTH_NAMES[d.month]!,
      value: Math.round((members > 0 ? income / members : 0) * 100) / 100,
      previousYear: Math.round((prevMembers > 0 ? prevIncome / prevMembers : 0) * 100) / 100,
    };
  });

  const yearly: YearlyDataPoint[] = yearlyDates.map((d, i) => {
    const income = Number(yearlyIncomeResults[i]![0]?.total ?? 0);
    const members = yearlyMemberResults[i]![0]?.count ?? 1;
    return {
      year: String(d.year),
      value: members > 0 ? Math.round((income / members) * 100) / 100 : 0,
    };
  });

  return { monthly, yearly };
}
