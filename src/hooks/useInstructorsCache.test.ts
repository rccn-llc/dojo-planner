import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useInstructorsCache } from './useInstructorsCache';

const mockList = vi.fn();

vi.mock('@/libs/Orpc', () => ({
  client: {
    instructors: { list: () => mockList() },
  },
}));

const INSTRUCTORS = [
  { id: 'user_1', name: 'Ada Lovelace', photoUrl: null },
  { id: 'user_2', name: 'Grace Hopper', photoUrl: null },
];

const ORG = 'org_test_123';

describe('useInstructorsCache', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockList.mockResolvedValue({ instructors: INSTRUCTORS });
  });

  it('fetches instructors for an organization', async () => {
    const { result } = await renderHook(() => useInstructorsCache(ORG));

    await vi.waitFor(() => {
      expect(result.current.instructors).toEqual(INSTRUCTORS);
    });

    expect(result.current.error).toBeNull();
  });

  it('resolves a clerk id to a name via instructorLookup', async () => {
    const { result } = await renderHook(() => useInstructorsCache(ORG));

    await vi.waitFor(() => {
      expect(result.current.instructors.length).toBeGreaterThan(0);
    });

    expect(result.current.instructorLookup.get('user_1')?.name).toBe('Ada Lovelace');
  });

  it('does not fetch without an organization id', async () => {
    const { result } = await renderHook(() => useInstructorsCache(undefined));

    expect(result.current.instructors).toEqual([]);
    expect(mockList).not.toHaveBeenCalled();
  });

  // A class page mounts several components that use this hook. The cache is
  // only written once the request resolves, so without an in-flight guard every
  // instance mounting in the same tick fires its own `instructors.list()` call
  // — an expensive duplicate, since that endpoint hits the Clerk API.
  it('collapses concurrent cold-cache mounts into a single request', async () => {
    // Hold the request open so all six mounts race against an empty cache:
    // `revalidate` clears the cache, and the pending promise keeps it empty
    // until we release it.
    let release: ((value: { instructors: typeof INSTRUCTORS }) => void) | undefined;
    mockList.mockReturnValue(new Promise((resolve) => {
      release = resolve;
    }));

    const warm = await renderHook(() => useInstructorsCache(ORG));
    const clearing = warm.result.current.revalidate();
    const callsBeforeMounts = mockList.mock.calls.length;

    const mounted = await Promise.all(
      Array.from({ length: 6 }, () => renderHook(() => useInstructorsCache(ORG))),
    );

    // Six mounts against an empty cache add no requests of their own — they
    // all attach to the single pending call.
    expect(mockList.mock.calls.length).toBe(callsBeforeMounts);

    release?.({ instructors: INSTRUCTORS });
    await clearing;

    await vi.waitFor(() => {
      expect(mounted.at(-1)?.result.current.instructors).toEqual(INSTRUCTORS);
    });

    await Promise.all([...mounted, warm].map(m => m.unmount()));
  });
});
