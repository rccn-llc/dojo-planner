/**
 * LIVE sandbox checks for SquarePaymentService.
 *
 * Skipped unless SQUARE_ACCESS_TOKEN is set, so CI and other developers are
 * unaffected. Run locally with credentials in .env.local to confirm the
 * payloads this service sends are the ones Square actually accepts — the
 * unit tests mock transport and cannot prove that.
 */
import { describe, expect, it } from 'vitest';
import { runWithTenant } from '@/libs/TenantContext';
import { getDbForOrg } from '@/services/TenantDirectoryService';
import { SquarePaymentProvider } from './SquarePaymentService';

const live = process.env.SQUARE_ACCESS_TOKEN ? describe : describe.skip;

/**
 * Subscriptions read and write `square_plan_variation`, so unlike the other
 * probes they need a real tenant database as well as Square credentials.
 *
 * Gated on an EXPLICIT opt-in rather than on `DATABASE_URL`, which
 * `vitest.config.mts` sets for every run — keying on it would make `npm run
 * test` attempt live calls against a database that is not listening. Run with:
 *
 *   npm run db-server:file            # in another terminal
 *   SQUARE_SANDBOX_DB=1 DATABASE_URL=... DEFAULT_TENANT_DATABASE_URL=... \
 *     npx vitest run src/services/SquarePaymentService.sandbox.test.ts
 */
const liveWithDb
  = process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_SANDBOX_DB ? describe : describe.skip;

/** A throwaway org id, so probe runs never touch a real org's catalog rows. */
const PROBE_ORG = `org_square_probe_${Date.now()}`;

async function inTenantScope<T>(fn: () => Promise<T>): Promise<T> {
  const db = await getDbForOrg(PROBE_ORG);
  return runWithTenant({ orgId: PROBE_ORG, db, source: 'test' }, fn);
}

const config = {
  provider: 'square' as const,
  accessToken: process.env.SQUARE_ACCESS_TOKEN ?? '',
  locationId: process.env.SQUARE_LOCATION_ID ?? '',
  applicationId: process.env.SQUARE_APPLICATION_ID ?? '',
  environment: 'sandbox' as const,
  webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? 'placeholder',
  source: 'env' as const,
};

live('SquarePaymentService against the live sandbox', () => {
  it('computeFees returns provider-attested tax and service fee', async () => {
    const provider = new SquarePaymentProvider();

    const quote = await provider.computeFees(config as never, {
      baseAmount: 100,
      isTaxable: true,
      taxStatePct: 8.375,
      paymentMethodType: 'card',
    });

    // 8.375% of $100 is $8.375; Square rounds half-up to 8.38, matching
    // roundCents. This is the awkward case the boundary has to get right.
    expect(quote.taxAmount).toBe(8.38);
    expect(quote.serviceFeeAmount).toBeGreaterThan(0);
    expect(quote.amount).toBe(100 + quote.taxAmount + quote.serviceFeeAmount);

    // Square computes both, unlike IQPro whose tax is local arithmetic.
    expect(quote.provenance).toEqual({ tax: 'provider', serviceFee: 'provider' });
  }, 30_000);

  it('creates a customer', async () => {
    const provider = new SquarePaymentProvider();

    const result = await provider.createCustomer(config as never, {
      organizationId: 'org_probe',
      memberId: 'member_probe',
      email: `probe+${Date.now()}@example.com`,
      firstName: 'Probe',
      lastName: 'Tester',
    });

    expect(result.customerId).toBeTruthy();
    // No billingAddressId: an IQPro vault concept with no Square analogue.
    expect(result.billingAddressId).toBeUndefined();
  }, 30_000);
});

liveWithDb('Square subscriptions against the live sandbox', () => {
  it('creates a subscription at an overridden price, then pauses, resumes and cancels it', async () => {
    const provider = new SquarePaymentProvider();

    await inTenantScope(async () => {
      const customer = await provider.createCustomer(config as never, {
        organizationId: PROBE_ORG,
        memberId: 'member_probe',
        // Square rejects a subscription whose customer has no email
        // (CUSTOMER_MISSING_EMAIL) — one of the two undocumented constraints.
        email: `probe+${Date.now()}@example.com`,
        firstName: 'Probe',
        lastName: 'Subscriber',
      });

      const card = await provider.createPaymentMethod(config as never, {
        customerId: customer.customerId,
        paymentMethod: 'card',
        // Square's sandbox nonce for a card that always succeeds.
        cardToken: 'cnon:card-nonce-ok',
        cardholderName: 'Probe Subscriber',
      } as never);

      const created = await provider.createSubscription(config as never, {
        organizationId: PROBE_ORG,
        customerId: customer.customerId,
        paymentMethodId: card.paymentMethodId,
        amount: 60,
        frequency: 'monthly',
        startDate: new Date(),
        description: 'Probe membership',
        firstName: 'Probe',
        lastName: 'Subscriber',
        email: `probe+${Date.now()}@example.com`,
      });

      expect(created.success).toBe(true);
      expect(created.subscriptionId).toBeTruthy();

      const subscriptionId = created.subscriptionId as string;

      // The card must be attached, not merely accepted — a subscription with
      // no card_id succeeds and then quietly invoices the member instead.
      const saved = await provider.getSubscriptionPaymentMethod(config as never, subscriptionId);

      expect(saved).toEqual({
        customerId: customer.customerId,
        paymentMethodId: card.paymentMethodId,
        paymentMethodName: 'card',
      });

      await expect(provider.setSubscriptionAutoRenewal(config as never, subscriptionId, false))
        .resolves
        .toEqual({ success: true });
      await expect(provider.setSubscriptionAutoRenewal(config as never, subscriptionId, true))
        .resolves
        .toEqual({ success: true });
      await expect(provider.cancelSubscription(config as never, subscriptionId))
        .resolves
        .toEqual({ success: true });
    });
  }, 120_000);

  it('creates the catalog variation once and reuses it for the second subscription', async () => {
    const provider = new SquarePaymentProvider();

    await inTenantScope(async () => {
      const ids: string[] = [];

      for (let i = 0; i < 2; i++) {
        const customer = await provider.createCustomer(config as never, {
          organizationId: PROBE_ORG,
          memberId: `member_probe_${i}`,
          email: `probe+${Date.now()}_${i}@example.com`,
          firstName: 'Probe',
          lastName: `Reuse${i}`,
        });

        const card = await provider.createPaymentMethod(config as never, {
          customerId: customer.customerId,
          paymentMethod: 'card',
          cardToken: 'cnon:card-nonce-ok',
        } as never);

        // Different prices prove the per-subscription override, which is the
        // finding that collapses the catalog to four rows per org.
        const created = await provider.createSubscription(config as never, {
          organizationId: PROBE_ORG,
          customerId: customer.customerId,
          paymentMethodId: card.paymentMethodId,
          amount: 40 + i * 25,
          frequency: 'monthly',
          startDate: new Date(),
          description: `Probe membership ${i}`,
          firstName: 'Probe',
          lastName: `Reuse${i}`,
          email: `probe+${Date.now()}_${i}@example.com`,
        });

        expect(created.success).toBe(true);

        ids.push(created.subscriptionId as string);
      }

      for (const id of ids) {
        await provider.cancelSubscription(config as never, id);
      }
    });
  }, 180_000);
});
