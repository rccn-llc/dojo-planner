import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// pg.Pool is mocked: these tests are about the cache's bookkeeping (identity,
// eviction, invalidation), not about talking to a database.
type MockPoolInstance = {
  connectionString: string;
  end: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

const poolInstances: MockPoolInstance[] = [];

vi.mock('pg', () => {
  // A real class: TenantDb calls `new Pool(...)`, so the mock must be
  // constructible.
  class MockPool {
    connectionString: string;
    end = vi.fn().mockResolvedValue(undefined);
    on = vi.fn();

    constructor(config: { connectionString: string }) {
      this.connectionString = config.connectionString;
      poolInstances.push(this);
    }
  }

  return { Pool: MockPool };
});

vi.mock('drizzle-orm/node-postgres', () => ({
  // Tag the handle with its pool so tests can assert identity.
  drizzle: vi.fn(({ client }: { client: { connectionString: string } }) => ({
    __connectionString: client.connectionString,
  })),
}));

describe('tenantDb', () => {
  let getTenantDb: typeof import('./TenantDb').getTenantDb;
  let invalidateTenantPool: typeof import('./TenantDb').invalidateTenantPool;
  let closeAllTenantPools: typeof import('./TenantDb').closeAllTenantPools;
  let tenantPoolCount: typeof import('./TenantDb').tenantPoolCount;

  beforeEach(async () => {
    poolInstances.length = 0;
    // The pool map is cached on globalThis to survive HMR, so it must be
    // cleared between tests or state leaks across cases.
    delete (globalThis as { tenantPools?: unknown }).tenantPools;
    vi.resetModules();

    const tenantDbModule = await import('./TenantDb');
    getTenantDb = tenantDbModule.getTenantDb;
    invalidateTenantPool = tenantDbModule.invalidateTenantPool;
    closeAllTenantPools = tenantDbModule.closeAllTenantPools;
    tenantPoolCount = tenantDbModule.tenantPoolCount;
  });

  afterEach(async () => {
    await closeAllTenantPools();
  });

  it('opens one pool per organization when they use different databases', () => {
    getTenantDb('org_a', 'postgres://a');
    getTenantDb('org_b', 'postgres://b');

    expect(tenantPoolCount()).toBe(2);
    expect(poolInstances).toHaveLength(2);
  });

  it('shares ONE socket across organizations pointing at the same database', () => {
    // Regression guard. While every org resolves to the same shared database
    // (the no-op phase), opening a pool per org multiplies connections for no
    // benefit — and pglite-server accepts exactly ONE connection locally, so
    // the extra sockets are refused mid-query as `read ECONNRESET`.
    const first = getTenantDb('org_a', 'postgres://shared');
    const second = getTenantDb('org_b', 'postgres://shared');
    const third = getTenantDb('org_c', 'postgres://shared');

    expect(poolInstances).toHaveLength(1);
    // All three orgs are tracked, but over one connection.
    expect(tenantPoolCount()).toBe(3);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('does not close a shared socket while another organization still uses it', () => {
    getTenantDb('org_a', 'postgres://shared');
    getTenantDb('org_b', 'postgres://shared');

    invalidateTenantPool('org_a');

    expect(tenantPoolCount()).toBe(1);
    // org_b is still using it.
    expect(poolInstances[0]?.end).not.toHaveBeenCalled();
  });

  it('closes the shared socket once the last organization releases it', () => {
    getTenantDb('org_a', 'postgres://shared');
    getTenantDb('org_b', 'postgres://shared');

    invalidateTenantPool('org_a');
    invalidateTenantPool('org_b');

    expect(tenantPoolCount()).toBe(0);
    expect(poolInstances[0]?.end).toHaveBeenCalled();
  });

  it('reuses the cached handle on repeat access', () => {
    const first = getTenantDb('org_a', 'postgres://a');
    const second = getTenantDb('org_a', 'postgres://a');

    expect(second).toBe(first);
    // The important part: no second socket was opened.
    expect(poolInstances).toHaveLength(1);
  });

  it('keeps each organization on its own connection string', () => {
    const a = getTenantDb('org_a', 'postgres://a') as unknown as { __connectionString: string };
    const b = getTenantDb('org_b', 'postgres://b') as unknown as { __connectionString: string };

    expect(a.__connectionString).toBe('postgres://a');
    expect(b.__connectionString).toBe('postgres://b');
  });

  it('registers an error handler so an idle-pool error cannot crash the process', () => {
    getTenantDb('org_a', 'postgres://a');

    expect(poolInstances[0]?.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('evicts the least-recently-used pool past the bound', async () => {
    // TENANT_POOL_MAX defaults to 12.
    for (let i = 0; i < 12; i++) {
      getTenantDb(`org_${i}`, `postgres://${i}`);
    }

    expect(tenantPoolCount()).toBe(12);

    // Touch org_0 so org_1 becomes least-recently-used.
    getTenantDb('org_0', 'postgres://0');
    getTenantDb('org_new', 'postgres://new');

    expect(tenantPoolCount()).toBe(12);
    // org_1 was evicted and its socket closed.
    expect(poolInstances[1]?.end).toHaveBeenCalled();
    // org_0 survived because it was re-touched.
    expect(poolInstances[0]?.end).not.toHaveBeenCalled();
  });

  it('invalidateTenantPool drops the entry and closes its socket', () => {
    getTenantDb('org_a', 'postgres://a');

    invalidateTenantPool('org_a');

    expect(tenantPoolCount()).toBe(0);
    expect(poolInstances[0]?.end).toHaveBeenCalled();
  });

  it('invalidateTenantPool is a no-op for an unknown organization', () => {
    expect(() => invalidateTenantPool('org_missing')).not.toThrow();
  });

  it('re-opens after invalidation, picking up a new connection string', () => {
    getTenantDb('org_a', 'postgres://old');
    invalidateTenantPool('org_a');

    const reopened = getTenantDb('org_a', 'postgres://new') as unknown as { __connectionString: string };

    expect(reopened.__connectionString).toBe('postgres://new');
  });

  it('closeAllTenantPools empties the cache and closes every socket', async () => {
    getTenantDb('org_a', 'postgres://a');
    getTenantDb('org_b', 'postgres://b');

    await closeAllTenantPools();

    expect(tenantPoolCount()).toBe(0);
    expect(poolInstances[0]?.end).toHaveBeenCalled();
    expect(poolInstances[1]?.end).toHaveBeenCalled();
  });
});
