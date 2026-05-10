import type { IStripeSubscription } from '@/types/Subscription';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

export const getStripeCustomerId = (orgId: string) => {
  return db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: { stripeCustomerId: true },
  });
};

export const upsertStripeCustomerId = (
  stripeCustomerId: string,
  orgId: string,
) => {
  return db
    .insert(organizationSchema)
    .values({ id: orgId, stripeCustomerId })
    .onConflictDoUpdate({
      target: organizationSchema.id,
      set: {
        stripeCustomerId,
      },
    });
};

export const getStripeSubscription = (orgId: string) => {
  return db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: {
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeSubscriptionPriceId: true,
      stripeSubscriptionStatus: true,
      stripeSubscriptionCurrentPeriodEnd: true,
    },
  });
};

export const updateStripeSubscription = (
  customerId: string,
  subscription: IStripeSubscription,
) => {
  return db
    .update(organizationSchema)
    .set({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      stripeSubscriptionPriceId: subscription.stripeSubscriptionPriceId,
      stripeSubscriptionStatus: subscription.stripeSubscriptionStatus,
      stripeSubscriptionCurrentPeriodEnd:
        subscription.stripeSubscriptionCurrentPeriodEnd,
    })
    .where(eq(organizationSchema.stripeCustomerId, customerId));
};

export type OrganizationLocation = {
  address: string | null;
  phone: string | null;
  email: string | null;
  taxRate: number;
};

export const getOrganizationLocation = async (
  orgId: string,
): Promise<OrganizationLocation> => {
  const row = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: {
      locationAddress: true,
      locationPhone: true,
      locationEmail: true,
      locationTaxRate: true,
    },
  });
  return {
    address: row?.locationAddress ?? null,
    phone: row?.locationPhone ?? null,
    email: row?.locationEmail ?? null,
    taxRate: row?.locationTaxRate ?? 0,
  };
};

export const updateOrganizationLocation = async (
  orgId: string,
  input: { address: string; phone: string; email: string; taxRate: number },
): Promise<OrganizationLocation> => {
  await db
    .insert(organizationSchema)
    .values({
      id: orgId,
      locationAddress: input.address,
      locationPhone: input.phone,
      locationEmail: input.email,
      locationTaxRate: input.taxRate,
    })
    .onConflictDoUpdate({
      target: organizationSchema.id,
      set: {
        locationAddress: input.address,
        locationPhone: input.phone,
        locationEmail: input.email,
        locationTaxRate: input.taxRate,
      },
    });
  return {
    address: input.address,
    phone: input.phone,
    email: input.email,
    taxRate: input.taxRate,
  };
};

export const getOrganizationTaxRate = async (orgId: string): Promise<number> => {
  const row = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: { locationTaxRate: true },
  });
  return row?.locationTaxRate ?? 0;
};
