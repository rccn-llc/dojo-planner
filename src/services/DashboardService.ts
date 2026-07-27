import { and, count, eq, gte, inArray, lte, ne, sql, sum } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { memberMembershipSchema, memberSchema, membershipPlanSchema, transactionSchema } from '@/models/Schema';

export type MembershipStats = {
  totalPeople: number;
  totalStudents: number;
  totalFamilies: number;
  newStudentsLast30Days: number;
  autopayOn: number;
  autopayOff: number;
  membershipsOnHold: number;
  cancelledLast30Days: number;
  membershipNetChange30Days: number;
};

export type FinancialStats = {
  autopaysSuspended: number;
  expiringCreditCards60Days: number;
  amountDueNext30Days: number;
  pastDueTotal: number;
  paymentsLast30Days: number;
  paymentsPending: number;
  failedPaymentsLast30Days: number;
  incomePerStudent30Days: number;
};

type MonthlyChartPoint = {
  month: string;
  value: number;
  previousYearValue: number | null;
};

type YearlyChartPoint = {
  year: string;
  value: number;
};

export type ChartData = {
  monthly: MonthlyChartPoint[];
  yearly: YearlyChartPoint[];
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// =============================================================================
// SHARED "MEMBERS AS OF" HELPER (N+1 consolidation)
//
// Both `getMemberAverageChartData` (here) and `getIncomePerStudentChartData`
// (ReportsService) count, as of a point in time, members that existed and were
// not yet cancelled at that instant. This is a cumulative snapshot — GROUP BY
// does not apply — so instead of one query per bucket we fetch the minimal
// columns ONCE per org and compute every bucket in JS.
//
// Predicate (byte-identical to the original per-bucket SQL
//   `WHERE created_at <= at AND (status != 'cancelled' OR updated_at > at)`):
//   createdAt <= at AND (status !== 'cancelled' OR updatedAt > at)
// =============================================================================

export type MemberAsOfRow = {
  createdAt: Date;
  status: string;
  updatedAt: Date;
};

// Fetch the minimal columns for every member in an org (one query).
export async function fetchMemberAsOfRows(organizationId: string): Promise<MemberAsOfRow[]> {
  const rows = await db
    .select({
      createdAt: memberSchema.createdAt,
      status: memberSchema.status,
      updatedAt: memberSchema.updatedAt,
    })
    .from(memberSchema)
    .where(eq(memberSchema.organizationId, organizationId));
  return rows.map(r => ({
    createdAt: r.createdAt as Date,
    status: r.status as string,
    updatedAt: r.updatedAt as Date,
  }));
}

/**
 * Pure counter for the "members as of a point in time" series: counts members
 * whose createdAt <= `at` and that were not yet cancelled at `at`. Exported for
 * direct unit testing. Mirrors the original `memberCountAt(at)` query.
 */
export function countMembersAsOf(rows: MemberAsOfRow[], at: Date): number {
  const atMs = at.getTime();
  let n = 0;
  for (const row of rows) {
    if (row.createdAt.getTime() <= atMs && (row.status !== 'cancelled' || row.updatedAt.getTime() > atMs)) {
      n++;
    }
  }
  return n;
}

export async function getMembershipStats(organizationId: string): Promise<MembershipStats> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    [totalResult],
    [studentsResult],
    [newStudentsResult],
    [autopayOnResult],
    [autopayOffResult],
    [onHoldResult],
    [cancelledResult],
  ] = await Promise.all([
    // Total people
    db.select({ count: count() })
      .from(memberSchema)
      .where(eq(memberSchema.organizationId, organizationId)),

    // Total students (active or trial)
    db.select({ count: count() })
      .from(memberSchema)
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        inArray(memberSchema.status, ['active', 'trial']),
      )),

    // New students in last 30 days
    db.select({ count: count() })
      .from(memberSchema)
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        gte(memberSchema.createdAt, thirtyDaysAgo),
      )),

    // Autopay on (active memberships with billingType = 'autopay')
    db.select({ count: count() })
      .from(memberMembershipSchema)
      .innerJoin(memberSchema, eq(memberMembershipSchema.memberId, memberSchema.id))
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        eq(memberMembershipSchema.status, 'active'),
        eq(memberMembershipSchema.billingType, 'autopay'),
      )),

    // Autopay off (active memberships with billingType != 'autopay')
    db.select({ count: count() })
      .from(memberMembershipSchema)
      .innerJoin(memberSchema, eq(memberMembershipSchema.memberId, memberSchema.id))
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        eq(memberMembershipSchema.status, 'active'),
        ne(memberMembershipSchema.billingType, 'autopay'),
      )),

    // On hold
    db.select({ count: count() })
      .from(memberSchema)
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        eq(memberSchema.status, 'hold'),
      )),

    // Cancelled in last 30 days
    db.select({ count: count() })
      .from(memberSchema)
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        eq(memberSchema.status, 'cancelled'),
        gte(memberSchema.updatedAt, thirtyDaysAgo),
      )),
  ]);

  const totalPeople = totalResult?.count ?? 0;
  const totalStudents = studentsResult?.count ?? 0;
  const newStudentsLast30Days = newStudentsResult?.count ?? 0;
  const autopayOn = autopayOnResult?.count ?? 0;
  const autopayOff = autopayOffResult?.count ?? 0;
  const membershipsOnHold = onHoldResult?.count ?? 0;
  const cancelledLast30Days = cancelledResult?.count ?? 0;

  return {
    totalPeople,
    totalStudents,
    totalFamilies: totalStudents, // Placeholder until family_member is populated
    newStudentsLast30Days,
    autopayOn,
    autopayOff,
    membershipsOnHold,
    cancelledLast30Days,
    membershipNetChange30Days: newStudentsLast30Days - cancelledLast30Days,
  };
}

