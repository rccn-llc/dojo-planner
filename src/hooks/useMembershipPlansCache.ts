import { useCallback, useEffect, useReducer, useRef } from 'react';
import { client } from '@/libs/Orpc';
import { clearInFlight, dedupeRequest } from './dedupeRequest';

// =============================================================================
// TYPES
// =============================================================================

export type MembershipPlanData = {
  id: string;
  name: string;
  slug: string;
  category: string;
  program: string;
  price: number;
  signupFee: number;
  cancellationFee: number;
  holdFeeAmount: number;
  holdFeeFrequency: string | null;
  holdLimitPerYear: number | null;
  frequency: string | null;
  contractLength: string;
  accessLevel: string;
  description: string | null;
  isTrial: boolean | null;
  isActive: boolean | null;
};

type CacheEntry = {
  data: MembershipPlanData[];
  timestamp: number;
  organizationId: string;
};

type CacheState = {
  plans: MembershipPlanData[];
  loading: boolean;
  error: string | null;
};

type CacheAction
  = | { type: 'RESET' }
    | { type: 'LOADING_START' }
    | { type: 'LOADING_END' }
    | { type: 'SET_PLANS'; payload: MembershipPlanData[] }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cacheStore: CacheEntry | null = null;
const revalidateCallbacks: Array<() => void | Promise<void>> = [];

function cacheReducer(state: CacheState, action: CacheAction): CacheState {
  switch (action.type) {
    case 'RESET':
      return { plans: [], loading: false, error: null };
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'LOADING_END':
      return { ...state, loading: false };
    case 'SET_PLANS':
      return { ...state, plans: action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

/**
 * Custom hook for intelligent membership plans caching with automatic invalidation.
 * Caches membership plan data and revalidates when organization changes or data mutations occur.
 */
export const useMembershipPlansCache = (organizationId?: string | undefined) => {
  const [state, dispatch] = useReducer(cacheReducer, {
    plans: [],
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

  const fetchPlans = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      // Snapshot the module-global cache into a local so a concurrent
      // invalidate() between the validity check and the read can't null it out
      // (removes the load-bearing non-null assertion).
      const cached = cacheStore;
      if (cached && isCacheValid(cached)) {
        dispatch({ type: 'SET_PLANS', payload: cached.data });
        return;
      }

      const orgKey = organizationId || '';
      // Several components on a page use this hook; without de-duping, each one
      // mounting against a cold cache fires its own request.
      const plans = await dedupeRequest(`membershipPlans:${orgKey}`, async () => {
        const result = await client.member.listAllMembershipPlans();
        const fetched = (result.plans || []) as MembershipPlanData[];

        cacheStore = {
          data: fetched,
          timestamp: Date.now(),
          organizationId: orgKey,
        };

        return fetched;
      });

      dispatch({ type: 'SET_PLANS', payload: plans });
    } catch (err) {
      let errorMessage = 'Failed to fetch membership plans';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      }

      if (cacheStore && isCacheValid(cacheStore)) {
        dispatch({ type: 'SET_PLANS', payload: cacheStore.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [organizationId, isCacheValid]);

  const revalidate = useCallback(async () => {
    cacheStore = null;
    // Drop any pending request too, so a refetch cannot attach to the call it
    // is meant to supersede and resolve with stale data.
    clearInFlight();
    await fetchPlans();
  }, [fetchPlans]);

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

    fetchPlans();
  }, [organizationId, fetchPlans]);

  return {
    plans: state.plans,
    loading: state.loading,
    error: state.error,
    revalidate,
  };
};

/**
 * Invalidate membership plans cache globally
 */
export const invalidateMembershipPlansCache = async () => {
  cacheStore = null;
  clearInFlight();
  await Promise.all(revalidateCallbacks.map(callback => callback()));
};
