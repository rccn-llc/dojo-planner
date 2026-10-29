import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Square webhook routing and verification.
 *
 * The order these assert is the point: Square's signature key is PER-ORG, so
 * the handler must resolve the owning org BEFORE it can verify anything — the
 * reverse of the IQPro handler, which checks one global env secret first.
 * Nothing may be written until verification passes.
 */

const SIGNATURE_KEY = 'test_webhook_key_not_real';
const NOTIFICATION_URL = 'https://example.test/webhook/square';

const resolveOrgByExternalRef = vi.fn();
const getDbForOrg = vi.fn();
const resolvePaymentProviderConfig = vi.fn();
const runWithTenant = vi.fn(async (_scope: unknown, fn: () => Promise<unknown>) => fn());
const loggerError = vi.fn();
const loggerWarn = vi.fn();

const tenantUpdateWhere = vi.fn();
const tenantUpdateSet = vi.fn(() => ({ where: tenantUpdateWhere }));
const membershipFindFirst = vi.fn().mockResolvedValue(undefined);
const tenantDb = {
  update: vi.fn(() => ({ set: tenantUpdateSet })),
  query: {
    memberMembershipSchema: { findFirst: membershipFindFirst },
  },
};

vi.mock('@/libs/DB', () => ({ db: tenantDb }));
vi.mock('@/libs/TenantContext', () => ({
  runWithTenant: (scope: unknown, fn: () => Promise<unknown>) => runWithTenant(scope, fn),
}));
vi.mock('@/services/TenantDirectoryService', () => ({
  getDbForOrg: (orgId: string) => getDbForOrg(orgId),
}));
vi.mock('@/services/PaymentProviderConfigService', () => ({
  resolvePaymentProviderConfig: (orgId: string) => resolvePaymentProviderConfig(orgId),
}));
const recordRecurringCharge = vi.fn().mockResolvedValue({ status: 'duplicate' });
const runAfterResponse = vi.fn();
vi.mock('@/libs/AfterResponse', () => ({ runAfterResponse: (l: string, w: () => Promise<void>) => runAfterResponse(l, w) }));
const syncMemberQuietly = vi.fn();
const syncByProviderCustomer = vi.fn();
vi.mock('@/services/PaymentMethodSyncService', () => ({
  syncMemberQuietly: (...a: unknown[]) => syncMemberQuietly(...a),
  syncByProviderCustomer: (...a: unknown[]) => syncByProviderCustomer(...a),
}));
vi.mock('@/services/RecurringChargeWebhookService', () => ({
  recordRecurringCharge: (e: unknown) => recordRecurringCharge(e),
}));
vi.mock('@/services/TenantExternalRefService', () => ({
  REF_TYPE: {
    PROVIDER_SUBSCRIPTION: 'provider_subscription',
    PROVIDER_TRANSACTION: 'provider_transaction',
    PROVIDER_CUSTOMER: 'provider_customer',
    SAAS_SUBSCRIPTION: 'saas_subscription',
    STRIPE_CUSTOMER: 'stripe_customer',
  },
  resolveOrgByExternalRef: (t: string, id: string) => resolveOrgByExternalRef(t, id),
}));
vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: (...a: unknown[]) => loggerWarn(...a),
    error: (...a: unknown[]) => loggerError(...a),
  },
}));
vi.mock('@/libs/RateLimit', () => ({
  getClientIP: () => '127.0.0.1',
  isRateLimitingEnabled: () => false,
  webhookRateLimiter: { limit: vi.fn() },
}));
vi.mock('@/libs/Env', () => ({ Env: { NEXT_PUBLIC_APP_URL: 'https://example.test' } }));

