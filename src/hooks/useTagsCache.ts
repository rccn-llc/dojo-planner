import { useCallback, useEffect, useReducer, useRef } from 'react';
import { client } from '@/libs/Orpc';
import { clearInFlight, dedupeRequest } from './dedupeRequest';

// =============================================================================
// TYPES
// =============================================================================

export type Tag = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  entityType: string;
  usageCount: number;
  classNames?: string[];
  membershipNames?: string[];
};

type CacheEntry = {
  classTags: Tag[];
  membershipTags: Tag[];
  timestamp: number;
  organizationId: string;
};

type CacheState = {
  classTags: Tag[];
  membershipTags: Tag[];
  loading: boolean;
  error: string | null;
};

type CacheAction
  = | { type: 'RESET' }
    | { type: 'LOADING_START' }
    | { type: 'LOADING_END' }
    | { type: 'SET_TAGS'; payload: { classTags: Tag[]; membershipTags: Tag[] } }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cacheStore: CacheEntry | null = null;
const revalidateCallbacks: Array<() => void | Promise<void>> = [];

function cacheReducer(state: CacheState, action: CacheAction): CacheState {
  switch (action.type) {
    case 'RESET':
      return { classTags: [], membershipTags: [], loading: false, error: null };
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'LOADING_END':
      return { ...state, loading: false };
    case 'SET_TAGS':
      return {
        ...state,
        classTags: action.payload.classTags,
        membershipTags: action.payload.membershipTags,
        loading: false,
        error: null,
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

/**
 * Custom hook for intelligent tags caching with automatic invalidation.
 * Fetches both class tags and membership tags in parallel.
 */
export const useTagsCache = (organizationId?: string | undefined) => {
  const [state, dispatch] = useReducer(cacheReducer, {
    classTags: [],
    membershipTags: [],
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

  const fetchTags = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      // Snapshot the module-global cache into a local so a concurrent
      // invalidate() between the validity check and the read can't null it out
      // (removes the load-bearing non-null assertion).
      const cached = cacheStore;
      if (cached && isCacheValid(cached)) {
        console.info('[Tags Cache] Using cached data for organization:', {
          organizationId,
          cacheAge: Date.now() - cached.timestamp,
        });
        dispatch({
          type: 'SET_TAGS',
          payload: {
            classTags: cached.classTags,
            membershipTags: cached.membershipTags,
          },
        });
        return;
      }

      console.info('[Tags Cache] Fetching fresh tags data for organization:', organizationId);

      // Fetch both tag types in parallel, de-duped as one unit so a second
      // instance mounting against the cold cache doesn't double both calls.
      const { classTags, membershipTags } = await dedupeRequest(
        `tags:${organizationId || ''}`,
        async () => {
          const [classTagsData, membershipTagsData] = await Promise.all([
            client.tags.listClassTags(),
            client.tags.listMembershipTags(),
          ]);

          return {
            classTags: (classTagsData.tags || []) as Tag[],
            membershipTags: (membershipTagsData.tags || []) as Tag[],
          };
        },
      );

      cacheStore = {
        classTags,
        membershipTags,
        timestamp: Date.now(),
        organizationId: organizationId || '',
      };

      console.info('[Tags Cache] Tags data fetched and cached:', {
        classTagsCount: classTags.length,
        membershipTagsCount: membershipTags.length,
        organizationId,
      });

      dispatch({ type: 'SET_TAGS', payload: { classTags, membershipTags } });
    } catch (err) {
      let errorMessage = 'Failed to fetch tags';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      }

      console.warn('[Tags Cache] Failed to fetch tags:', {
        error: errorMessage,
        organizationId,
      });

      if (cacheStore && isCacheValid(cacheStore)) {
        console.warn('[Tags Cache] Using stale cache as fallback after fetch error');
        dispatch({
          type: 'SET_TAGS',
          payload: {
            classTags: cacheStore.classTags,
            membershipTags: cacheStore.membershipTags,
          },
        });
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [organizationId, isCacheValid]);

  const revalidate = useCallback(async () => {
    console.info('[Tags Cache] Manual revalidation triggered');
    cacheStore = null;
    clearInFlight();
    await fetchTags();
  }, [fetchTags]);

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

    fetchTags();
  }, [organizationId, fetchTags]);

  return {
    classTags: state.classTags,
    membershipTags: state.membershipTags,
    loading: state.loading,
    error: state.error,
    revalidate,
  };
};

/**
 * Invalidate tags cache globally
 */
export const invalidateTagsCache = async () => {
  console.info('[Tags Cache] Global cache invalidation triggered');
  cacheStore = null;
  clearInFlight();
  await Promise.all(revalidateCallbacks.map(callback => callback()));
};
