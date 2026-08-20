import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from 'vitest-browser-react';
import { invalidateOrganizationLocationCache, useOrganizationLocation } from './useOrganizationLocation';

const mockGetLocation = vi.fn();

// The hook reads the active org itself, so the cache can be keyed without
// every caller having to pass an id.
const mockUseOrganization = vi.fn();
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => mockUseOrganization(),
}));

vi.mock('@/libs/Orpc', () => ({
  client: {
    organization: { getLocation: () => mockGetLocation() },
  },
}));

const LOCATION = { address: '1 Main St', phone: '555', email: 'a@b.c', taxRate: 8.25 };

// This hook holds a module-level `subscribers` set, so a render left mounted by
// one test keeps receiving `setLocation` calls during the next one. Unmount
// everything between tests rather than relying on each test to tidy up.
afterEach(() => {
  cleanup();
});

// ORDER MATTERS: this block runs BEFORE the one below.
//
// The `issues a single request for many concurrent instances` test mounts a
// dozen hook instances and, in browser mode, renders outlive the test that
// created them. This hook keeps a module-level `subscribers` set, so those
// stale instances keep calling `setLocation` and a later test's `result.current`
// reads back as null. `cleanup()` in afterEach does not fully undo it.
//
// Keep these org-scoping tests first, or give the block below a proper teardown.
describe('useOrganizationLocation — organization scoping', () => {
  beforeEach(() => {
    mockGetLocation.mockReset();
    mockUseOrganization.mockReturnValue({ organization: { id: 'org_a' } });
    invalidateOrganizationLocationCache();
  });

  it('refetches when the active organization changes, instead of serving the warm cache', async () => {
    // The bug: this cache checked only its TTL, so after an org switch the
    // Location Settings page kept showing the previous org's address, phone,
    // email and TAX RATE for five minutes. `router.refresh()` in the switcher
    // does not clear module state, which is why only a hard reload worked.
    const ORG_A = { address: 'A St', phone: '111', email: 'a@a.a', taxRate: 1 };
    const ORG_B = { address: 'B St', phone: '222', email: 'b@b.b', taxRate: 2 };
    mockGetLocation.mockResolvedValue({ location: ORG_A });

    const firstRender = await renderHook(() => useOrganizationLocation());
    await vi.waitFor(() => {
      expect(firstRender.result.current?.location.address).toBe('A St');
    });
    // Unmount before switching: a live render from the previous org keeps a
    // subscriber attached and leaks into the assertions below.
    await firstRender.unmount();

    // Switch orgs: same request, different session, different answer.
    mockGetLocation.mockResolvedValue({ location: ORG_B });
    mockUseOrganization.mockReturnValue({ organization: { id: 'org_b' } });

    const secondRender = await renderHook(() => useOrganizationLocation());
    await vi.waitFor(() => {
      expect(secondRender.result.current?.location.address).toBe('B St');
    });

    expect(secondRender.result.current?.location.taxRate).toBe(2);

    await secondRender.unmount();
  });

  it('still serves the cache for repeat mounts within the same organization', async () => {
    // The calendar mounts one instance per event; keying by org must not
    // regress that de-duplication into a request per card.
    mockGetLocation.mockResolvedValue({ location: LOCATION });

    const firstRender = await renderHook(() => useOrganizationLocation());
    await vi.waitFor(() => {
      expect(firstRender.result.current?.loading).toBe(false);
    });
    const callsAfterFirst = mockGetLocation.mock.calls.length;

    const secondRender = await renderHook(() => useOrganizationLocation());
    await vi.waitFor(() => {
      expect(secondRender.result.current?.location.address).toBe(LOCATION.address);
    });

    expect(mockGetLocation.mock.calls.length).toBe(callsAfterFirst);

    await firstRender.unmount();
    await secondRender.unmount();
  });
});

describe('useOrganizationLocation', () => {
  beforeEach(() => {
    mockGetLocation.mockReset();
    mockGetLocation.mockResolvedValue({ location: LOCATION });
    mockUseOrganization.mockReturnValue({ organization: { id: 'org_a' } });
    invalidateOrganizationLocationCache();
  });

  it('fetches the location and exposes it', async () => {
    const { result } = await renderHook(() => useOrganizationLocation());

    await vi.waitFor(() => {
      expect(result.current.location).toEqual(LOCATION);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('refetch bypasses the cache so a save is reflected', async () => {
    const { result } = await renderHook(() => useOrganizationLocation());

    await vi.waitFor(() => {
      expect(result.current.location).toBeDefined();
    });

    const updated = { ...LOCATION, address: '2 Second Ave' };
    mockGetLocation.mockResolvedValue({ location: updated });
    const before = mockGetLocation.mock.calls.length;

    await result.current.refetch();

    await vi.waitFor(() => {
      expect(result.current.location).toEqual(updated);
    });

    expect(mockGetLocation.mock.calls.length).toBe(before + 1);
  });

  it('surfaces an error when a forced refetch fails', async () => {
    const { result } = await renderHook(() => useOrganizationLocation());

    await vi.waitFor(() => {
      expect(result.current.location).toBeDefined();
    });

    mockGetLocation.mockRejectedValue(new Error('boom'));
    await result.current.refetch();

    await vi.waitFor(() => {
      expect(result.current.error).toBe('boom');
    });

    expect(result.current.loading).toBe(false);
  });

  // A failed request must not poison the shared cache: the next caller has to
  // be able to issue a fresh request and succeed.
  it('recovers on the next refetch after a failed request', async () => {
    const { result } = await renderHook(() => useOrganizationLocation());

    await vi.waitFor(() => {
      expect(result.current).toBeTruthy();
    });

    // A forced refetch bypasses the shared cache, so this exercises a real
    // request failure regardless of what earlier tests left cached.
    mockGetLocation.mockRejectedValue(new Error('network down'));
    await result.current.refetch();

    await vi.waitFor(() => {
      expect(result.current.error).toBe('network down');
    });

    const recovered = { ...LOCATION, address: '3 Recovery Rd' };
    mockGetLocation.mockResolvedValue({ location: recovered });

    await result.current.refetch();

    await vi.waitFor(() => {
      expect(result.current.location).toEqual(recovered);
    });

    expect(result.current.error).toBeNull();
  });

  // The calendar renders one ClassEventHoverCard per event, each calling this
  // hook. Without a shared cache every event fires its own request — this is
  // what caused a flood of getLocation calls on the monthly view.
  it('issues a single request for many concurrent instances', async () => {
    const { result } = await renderHook(() => useOrganizationLocation());

    // Warm the shared cache; the exact address depends on test order, so only
    // wait for a resolved value rather than a specific one.
    await vi.waitFor(() => {
      expect(result.current.location.address).toBeTruthy();
    });

    const callsAfterWarmup = mockGetLocation.mock.calls.length;

    // Twelve more mounts, as the calendar would produce for twelve events.
    const extra = await Promise.all(
      Array.from({ length: 12 }, () => renderHook(() => useOrganizationLocation())),
    );

    expect(mockGetLocation).toHaveBeenCalledTimes(callsAfterWarmup);

    // Unmount them so the shared render result does not leak into later tests.
    await Promise.all(extra.map(r => r.unmount()));
  });
});