let signatureHeader: string | null = null;
vi.mock('next/headers', () => ({
  headers: async () => new Map(
    signatureHeader === null ? [] : [['x-square-hmacsha256-signature', signatureHeader]],
  ),
}));
vi.mock('@/models/Schema', () => ({
  memberMembershipSchema: {
    providerSubscriptionId: 'psid',
    memberId: 'member_id',
    status: 'status',
    endDate: 'end_date',
    updatedAt: 'updated_at',
  },
  memberSchema: {
    id: 'id',
    organizationId: 'org_id',
    status: 'status',
    statusChangedAt: 'changed',
    updatedAt: 'updated_at',
  },
  transactionSchema: {
    providerTransactionId: 'ptid',
    organizationId: 'org_id',
    status: 'status',
    processedAt: 'processed_at',
    updatedAt: 'updated_at',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _and: a }),
  eq: (...a: unknown[]) => ({ _eq: a }),
  ne: (...a: unknown[]) => ({ _ne: a }),
}));

function sign(body: string, key = SIGNATURE_KEY, url = NOTIFICATION_URL): string {
  return createHmac('sha256', key).update(url + body).digest('base64');
}

function invoicePaid(subscriptionId = 'sub_1') {
  return JSON.stringify({
    type: 'invoice.payment_made',
    event_id: 'ev_1',
    merchant_id: 'M1',
    data: { object: { invoice: { subscription_id: subscriptionId } } },
  });
}

async function post(body: string, url = NOTIFICATION_URL) {
  const { POST } = await import('./route');
  return POST(new Request(url, { method: 'POST', body }));
}

describe('square webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipFindFirst.mockResolvedValue(undefined);
    resolveOrgByExternalRef.mockResolvedValue('org_resolved');
    getDbForOrg.mockResolvedValue(tenantDb);
    resolvePaymentProviderConfig.mockResolvedValue({
      provider: 'square',
      webhookSignatureKey: SIGNATURE_KEY,
    });
    signatureHeader = null;
  });

  it('routes by the invoice subscription_id and processes a verified event', async () => {
    // Square has no "subscription charge succeeded" event — recurring billing
    // arrives as an invoice, which carries the subscription that made it.
    const body = invoicePaid();
    signatureHeader = sign(body);

    const res = await post(body);

    expect(res.status).toBe(200);
    expect(resolveOrgByExternalRef).toHaveBeenCalledWith('provider_subscription', 'sub_1');
    expect(getDbForOrg).toHaveBeenCalledWith('org_resolved');
    expect(recordRecurringCharge).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'square',
      organizationId: 'org_resolved',
      providerSubscriptionId: 'sub_1',
      outcome: 'paid',
      eventKey: 'ev_1',
    }));
  });

  it('REFUSES an invalid signature with 401 and writes nothing', async () => {
    const body = invoicePaid();
    signatureHeader = sign(body, 'someone-elses-key');

    const res = await post(body);

    expect(res.status).toBe(401);
    expect(tenantUpdateWhere).not.toHaveBeenCalled();
    expect(recordRecurringCharge).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid signature'),
      expect.anything(),
    );
  });

  it('verifies AFTER resolving the org, because the key is per-org', async () => {
    // If verification came first there would be no key to verify with — this
    // ordering is the structural difference from the IQPro handler.
    const body = invoicePaid();
    signatureHeader = sign(body);

    await post(body);

    expect(resolveOrgByExternalRef).toHaveBeenCalled();
    expect(resolvePaymentProviderConfig).toHaveBeenCalledWith('org_resolved');
  });

  it('REFUSES an event whose id maps to no org, rather than updating nothing', async () => {
    resolveOrgByExternalRef.mockResolvedValue(null);
    const body = invoicePaid('sub_unknown');
    signatureHeader = sign(body);

    const res = await post(body);

    expect(res.status).toBe(200);
    expect(tenantUpdateWhere).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('REFUSING'),
      expect.anything(),
    );
  });

  it('REFUSES an event routed to an org that is not on Square', async () => {
    // Verifying an IQPro org's event with a Square key is meaningless, and
    // processing it would apply Square semantics to another provider's data.
    resolvePaymentProviderConfig.mockResolvedValue({ provider: 'iqpro' });
    const body = invoicePaid();
    signatureHeader = sign(body);

    const res = await post(body);

    expect(res.status).toBe(200);
    expect(tenantUpdateWhere).not.toHaveBeenCalled();
  });

  it('ignores subscription.updated unless the status is terminal', async () => {
    // The event fires on every change; treating any of them as a cancellation
    // would cancel memberships that merely paused.
    const body = JSON.stringify({
      type: 'subscription.updated',
      data: { object: { subscription: { id: 'sub_1', status: 'PAUSED' } } },
    });
    signatureHeader = sign(body);

    await post(body);

    expect(tenantUpdateWhere).not.toHaveBeenCalled();
  });

  it('cancels the membership when a subscription reports CANCELED', async () => {
    const body = JSON.stringify({
      type: 'subscription.updated',
      data: { object: { subscription: { id: 'sub_1', status: 'CANCELED' } } },
    });
    signatureHeader = sign(body);

    await post(body);

    expect(tenantUpdateWhere).toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'CANCELED'])('never overwrites a refunded row on payment.updated (%s)', async (status) => {
    // Square sends payment.updated when a refund lands (status stays COMPLETED)
    // and when a void cancels it (CANCELED). Neither may overwrite 'refunded'.
    const body = JSON.stringify({
      type: 'payment.updated',
      data: { object: { payment: { id: 'pay_1', status } } },
    });
    signatureHeader = sign(body);

    await post(body);

    expect(JSON.stringify(tenantUpdateWhere.mock.calls[0])).toContain('"refunded"');
  });

  it('does not record an uncaptured APPROVED payment as paid', async () => {
    // APPROVED is authorised-but-not-captured. Only COMPLETED has settled.
    const body = JSON.stringify({
      type: 'payment.updated',
      data: { object: { payment: { id: 'pay_1', status: 'APPROVED' } } },
    });
    signatureHeader = sign(body);

    await post(body);

    expect(tenantUpdateWhere).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with 400', async () => {
    const res = await post('not json');

    expect(res.status).toBe(400);
  });
});

