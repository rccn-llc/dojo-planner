import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearInFlight, dedupeRequest } from './dedupeRequest';

describe('dedupeRequest', () => {
  beforeEach(() => {
    clearInFlight();
  });

  it('runs a single request for concurrent callers sharing a key', async () => {
    const run = vi.fn(async () => 'value');

    const results = await Promise.all([
      dedupeRequest('org_1', run),
      dedupeRequest('org_1', run),
      dedupeRequest('org_1', run),
    ]);

    expect(run).toHaveBeenCalledTimes(1);
    expect(results).toEqual(['value', 'value', 'value']);
  });

  it('keeps different keys independent', async () => {
    const run = vi.fn(async () => 'value');

    await Promise.all([dedupeRequest('org_1', run), dedupeRequest('org_2', run)]);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('releases the slot once settled so later callers refetch', async () => {
    const run = vi.fn(async () => 'value');

    await dedupeRequest('org_1', run);
    await dedupeRequest('org_1', run);

    expect(run).toHaveBeenCalledTimes(2);
  });

  // A cached rejection would wedge every later caller on the same failure.
  it('does not cache a rejection', async () => {
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });

    await expect(dedupeRequest('org_1', failing)).rejects.toThrow('boom');

    const succeeding = vi.fn(async () => 'recovered');

    await expect(dedupeRequest('org_1', succeeding)).resolves.toBe('recovered');
  });

  it('propagates the rejection to every concurrent caller', async () => {
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });

    const a = dedupeRequest('org_1', failing);
    const b = dedupeRequest('org_1', failing);

    await expect(a).rejects.toThrow('boom');
    await expect(b).rejects.toThrow('boom');
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('clearInFlight drops a pending request so a refetch is not joined', async () => {
    // Each call gets its own resolver, so both promises can be settled.
    const releases: Array<(value: string) => void> = [];
    const run = vi.fn(() => new Promise<string>((resolve) => {
      releases.push(resolve);
    }));

    const first = dedupeRequest('org_1', run);
    clearInFlight('org_1');
    const second = dedupeRequest('org_1', run);

    // Without the clear, the second call would have joined the first.
    expect(run).toHaveBeenCalledTimes(2);

    releases.forEach(resolve => resolve('value'));

    await expect(Promise.all([first, second])).resolves.toEqual(['value', 'value']);
  });
});
