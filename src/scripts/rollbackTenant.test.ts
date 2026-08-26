import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const end = vi.fn();

vi.mock('pg', () => ({
  // `new Pool(...)` — must be constructible, so a class rather than an arrow.
  Pool: class {
    query = query;
    end = end;
    // TenantDb attaches an error handler to every pool it opens.
    on = vi.fn();
  },
}));

const { countStranded } = await import('./rollbackTenant');

describe('countStranded — what a rollback would leave behind', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports only tables that actually hold rows', async () => {
    // The operator needs the SHORT list. Reporting all 38 tables with mostly
    // zeroes buries the three that matter.
    query.mockImplementation((sql: string) => {
      const n = sql.includes('"attendance"') ? '7' : '0';
      return Promise.resolve({ rows: [{ n }] });
    });

    const stranded = await countStranded('postgres://tenant', 'org_a');

    expect(stranded).toEqual([{ table: 'attendance', rows: 7 }]);
  });

  it('reports nothing when the tenant database is empty for this org', async () => {
    // The common case: rolling back minutes after a cutover strands nothing,
    // and the script must say so rather than warn about a risk that is absent.
    query.mockResolvedValue({ rows: [{ n: '0' }] });

    await expect(countStranded('postgres://tenant', 'org_a')).resolves.toEqual([]);
  });

  it('releases the pool even when a count query throws', async () => {
    // A rollback is run under pressure. Leaking a connection because one
    // table failed to count would make the situation worse.
    query.mockRejectedValue(new Error('relation does not exist'));

    await expect(countStranded('postgres://tenant', 'org_a')).rejects.toThrow('relation does not exist');
    expect(end).toHaveBeenCalled();
  });
});
