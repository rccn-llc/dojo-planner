import { describe, expect, it } from 'vitest';
import {
  assertSandbox,
  buildDailySubscriptionPayload,
  CANCEL_NOW_BODY,
  defaultRunTime,
  IQPRO_BILLING_PERIOD_DAILY,
  IQPRO_UNIT_DAYS,
  parseArgs,
} from './iqproSandboxDailySubscription';

const sandbox = {
  IQPRO_CLIENT_ID: 'test-client',
  IQPRO_CLIENT_SECRET: 'test_secret_not_real',
  IQPRO_SCOPE: 'scope',
  IQPRO_OAUTH_URL: 'https://sandbox.account.basyspro.com/x/token',
  IQPRO_BASE_URL: 'https://sandbox.api.basyspro.com/iqsaas/v1',
  IQPRO_GATEWAY_ID: 'gw',
};

describe('iqproSandboxDailySubscription', () => {
  it('uses IQPro\'s Daily billing period (1) and Days unit (36), read from /api/constants', () => {
    expect(IQPRO_BILLING_PERIOD_DAILY).toBe(1);
    expect(IQPRO_UNIT_DAYS).toBe(36);
  });

  it('builds a daily, auto-charged subscription on the saved card with no fee adjustment', () => {
    const p = buildDailySubscriptionPayload({
      customerId: 'cus_1',
      paymentMethodId: 'pm_1',
      cardProcessorId: 'proc_1',
      amount: 1,
      firstName: 'Test',
      lastName: 'Member',
      email: 't@example.com',
      hour: 14,
      minute: 30,
      now: new Date('2026-10-27T14:20:00Z'),
    }) as Record<string, any>;

    expect(p.recurrence).toMatchObject({ billingPeriodId: 1, schedule: { minutes: [30], hours: [14] }, isAutoRenewed: true, invoiceLengthInDays: 1, billingStartDate: '2026-10-27T14:20:00.000Z' });
    expect(p.recurrence.schedule).not.toHaveProperty('daysOfMonth');
    expect(p.paymentMethod).toEqual({ customerPaymentMethodId: 'pm_1', isAutoCharged: true, cardProcessorId: 'proc_1' });
    expect(p.lineItems[0]).toMatchObject({ unitPrice: 1, unitOfMeasureId: 36, quantity: 1, discount: 0 });
    expect(p.addresses).toHaveLength(2);
    expect(p).not.toHaveProperty('paymentAdjustments');
    expect(p.prefix.length).toBeLessThanOrEqual(10);
  });

  it('omits the card processor when the gateway reports none', () => {
    const p = buildDailySubscriptionPayload({ customerId: 'c', paymentMethodId: 'p', cardProcessorId: null, amount: 1, firstName: 'a', lastName: 'b', email: 'e@x.com', hour: 0, minute: 0 }) as Record<string, any>;

    expect(p.paymentMethod).toEqual({ customerPaymentMethodId: 'p', isAutoCharged: true });
  });

  it('schedules the first run ~10 minutes ahead in UTC, wrapping the hour', () => {
    expect(defaultRunTime(new Date('2026-10-27T23:55:00Z'))).toEqual({ hour: 0, minute: 5 });
  });

  it('refuses a non-sandbox environment or missing credentials', () => {
    expect(() => assertSandbox(sandbox)).not.toThrow();
    expect(() => assertSandbox({ ...sandbox, IQPRO_BASE_URL: 'https://api.basyspro.com/iqsaas/v1' })).toThrow(/sandbox-only/);
    expect(() => assertSandbox({ ...sandbox, IQPRO_OAUTH_URL: 'https://account.basyspro.com/x/token' })).toThrow(/sandbox-only/);
    expect(() => assertSandbox({ ...sandbox, IQPRO_GATEWAY_ID: '' })).toThrow('IQPRO_GATEWAY_ID is not set.');
  });

  it('cancels with the required body (an empty body is a 400 at IQPro)', () => {
    expect(CANCEL_NOW_BODY).toEqual({ cancel: { now: true, endOfBillingPeriod: false } });
  });

  it('parses --key=value arguments', () => {
    expect(parseArgs(['--orgId=org_1', '--memberId=m', '--amount=1.00', 'stray'])).toEqual({ orgId: 'org_1', memberId: 'm', amount: '1.00' });
  });
});
