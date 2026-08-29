/**
 * LIVE sandbox checks for SquarePaymentService.
 *
 * Skipped unless SQUARE_ACCESS_TOKEN is set, so CI and other developers are
 * unaffected. Run locally with credentials in .env.local to confirm the
 * payloads this service sends are the ones Square actually accepts — the
 * unit tests mock transport and cannot prove that.
 */
import { describe, expect, it } from 'vitest';
import { SquarePaymentProvider } from './SquarePaymentService';

const live = process.env.SQUARE_ACCESS_TOKEN ? describe : describe.skip;

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
