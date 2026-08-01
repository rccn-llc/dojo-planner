import { useCallback, useEffect, useReducer, useRef } from 'react';
import { client } from '@/libs/Orpc';
import { clearInFlight, dedupeRequest } from './dedupeRequest';

// =============================================================================
// TYPES
// =============================================================================

export type EventSession = {
  id: string;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  instructorClerkId: string | null;
};

export type EventBilling = {
  id: string;
  name: string;
  price: number;
  memberOnly: boolean | null;
  validUntil: Date | null;
};

export type EventTag = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
};

export type EventData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  eventType: string;
  location: string | null;
  note: string | null;
  maxCapacity: number | null;
  isActive: boolean | null;
  tags: EventTag[];
  sessions: EventSession[];
  billing: EventBilling[];
};

type CacheEntry = {
  data: EventData[];
  timestamp: number;
  organizationId: string;
};

type CacheState = {
  events: EventData[];
  loading: boolean;
  error: string | null;
};

type CacheAction
  = | { type: 'RESET' }
    | { type: 'LOADING_START' }
    | { type: 'LOADING_END' }
    | { type: 'SET_EVENTS'; payload: EventData[] }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cacheStore: CacheEntry | null = null;
const revalidateCallbacks: Array<() => void | Promise<void>> = [];

function cacheReducer(state: CacheState, action: CacheAction): CacheState {
  switch (action.type) {
    case 'RESET':
      return { events: [], loading: false, error: null };
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'LOADING_END':
      return { ...state, loading: false };
    case 'SET_EVENTS':
      return { ...state, events: action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

/**
 * Custom hook for intelligent events caching with automatic invalidation.
 */
export const useEventsCache = (organizationId?: string | undefined) => {
  const [state, dispatch] = useReducer(cacheReducer, {
    events: [],
    loading: true,
    error: null,
  });

  const revalidateRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const isCacheValid = useCallback((cache: CacheEntry | null): boolean => {
    if (!cache) {
      return false;
    }
    if (organizationId && cache.organizationId !== organizationId) {
      return false;
    }
    const now = Date.now();
    return (now - cache.timestamp) < CACHE_DURATION;
  }, [organizationId]);

  const fetchEvents = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      // Snapshot the module-global cache into a local so a concurrent
      // invalidate() between the validity check and the read can't null it out
      // (removes the load-bearing non-null assertion).
      const cached = cacheStore;
      if (cached && isCacheValid(cached)) {
        console.info('[Events Cache] Using cached data for organization:', {
          organizationId,
          cacheAge: Date.now() - cached.timestamp,
        });
        dispatch({ type: 'SET_EVENTS', payload: cached.data });
        return;
      }

      console.info('[Events Cache] Fetching fresh events data for organization:', organizationId);

      // Several components can mount this hook in the same tick; without
      // de-duping, each one fires its own request against the cold cache.
      const eventsData = await dedupeRequest(`events:${organizationId || ''}`, async () => client.events.list());
      const events = (eventsData.events || []) as EventData[];

      cacheStore = {
        data: events,
        timestamp: Date.now(),
        organizationId: organizationId || '',
      };

      console.info('[Events Cache] Events data fetched and cached:', {
        count: events.length,
        organizationId,
      });

      dispatch({ type: 'SET_EVENTS', payload: events });
    } catch (err) {
      let errorMessage = 'Failed to fetch events';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      }

      console.warn('[Events Cache] Failed to fetch events:', {
        error: errorMessage,
        organizationId,
      });

      if (cacheStore && isCacheValid(cacheStore)) {
        console.warn('[Events Cache] Using stale cache as fallback after fetch error');
        dispatch({ type: 'SET_EVENTS', payload: cacheStore.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [organizationId, isCacheValid]);

  const revalidate = useCallback(async () => {
    console.info('[Events Cache] Manual revalidation triggered');
    cacheStore = null;
    clearInFlight();
    await fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    revalidateRef.current = revalidate;
  }, [revalidate]);

  useEffect(() => {
    const stableCallback = () => {
      revalidateRef.current?.();
    };
    revalidateCallbacks.push(stableCallback);
    return () => {
      const index = revalidateCallbacks.indexOf(stableCallback);
      if (index > -1) {
        revalidateCallbacks.splice(index, 1);
      }
    };
  }, []);

  useEffect(() => {
    if (!organizationId) {
      dispatch({ type: 'RESET' });
      return;
    }

    fetchEvents();
  }, [organizationId, fetchEvents]);

  return {
    events: state.events,
    loading: state.loading,
    error: state.error,
    revalidate,
  };
};

/**
 * Invalidate events cache globally
 */
export const invalidateEventsCache = async () => {
  console.info('[Events Cache] Global cache invalidation triggered');
  cacheStore = null;
  clearInFlight();
  await Promise.all(revalidateCallbacks.map(callback => callback()));
};
