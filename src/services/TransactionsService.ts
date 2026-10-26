import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { eventRegistrationSchema, eventSchema, memberMembershipSchema, memberSchema, membershipPlanSchema, transactionSchema } from '@/models/Schema';

export type TransactionData = {
  id: string;
  memberId: string | null;
  memberFirstName: string | null;
  memberLastName: string | null;
  transactionType: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  description: string | null;
  processedAt: Date | null;
  createdAt: Date;
} & RecurringState;

/**
 * Failed-payment state of a row, computed in SQL so the list and the member
 * billing history agree and need no per-row round-trips.
 */
export type RecurringState = {
  memberMembershipId: string | null;
  failureReason: string | null;
  /** 'app' | 'webhook_recurring' | 'retry'. */
  source: string;
  retryOfTransactionId: string | null;
  /** A declined row that something later collected (retry, auto-retry, member paid). */
  resolved: boolean;
  /** A declined row with a NEWER unresolved decline for the same membership — retry that one. */
  superseded: boolean;
  /**
   * 1-based attempt within the billing cycle for an IQPro-style automatic
   * retry sequence; null otherwise. Only rows with a provider transaction id
   * count: every IQPro attempt is a TRANSACTION webhook with its own id,
   * whereas a Square failure is recorded from an INVOICE event with none —
   * and Square does not auto-retry, so "attempt n of 3" would be false there.
   */
  attemptNumber: number | null;
};

const RETRYABLE_TYPES_SQL = sql.raw(`('membership_payment','hold_fee')`);

/**
 * Columns for `RecurringState`. Correlated subqueries reference the outer
 * `transaction` row; `t2`/`t3` are the inner aliases.
 */
export const recurringStateColumns = {
  memberMembershipId: transactionSchema.memberMembershipId,
  failureReason: transactionSchema.failureReason,
  source: transactionSchema.source,
  retryOfTransactionId: transactionSchema.retryOfTransactionId,
  resolved: sql<boolean>`(${transactionSchema.status} = 'declined' AND ${transactionSchema.memberMembershipId} IS NOT NULL AND EXISTS (
    SELECT 1 FROM "transaction" t2
    WHERE t2.member_membership_id = ${transactionSchema.memberMembershipId}
      AND t2.status = 'paid'
      AND t2.created_at > ${transactionSchema.createdAt}
  ))`.mapWith(Boolean),
  superseded: sql<boolean>`(${transactionSchema.status} = 'declined' AND ${transactionSchema.memberMembershipId} IS NOT NULL AND EXISTS (
    SELECT 1 FROM "transaction" t2
    WHERE t2.member_membership_id = ${transactionSchema.memberMembershipId}
      AND t2.status = 'declined'
      AND t2.transaction_type IN ${RETRYABLE_TYPES_SQL}
      AND t2.created_at > ${transactionSchema.createdAt}
  ))`.mapWith(Boolean),
  attemptNumber: sql<number | null>`CASE WHEN ${transactionSchema.status} = 'declined' AND ${transactionSchema.source} = 'webhook_recurring' AND ${transactionSchema.providerTransactionId} IS NOT NULL THEN (
    SELECT count(*)::int FROM "transaction" t2
    WHERE t2.member_membership_id = ${transactionSchema.memberMembershipId}
      AND t2.status = 'declined'
      AND t2.source = 'webhook_recurring'
      AND t2.provider_transaction_id IS NOT NULL
      AND t2.created_at <= ${transactionSchema.createdAt}
      AND t2.created_at > COALESCE((
        SELECT max(t3.created_at) FROM "transaction" t3
        WHERE t3.member_membership_id = ${transactionSchema.memberMembershipId}
          AND t3.status = 'paid'
          AND t3.created_at < ${transactionSchema.createdAt}
      ), 'epoch'::timestamp)
  ) END`.mapWith(v => (v === null || v === undefined ? null : Number(v))),
};

// Default page size for the org-wide transactions list when the caller doesn't
// specify one. Bounds payload/heap for orgs with large histories; the list UI
// paginates client-side over this slice.
const DEFAULT_TRANSACTION_LIMIT = 500;

export type TransactionListOptions = {
  limit?: number;
  offset?: number;
  status?: string;
  transactionType?: string;
};

