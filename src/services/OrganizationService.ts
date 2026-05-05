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
  name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export const getOrganizationLocation = async (
  orgId: string,
): Promise<OrganizationLocation> => {
  const row = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: {
      locationName: true,
      locationAddress: true,
      locationPhone: true,
      locationEmail: true,
    },
  });
  return {
    name: row?.locationName ?? null,
    address: row?.locationAddress ?? null,
    phone: row?.locationPhone ?? null,
    email: row?.locationEmail ?? null,
  };
};

export const updateOrganizationLocation = async (
  orgId: string,
  input: { name: string; address: string; phone: string; email: string },
): Promise<OrganizationLocation> => {
  await db
    .insert(organizationSchema)
    .values({
      id: orgId,
      locationName: input.name,
      locationAddress: input.address,
      locationPhone: input.phone,
      locationEmail: input.email,
    })
    .onConflictDoUpdate({
      target: organizationSchema.id,
      set: {
        locationName: input.name,
        locationAddress: input.address,
        locationPhone: input.phone,
        locationEmail: input.email,
      },
    });
  return {
    name: input.name,
    address: input.address,
    phone: input.phone,
    email: input.email,
  };
};
