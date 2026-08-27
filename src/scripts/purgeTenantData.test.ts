import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const end = vi.fn(async () => {});

vi.mock('pg', () => ({
  Pool: class {
    query = query;
    end = end;
    on = vi.fn();
    connect = vi.fn();
  },
}));

const { countOrgRows } = await import('./purgeTenantData');

/** The function takes a pool; hand it the same mock `pg` returns. */
const pool = { query, end } as never;

describe('countOrgRows — what a purge would remove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports only tables that hold rows, so the review list stays short', async () => {
    query.mockImplementation((sql: string) =>
      Promise.resolve({ rows: [{ n: sql.includes('"member"') ? '14' : '0' }] }),
    );

    const counts = await countOrgRows(pool, 'org_a');

    expect(counts).toEqual([{ table: 'member', rows: 14 }]);
  });

  it('walks tables in REVERSE insert order — children before parents', async () => {
    // Deleting a parent first would violate a foreign key: nothing cascades,
    // so the order is load-bearing. TenantDataMap is in INSERT order, hence
    // the reverse here and in the DELETE loop.
    const { TENANT_TABLES } = await import('../services/TenantDataMap');
    query.mockResolvedValue({ rows: [{ n: '1' }] });

    const counts = await countOrgRows(pool, 'org_a');

    expect(counts.map(c => c.table)).toEqual([...TENANT_TABLES].reverse().map(t => t.table));
  });

  it('scopes every count to the org, never a bare table scan', async () => {
    query.mockResolvedValue({ rows: [{ n: '0' }] });

    await countOrgRows(pool, 'org_a');

    for (const call of query.mock.calls) {
      expect(call[0]).toContain('WHERE');
      expect(call[1]).toEqual(['org_a']);
    }
  });
});

describe('assertSafeToPurgeShared — the only-copy guard', () => {
  const SHARED = 'postgres://shared';
  const CONTROL = 'postgres://control';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONTROL_DATABASE_URL = CONTROL;
    process.env.CONTROL_PLANE_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('REFUSES when the org has no tenant row', async () => {
    // Without a row there is no proof the org owns another database, so the
    // target may be its only copy.
    query.mockResolvedValue({ rows: [] });
    const { assertSafeToPurgeShared } = await import('./purgeTenantData');

    await expect(assertSafeToPurgeShared('org_a', SHARED, pool)).rejects.toThrow(/No tenant row/);
  });

  it('REFUSES an org that is not cut over', async () => {
    // Its rows live only in the shared database. Deleting them here destroys
    // the organization.
    const { encryptConnectionString, tenantEncryptionKey } = await import('../libs/TenantCrypto');
    query.mockResolvedValue({
      rows: [{ connection_string_enc: encryptConnectionString(SHARED, tenantEncryptionKey()!) }],
    });
    const { assertSafeToPurgeShared } = await import('./purgeTenantData');

    await expect(assertSafeToPurgeShared('org_a', SHARED, pool)).rejects.toThrow(/served from/);
  });

  it('REFUSES when the target IS the org\'s own database', async () => {
    // The purest only-copy case: checking that database for data would pass,
    // and we would then empty the very thing just verified.
    const { encryptConnectionString, tenantEncryptionKey } = await import('../libs/TenantCrypto');
    const own = 'postgres://tenant-a';
    query.mockResolvedValue({
      rows: [{ connection_string_enc: encryptConnectionString(own, tenantEncryptionKey()!) }],
    });
    const { assertSafeToPurgeShared } = await import('./purgeTenantData');

    await expect(assertSafeToPurgeShared('org_a', own, pool)).rejects.toThrow(/served from/);
  });

  it('ALLOWS purging the source once the org is cut over and its own db has data', async () => {
    // The whole point of the phase: after a soak, the shared copy can go —
    // but only because the org's own database demonstrably holds the rows.
    const { encryptConnectionString, tenantEncryptionKey } = await import('../libs/TenantCrypto');
    const own = 'postgres://tenant-a';

    query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenant')) {
        return Promise.resolve({
          rows: [{ connection_string_enc: encryptConnectionString(own, tenantEncryptionKey()!) }],
        });
      }
      // assertDestinationHasData counting the org's own database
      return Promise.resolve({ rows: [{ n: '780' }] });
    });

    const { assertSafeToPurgeShared } = await import('./purgeTenantData');

    await expect(assertSafeToPurgeShared('org_a', SHARED, pool)).resolves.toBeUndefined();
  });

  it('REFUSES when the org is cut over but its own database is EMPTY', async () => {
    // A cut-over row pointing at an unpopulated database. Deleting the source
    // here strands the org with nothing — the failure assertDestinationHasData
    // exists to prevent.
    const { encryptConnectionString, tenantEncryptionKey } = await import('../libs/TenantCrypto');

    query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenant')) {
        return Promise.resolve({
          rows: [{ connection_string_enc: encryptConnectionString('postgres://tenant-a', tenantEncryptionKey()!) }],
        });
      }
      return Promise.resolve({ rows: [{ n: '0' }] });
    });

    const { assertSafeToPurgeShared } = await import('./purgeTenantData');

    await expect(assertSafeToPurgeShared('org_a', SHARED, pool)).rejects.toThrow(/NO rows/);
  });
});
