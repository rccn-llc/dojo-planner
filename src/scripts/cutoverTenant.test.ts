import { spawnSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runStep } from './cutoverTenant';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

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
