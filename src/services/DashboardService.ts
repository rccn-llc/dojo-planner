import { and, count, eq, gte, inArray, ne, sql, sum } from 'drizzle-orm';
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
    amountDueRows,
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

    // Amount due next 30 days (sum of active autopay membership plan prices)
    db.select({ price: membershipPlanSchema.price })
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
  const amountDueNext30Days = amountDueRows.reduce((s, row) => s + (row.price ?? 0), 0);
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

  const memberCountAt = (datePoint: Date) =>
    db.select({ count: count() })
      .from(memberSchema)
      .where(and(
        eq(memberSchema.organizationId, organizationId),
        sql`${memberSchema.createdAt} <= ${datePoint}`,
        sql`(${memberSchema.status} != 'cancelled' OR ${memberSchema.updatedAt} > ${datePoint})`,
      ));

  // Run all queries in parallel
  const [monthlyCurrentResults, monthlyPrevResults, yearlyResults] = await Promise.all([
    Promise.all(monthlyDates.map(d => memberCountAt(d.endOfMonth))),
    Promise.all(monthlyDates.map(d => memberCountAt(d.endOfMonthPrev))),
    Promise.all(yearlyDates.map(d => memberCountAt(d.endOfYear))),
  ]);

  const monthly: MonthlyChartPoint[] = monthlyDates.map((d, i) => ({
    month: MONTH_NAMES[d.month]!,
    value: monthlyCurrentResults[i]![0]?.count ?? 0,
    previousYearValue: monthlyPrevResults[i]![0]?.count ?? 0,
  }));

  const yearly: YearlyChartPoint[] = yearlyDates.map((d, i) => ({
    year: String(d.year),
    value: yearlyResults[i]![0]?.count ?? 0,
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

  const earningsInRange = (start: Date, end: Date) =>
    db.select({ total: sum(transactionSchema.amount) })
      .from(transactionSchema)
      .where(and(
        eq(transactionSchema.organizationId, organizationId),
        eq(transactionSchema.status, 'paid'),
        gte(transactionSchema.createdAt, start),
        sql`${transactionSchema.createdAt} <= ${end}`,
      ));

  const [monthlyCurrentResults, monthlyPrevResults, yearlyResults] = await Promise.all([
    Promise.all(monthlyDates.map(d => earningsInRange(d.startOfMonth, d.endOfMonth))),
    Promise.all(monthlyDates.map(d => earningsInRange(d.startOfMonthPrev, d.endOfMonthPrev))),
    Promise.all(yearlyDates.map(d => earningsInRange(d.startOfYear, d.endOfYear))),
  ]);

  const monthly: MonthlyChartPoint[] = monthlyDates.map((d, i) => ({
    month: MONTH_NAMES[d.month]!,
    value: Number(monthlyCurrentResults[i]![0]?.total ?? 0),
    previousYearValue: Number(monthlyPrevResults[i]![0]?.total ?? 0),
  }));

  const yearly: YearlyChartPoint[] = yearlyDates.map((d, i) => ({
    year: String(d.year),
    value: Number(yearlyResults[i]![0]?.total ?? 0),
  }));

  return { monthly, yearly };
}
