import { and, count, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { memberMembershipSchema, memberSchema, membershipPlanSchema, transactionSchema } from '@/models/Schema';
import { countMembersAsOf, fetchMemberAsOfRows, getFinancialStats } from './DashboardService';

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

// =============================================================================
// N+1 CONSOLIDATION HELPERS
//
// The chart builders previously fired one DB query per calendar bucket (12
// months + 12 prev-year months + 5 years, and up to 90 daily buckets) inside
// Promise.all — 29–180 queries per chart. They now issue ONE query per series.
//
// Two aggregate shapes:
//  - Range sum   → a single `date_trunc(period, created_at)` GROUP BY query;
//                  the rows are mapped back into calendar buckets in JS
//                  (a missing bucket → 0).
//  - As-of count → the minimal columns are fetched ONCE per org and every
//                  bucket count is computed in JS via pure functions.
//
// A period bucket in the ORIGINAL code was `[start, start + 1 period - 1s]`,
// e.g. a month is `[YYYY-MM-01 00:00:00, last-day 23:59:59]`. That leaves a
// sub-second gap (`…59.001–…59.999`) at every period boundary — rows there
// were dropped by the originals. `date_trunc` alone would fold those gap rows
// into their calendar period, changing counts for millisecond-precision
// timestamps. To stay byte-identical we replicate the original per-bucket
// upper bound in SQL: a row is kept only when
//   `created_at <= date_trunc(period, created_at) + 1 period - interval '1 second'`.
// That reproduces the original row-set exactly; `date_trunc` then groups the
// survivors into the same calendar buckets the originals used.
// =============================================================================

type TruncPeriod = 'month' | 'year' | 'day';

// The SQL bucket key for a row (start of its calendar period).
function bucketExpr(period: TruncPeriod) {
  return sql<Date>`date_trunc(${period}, ${transactionSchema.createdAt})`;
}

// Reproduces the originals' per-bucket upper bound so gap rows (the fractional
// tail of each period's final second) are dropped exactly as before.
function withinBucketWindow(period: TruncPeriod) {
  const oneUnit = sql.raw(`interval '1 ${period}'`);
  return sql`${transactionSchema.createdAt} <= date_trunc(${period}, ${transactionSchema.createdAt}) + ${oneUnit} - interval '1 second'`;
}

// A stable map key for a bucket-start Date, regardless of whether the driver
// returns a Date or an ISO string.
function bucketKey(value: unknown): string {
  if (value instanceof Date) {
    return value.getTime().toString();
  }
  return new Date(value as string).getTime().toString();
}

// Run ONE grouped date_trunc sum query for a status set over [start, end] and
// return a Map keyed by bucket-start ms → summed amount.
async function groupedSumByBucket(
  organizationId: string,
  statuses: string[],
  period: TruncPeriod,
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      bucket: bucketExpr(period),
      total: sql<string | number | null>`COALESCE(SUM(${transactionSchema.amount}), 0)`,
    })
    .from(transactionSchema)
    .where(and(
      eq(transactionSchema.organizationId, organizationId),
      inArray(transactionSchema.status, statuses),
      gte(transactionSchema.createdAt, start),
      lte(transactionSchema.createdAt, end),
      withinBucketWindow(period),
    ))
    .groupBy(bucketExpr(period));

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(bucketKey(row.bucket), Number(row.total ?? 0));
  }
  return map;
}

// -----------------------------------------------------------------------------
// Shape B — as-of point-in-time member counts (fetch once, bucket in JS)
// -----------------------------------------------------------------------------

// Fetch the createdAt of every past_due member for an org (one query). The
// per-bucket count is `# rows whose createdAt <= point`.
async function fetchPastDueMemberCreatedAts(organizationId: string): Promise<Date[]> {
  const rows = await db
    .select({ createdAt: memberSchema.createdAt })
    .from(memberSchema)
    .where(and(
      eq(memberSchema.organizationId, organizationId),
      eq(memberSchema.status, 'past_due'),
    ));
  return rows.map(r => r.createdAt as Date);
}

/**
 * Pure counter for the "accounts autopay suspended" series: counts the number
 * of past_due members whose createdAt is at or before `at`. Exported for direct
 * unit testing. Mirrors the original `pastDueCountAt(at)` query
 * (`WHERE status='past_due' AND created_at <= at`).
 */