describe('notification URL derivation', () => {
  // ⚠️ The notification URL is an HMAC input. This route is locale-prefixed
  // (`/[locale]/webhook/square`) with `localePrefix: 'as-needed'`, so Square can
  // legitimately be pointed at `/webhook/square` OR `/en|fr|ja/webhook/square`.
  // Deriving it as origin + a hardcoded `/webhook/square` rejected every event
  // from a locale-prefixed configuration: org and key resolved correctly, then
  // the signature check failed.
  beforeEach(() => {
    vi.clearAllMocks();
    membershipFindFirst.mockResolvedValue(undefined);
    resolveOrgByExternalRef.mockResolvedValue('org_resolved');
    getDbForOrg.mockResolvedValue(tenantDb);
    resolvePaymentProviderConfig.mockResolvedValue({
      provider: 'square',
      webhookSignatureKey: SIGNATURE_KEY,
    });
    signatureHeader = null;
  });

  it.each([
    ['https://example.test/en/webhook/square'],
    ['https://example.test/fr/webhook/square'],
    ['https://example.test/ja/webhook/square'],
  ])('accepts an event signed against the locale-prefixed URL %s', async (url) => {
    const body = invoicePaid();
    signatureHeader = sign(body, SIGNATURE_KEY, url);

    const res = await post(body, url);

    expect(res.status).toBe(200);
    expect(recordRecurringCharge).toHaveBeenCalled();
  });

  it('still accepts the un-prefixed URL a pre-existing deployment signs against', async () => {
    // Square configured with `/webhook/square`, but the request arrives at the
    // locale-prefixed path. The un-prefixed candidate keeps that working.
    const body = invoicePaid();
    signatureHeader = sign(body, SIGNATURE_KEY, NOTIFICATION_URL);

    const res = await post(body, 'https://example.test/en/webhook/square');

    expect(res.status).toBe(200);
    expect(recordRecurringCharge).toHaveBeenCalled();
  });

  it('a wrong key is STILL refused on a locale-prefixed URL', async () => {
    // Trying several URL candidates must not weaken verification: each is
    // checked against the same per-org key.
    const url = 'https://example.test/ja/webhook/square';
    const body = invoicePaid();
    signatureHeader = sign(body, 'someone-elses-key', url);

    const res = await post(body, url);

    expect(res.status).toBe(401);
    expect(tenantUpdateWhere).not.toHaveBeenCalled();
  });

  it('refuses a signature computed over a DIFFERENT origin', async () => {
    const body = invoicePaid();
    signatureHeader = sign(body, SIGNATURE_KEY, 'https://attacker.test/webhook/square');

    const res = await post(body, 'https://example.test/en/webhook/square');

    expect(res.status).toBe(401);
    expect(tenantUpdateWhere).not.toHaveBeenCalled();
  });
});

