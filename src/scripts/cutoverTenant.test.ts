import { spawnSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runStep } from './cutoverTenant';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

const query = vi.fn();
// `pool.end()` is awaited with `.catch(...)`, so it must return a promise.
const end = vi.fn(async () => {});

vi.mock('pg', () => ({
  // `new Pool(...)` — must be constructible, so a class rather than an arrow.
  Pool: class {
    query = query;
    end = end;
    on = vi.fn();
  },
}));

const spawn = vi.mocked(spawnSync);

describe('runStep — the cutover abort contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aborts the cutover when a step exits non-zero', () => {
    // This is the property the ordering depends on: if the copy or the verify
    // fails, activation must NOT happen. A cut-over org pointing at a
    // half-copied database is the exact state this phase exists to prevent.
    spawn.mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);

    expect(() => runStep('verify', 'src/scripts/verifyTenantCopy.ts', ['--orgId=org_a']))
      .toThrow(/is NOT active/);
  });

  it('aborts when a step dies on a signal rather than an exit code', () => {
    // A killed child yields status null, which is not 0 — it must not be
    // mistaken for success.
    spawn.mockReturnValue({ status: null } as ReturnType<typeof spawnSync>);

    expect(() => runStep('copy', 'src/scripts/copyTenantData.ts', ['--orgId=org_a']))
      .toThrow(/Cutover aborted/);
  });

  it('passes through on success so the next step runs', () => {
    spawn.mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

    expect(() => runStep('copy', 'src/scripts/copyTenantData.ts', ['--orgId=org_a'])).not.toThrow();
    expect(spawn).toHaveBeenCalledWith(
      'npx',
      ['tsx', 'src/scripts/copyTenantData.ts', '--orgId=org_a'],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });
});

describe('assertDestinationHasData — the activate-only guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('REFUSES a destination holding no rows for the org', async () => {
    // Activating an empty database is silent: resolveTenant starts serving the
    // org from it once the 60s cache expires, and every read comes back empty
    // with no error. This guard is the only thing standing in the way, because
    // activate-only has no copy and no verify step.
    query.mockResolvedValue({ rows: [{ n: '0' }] });
    const { assertDestinationHasData } = await import('./cutoverTenant');

    await expect(assertDestinationHasData('postgres://empty', 'org_a')).rejects.toThrow(/NO rows/);
  });

  it('allows a destination that was seeded', async () => {
    query.mockResolvedValue({ rows: [{ n: '5' }] });
    const { assertDestinationHasData } = await import('./cutoverTenant');

    await expect(assertDestinationHasData('postgres://seeded', 'org_a')).resolves.toBeUndefined();
  });

  it('counts only THIS org\'s rows, not "tables exist"', async () => {
    // A Neon branch inherits its parent's schema, so every table is present in
    // an unseeded destination. Only a row count scoped to the org distinguishes
    // "ready" from "empty".
    query.mockResolvedValue({ rows: [{ n: '0' }] });
    const { assertDestinationHasData } = await import('./cutoverTenant');

    await expect(assertDestinationHasData('postgres://branch', 'org_a')).rejects.toThrow();

    const [, params] = query.mock.calls[0]!;

    expect(params).toEqual(['org_a']);
  });

  it('releases the pool even when a count query throws', async () => {
    query.mockRejectedValue(new Error('relation does not exist'));
    const { assertDestinationHasData } = await import('./cutoverTenant');

    await expect(assertDestinationHasData('postgres://x', 'org_a')).rejects.toThrow(/relation/);
    expect(end).toHaveBeenCalled();
  });
});
