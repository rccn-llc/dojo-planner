import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { eventRegistrationSchema, eventSchema, memberMembershipSchema, memberSchema, membershipPlanSchema, transactionSchema } from '@/models/Schema';

export type TransactionData = {
  id: string;
  memberId: string;
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
};

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
    })
    .from(transactionSchema)
    .innerJoin(memberSchema, eq(transactionSchema.memberId, memberSchema.id))
    .where(and(...conditions))
    .orderBy(desc(transactionSchema.createdAt))
    .limit(options?.limit ?? 500)
    .offset(options?.offset ?? 0);

  return rows;
}

export type TransactionDetailData = {
  id: string;
  memberId: string;
  memberFirstName: string | null;
  memberLastName: string | null;
  memberType: string | null;
  transactionType: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  description: string | null;
  iqproTransactionId: string | null;
  processedAt: Date | null;
  createdAt: Date;
  // Membership details (nullable)
  membershipPlanName: string | null;
  membershipPlanFrequency: string | null;
  membershipPlanPrice: number | null;
  membershipBillingType: string | null;
  membershipStartDate: Date | null;
  membershipNextPaymentDate: Date | null;
  // Event details (nullable)
  eventName: string | null;
  eventType: string | null;
};

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
      iqproTransactionId: transactionSchema.iqproTransactionId,
      processedAt: transactionSchema.processedAt,
      createdAt: transactionSchema.createdAt,
      membershipPlanName: membershipPlanSchema.name,
      membershipPlanFrequency: membershipPlanSchema.frequency,
      membershipPlanPrice: membershipPlanSchema.price,
      membershipBillingType: memberMembershipSchema.billingType,
      membershipStartDate: memberMembershipSchema.startDate,
      membershipNextPaymentDate: memberMembershipSchema.nextPaymentDate,
      eventName: eventSchema.name,
      eventType: eventSchema.eventType,
    })
    .from(transactionSchema)
    .innerJoin(memberSchema, eq(transactionSchema.memberId, memberSchema.id))
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