export async function getFinancialStats(organizationId: string): Promise<FinancialStats> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    [suspendedResult],
    [amountDueResult],
    [pastDueResult],
    [paymentsResult],
    [pendingResult],
    [failedResult],
    [studentsResult],
  ] = await Promise.all([
    // Autopays suspended (past_due members with autopay memberships)
    db.select({ count: count() })
      .from(memberSchema)
      .innerJoin(memberMembershipSchema, eq(memberMembershipSchema.memberId, memberSchema.id))
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        eq(memberSchema.status, 'past_due'),
        eq(memberMembershipSchema.billingType, 'autopay'),
      )),

    // Amount due next 30 days (SUM of active autopay membership plan prices) —
    // aggregate in SQL rather than fetching one row per membership and summing
    // in JS.
    db.select({ total: sum(membershipPlanSchema.price) })
      .from(memberMembershipSchema)
      .innerJoin(memberSchema, eq(memberMembershipSchema.memberId, memberSchema.id))
      .innerJoin(membershipPlanSchema, eq(memberMembershipSchema.membershipPlanId, membershipPlanSchema.id))
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        eq(memberMembershipSchema.status, 'active'),
        eq(memberMembershipSchema.billingType, 'autopay'),
      )),

    // Past due total (sum of declined transactions)
    db.select({ total: sum(transactionSchema.amount) })
      .from(transactionSchema)
      .where(and(
        eq(transactionSchema.organizationId, organizationId),
        eq(transactionSchema.status, 'declined'),
      )),

    // Payments last 30 days
    db.select({ total: sum(transactionSchema.amount) })
      .from(transactionSchema)
      .where(and(
        eq(transactionSchema.organizationId, organizationId),
        eq(transactionSchema.status, 'paid'),
        gte(transactionSchema.createdAt, thirtyDaysAgo),
      )),

    // Payments pending
    db.select({ total: sum(transactionSchema.amount) })
      .from(transactionSchema)
      .where(and(
        eq(transactionSchema.organizationId, organizationId),
        inArray(transactionSchema.status, ['pending', 'processing']),
      )),

    // Failed payments last 30 days
    db.select({ total: sum(transactionSchema.amount) })
      .from(transactionSchema)
      .where(and(
        eq(transactionSchema.organizationId, organizationId),
        eq(transactionSchema.status, 'declined'),
        gte(transactionSchema.createdAt, thirtyDaysAgo),
      )),

    // Income per student (active student count)
    db.select({ count: count() })
      .from(memberSchema)
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        inArray(memberSchema.status, ['active', 'trial']),
      )),
  ]);

  const autopaysSuspended = suspendedResult?.count ?? 0;
  const amountDueNext30Days = Number(amountDueResult?.total ?? 0);
  const pastDueTotal = Number(pastDueResult?.total ?? 0);
  const paymentsLast30Days = Number(paymentsResult?.total ?? 0);
  const paymentsPending = Number(pendingResult?.total ?? 0);
  const failedPaymentsLast30Days = Number(failedResult?.total ?? 0);
  const totalStudents = studentsResult?.count ?? 1;
  const incomePerStudent30Days = totalStudents > 0 ? paymentsLast30Days / totalStudents : 0;

  return {
    autopaysSuspended,
    expiringCreditCards60Days: 0, // Schema has no card expiry field
    amountDueNext30Days,
    pastDueTotal,
    paymentsLast30Days,
    paymentsPending,
    failedPaymentsLast30Days,
    incomePerStudent30Days,
  };
}

