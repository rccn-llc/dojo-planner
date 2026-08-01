import { useCallback, useEffect, useReducer, useRef } from 'react';
import { client } from '@/libs/Orpc';
import { clearInFlight, dedupeRequest } from './dedupeRequest';

// =============================================================================
// TYPES
// =============================================================================

export type Program = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  classCount: number;
};

type CacheEntry = {
  data: Program[];
  timestamp: number;
  organizationId: string;
};

type CacheState = {
  programs: Program[];
  loading: boolean;
  error: string | null;
};

type CacheAction
  = | { type: 'RESET' }
    | { type: 'LOADING_START' }
    | { type: 'LOADING_END' }
    | { type: 'SET_PROGRAMS'; payload: Program[] }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cacheStore: CacheEntry | null = null;
const revalidateCallbacks: Array<() => void | Promise<void>> = [];

function cacheReducer(state: CacheState, action: CacheAction): CacheState {
  switch (action.type) {
    case 'RESET':
      return { programs: [], loading: false, error: null };
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'LOADING_END':
      return { ...state, loading: false };
    case 'SET_PROGRAMS':
      return { ...state, programs: action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

/**
 * Custom hook for intelligent programs caching with automatic invalidation.
 */
export const useProgramsCache = (organizationId?: string | undefined) => {
  const [state, dispatch] = useReducer(cacheReducer, {
    programs: [],
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

  const fetchPrograms = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      // Snapshot the module-global cache into a local so a concurrent
      // invalidate() between the validity check and the read can't null it out
      // (removes the load-bearing non-null assertion).
      const cachedPrograms = cacheStore;
      if (cachedPrograms && isCacheValid(cachedPrograms)) {
        dispatch({ type: 'SET_PROGRAMS', payload: cachedPrograms.data });
        return;
      }

      // Several components can mount this hook in the same tick; without
      // de-duping, each one fires its own request against the cold cache.
      const result = await dedupeRequest(`programs:${organizationId || ''}`, async () => client.programs.list());
      const programs = (result.programs || []) as Program[];

      cacheStore = {
        data: programs,
        timestamp: Date.now(),
        organizationId: organizationId || '',
      };

      dispatch({ type: 'SET_PROGRAMS', payload: programs });
    } catch (err) {
      let errorMessage = 'Failed to fetch programs';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      }

      console.warn('[Programs Cache] Failed to fetch programs:', {
        error: errorMessage,
        organizationId,
      });

      if (cacheStore && isCacheValid(cacheStore)) {
        dispatch({ type: 'SET_PROGRAMS', payload: cacheStore.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [organizationId, isCacheValid]);

  const revalidate = useCallback(async () => {
    cacheStore = null;
    clearInFlight();
    await fetchPrograms();
  }, [fetchPrograms]);

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

    fetchPrograms();
  }, [organizationId, fetchPrograms]);

  return {
    programs: state.programs,
    loading: state.loading,
    error: state.error,
    revalidate,
  };
};

/**
 * Invalidate programs cache globally
 */
export const invalidateProgramsCache = async () => {
  cacheStore = null;
  clearInFlight();
  await Promise.all(revalidateCallbacks.map(callback => callback()));
};
