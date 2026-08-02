import { useCallback, useEffect, useState } from 'react';
import { client } from '@/libs/Orpc';

export type OrganizationLocation = {
  address: string | null;
  phone: string | null;
  email: string | null;
  taxRate: number;
};

const EMPTY_LOCATION: OrganizationLocation = {
  address: null,
  phone: null,
  email: null,
  taxRate: 0,
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Module-level cache shared by every hook instance. The calendar renders one
// `ClassEventHoverCard` per event, and each one calls this hook — without
// sharing, a month of classes fires one `getLocation` request per event.
let cached: { location: OrganizationLocation; timestamp: number } | null = null;
// De-dupes concurrent first-loads: instances mounting in the same tick await
// the same request rather than each issuing their own.
let inFlight: Promise<OrganizationLocation> | null = null;
// Identifies which request currently owns `inFlight`, so a settling request
// only clears the slot when it has not already been superseded by a newer one.
let activeToken: symbol | null = null;
const subscribers = new Set<(location: OrganizationLocation) => void>();

async function loadLocation(force: boolean): Promise<OrganizationLocation> {
  if (!force && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.location;
  }
  if (!force && inFlight) {
    return inFlight;
  }

  // Identity token captured before the async body runs, so the cleanup below
  // can tell "my request is still the current one" without referring to the
  // promise variable while it is still being initialised.
  const token = Symbol('getLocation');
  activeToken = token;

  const request = (async () => {
    try {
      const result = await client.organization.getLocation();
      cached = { location: result.location, timestamp: Date.now() };
      subscribers.forEach(notify => notify(result.location));
      return result.location;
    } finally {
      // Clear the shared slot from inside the request itself so a rejected
      // promise is never handed to a later caller by the `inFlight` fast path.
      if (activeToken === token) {
        inFlight = null;
        activeToken = null;
      }
    }
  })();

  inFlight = request;
  return await request;
}

export function useOrganizationLocation() {
  const [location, setLocation] = useState<OrganizationLocation>(
    () => cached?.location ?? EMPTY_LOCATION,
  );
  const [loading, setLoading] = useState(() => cached === null);
  const [error, setError] = useState<string | null>(null);

  // Keep every mounted instance in step when any of them refetches.
  useEffect(() => {
    subscribers.add(setLocation);
    return () => {
      subscribers.delete(setLocation);
    };
  }, []);

  const fetchLocation = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      setLocation(await loadLocation(options?.force ?? false));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load location');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await fetchLocation();
    })();
  }, [fetchLocation]);

  // `refetch` always bypasses the cache — callers use it after a save to pull
  // the values they just wrote.
  const refetch = useCallback(async () => {
    await fetchLocation({ force: true });
  }, [fetchLocation]);

  return { location, loading, error, refetch };
}