export async function getMemberAverageChartData(organizationId: string): Promise<ChartData> {
  const currentYear = new Date().getFullYear();

  // Build all date points for monthly (current + previous year) and yearly queries
  const monthlyDates = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    endOfMonth: new Date(currentYear, m + 1, 0, 23, 59, 59),
    endOfMonthPrev: new Date(currentYear - 1, m + 1, 0, 23, 59, 59),
  }));

  const yearlyDates = Array.from({ length: 5 }, (_, i) => ({
    year: currentYear - 4 + i,
    endOfYear: new Date(currentYear - 4 + i, 11, 31, 23, 59, 59),
  }));

  // ONE query: fetch all members' minimal columns, then count as-of each bucket
  // in JS (replaces the per-bucket `memberCountAt` fan-out — 29 → 1).
  const rows = await fetchMemberAsOfRows(organizationId);

  const monthly: MonthlyChartPoint[] = monthlyDates.map(d => ({
    month: MONTH_NAMES[d.month]!,
    value: countMembersAsOf(rows, d.endOfMonth),
    previousYearValue: countMembersAsOf(rows, d.endOfMonthPrev),
  }));

  const yearly: YearlyChartPoint[] = yearlyDates.map(d => ({
    year: String(d.year),
    value: countMembersAsOf(rows, d.endOfYear),
  }));

  return { monthly, yearly };
}

export async function getEarningsChartData(organizationId: string): Promise<ChartData> {
  const currentYear = new Date().getFullYear();

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

  // Each series → ONE grouped date_trunc sum query (was one query per bucket).
  const currentYearStart = monthlyDates[0]!.startOfMonth;
  const currentYearEnd = monthlyDates[11]!.endOfMonth;
  const prevYearStart = monthlyDates[0]!.startOfMonthPrev;
  const prevYearEnd = monthlyDates[11]!.endOfMonthPrev;
  const yearlyStart = yearlyDates[0]!.startOfYear;
  const yearlyEnd = yearlyDates[4]!.endOfYear;

  const [currentMap, prevMap, yearlyMap] = await Promise.all([
    groupedPaidSumByBucket(organizationId, 'month', currentYearStart, currentYearEnd),
    groupedPaidSumByBucket(organizationId, 'month', prevYearStart, prevYearEnd),
    groupedPaidSumByBucket(organizationId, 'year', yearlyStart, yearlyEnd),
  ]);

  const monthly: MonthlyChartPoint[] = monthlyDates.map(d => ({
    month: MONTH_NAMES[d.month]!,
    value: Number(currentMap.get(bucketKey(d.startOfMonth)) ?? 0),
    previousYearValue: Number(prevMap.get(bucketKey(d.startOfMonthPrev)) ?? 0),
  }));

  const yearly: YearlyChartPoint[] = yearlyDates.map(d => ({
    year: String(d.year),
    value: Number(yearlyMap.get(bucketKey(d.startOfYear)) ?? 0),
  }));

  return { monthly, yearly };
}

// -----------------------------------------------------------------------------
// Grouped paid-transaction sum by calendar bucket (N+1 consolidation).
//
// Mirrors the range-sum shape used by ReportsService: ONE `date_trunc` GROUP BY
// query per series, mapped back into calendar buckets in JS (missing → 0). The
// `withinBucketWindow` predicate reproduces the originals' per-bucket upper
// bound so sub-second gap rows are dropped exactly as before (byte-identical).
// -----------------------------------------------------------------------------

type EarningsTruncPeriod = 'month' | 'year';

function bucketKey(value: unknown): string {
  if (value instanceof Date) {
    return value.getTime().toString();
  }
  return new Date(value as string).getTime().toString();
}

// `date_trunc`'s first argument must be a literal in the SQL text (Postgres/PGlite
// reject a bound parameter there). `period` is a fixed internal enum, so we inline
// it as a raw quoted literal via an allowlist switch.
function truncField(period: EarningsTruncPeriod) {
  switch (period) {
    case 'month': return sql.raw(`'month'`);
    case 'year': return sql.raw(`'year'`);
    default: throw new Error(`Unsupported trunc period: ${period as string}`);
  }
}

async function groupedPaidSumByBucket(
  organizationId: string,
  period: EarningsTruncPeriod,
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const oneUnit = sql.raw(`interval '1 ${period}'`);
  const truncatedCreatedAt = sql`date_trunc(${truncField(period)}, ${transactionSchema.createdAt})`;
  const rows = await db
    .select({
      bucket: sql<Date>`${truncatedCreatedAt}`,
      total: sql<string | number | null>`COALESCE(SUM(${transactionSchema.amount}), 0)`,
    })
    .from(transactionSchema)
    .where(and(
      eq(transactionSchema.organizationId, organizationId),
      eq(transactionSchema.status, 'paid'),
      gte(transactionSchema.createdAt, start),
      lte(transactionSchema.createdAt, end),
      sql`${transactionSchema.createdAt} <= ${truncatedCreatedAt} + ${oneUnit} - interval '1 second'`,
    ))
    .groupBy(sql`${truncatedCreatedAt}`);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(bucketKey(row.bucket), Number(row.total ?? 0));
  }
  return map;
}
