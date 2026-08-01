import { useCallback, useEffect, useReducer, useRef } from 'react';
import { client } from '@/libs/Orpc';
import { clearInFlight, dedupeRequest } from './dedupeRequest';

// =============================================================================
// TYPES
// =============================================================================

export type Coupon = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  applicableTo: string;
  usageLimit: number | null;
  usageCount: number;
  perUserLimit: number;
  status: string;
  validFrom: Date;
  validUntil: Date | null;
  createdAt: Date;
};

type CacheEntry = {
  data: Coupon[];
  timestamp: number;
  organizationId: string;
};

type CacheState = {
  coupons: Coupon[];
  loading: boolean;
  error: string | null;
};

type CacheAction
  = | { type: 'RESET' }
    | { type: 'LOADING_START' }
    | { type: 'LOADING_END' }
    | { type: 'SET_COUPONS'; payload: Coupon[] }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cacheStore: CacheEntry | null = null;
const revalidateCallbacks: Array<() => void | Promise<void>> = [];

function cacheReducer(state: CacheState, action: CacheAction): CacheState {
  switch (action.type) {
    case 'RESET':
      return { coupons: [], loading: false, error: null };
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'LOADING_END':
      return { ...state, loading: false };
    case 'SET_COUPONS':
      return { ...state, coupons: action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

/**
 * Custom hook for intelligent coupons caching with automatic invalidation.
 */
export const useCouponsCache = (organizationId?: string | undefined) => {
  const [state, dispatch] = useReducer(cacheReducer, {
    coupons: [],
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

  const fetchCoupons = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      // Snapshot the module-global cache into a local so a concurrent
      // invalidate() between the validity check and the read can't null it out
      // (removes the load-bearing non-null assertion).
      const cached = cacheStore;
      if (cached && isCacheValid(cached)) {
        console.info('[Coupons Cache] Using cached data for organization:', {
          organizationId,
          cacheAge: Date.now() - cached.timestamp,
        });
        dispatch({ type: 'SET_COUPONS', payload: cached.data });
        return;
      }

      console.info('[Coupons Cache] Fetching fresh coupons data for organization:', organizationId);

      // Several components can mount this hook in the same tick; without
      // de-duping, each one fires its own request against the cold cache.
      const couponsData = await dedupeRequest(`coupons:${organizationId || ''}`, async () => client.coupons.list());
      const coupons = (couponsData.coupons || []) as Coupon[];

      cacheStore = {
        data: coupons,
        timestamp: Date.now(),
        organizationId: organizationId || '',
      };

      console.info('[Coupons Cache] Coupons data fetched and cached:', {
        count: coupons.length,
        organizationId,
      });

      dispatch({ type: 'SET_COUPONS', payload: coupons });
    } catch (err) {
      let errorMessage = 'Failed to fetch coupons';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      }

      console.warn('[Coupons Cache] Failed to fetch coupons:', {
        error: errorMessage,
        organizationId,
      });

      if (cacheStore && isCacheValid(cacheStore)) {
        console.warn('[Coupons Cache] Using stale cache as fallback after fetch error');
        dispatch({ type: 'SET_COUPONS', payload: cacheStore.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [organizationId, isCacheValid]);

  const revalidate = useCallback(async () => {
    console.info('[Coupons Cache] Manual revalidation triggered');
    cacheStore = null;
    clearInFlight();
    await fetchCoupons();
  }, [fetchCoupons]);

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

    fetchCoupons();
  }, [organizationId, fetchCoupons]);

  return {
    coupons: state.coupons,
    loading: state.loading,
    error: state.error,
    revalidate,
  };
};

/**
 * Invalidate coupons cache globally
 */
export const invalidateCouponsCache = async () => {
  console.info('[Coupons Cache] Global cache invalidation triggered');
  cacheStore = null;
  clearInFlight();
  await Promise.all(revalidateCallbacks.map(callback => callback()));
};
