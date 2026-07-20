import { useCallback, useEffect, useReducer, useRef } from 'react';
import { client } from '@/libs/Orpc';

// =============================================================================
// TYPES
// =============================================================================

export type ClassSchedule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  instructorClerkId: string | null;
};

export type ClassScheduleException = {
  id: string;
  classScheduleInstanceId: string;
  exceptionDate: Date;
  exceptionType: string;
  newStartTime: string | null;
  newEndTime: string | null;
  newInstructorClerkId: string | null;
  reason: string | null;
};

export type ClassTag = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
};

export type ClassData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  defaultDurationMinutes: number | null;
  minAge: number | null;
  maxAge: number | null;
  maxCapacity: number | null;
  allowWalkIns: string | null;
  isActive: boolean | null;
  program: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
  } | null;
  tags: ClassTag[];
  schedule: ClassSchedule[];
  scheduleExceptions: ClassScheduleException[];
};

type CacheEntry = {
  data: ClassData[];
  timestamp: number;
  organizationId: string;
};

type CacheState = {
  classes: ClassData[];
  loading: boolean;
  error: string | null;
};

type CacheAction
  = | { type: 'RESET' }
    | { type: 'LOADING_START' }
    | { type: 'LOADING_END' }
    | { type: 'SET_CLASSES'; payload: ClassData[] }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cacheStore: CacheEntry | null = null;
const revalidateCallbacks: Array<() => void | Promise<void>> = [];

function cacheReducer(state: CacheState, action: CacheAction): CacheState {
  switch (action.type) {
    case 'RESET':
      return { classes: [], loading: false, error: null };
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'LOADING_END':
      return { ...state, loading: false };
    case 'SET_CLASSES':
      return { ...state, classes: action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

/**
 * Custom hook for intelligent classes caching with automatic invalidation.
 * Caches classes data and revalidates when organization changes or data mutations occur.
 */
export const useClassesCache = (organizationId?: string | undefined) => {
  const [state, dispatch] = useReducer(cacheReducer, {
    classes: [],
    loading: true,
    error: null,
  });

  // Use a ref to track the latest revalidate function to avoid stale closure issues
  const revalidateRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const isCacheValid = useCallback((cache: CacheEntry | null): boolean => {
    if (!cache) {
      return false;
    }
    // Cache is invalid if organization changed or if duration exceeded
    if (organizationId && cache.organizationId !== organizationId) {
      return false;
    }
    const now = Date.now();
    return (now - cache.timestamp) < CACHE_DURATION;
  }, [organizationId]);

  const fetchClasses = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      // Snapshot the module-global cache into a local so a concurrent
      // invalidate() between the validity check and the read can't null it out
      // (removes the load-bearing non-null assertion).
      const cached = cacheStore;
      if (cached && isCacheValid(cached)) {
        console.info('[Classes Cache] Using cached data for organization:', {
          organizationId,
          cacheAge: Date.now() - cached.timestamp,
        });
        dispatch({ type: 'SET_CLASSES', payload: cached.data });
        return;
      }

      console.info('[Classes Cache] Fetching fresh classes data for organization:', organizationId);

      const classesData = await client.classes.list();
      const classes = (classesData.classes || []) as ClassData[];

      // Update cache
      cacheStore = {
        data: classes,
        timestamp: Date.now(),
        organizationId: organizationId || '',
      };

      console.info('[Classes Cache] Classes data fetched and cached:', {
        count: classes.length,
        organizationId,
      });

      dispatch({ type: 'SET_CLASSES', payload: classes });
    } catch (err) {
      let errorMessage = 'Failed to fetch classes';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      }

      console.warn('[Classes Cache] Failed to fetch classes:', {
        error: errorMessage,
        organizationId,
      });

      // If we have cached data and the fetch fails, use the cached data
      if (cacheStore && isCacheValid(cacheStore)) {
        console.warn('[Classes Cache] Using stale cache as fallback after fetch error');
        dispatch({ type: 'SET_CLASSES', payload: cacheStore.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [organizationId, isCacheValid]);

  // Revalidate cache on demand
  const revalidate = useCallback(async () => {
    console.info('[Classes Cache] Manual revalidation triggered');
    cacheStore = null;
    await fetchClasses();
  }, [fetchClasses]);

  // Keep the ref updated with the latest revalidate function
  useEffect(() => {
    revalidateRef.current = revalidate;
  }, [revalidate]);

  // Register a stable callback for global cache invalidation
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

  // Reset state when organization is cleared, or fetch classes when it changes
  useEffect(() => {
    if (!organizationId) {
      dispatch({ type: 'RESET' });
      return;
    }

    fetchClasses();
  }, [organizationId, fetchClasses]);

  return {
    classes: state.classes,
    loading: state.loading,
    error: state.error,
    revalidate,
  };
};

/**
 * Invalidate classes cache globally
 */
export const invalidateClassesCache = async () => {
  console.info('[Classes Cache] Global cache invalidation triggered');
  cacheStore = null;
  await Promise.all(revalidateCallbacks.map(callback => callback()));
};
