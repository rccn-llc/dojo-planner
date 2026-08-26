import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { TENANT_STATUS } from '../models/ControlSchema';
import { insertChunked, setTenantStatus } from './copyTenantData';

function poolReturning(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { pool: { query } as unknown as Pool, query };
}

describe('setTenantStatus — the write freeze', () => {
  it('returns the status the row held BEFORE the update, not after', async () => {
    // The regression this pins: a plain `RETURNING status` hands back the
    // value just written, so the unfreeze would restore `migrating` — leaving
    // the org permanently unservable by the very code meant to release it.
    const { pool, query } = poolReturning([{ prior: TENANT_STATUS.ACTIVE }]);

    const prior = await setTenantStatus(pool, 'org_a', TENANT_STATUS.MIGRATING);

    expect(prior).toBe(TENANT_STATUS.ACTIVE);

    const [sql, params] = query.mock.calls[0]!;

    expect(sql).toContain('WITH before AS');
    expect(params).toEqual(['org_a', TENANT_STATUS.MIGRATING]);
  });

  it('returns null when no tenant row exists, so the caller can refuse', async () => {
    // A missing row must NOT be treated as "was active" — restoring a
    // non-existent org to active would be a silent no-op that hides the fact
    // that the copy ran against an unprovisioned tenant.
    const { pool } = poolReturning([]);

    await expect(setTenantStatus(pool, 'org_missing', TENANT_STATUS.MIGRATING)).resolves.toBeNull();
  });

  it('restores an arbitrary prior status rather than forcing active', async () => {
    // A row that was `provisioning` before the copy must stay non-servable
    // until the copy is verified — that is the A5 step-3 ordering.
    const { pool, query } = poolReturning([{ prior: TENANT_STATUS.PROVISIONING }]);

    await setTenantStatus(pool, 'org_a', TENANT_STATUS.PROVISIONING);

    expect(query.mock.calls[0]![1]).toEqual(['org_a', TENANT_STATUS.PROVISIONING]);
  });
});

describe('insertChunked', () => {
  it('preserves ids verbatim so the copy stays idempotent', async () => {
    const query = vi.fn().mockResolvedValue({});
    const client = { query };

    await insertChunked(client, 'member', ['id', 'organization_id'], [
      { id: 'mem_1', organization_id: 'org_a' },
      { id: 'mem_2', organization_id: 'org_a' },
    ]);

    const params = query.mock.calls[0]![1] as unknown[];

    expect(params).toContain('mem_1');
    expect(params).toContain('mem_2');
  });
});
