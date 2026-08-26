import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Webhook tenant routing.
 *
 * This file did not exist before A2, which mattered: `getBootstrapTenantDb()`
 * prefers CONTROL_DATABASE_URL, so once the planes separate every handler here
 * would have run against the CONTROL database. Tenant-table UPDATEs would match
 * zero rows — a payment captured at the gateway while the member's status never
 * changed, with nothing logged. These tests pin the routing that replaces it.
 */

const resolveOrgByExternalRef = vi.fn();
const getDbForOrg = vi.fn();
const runWithTenant = vi.fn(async (_scope: unknown, fn: () => Promise<unknown>) => fn());
const loggerError = vi.fn();
const loggerWarn = vi.fn();

const tenantUpdateWhere = vi.fn();
const tenantDb = {
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: tenantUpdateWhere })) })),
  query: {
    memberMembershipSchema: { findFirst: vi.fn().mockResolvedValue(undefined) },
    organizationSchema: { findFirst: vi.fn().mockResolvedValue(undefined) },
  },
};

// The control handle must be a DIFFERENT spy: asserting the tenant handle was
// NOT used for saas_* columns is the whole point of the plane split.
const controlFindFirst = vi.fn().mockResolvedValue(undefined);
const controlDb = {
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  query: { organizationSchema: { findFirst: controlFindFirst } },
};

vi.mock('@/libs/DB', () => ({ db: tenantDb }));
vi.mock('@/libs/ControlPlaneReads', () => ({ controlOrganizationDb: () => controlDb }));
vi.mock('@/libs/TenantContext', () => ({
  runWithTenant: (scope: unknown, fn: () => Promise<unknown>) => runWithTenant(scope, fn),
  requireTenantScope: () => ({ orgId: 'org_resolved' }),
}));
vi.mock('@/libs/WebhookTenantScope', () => ({
  getBootstrapTenantDb: () => tenantDb,
  WEBHOOK_BOOTSTRAP_ORG_ID: '__webhook_bootstrap__',
}));
vi.mock('@/services/TenantDirectoryService', () => ({
  getDbForOrg: (orgId: string) => getDbForOrg(orgId),
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
  logger: { info: vi.fn(), warn: (...a: unknown[]) => loggerWarn(...a), error: (...a: unknown[]) => loggerError(...a) },
}));
vi.mock('@/libs/RateLimit', () => ({
  getClientIP: () => '127.0.0.1',
  isRateLimitingEnabled: () => false,
  webhookRateLimiter: { limit: vi.fn() },
}));
vi.mock('@/libs/Env', () => ({ Env: { IQPRO_WEBHOOK_SECRET: 'test-secret' } }));
// `headers()` throws outside a Next request scope; the route reads it for the
// signature header.
vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-iqpro-signature', 'sig']]),
}));
vi.mock('@/models/Schema', () => ({
  memberMembershipSchema: { providerSubscriptionId: 'psid', memberId: 'member_id', status: 'status' },
  memberSchema: { id: 'id', status: 'status', statusChangedAt: 'changed' },
  organizationSchema: { id: 'id', saasProviderSubscriptionId: 'saas_sub' },
  transactionSchema: { providerTransactionId: 'ptid', organizationId: 'org_id', status: 'status' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _and: a }),
  eq: (col: unknown, val: unknown) => ({ _eq: [col, val] }),
  ne: (col: unknown, val: unknown) => ({ _ne: [col, val] }),
}));

// Signature validation is out of scope here; accept every payload.
//
// The route imports this through a VARIABLE specifier
// (`await import(iqproModule)`) to dodge bundling, which also dodges vi.mock's
// static specifier matching — so stub the module in the loader cache instead.
vi.mock('@dojo-planner/iqpro-client', () => ({
  WebhookValidator: class {
    validateWebhook() {
      return { isValid: true, errors: [] };
    }
  },
}));

function paymentCompleted(transactionId: string) {
  return new Request('https://example.test/webhook/iqpro', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-iqpro-signature': 'sig' },
    body: JSON.stringify({ type: 'payment.completed', id: 'evt_1', data: { id: transactionId } }),
  });
}

describe('iQPro webhook tenant routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveOrgByExternalRef.mockResolvedValue(null);
    getDbForOrg.mockResolvedValue(tenantDb);
  });

  it('opens the OWNING org scope when the external ref resolves', async () => {
    resolveOrgByExternalRef.mockResolvedValue('org_resolved');
    const { POST } = await import('./route');

    await POST(paymentCompleted('tx_1'));

    expect(resolveOrgByExternalRef).toHaveBeenCalledWith('provider_transaction', 'tx_1');
    expect(getDbForOrg).toHaveBeenCalledWith('org_resolved');
    expect(runWithTenant).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_resolved', source: 'webhook' }),
      expect.any(Function),
    );
  });

  it('still processes an unmapped event in shared mode', async () => {
    // Refs minted before this table existed have no row. One physical database
    // means the bootstrap scope reaches the same rows, so behaviour is
    // unchanged and the event must NOT be dropped.
    resolveOrgByExternalRef.mockResolvedValue(null);
    const { POST } = await import('./route');

    await POST(paymentCompleted('tx_legacy'));

    expect(tenantUpdateWhere).toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('processes an unmapped event against the shared database, and says so', async () => {
    // An unmapped id predates ref-writing, so its rows can only be in the
    // shared database. The regression guarded here is the inverse of the old
    // one: it must NOT go silent. A cut-over org's ids are mapped at mint
    // time, so this path cannot reach a cut-over org's data.
    resolveOrgByExternalRef.mockResolvedValue(null);
    const { POST } = await import('./route');

    await POST(paymentCompleted('tx_orphan'));

    // It runs under the bootstrap scope (the shared database) rather than
    // resolving a per-org one — and it processes rather than dropping.
    expect(tenantUpdateWhere).toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('No tenant mapping'),
      expect.objectContaining({ refId: 'tx_orphan' }),
    );
  });
});
