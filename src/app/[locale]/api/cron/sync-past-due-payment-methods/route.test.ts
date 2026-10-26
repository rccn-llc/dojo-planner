import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'test_cron_secret_not_real_123';
const envMock: { CRON_SECRET?: string } = { CRON_SECRET: SECRET };
vi.mock('@/libs/Env', () => ({ Env: envMock }));

const tenantRows = vi.fn();
vi.mock('@/libs/ControlDb', () => ({
  controlDb: { select: () => ({ from: () => ({ where: () => tenantRows() }) }) },
}));
vi.mock('@/models/ControlSchema', () => ({ TENANT_STATUS: { ACTIVE: 'active' }, tenantSchema: { orgId: 'org_id', status: 'status' } }));
vi.mock('drizzle-orm', () => ({ eq: (...a: unknown[]) => ({ eq: a }) }));
const runWithTenant = vi.fn(async (_s: unknown, fn: () => Promise<unknown>) => fn());
vi.mock('@/libs/TenantContext', () => ({ runWithTenant: (s: unknown, fn: () => Promise<unknown>) => runWithTenant(s, fn) }));
const getDbForOrg = vi.fn();
vi.mock('@/services/TenantDirectoryService', () => ({ getDbForOrg: (o: string) => getDbForOrg(o) }));
const resolvePaymentProviderConfig = vi.fn();
vi.mock('@/services/PaymentProviderConfigService', () => ({ resolvePaymentProviderConfig: (o: string) => resolvePaymentProviderConfig(o) }));
const syncPastDuePaymentMethods = vi.fn();
vi.mock('@/services/PaymentMethodSyncService', () => ({ syncPastDuePaymentMethods: (...a: unknown[]) => syncPastDuePaymentMethods(...a) }));
const loggerError = vi.fn();
vi.mock('@/libs/Logger', () => ({ logger: { info: vi.fn(), error: (...a: unknown[]) => loggerError(...a) } }));

function req(auth?: string) {
  return new Request('https://example.test/api/cron/sync-past-due-payment-methods', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe('past-due payment-method sync cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CRON_SECRET = SECRET;
    tenantRows.mockResolvedValue([{ orgId: 'org_a' }, { orgId: 'org_b' }]);
    getDbForOrg.mockResolvedValue({ db: true });
    resolvePaymentProviderConfig.mockResolvedValue({ provider: 'iqpro' });
    syncPastDuePaymentMethods.mockResolvedValue({ checked: 2, changed: 1, failed: 0 });
  });

  it.each([
    ['no header', undefined],
    ['a wrong secret', 'Bearer wrong_secret_value_here_x'],
    ['a different-length header', 'Bearer x'],
  ])('401s with %s', async (_label, auth) => {
    const { GET } = await import('./route');

    expect((await GET(req(auth))).status).toBe(401);
    expect(tenantRows).not.toHaveBeenCalled();
  });

  it('fails closed when CRON_SECRET is not configured', async () => {
    delete envMock.CRON_SECRET;
    const { GET } = await import('./route');

    expect((await GET(req(`Bearer ${SECRET}`))).status).toBe(401);
  });

  it('syncs every active org inside its tenant scope', async () => {
    const { GET } = await import('./route');
    const res = await GET(req(`Bearer ${SECRET}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      orgs: 2,
      results: [
        { orgId: 'org_a', checked: 2, changed: 1, failed: 0 },
        { orgId: 'org_b', checked: 2, changed: 1, failed: 0 },
      ],
    });
    expect(runWithTenant).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_a', source: 'cron' }), expect.any(Function));
    expect(syncPastDuePaymentMethods).toHaveBeenCalledWith('org_a', { provider: 'iqpro' });
  });

  it('reports zero for an org without a payment provider', async () => {
    resolvePaymentProviderConfig.mockResolvedValueOnce(null).mockResolvedValueOnce({ provider: 'square' });
    const { GET } = await import('./route');
    const body = await (await GET(req(`Bearer ${SECRET}`))).json();

    expect(body.results[0]).toEqual({ orgId: 'org_a', checked: 0, changed: 0, failed: 0 });
  });

  it('keeps going when one org fails', async () => {
    getDbForOrg.mockRejectedValueOnce(new Error('tenant 503')).mockResolvedValueOnce({ db: true });
    const { GET } = await import('./route');
    const body = await (await GET(req(`Bearer ${SECRET}`))).json();

    expect(body.results[0]).toEqual({ orgId: 'org_a', error: 'tenant 503' });
    expect(body.results[1]).toMatchObject({ orgId: 'org_b', checked: 2 });
    expect(loggerError).toHaveBeenCalled();
  });

  it('records a non-Error failure as a string', async () => {
    getDbForOrg.mockRejectedValueOnce('down');
    const { GET } = await import('./route');
    const body = await (await GET(req(`Bearer ${SECRET}`))).json();

    expect(body.results[0]).toEqual({ orgId: 'org_a', error: 'down' });
  });
});
