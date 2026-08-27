import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const end = vi.fn(async () => {});

vi.mock('pg', () => ({
  Pool: class {
    query = query;
    end = end;
    on = vi.fn();
  },
}));

describe('countOrgRowsIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('totals the org\'s rows so the operator knows what is being abandoned', async () => {
    // Deprovisioning does not delete the database, so this count is what the
    // operator carries to the console to delete by hand — and what confirms
    // they are deleting the right one.
    query.mockResolvedValue({ rows: [{ n: '10' }] });
    const { countOrgRowsIn } = await import('./deprovisionTenant');
    const { TENANT_TABLES } = await import('../services/TenantDataMap');

    const total = await countOrgRowsIn('postgres://tenant-a', 'org_a');

    expect(total).toBe(10 * TENANT_TABLES.length);
  });

  it('scopes every count to the org', async () => {
    query.mockResolvedValue({ rows: [{ n: '0' }] });
    const { countOrgRowsIn } = await import('./deprovisionTenant');

    await countOrgRowsIn('postgres://tenant-a', 'org_a');

    for (const call of query.mock.calls) {
      expect(call[1]).toEqual(['org_a']);
    }
  });

  it('releases the pool when a count throws', async () => {
    query.mockRejectedValue(new Error('relation does not exist'));
    const { countOrgRowsIn } = await import('./deprovisionTenant');

    await expect(countOrgRowsIn('postgres://x', 'org_a')).rejects.toThrow(/relation/);
    expect(end).toHaveBeenCalled();
  });
});
