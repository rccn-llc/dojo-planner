import { useOrganization } from '@clerk/nextjs';
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
//
// KEYED BY ORGANIZATION. `getLocation` takes no arguments — the server derives
// the org from the Clerk session — so switching orgs changes what the SAME
// request returns. Without the org on the cache entry this served the previous
// org's address, phone, email and TAX RATE for the full TTL, and tax feeds
// money arithmetic. `router.refresh()` in the org switcher does not help:
// it re-renders Server Components and leaves module state like this intact.
let cached: { organizationId: string; location: OrganizationLocation; timestamp: number } | null = null;

/** A cache hit only counts when it belongs to the org being asked about. */
function cachedFor(organizationId: string | undefined): OrganizationLocation | null {
  if (!organizationId || !cached || cached.organizationId !== organizationId) {
    return null;
  }
  return Date.now() - cached.timestamp < CACHE_DURATION ? cached.location : null;
}
// De-dupes concurrent first-loads: instances mounting in the same tick await
// the same request rather than each issuing their own.
let inFlight: Promise<OrganizationLocation> | null = null;
// Identifies which request currently owns `inFlight`, so a settling request
// only clears the slot when it has not already been superseded by a newer one.
let activeToken: symbol | null = null;
// Which org `inFlight` belongs to, so a switch mid-request cannot adopt it.
let inFlightOrgId: string | null = null;
const subscribers = new Set<(location: OrganizationLocation) => void>();

async function loadLocation(organizationId: string, force: boolean): Promise<OrganizationLocation> {
  if (!force) {
    const hit = cachedFor(organizationId);
    if (hit) {
      return hit;
    }
  }
  // Only share an in-flight request with callers asking about the same org.
  if (!force && inFlight && inFlightOrgId === organizationId) {
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
      cached = { organizationId, location: result.location, timestamp: Date.now() };
      subscribers.forEach(notify => notify(result.location));
      return result.location;
    } finally {
      // Clear the shared slot from inside the request itself so a rejected
      // promise is never handed to a later caller by the `inFlight` fast path.
      if (activeToken === token) {
        inFlight = null;
        activeToken = null;
        inFlightOrgId = null;
      }
    }
  })();

  inFlight = request;
  inFlightOrgId = organizationId;
  return await request;
}

export function useOrganizationLocation() {
  // Read the active org here rather than making every caller thread it in:
  // all six consumers want "the current org's location", and an argument they
  // could forget to pass is exactly how this bug happened.
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // Seeded from the cache only when it belongs to THIS org, so a switch cannot
  // flash the previous org's address on first render.
  const [location, setLocation] = useState<OrganizationLocation>(
    () => cachedFor(organizationId) ?? EMPTY_LOCATION,
  );
  const [loading, setLoading] = useState(() => cachedFor(organizationId) === null);
  const [error, setError] = useState<string | null>(null);

  // Keep every mounted instance in step when any of them refetches.
  useEffect(() => {
    subscribers.add(setLocation);
    return () => {
      subscribers.delete(setLocation);
    };
  }, []);

  const fetchLocation = useCallback(async (options?: { force?: boolean }) => {
    if (!organizationId) {
      setLocation(EMPTY_LOCATION);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setLocation(await loadLocation(organizationId, options?.force ?? false));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load location');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // `organizationId` reaches this through `fetchLocation`'s identity, so an org
  // switch re-runs the fetch instead of serving the stale module cache.
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

/**
 * Drop the cached location. Called by the org-change guard so a switch cannot
 * serve the previous org's address or tax rate, and usable after a save.
 */
export function invalidateOrganizationLocationCache(): void {
  cached = null;
  inFlight = null;
  activeToken = null;
  inFlightOrgId = null;
}
