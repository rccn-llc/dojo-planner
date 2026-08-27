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
