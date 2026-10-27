import type { OnboardState, Queryable } from './steps';
import { describe, expect, it, vi } from 'vitest';
import { TENANT_TABLES } from '../../services/TenantDataMap';
import { countOrgRows, ensureControlTrial, hasPaymentConfig, planSteps, readConfiguredProvider, readTenantRow, writePaymentConfig } from './steps';

function fakeDb(rowsFor: (sql: string) => unknown[]) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => ({ rows: rowsFor(sql) }));
  return { db: { query } as unknown as Queryable, query };
}

const FRESH: OnboardState = {
  clerkOrgExists: false,
  ownerAccessGranted: false,
  databaseExists: false,
  tenantStatus: null,
  orgRowCount: 0,
  paymentSaved: false,
  paymentRequested: true,
};

describe('planSteps', () => {
  it('lists every step in order for a fresh org, payment before activation', () => {
    expect(planSteps(FRESH).map(s => s.id)).toEqual(['clerk-org', 'owner', 'database', 'provision', 'seed', 'payment', 'activate', 'verify']);
    expect(planSteps(FRESH).every(s => !s.done)).toBe(true);
  });

  it('omits the payment step when no credentials were given', () => {
    expect(planSteps({ ...FRESH, paymentRequested: false }).map(s => s.id)).not.toContain('payment');
  });

  it('marks completed steps on resume after a failure mid-way', () => {
    const steps = planSteps({ ...FRESH, clerkOrgExists: true, ownerAccessGranted: true, databaseExists: true, tenantStatus: 'provisioning' });

    expect(steps.filter(s => s.done).map(s => s.id)).toEqual(['clerk-org', 'owner', 'database', 'provision']);
  });

  it('treats only an ACTIVE tenant as activated', () => {
    expect(planSteps({ ...FRESH, tenantStatus: 'provisioning' }).find(s => s.id === 'activate')?.done).toBe(false);
    expect(planSteps({ ...FRESH, tenantStatus: 'active' }).find(s => s.id === 'activate')?.done).toBe(true);
  });

  it('always re-runs verification', () => {
    const all = { ...FRESH, clerkOrgExists: true, ownerAccessGranted: true, databaseExists: true, tenantStatus: 'active', orgRowCount: 9, paymentSaved: true };

    expect(planSteps(all).filter(s => !s.done).map(s => s.id)).toEqual(['verify']);
  });
});

describe('state probes', () => {
  it('reads the tenant row', async () => {
    const { db } = fakeDb(() => [{ status: 'active', connection_string_enc: 'enc' }]);

    expect(await readTenantRow(db, 'org_1')).toEqual({ status: 'active', connectionStringEncrypted: 'enc' });
  });

  it('returns null with no tenant row', async () => {
    const { db } = fakeDb(() => []);

    expect(await readTenantRow(db, 'org_1')).toBeNull();
  });

  it('counts org rows across every tenant table, scoped to the org', async () => {
    const { db, query } = fakeDb(() => [{ n: '2' }]);

    expect(await countOrgRows(db, 'org_1')).toBe(2 * TENANT_TABLES.length);
    expect(query.mock.calls.every(([, params]) => params?.[0] === 'org_1')).toBe(true);
  });

  it('detects a saved payment blob', async () => {
    expect(await hasPaymentConfig(fakeDb(() => [{ enc: 'blob' }]).db, 'org_1')).toBe(true);
    expect(await hasPaymentConfig(fakeDb(() => [{ enc: null }]).db, 'org_1')).toBe(false);
    expect(await hasPaymentConfig(fakeDb(() => []).db, 'org_1')).toBe(false);
  });

  it('upserts the payment config so a missing organization row is created, not silently skipped', async () => {
    const { db, query } = fakeDb(() => []);
    await writePaymentConfig(db, 'org_1', 'iqpro', 'blob');
    const [sql, params] = query.mock.calls[0]!;

    expect(sql).toMatch(/INSERT INTO organization[\s\S]*ON CONFLICT \(id\) DO UPDATE/);
    expect(params).toEqual(['org_1', 'iqpro', 'blob']);
  });

  it('writes the provider column TOGETHER with the blob, so a Square org is never left marked iqpro', async () => {
    const { db, query } = fakeDb(() => []);
    await writePaymentConfig(db, 'org_1', 'square', 'square-blob');
    const [sql, params] = query.mock.calls[0]!;

    expect(sql).toMatch(/SET payment_provider = EXCLUDED\.payment_provider,\s+payment_provider_config_enc = EXCLUDED\.payment_provider_config_enc/);
    expect(params).toEqual(['org_1', 'square', 'square-blob']);
  });

  it('reports the configured provider only when credentials are saved', async () => {
    expect(await readConfiguredProvider(fakeDb(() => [{ provider: 'square', enc: 'blob' }]).db, 'org_1')).toBe('square');
    expect(await readConfiguredProvider(fakeDb(() => [{ provider: 'iqpro', enc: null }]).db, 'org_1')).toBeNull();
    expect(await readConfiguredProvider(fakeDb(() => []).db, 'org_1')).toBeNull();
  });
});

describe('ensureControlTrial', () => {
  const NOW = 1_000_000;

  it('writes a 30-day trial (period end in ms) when the org has no billing row', async () => {
    const { db, query } = fakeDb(sql => (sql.startsWith('SELECT') ? [] : []));
    const result = await ensureControlTrial(db, 'org_1', 'user_owner', NOW);

    expect(result).toEqual({ written: true, status: 'trial' });

    const [sql, params] = query.mock.calls[1]!;

    expect(sql).toMatch(/INSERT INTO organization[\s\S]*ON CONFLICT \(id\) DO UPDATE[\s\S]*WHERE organization\.saas_subscription_status IS NULL/);
    expect(params).toEqual(['org_1', NOW + 30 * 24 * 60 * 60 * 1000, 'user_owner']);
  });

  it('also fills a row that exists with no status (seed\'s org row, written without a trial)', async () => {
    const { db, query } = fakeDb(sql => (sql.startsWith('SELECT') ? [{ status: null }] : []));

    expect(await ensureControlTrial(db, 'org_1', undefined, NOW)).toEqual({ written: true, status: 'trial' });
    expect((query.mock.calls[1]![1] as unknown[])[2]).toMatch(/^seed_owner_user_/);
  });

  it('never touches an org that already has a subscription status — a real subscription is not overwritten', async () => {
    const { db, query } = fakeDb(() => [{ status: 'active' }]);

    expect(await ensureControlTrial(db, 'org_1', 'user_owner', NOW)).toEqual({ written: false, status: 'active' });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