export async function getOrganizationTransactions(
  organizationId: string,
  options?: TransactionListOptions,
): Promise<TransactionData[]> {
  const conditions = [eq(transactionSchema.organizationId, organizationId)];

  if (options?.status) {
    conditions.push(eq(transactionSchema.status, options.status));
  }
  if (options?.transactionType) {
    conditions.push(eq(transactionSchema.transactionType, options.transactionType));
  }

  const rows = await db
    .select({
      id: transactionSchema.id,
      memberId: transactionSchema.memberId,
      memberFirstName: memberSchema.firstName,
      memberLastName: memberSchema.lastName,
      transactionType: transactionSchema.transactionType,
      amount: transactionSchema.amount,
      currency: transactionSchema.currency,
      status: transactionSchema.status,
      paymentMethod: transactionSchema.paymentMethod,
      description: transactionSchema.description,
      processedAt: transactionSchema.processedAt,
      createdAt: transactionSchema.createdAt,
      ...recurringStateColumns,
    })
    .from(transactionSchema)
    // leftJoin (not inner): a guest/non-member transaction has a null member_id
    // and no member row — an inner join would silently drop it from the list.
    .leftJoin(memberSchema, eq(transactionSchema.memberId, memberSchema.id))
    .where(and(...conditions))
    .orderBy(desc(transactionSchema.createdAt))
    .limit(options?.limit ?? DEFAULT_TRANSACTION_LIMIT)
    .offset(options?.offset ?? 0);

  return rows;
}

export type TransactionDetailData = {
  id: string;
  memberId: string | null;
  memberFirstName: string | null;
  memberLastName: string | null;
  memberType: string | null;
  transactionType: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  description: string | null;
  providerTransactionId: string | null;
  processedAt: Date | null;
  createdAt: Date;
  // Membership details (nullable)
  membershipPlanName: string | null;
  membershipPlanFrequency: string | null;
  membershipPlanPrice: number | null;
  membershipBillingType: string | null;
  membershipStartDate: Date | null;
  membershipNextPaymentDate: Date | null;
  membershipStatus: string | null;
  membershipDeclineCount: number | null;
  // Event details (nullable)
  eventName: string | null;
  eventType: string | null;
} & RecurringState;

export async function getTransactionById(
  transactionId: string,
  organizationId: string,
): Promise<TransactionDetailData | null> {
  const rows = await db
    .select({
      id: transactionSchema.id,
      memberId: transactionSchema.memberId,
      memberFirstName: memberSchema.firstName,
      memberLastName: memberSchema.lastName,
      memberType: memberSchema.memberType,
      transactionType: transactionSchema.transactionType,
      amount: transactionSchema.amount,
      currency: transactionSchema.currency,
      status: transactionSchema.status,
      paymentMethod: transactionSchema.paymentMethod,
      description: transactionSchema.description,
      providerTransactionId: transactionSchema.providerTransactionId,
      processedAt: transactionSchema.processedAt,
      createdAt: transactionSchema.createdAt,
      membershipPlanName: membershipPlanSchema.name,
      membershipPlanFrequency: membershipPlanSchema.frequency,
      membershipPlanPrice: membershipPlanSchema.price,
      membershipBillingType: memberMembershipSchema.billingType,
      membershipStartDate: memberMembershipSchema.startDate,
      membershipNextPaymentDate: memberMembershipSchema.nextPaymentDate,
      membershipStatus: memberMembershipSchema.status,
      membershipDeclineCount: memberMembershipSchema.declineCount,
      eventName: eventSchema.name,
      eventType: eventSchema.eventType,
      ...recurringStateColumns,
    })
    .from(transactionSchema)
    // leftJoin (not inner): a guest/non-member transaction has a null member_id
    // and no member row — an inner join would 404 the detail lookup.
    .leftJoin(memberSchema, eq(transactionSchema.memberId, memberSchema.id))
    .leftJoin(memberMembershipSchema, eq(transactionSchema.memberMembershipId, memberMembershipSchema.id))
    .leftJoin(membershipPlanSchema, eq(memberMembershipSchema.membershipPlanId, membershipPlanSchema.id))
    .leftJoin(eventRegistrationSchema, eq(transactionSchema.eventRegistrationId, eventRegistrationSchema.id))
    .leftJoin(eventSchema, eq(eventRegistrationSchema.eventId, eventSchema.id))
    .where(and(
      eq(transactionSchema.id, transactionId),
      eq(transactionSchema.organizationId, organizationId),
    ))
    .limit(1);

  return rows[0] ?? null;
}
