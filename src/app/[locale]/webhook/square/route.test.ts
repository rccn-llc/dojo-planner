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
    expect(tenantUpdateWhere).toHaveBeenCalled();
  });

  it('REFUSES an invalid signature with 401 and writes nothing', async () => {
    const body = invoicePaid();
    signatureHeader = sign(body, 'someone-elses-key');

    const res = await post(body);

    expect(res.status).toBe(401);
    expect(tenantUpdateWhere).not.toHaveBeenCalled();
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
    expect(tenantUpdateWhere).toHaveBeenCalled();
  });

  it('still accepts the un-prefixed URL a pre-existing deployment signs against', async () => {
    // Square configured with `/webhook/square`, but the request arrives at the
    // locale-prefixed path. The un-prefixed candidate keeps that working.
    const body = invoicePaid();
    signatureHeader = sign(body, SIGNATURE_KEY, NOTIFICATION_URL);

    const res = await post(body, 'https://example.test/en/webhook/square');

    expect(res.status).toBe(200);
    expect(tenantUpdateWhere).toHaveBeenCalled();
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