describe('square recurring invoice events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveOrgByExternalRef.mockResolvedValue('org_resolved');
    getDbForOrg.mockResolvedValue(tenantDb);
    resolvePaymentProviderConfig.mockResolvedValue({ provider: 'square', webhookSignatureKey: SIGNATURE_KEY });
  });

  function invoiceEvent(type: string, invoice: Record<string, unknown>, eventId: string | null = 'ev_x') {
    return JSON.stringify({ type, ...(eventId ? { event_id: eventId } : {}), data: { object: { invoice } } });
  }

  it('records invoice.scheduled_charge_failed as a declined charge, amount from computed_amount_money', async () => {
    const body = invoiceEvent('invoice.scheduled_charge_failed', {
      id: 'inv_1',
      subscription_id: 'sub_9',
      status: 'UNPAID',
      updated_at: '2026-10-02T10:00:00Z',
      payment_requests: [{ computed_amount_money: { amount: 10375, currency: 'USD' }, total_completed_amount_money: { amount: 0 } }],
    });
    signatureHeader = sign(body);

    expect((await post(body)).status).toBe(200);
    expect(recordRecurringCharge).toHaveBeenCalledWith({
      provider: 'square',
      eventKey: 'ev_x',
      organizationId: 'org_resolved',
      providerSubscriptionId: 'sub_9',
      providerTransactionId: null,
      providerInvoiceId: 'inv_1',
      amount: 103.75,
      outcome: 'declined',
      failureReason: 'Scheduled charge failed',
      occurredAt: new Date('2026-10-02T10:00:00Z'),
    });
  });

  it('falls back to next_payment_amount_money for a failed charge with no payment request', async () => {
    const body = invoiceEvent('invoice.scheduled_charge_failed', { id: 'inv_2', subscription_id: 'sub_9', next_payment_amount_money: { amount: 5000 } });
    signatureHeader = sign(body);

    await post(body);

    expect(recordRecurringCharge).toHaveBeenCalledWith(expect.objectContaining({ amount: 50, occurredAt: undefined }));
  });

  it('records invoice.payment_made with the collected amount', async () => {
    const body = invoiceEvent('invoice.payment_made', {
      id: 'inv_3',
      subscription_id: 'sub_9',
      payment_requests: [{ computed_amount_money: { amount: 10375 }, total_completed_amount_money: { amount: 10375 } }],
    });
    signatureHeader = sign(body);

    await post(body);

    expect(recordRecurringCharge).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'paid', amount: 103.75, failureReason: null }));
  });

  it('uses computed_amount_money for a paid invoice that omits the completed amount, and 0 when nothing is present', async () => {
    const withComputed = invoiceEvent('invoice.payment_made', { id: 'inv_4', subscription_id: 'sub_9', payment_requests: [{ computed_amount_money: { amount: 2000 } }] });
    signatureHeader = sign(withComputed);
    await post(withComputed);

    expect(recordRecurringCharge).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 20 }));

    const empty = invoiceEvent('invoice.payment_made', { id: 'inv_5', subscription_id: 'sub_9' });
    signatureHeader = sign(empty);
    await post(empty);

    expect(recordRecurringCharge).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 0 }));
  });

  it('derives an event key from the invoice when event_id is absent, and ignores an invalid date', async () => {
    const body = invoiceEvent('invoice.payment_made', { id: 'inv_6', subscription_id: 'sub_9', updated_at: 'garbage' }, null);
    signatureHeader = sign(body);

    await post(body);

    expect(recordRecurringCharge).toHaveBeenCalledWith(expect.objectContaining({ eventKey: 'inv_6:invoice.payment_made', occurredAt: undefined, providerInvoiceId: 'inv_6' }));
  });

  it('defaults a missing invoice id to null', async () => {
    const body = invoiceEvent('invoice.payment_made', { subscription_id: 'sub_9' });
    signatureHeader = sign(body);

    await post(body);

    expect(recordRecurringCharge).toHaveBeenCalledWith(expect.objectContaining({ providerInvoiceId: null }));
  });

  it('500s (so Square redelivers) when recording throws', async () => {
    recordRecurringCharge.mockRejectedValueOnce(new Error('db down'));
    const body = invoiceEvent('invoice.scheduled_charge_failed', { id: 'inv_7', subscription_id: 'sub_9' });
    signatureHeader = sign(body);

    expect((await post(body)).status).toBe(500);
  });
});

