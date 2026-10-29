import { Buffer } from 'node:buffer';
import { constants, generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * iQ Pro+ webhook route: RSA verification (real keypair), tenant routing,
 * dispatch to the recurring-charge recorder, and the SaaS branch.
 */

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

const resolveOrgByExternalRef = vi.fn();
const getDbForOrg = vi.fn();
const runWithTenant = vi.fn(async (_scope: unknown, fn: () => Promise<unknown>) => fn());
const loggerError = vi.fn();
const loggerInfo = vi.fn();
const loggerWarn = vi.fn();
const recordRecurringCharge = vi.fn();
const resolvePaymentProviderConfig = vi.fn();
const resolvePlatformIQProConfig = vi.fn();
const resolveWebhookPublicKey = vi.fn();

const tenantUpdateWhere = vi.fn();
const tenantUpdateSet = vi.fn(() => ({ where: tenantUpdateWhere }));
const tenantDb = { update: vi.fn(() => ({ set: tenantUpdateSet })) };

const controlFindFirst = vi.fn();
const controlUpdateSet = vi.fn(() => ({ where: vi.fn() }));
const controlDb = {
  update: vi.fn(() => ({ set: controlUpdateSet })),
  query: { organizationSchema: { findFirst: controlFindFirst } },
};

vi.mock('@/libs/DB', () => ({ db: tenantDb }));
vi.mock('@/libs/ControlPlaneReads', () => ({ controlOrganizationDb: () => controlDb }));
vi.mock('@/libs/TenantContext', () => ({
  runWithTenant: (scope: unknown, fn: () => Promise<unknown>) => runWithTenant(scope, fn),
}));
vi.mock('@/services/TenantDirectoryService', () => ({ getDbForOrg: (orgId: string) => getDbForOrg(orgId) }));
vi.mock('@/services/TenantExternalRefService', () => ({
  REF_TYPE: {
    PROVIDER_SUBSCRIPTION: 'provider_subscription',
    PROVIDER_TRANSACTION: 'provider_transaction',
    PROVIDER_CUSTOMER: 'provider_customer',
  },
  resolveOrgByExternalRef: (t: string, id: string) => resolveOrgByExternalRef(t, id),
}));
vi.mock('@/services/PaymentProviderConfigService', () => ({
  resolvePaymentProviderConfig: (orgId: string) => resolvePaymentProviderConfig(orgId),
  resolvePlatformIQProConfig: () => resolvePlatformIQProConfig(),
}));
vi.mock('@/services/RecurringChargeWebhookService', () => ({
  recordRecurringCharge: (e: unknown) => recordRecurringCharge(e),
}));
vi.mock('@/libs/IQPro', async () => {
  const actual = await vi.importActual<typeof import('@/libs/IQPro')>('@/libs/IQPro');
  return {
    verifyIQProWebhookSignature: actual.verifyIQProWebhookSignature,
    resolveWebhookPublicKey: (c: unknown, o: unknown) => resolveWebhookPublicKey(c, o),
  };
});
vi.mock('@/libs/Env', () => ({ Env: {} }));
const runAfterResponse = vi.fn();
vi.mock('@/libs/AfterResponse', () => ({ runAfterResponse: (l: string, w: () => Promise<void>) => runAfterResponse(l, w) }));
const syncMemberQuietly = vi.fn();
vi.mock('@/services/PaymentMethodSyncService', () => ({ syncMemberQuietly: (...a: unknown[]) => syncMemberQuietly(...a) }));
vi.mock('@/libs/Logger', () => ({
  logger: {
    info: (...a: unknown[]) => loggerInfo(...a),
    warn: (...a: unknown[]) => loggerWarn(...a),
    error: (...a: unknown[]) => loggerError(...a),
  },
}));
const rateLimit = vi.fn();
let rateLimitingEnabled = false;
vi.mock('@/libs/RateLimit', () => ({
  getClientIP: () => '127.0.0.1',
  isRateLimitingEnabled: () => rateLimitingEnabled,
  webhookRateLimiter: { limit: (ip: string) => rateLimit(ip) },
}));
vi.mock('@/models/Schema', () => ({
  organizationSchema: { id: 'id', saasProviderSubscriptionId: 'saas_sub' },
  transactionSchema: { providerTransactionId: 'ptid', organizationId: 'org_id', status: 'status' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _and: a }),
  eq: (col: unknown, val: unknown) => ({ _eq: [col, val] }),
  ne: (col: unknown, val: unknown) => ({ _ne: [col, val] }),
}));

