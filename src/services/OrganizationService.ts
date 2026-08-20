import type { IStripeSubscription } from '@/types/Subscription';
import { eq } from 'drizzle-orm';
import { controlOrganizationDb } from '@/libs/ControlPlaneReads';
import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { recordExternalRef, REF_TYPE } from '@/services/TenantExternalRefService';

// The `stripe*` columns on `organization` are CONTROL-plane data: they describe
// the org's SaaS billing relationship with the platform, not any tenant's own
// records. They are read from surfaces that have no tenant scope — server pages,
// the Stripe webhook, and the public subscription endpoint — and must keep
// working even when an org's own database is unreachable or unprovisioned.
// Hence `controlOrganizationDb()` rather than the tenant-scoped `db`.

export const getStripeCustomerId = (orgId: string) => {
  return controlOrganizationDb().query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: { stripeCustomerId: true },
  });
};

export const upsertStripeCustomerId = async (
  stripeCustomerId: string,
  orgId: string,
) => {
  await controlOrganizationDb()
    .insert(organizationSchema)
    .values({ id: orgId, stripeCustomerId })
    .onConflictDoUpdate({
      target: organizationSchema.id,
      set: {
        stripeCustomerId,
      },
    });

  // Route Stripe webhooks for this customer back to the org once each org has
  // its own database. Best-effort — never fail the upsert over bookkeeping.
  await recordExternalRef(REF_TYPE.STRIPE_CUSTOMER, stripeCustomerId, orgId);
};

export const getStripeSubscription = (orgId: string) => {
  return controlOrganizationDb().query.organizationSchema.findFirst({
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
  return controlOrganizationDb()
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
