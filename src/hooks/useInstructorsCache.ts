import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { client } from '@/libs/Orpc';

// =============================================================================
// TYPES
// =============================================================================

export type Instructor = {
  /** Clerk user id — stored as `primaryInstructorClerkId` on schedule/session rows. */
  id: string;
  name: string;
  photoUrl: string | null;
};

type CacheEntry = {
  instructors: Instructor[];
  timestamp: number;
  organizationId: string;
};

type CacheState = {
  instructors: Instructor[];
  loading: boolean;
  error: string | null;
};

type CacheAction
  = | { type: 'RESET' }
    | { type: 'LOADING_START' }
    | { type: 'SET_INSTRUCTORS'; payload: Instructor[] }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cacheStore: CacheEntry | null = null;
const revalidateCallbacks: Array<() => void | Promise<void>> = [];

function cacheReducer(state: CacheState, action: CacheAction): CacheState {
  switch (action.type) {
    case 'RESET':
      return { instructors: [], loading: false, error: null };
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'SET_INSTRUCTORS':
      return { instructors: action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

/**
 * Caches the org's assignable instructors (Clerk `org:instructor` +
 * `org:academy_owner`). Single source for instructor dropdowns and for
 * resolving a stored `primaryInstructorClerkId` to a display name/photo.
 */
export const useInstructorsCache = (organizationId?: string | undefined) => {
  const [state, dispatch] = useReducer(cacheReducer, {
    instructors: [],
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
    return (Date.now() - cache.timestamp) < CACHE_DURATION;
  }, [organizationId]);

  const fetchInstructors = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      // Snapshot the module-global cache into a local so a concurrent
      // invalidate() between the validity check and the read can't null it out
      // (removes the load-bearing non-null assertion).
      const cached = cacheStore;
      if (cached && isCacheValid(cached)) {
        dispatch({ type: 'SET_INSTRUCTORS', payload: cached.instructors });
        return;
      }

      const result = await client.instructors.list();
      const instructors = (result.instructors || []) as Instructor[];

      cacheStore = {
        instructors,
        timestamp: Date.now(),
        organizationId: organizationId || '',
      };

      dispatch({ type: 'SET_INSTRUCTORS', payload: instructors });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch instructors';
      console.warn('[Instructors Cache] Failed to fetch instructors:', { error: errorMessage, organizationId });

      if (cacheStore && isCacheValid(cacheStore)) {
        dispatch({ type: 'SET_INSTRUCTORS', payload: cacheStore.instructors });
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [organizationId, isCacheValid]);

  const revalidate = useCallback(async () => {
    cacheStore = null;
    await fetchInstructors();
  }, [fetchInstructors]);

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

    fetchInstructors();
  }, [organizationId, fetchInstructors]);

  // id -> instructor lookup for resolving stored clerk ids to name/photo.
  const instructorLookup = useMemo(() => {
    const map = new Map<string, Instructor>();
    for (const instructor of state.instructors) {
      map.set(instructor.id, instructor);
    }
    return map;
  }, [state.instructors]);

  return {
    instructors: state.instructors,
    instructorLookup,
    loading: state.loading,
    error: state.error,
    revalidate,
  };
};

/**
 * Invalidate the instructors cache globally (e.g. after inviting/removing staff).
 */
export const invalidateInstructorsCache = async () => {
  cacheStore = null;
  await Promise.all(revalidateCallbacks.map(callback => callback()));
};
