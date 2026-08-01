import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useOrganizationLocation } from './useOrganizationLocation';

const mockGetLocation = vi.fn();

vi.mock('@/libs/Orpc', () => ({
  client: {
    organization: { getLocation: () => mockGetLocation() },
  },
}));

const LOCATION = { address: '1 Main St', phone: '555', email: 'a@b.c', taxRate: 8.25 };

describe('useOrganizationLocation', () => {
  beforeEach(() => {
    mockGetLocation.mockReset();
    mockGetLocation.mockResolvedValue({ location: LOCATION });
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