describe('square payment-method sync triggers', () => {
  const CONFIG = { provider: 'square', webhookSignatureKey: SIGNATURE_KEY };

  beforeEach(() => {
    vi.clearAllMocks();
    resolveOrgByExternalRef.mockResolvedValue('org_resolved');
    getDbForOrg.mockResolvedValue(tenantDb);
    resolvePaymentProviderConfig.mockResolvedValue(CONFIG);
  });

  async function runScheduled() {
    runWithTenant.mockClear();
    await runAfterResponse.mock.calls[0]![1]();
  }

  it.each(['card.created', 'card.updated', 'card.automatically_updated', 'card.disabled'])('routes %s by customer and syncs that customer after the response', async (type) => {
    const body = JSON.stringify({ type, event_id: 'ev_card', data: { object: { card: { id: 'ccof:1', customer_id: 'cus_9' } } } });
    signatureHeader = sign(body);

    expect((await post(body)).status).toBe(200);
    expect(resolveOrgByExternalRef).toHaveBeenCalledWith('provider_customer', 'cus_9');

    await runScheduled();

    expect(runWithTenant).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_resolved' }), expect.any(Function));
    expect(syncByProviderCustomer).toHaveBeenCalledWith('cus_9', 'org_resolved', CONFIG);
  });

  it('ignores a card event with no customer', async () => {
    const body = JSON.stringify({ type: 'card.updated', event_id: 'ev_x', data: { object: { card: { id: 'ccof:1' } } } });
    signatureHeader = sign(body);

    expect((await post(body)).status).toBe(200);
    expect(resolveOrgByExternalRef).not.toHaveBeenCalled();
    expect(runAfterResponse).not.toHaveBeenCalled();
  });

  it('syncs the customer on a non-terminal subscription.updated (possible card change)', async () => {
    const body = JSON.stringify({ type: 'subscription.updated', event_id: 'ev_s', data: { object: { subscription: { id: 'sub_1', status: 'ACTIVE', customer_id: 'cus_2' } } } });
    signatureHeader = sign(body);

    await post(body);
    await runScheduled();

    expect(syncByProviderCustomer).toHaveBeenCalledWith('cus_2', 'org_resolved', CONFIG);
  });

  it('does not schedule a sync for a non-terminal subscription.updated without a customer', async () => {
    const body = JSON.stringify({ type: 'subscription.updated', event_id: 'ev_s2', data: { object: { subscription: { id: 'sub_1', status: 'PAUSED' } } } });
    signatureHeader = sign(body);

    await post(body);

    expect(runAfterResponse).not.toHaveBeenCalled();
  });

  it('syncs the member after a recorded invoice event, not after a duplicate', async () => {
    recordRecurringCharge.mockResolvedValueOnce({ status: 'recorded', memberId: 'mem_7' });
    const body = JSON.stringify({ type: 'invoice.scheduled_charge_failed', event_id: 'ev_i', data: { object: { invoice: { id: 'inv', subscription_id: 'sub_1' } } } });
    signatureHeader = sign(body);

    await post(body);
    await runScheduled();

    expect(syncMemberQuietly).toHaveBeenCalledWith('mem_7', 'org_resolved', CONFIG);

    runAfterResponse.mockClear();
    recordRecurringCharge.mockResolvedValueOnce({ status: 'duplicate' });
    await post(body);

    expect(runAfterResponse).not.toHaveBeenCalled();
  });
});