export function countPastDueAsOf(createdAts: Date[], at: Date): number {
  let n = 0;
  for (const createdAt of createdAts) {
    if (createdAt.getTime() <= at.getTime()) {
      n++;
    }
  }
  return n;
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

// Daily series for the "last N days" report filter. Uses the same two aggregate
// shapes as the monthly/yearly builders over the last-N-day buckets, but issues
// ONE query per series instead of one per day (#274 + N+1 consolidation).
async function getDailyChartData(
  organizationId: string,
  reportType: string,
  days: number,
): Promise<DailyDataPoint[]> {
  const buckets = lastNDayBuckets(days);
  if (buckets.length === 0) {
    return [];
  }
  const rangeStart = buckets[0]!.start;
  const rangeEnd = buckets[buckets.length - 1]!.end;

  const mapSum = (map: Map<string, number>): DailyDataPoint[] =>
    buckets.map(b => ({ day: b.label, value: Math.abs(map.get(bucketKey(b.start)) ?? 0) }));

  switch (reportType) {
    case 'accounts-autopay-suspended': {
      const createdAts = await fetchPastDueMemberCreatedAts(organizationId);
      return buckets.map(b => ({ day: b.label, value: countPastDueAsOf(createdAts, b.end) }));
    }
    case 'amount-due':
    case 'payments-last-30-days':
      return mapSum(await groupedSumByBucket(organizationId, ['paid'], 'day', rangeStart, rangeEnd));
    case 'past-due':
    case 'failed-payments':
      return mapSum(await groupedSumByBucket(organizationId, ['declined'], 'day', rangeStart, rangeEnd));
    case 'payments-pending':
      return mapSum(await groupedSumByBucket(organizationId, ['pending', 'processing'], 'day', rangeStart, rangeEnd));
    case 'income-per-student': {
      const [incomeMap, memberRows] = await Promise.all([
        groupedSumByBucket(organizationId, ['paid'], 'day', rangeStart, rangeEnd),
        fetchMemberAsOfRows(organizationId),
      ]);
      return buckets.map((b) => {
        const income = incomeMap.get(bucketKey(b.start)) ?? 0;
        const members = countMembersAsOf(memberRows, b.end) ?? 1;
        return { day: b.label, value: members > 0 ? Math.round((income / members) * 100) / 100 : 0 };
      });
    }
    case 'expiring-credit-cards':
    default:
      return buckets.map(b => ({ day: b.label, value: 0 }));
  }
}

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

export async function getReportInsights(
  organizationId: string,
  reportType: string,
): Promise<string[]> {
  // These three reads are independent — run them together instead of serially.
  const [stats, [studentsResult], [totalMembersResult]] = await Promise.all([
    getFinancialStats(organizationId),
    db
      .select({ count: count() })
      .from(memberSchema)
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        inArray(memberSchema.status, ['active', 'trial']),
      )),
    db
      .select({ count: count() })
      .from(memberSchema)
      .where(eq(memberSchema.organizationId, organizationId)),
  ]);
  const totalStudents = studentsResult?.count ?? 0;
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
      // Paid-count and by-method breakdown are independent — run together.
      const [[paidCountResult], methodCounts] = await Promise.all([
        db
          .select({ count: count() })
          .from(transactionSchema)
          .where(and(
            eq(transactionSchema.organizationId, organizationId),
            eq(transactionSchema.status, 'paid'),
            gte(transactionSchema.createdAt, thirtyDaysAgo),
          )),
        db
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
          .orderBy(sql`count(*) DESC`),
      ]);
      const paidCount = paidCountResult?.count ?? 0;
      const avgTx = paidCount > 0 ? stats.paymentsLast30Days / paidCount : 0;

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

  // ONE query: fetch every past_due member's createdAt, then count as-of each
  // bucket end in JS (replaces the per-bucket `pastDueCountAt` fan-out).
  const createdAts = await fetchPastDueMemberCreatedAts(organizationId);

  const monthly: MonthlyDataPoint[] = monthlyDates.map(d => ({
    month: MONTH_NAMES[d.month]!,
    value: countPastDueAsOf(createdAts, d.endOfMonth),
    previousYear: countPastDueAsOf(createdAts, d.endOfMonthPrev),
  }));

  const yearly: YearlyDataPoint[] = yearlyDates.map(d => ({
    year: String(d.year),
    value: countPastDueAsOf(createdAts, d.endOfYear),
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

  // Each series → ONE grouped date_trunc query (was one query per bucket).
  // For the current-year months, the whole calendar year is queried in one
  // shot; the `currentMonthOverride` month is simply overwritten afterwards
  // (querying it too is harmless — the mapped value is replaced).
  const currentYearStart = monthlyDates[0]!.startOfMonth;
  const currentYearEnd = monthlyDates[11]!.endOfMonth;
  const prevYearStart = monthlyDates[0]!.startOfMonthPrev;
  const prevYearEnd = monthlyDates[11]!.endOfMonthPrev;
  const yearlyStart = yearlyDates[0]!.startOfYear;
  const yearlyEnd = yearlyDates[4]!.endOfYear;

  const [currentMap, prevMap, yearlyMap] = await Promise.all([
    groupedSumByBucket(organizationId, [status], 'month', currentYearStart, currentYearEnd),
    groupedSumByBucket(organizationId, [status], 'month', prevYearStart, prevYearEnd),
    groupedSumByBucket(organizationId, [status], 'year', yearlyStart, yearlyEnd),
  ]);

  const monthly: MonthlyDataPoint[] = monthlyDates.map((d) => {
    let currentValue: number;
    if (currentMonthOverride !== undefined && d.month === currentMonth) {
      currentValue = currentMonthOverride;
    } else {
      currentValue = currentMap.get(bucketKey(d.startOfMonth)) ?? 0;
    }
    return {
      month: MONTH_NAMES[d.month]!,
      value: Math.abs(currentValue),
      previousYear: Math.abs(prevMap.get(bucketKey(d.startOfMonthPrev)) ?? 0),
    };
  });

  const yearly: YearlyDataPoint[] = yearlyDates.map(d => ({
    year: String(d.year),
    value: Math.abs(yearlyMap.get(bucketKey(d.startOfYear)) ?? 0),
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

  const currentYearStart = monthlyDates[0]!.startOfMonth;
  const currentYearEnd = monthlyDates[11]!.endOfMonth;
  const prevYearStart = monthlyDates[0]!.startOfMonthPrev;
  const prevYearEnd = monthlyDates[11]!.endOfMonthPrev;
  const yearlyStart = yearlyDates[0]!.startOfYear;
  const yearlyEnd = yearlyDates[4]!.endOfYear;

  const [currentMap, prevMap, yearlyMap] = await Promise.all([
    groupedSumByBucket(organizationId, ['pending', 'processing'], 'month', currentYearStart, currentYearEnd),
    groupedSumByBucket(organizationId, ['pending', 'processing'], 'month', prevYearStart, prevYearEnd),
    groupedSumByBucket(organizationId, ['pending', 'processing'], 'year', yearlyStart, yearlyEnd),
  ]);

  const monthly: MonthlyDataPoint[] = monthlyDates.map(d => ({
    month: MONTH_NAMES[d.month]!,
    value: Number(currentMap.get(bucketKey(d.startOfMonth)) ?? 0),
    previousYear: Number(prevMap.get(bucketKey(d.startOfMonthPrev)) ?? 0),
  }));

  const yearly: YearlyDataPoint[] = yearlyDates.map(d => ({
    year: String(d.year),
    value: Number(yearlyMap.get(bucketKey(d.startOfYear)) ?? 0),
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

  const currentYearStart = monthlyDates[0]!.startOfMonth;
  const currentYearEnd = monthlyDates[11]!.endOfMonth;
  const prevYearStart = monthlyDates[0]!.startOfMonthPrev;
  const prevYearEnd = monthlyDates[11]!.endOfMonthPrev;
  const yearlyStart = yearlyDates[0]!.startOfYear;
  const yearlyEnd = yearlyDates[4]!.endOfYear;

  // Income series → grouped date_trunc sums. Member counts → fetch-once + JS.
  const [incomeMonthMap, incomePrevMonthMap, incomeYearMap, memberRows] = await Promise.all([
    groupedSumByBucket(organizationId, ['paid'], 'month', currentYearStart, currentYearEnd),
    groupedSumByBucket(organizationId, ['paid'], 'month', prevYearStart, prevYearEnd),
    groupedSumByBucket(organizationId, ['paid'], 'year', yearlyStart, yearlyEnd),
    fetchMemberAsOfRows(organizationId),
  ]);

  const monthly: MonthlyDataPoint[] = monthlyDates.map((d) => {
    const income = Number(incomeMonthMap.get(bucketKey(d.startOfMonth)) ?? 0);
    const members = countMembersAsOf(memberRows, d.endOfMonth) ?? 1;
    const prevIncome = Number(incomePrevMonthMap.get(bucketKey(d.startOfMonthPrev)) ?? 0);
    const prevMembers = countMembersAsOf(memberRows, d.endOfMonthPrev) ?? 1;
    return {
      month: MONTH_NAMES[d.month]!,
      value: Math.round((members > 0 ? income / members : 0) * 100) / 100,
      previousYear: Math.round((prevMembers > 0 ? prevIncome / prevMembers : 0) * 100) / 100,
    };
  });

  const yearly: YearlyDataPoint[] = yearlyDates.map((d) => {
    const income = Number(incomeYearMap.get(bucketKey(d.startOfYear)) ?? 0);
    const members = countMembersAsOf(memberRows, d.endOfYear) ?? 1;
    return {
      year: String(d.year),
      value: members > 0 ? Math.round((income / members) * 100) / 100 : 0,
    };
  });

  return { monthly, yearly };
}