const IQPRO_CONFIG = { provider: 'iqpro', gatewayId: 'gw-1', clientId: 'c', clientSecret: 's', scope: 'x', oauthUrl: 'https://o.test', baseUrl: 'https://b.test', source: 'db' };

type Resource = Record<string, unknown>;

function signed(resource: Resource, opts: { key?: typeof privateKey; resourceType?: string; subType?: string; signature?: string } = {}): string {
  const resourceText = JSON.stringify(resource);
  const signature = opts.signature ?? sign('sha256', Buffer.from(resourceText), { key: opts.key ?? privateKey, padding: constants.RSA_PKCS1_PADDING }).toString('base64');
  return `{"resourceType":"${opts.resourceType ?? 'TRANSACTION'}","subType":"${opts.subType ?? 'Sale'}","resource":${resourceText},"traceId":"trace-1","actionDateTime":"2026-10-01T00:00:00Z","hashAlg":"SHA256","signatureAlg":"RSA","signature":"${signature}"}`;
}

function post(body: string) {
  return new Request('https://example.test/webhook/iqpro', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

const subscriptionDecline: Resource = {
  transactionId: 'tx-1',
  subscriptionId: 'sub-1',
  status: 'declined',
  response: 'Declined',
  processorResponseText: 'Insufficient funds',
  transactionRemit: { amount: 103.75 },
  transactionPaymentMethod: { card: { maskedCard: '411111******1111' } },
  customer: { customerId: 'cus-1', name: 'Jane' },
  createdDateTime: '2026-10-01T00:00:00Z',
};

async function load() {
  return (await import('./route')).POST;
}

describe('IQPro webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitingEnabled = false;
    controlFindFirst.mockResolvedValue(undefined);
    resolveOrgByExternalRef.mockImplementation(async (type: string) => (type === 'provider_subscription' ? 'org_a' : null));
    getDbForOrg.mockResolvedValue(tenantDb);
    resolvePaymentProviderConfig.mockResolvedValue(IQPRO_CONFIG);
    resolveWebhookPublicKey.mockResolvedValue(PUBLIC_PEM);
    recordRecurringCharge.mockResolvedValue({ status: 'recorded', memberId: 'mem_1' });
  });

  describe('request validation', () => {
    it('400s on invalid JSON', async () => {
      const res = await (await load())(post('{nope'));

      expect(res.status).toBe(400);
    });

    it('401s when the signature or resource is missing', async () => {
      const POST = await load();

      expect((await POST(post(JSON.stringify({ resourceType: 'TRANSACTION', resource: { a: 1 } })))).status).toBe(401);
      expect((await POST(post(JSON.stringify({ resourceType: 'TRANSACTION', signature: 'abc' })))).status).toBe(401);
      expect(recordRecurringCharge).not.toHaveBeenCalled();
    });

    it('429s when rate limited', async () => {
      rateLimitingEnabled = true;
      rateLimit.mockResolvedValue({ success: false, reset: Date.now() + 5000 });

      const res = await (await load())(post(signed(subscriptionDecline)));

      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBeTruthy();
    });

    it('passes through when under the rate limit', async () => {
      rateLimitingEnabled = true;
      rateLimit.mockResolvedValue({ success: true, reset: 0 });

      expect((await (await load())(post(signed(subscriptionDecline)))).status).toBe(200);
    });
  });

  describe('signature', () => {
    it('401s on a signature from another key and writes nothing', async () => {
      const res = await (await load())(post(signed(subscriptionDecline, { key: other.privateKey })));

      expect(res.status).toBe(401);
      expect(recordRecurringCharge).not.toHaveBeenCalled();
      expect(tenantDb.update).not.toHaveBeenCalled();
    });

    it('verifies AFTER resolving the org, with that org\'s config', async () => {
      await (await load())(post(signed(subscriptionDecline)));

      expect(resolvePaymentProviderConfig).toHaveBeenCalledWith('org_a');
      expect(resolveWebhookPublicKey).toHaveBeenCalledWith(IQPRO_CONFIG, undefined);
    });

    it('refetches the key once when verification fails (rotation), then succeeds', async () => {
      const stale = other.publicKey.export({ type: 'spki', format: 'pem' }).toString();
      resolveWebhookPublicKey.mockResolvedValueOnce(stale).mockResolvedValueOnce(PUBLIC_PEM);

      const res = await (await load())(post(signed(subscriptionDecline)));

      expect(res.status).toBe(200);
      expect(resolveWebhookPublicKey).toHaveBeenLastCalledWith(IQPRO_CONFIG, { force: true });
      expect(recordRecurringCharge).toHaveBeenCalled();
    });

    it('fails closed when the gateway has no key', async () => {
      resolveWebhookPublicKey.mockResolvedValue(null);

      expect((await (await load())(post(signed(subscriptionDecline)))).status).toBe(401);
    });
  });

  describe('routing', () => {
    it('routes by subscriptionId first', async () => {
      await (await load())(post(signed(subscriptionDecline)));

      expect(resolveOrgByExternalRef).toHaveBeenCalledWith('provider_subscription', 'sub-1');
      expect(getDbForOrg).toHaveBeenCalledWith('org_a');
      expect(runWithTenant).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_a', source: 'webhook' }), expect.any(Function));
    });

    it('falls back to the transaction ref, then the customer ref', async () => {
      resolveOrgByExternalRef.mockImplementation(async (type: string) => (type === 'provider_customer' ? 'org_c' : null));

      await (await load())(post(signed(subscriptionDecline)));

      expect(resolveOrgByExternalRef.mock.calls.map(c => c[0])).toEqual(['provider_subscription', 'provider_transaction', 'provider_customer']);
      expect(getDbForOrg).toHaveBeenCalledWith('org_c');
    });

    it('REFUSES (200 + loud log) an event no ref maps', async () => {
      resolveOrgByExternalRef.mockResolvedValue(null);

      const res = await (await load())(post(signed(subscriptionDecline)));

      expect(res.status).toBe(200);
      expect(recordRecurringCharge).not.toHaveBeenCalled();
      expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('REFUSING'), expect.objectContaining({ subscriptionId: 'sub-1' }));
    });

    it('REFUSES an event routed to an org that is not on IQPro', async () => {
      resolvePaymentProviderConfig.mockResolvedValue({ provider: 'square' });

      const res = await (await load())(post(signed(subscriptionDecline)));

      expect(res.status).toBe(200);
      expect(recordRecurringCharge).not.toHaveBeenCalled();
    });

    it('REFUSES when the org has no payment config', async () => {
      resolvePaymentProviderConfig.mockResolvedValue(null);

      expect((await (await load())(post(signed(subscriptionDecline)))).status).toBe(200);
      expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('not on IQPro'), expect.objectContaining({ provider: 'none' }));
    });
  });

  describe('subscription charges', () => {
    it('records a DECLINED subscription Sale (case-insensitive) with the documented fields', async () => {
      const res = await (await load())(post(signed(subscriptionDecline)));

      expect(res.status).toBe(200);
      expect(recordRecurringCharge).toHaveBeenCalledWith({
        provider: 'iqpro',
        eventKey: 'tx-1:DECLINED',
        organizationId: 'org_a',
        providerSubscriptionId: 'sub-1',
        providerTransactionId: 'tx-1',
        providerInvoiceId: null,
        amount: 103.75,
        outcome: 'declined',
        failureReason: 'Insufficient funds',
        occurredAt: new Date('2026-10-01T00:00:00Z'),
      });
    });

    it('falls back to `response` then "Declined" for the reason', async () => {
      const POST = await load();
      await POST(post(signed({ ...subscriptionDecline, processorResponseText: undefined })));

      expect(recordRecurringCharge.mock.calls[0]![0]).toMatchObject({ failureReason: 'Declined' });

      await POST(post(signed({ ...subscriptionDecline, processorResponseText: '', response: '' })));

      expect(recordRecurringCharge.mock.calls[1]![0]).toMatchObject({ failureReason: 'Declined' });
    });

    it('records any other status as paid (approved retry, e.g. PENDINGSETTLEMENT)', async () => {
      await (await load())(post(signed({ ...subscriptionDecline, status: 'PENDINGSETTLEMENT', invoiceId: 'inv-9' })));

      expect(recordRecurringCharge).toHaveBeenCalledWith(expect.objectContaining({
        outcome: 'paid',
        failureReason: null,
        eventKey: 'tx-1:PENDINGSETTLEMENT',
        providerInvoiceId: 'inv-9',
      }));
    });

    it('treats a missing or invalid amount / date defensively', async () => {
      await (await load())(post(signed({ ...subscriptionDecline, transactionRemit: { amount: 'abc' }, createdDateTime: 'not a date' })));

      expect(recordRecurringCharge).toHaveBeenCalledWith(expect.objectContaining({ amount: 0, occurredAt: undefined }));
    });

    it('ignores VOIDED / REFUNDED statuses', async () => {
      await (await load())(post(signed({ ...subscriptionDecline, status: 'VOIDED' })));

      expect(recordRecurringCharge).not.toHaveBeenCalled();
    });

    it('ignores non-TRANSACTION and non-Sale events', async () => {
      const POST = await load();
      await POST(post(signed(subscriptionDecline, { resourceType: 'SETTLEMENT' })));
      await POST(post(signed(subscriptionDecline, { subType: 'Refund' })));

      expect(recordRecurringCharge).not.toHaveBeenCalled();
    });

    it('ignores a subscription Sale with no transactionId (cannot dedupe)', async () => {
      const { transactionId: _omit, ...noTx } = subscriptionDecline;
      await (await load())(post(signed(noTx)));

      expect(recordRecurringCharge).not.toHaveBeenCalled();
      expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('without transactionId'), expect.any(Object));
    });

    it('never logs the masked card', async () => {
      await (await load())(post(signed(subscriptionDecline)));

      const logged = JSON.stringify([...loggerInfo.mock.calls, ...loggerWarn.mock.calls, ...loggerError.mock.calls]);

      expect(logged).not.toContain('411111');
    });

    it('500s (so IQPro redelivers) when recording throws', async () => {
      recordRecurringCharge.mockRejectedValue(new Error('db down'));

      expect((await (await load())(post(signed(subscriptionDecline)))).status).toBe(500);
    });

    it('500s on a non-Error throw', async () => {
      recordRecurringCharge.mockRejectedValue('boom');

      expect((await (await load())(post(signed(subscriptionDecline)))).status).toBe(500);
    });
  });

  describe('one-time Sales (no subscriptionId)', () => {
    const oneTime: Resource = { transactionId: 'tx-ot', status: 'SETTLED', customer: { customerId: 'cus-1' } };

    beforeEach(() => {
      resolveOrgByExternalRef.mockImplementation(async (type: string) => (type === 'provider_transaction' ? 'org_a' : null));
    });

    it('updates the existing row to paid and NEVER inserts', async () => {
      await (await load())(post(signed(oneTime)));

      expect(recordRecurringCharge).not.toHaveBeenCalled();
      expect(tenantUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }));

      const where = tenantUpdateWhere.mock.calls[0]![0];

      expect(JSON.stringify(where)).toContain('refunded');
      expect(JSON.stringify(where)).toContain('org_a');
    });

    it('updates the existing row to declined with the reason', async () => {
      await (await load())(post(signed({ ...oneTime, status: 'DECLINED', processorResponseText: 'Do not honor' })));

      expect(tenantUpdateSet).toHaveBeenCalledWith({ status: 'declined', failureReason: 'Do not honor' });
    });

    it('defaults the decline reason', async () => {
      await (await load())(post(signed({ ...oneTime, status: 'DECLINED' })));

      expect(tenantUpdateSet).toHaveBeenCalledWith({ status: 'declined', failureReason: 'Declined' });
    });

    it('does nothing without a transactionId', async () => {
      resolveOrgByExternalRef.mockImplementation(async (type: string) => (type === 'provider_customer' ? 'org_a' : null));
      await (await load())(post(signed({ status: 'SETTLED', customer: { customerId: 'cus-1' } })));

      expect(tenantDb.update).not.toHaveBeenCalled();
    });
  });

  describe('SaaS subscription (platform gateway)', () => {
    beforeEach(() => {
      controlFindFirst.mockResolvedValue({ id: 'org_saas', saasBillingCycle: 'monthly' });
      resolvePlatformIQProConfig.mockResolvedValue({ ...IQPRO_CONFIG, gatewayId: 'platform-gw' });
    });

    it('marks the org past_due on a decline, verified with the PLATFORM config', async () => {
      const res = await (await load())(post(signed(subscriptionDecline)));

      expect(res.status).toBe(200);
      expect(resolveWebhookPublicKey).toHaveBeenCalledWith(expect.objectContaining({ gatewayId: 'platform-gw' }), undefined);
      expect(controlUpdateSet).toHaveBeenCalledWith({ saasSubscriptionStatus: 'past_due' });
      expect(recordRecurringCharge).not.toHaveBeenCalled();
      expect(resolveOrgByExternalRef).not.toHaveBeenCalled();
    });

    it('marks the org active with a ms period end on success', async () => {
      const before = Date.now();
      await (await load())(post(signed({ ...subscriptionDecline, status: 'PENDINGSETTLEMENT' })));

      const set = (controlUpdateSet.mock.calls[0] as unknown as [{ saasSubscriptionStatus: string; saasCurrentPeriodEnd: number }])[0];

      expect(set.saasSubscriptionStatus).toBe('active');
      expect(set.saasCurrentPeriodEnd).toBeGreaterThanOrEqual(before + 29 * 24 * 3600 * 1000);
    });

    it('uses a one-year period for annual billing', async () => {
      controlFindFirst.mockResolvedValue({ id: 'org_saas', saasBillingCycle: 'annual' });
      const before = Date.now();
      await (await load())(post(signed({ ...subscriptionDecline, status: 'SETTLED' })));

      const set = (controlUpdateSet.mock.calls[0] as unknown as [{ saasCurrentPeriodEnd: number }])[0];

      expect(set.saasCurrentPeriodEnd).toBeGreaterThanOrEqual(before + 364 * 24 * 3600 * 1000);
    });

    it('handles a null billing cycle as monthly', async () => {
      controlFindFirst.mockResolvedValue({ id: 'org_saas', saasBillingCycle: null });
      await (await load())(post(signed({ ...subscriptionDecline, status: 'SETTLED' })));

      expect(controlUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ saasSubscriptionStatus: 'active' }));
    });

    it('401s a SaaS event with a bad signature', async () => {
      expect((await (await load())(post(signed(subscriptionDecline, { key: other.privateKey })))).status).toBe(401);
      expect(controlUpdateSet).not.toHaveBeenCalled();
    });

    it('401s when there is no platform config', async () => {
      resolvePlatformIQProConfig.mockResolvedValue(null);

      expect((await (await load())(post(signed(subscriptionDecline)))).status).toBe(401);
    });

    it('acknowledges but ignores non-TRANSACTION or reversal SaaS events', async () => {
      const POST = await load();
      await POST(post(signed(subscriptionDecline, { resourceType: 'INVOICE' })));
      await POST(post(signed({ ...subscriptionDecline, status: 'REFUNDED' })));

      expect(controlUpdateSet).not.toHaveBeenCalled();
    });
  });

  describe('payment-method sync after a recorded charge', () => {
    it('schedules a sync for the member after the response, inside the tenant scope', async () => {
      const res = await (await load())(post(signed(subscriptionDecline)));

      expect(res.status).toBe(200);
      expect(runAfterResponse).toHaveBeenCalledWith('IQPro payment-method sync', expect.any(Function));
      expect(syncMemberQuietly).not.toHaveBeenCalled();

      runWithTenant.mockClear();
      await runAfterResponse.mock.calls[0]![1]();

      expect(runWithTenant).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_a', db: tenantDb }), expect.any(Function));
      expect(syncMemberQuietly).toHaveBeenCalledWith('mem_1', 'org_a', IQPRO_CONFIG);
    });

    it('does not sync for a duplicate or unmatched event', async () => {
      recordRecurringCharge.mockResolvedValue({ status: 'duplicate' });

      await (await load())(post(signed(subscriptionDecline)));

      expect(runAfterResponse).not.toHaveBeenCalled();
    });
  });
});
