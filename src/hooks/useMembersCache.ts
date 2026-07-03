import { useCallback, useEffect, useReducer, useRef } from 'react';
import { client } from '@/libs/Orpc';

type MembershipPlan = {
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

type MemberMembership = {
  id: string;
  membershipPlanId: string;
  membershipPlan?: MembershipPlan | null;
  status: string;
  startDate: Date;
  endDate: Date | null;
  firstPaymentDate: Date | null;
  nextPaymentDate: Date | null;
  createdAt: Date;
};

export type Member = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  dateOfBirth: Date | null;
  photoUrl: string | null;
  memberType: string | null;
  lastAccessedAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  create_organization_enabled?: boolean;
  membershipType?: 'free' | 'free-trial' | 'monthly' | 'annual';
  amountDue?: string;
  nextPayment?: Date;
  address?: {
    street: string;
    apartment?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  currentMembership?: MemberMembership | null;
  membershipHistory?: MemberMembership[];
};

type CacheEntry = {
  data: Member[];
  timestamp: number;
  organizationId: string;
};

type CacheState = {
  members: Member[];
  loading: boolean;
  error: string | null;
};

type CacheAction
  = | { type: 'RESET' }
    | { type: 'LOADING_START' }
    | { type: 'LOADING_END' }
    | { type: 'SET_MEMBERS'; payload: Member[] }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cacheStore: CacheEntry | null = null;
const revalidateCallbacks: Array<() => void | Promise<void>> = [];

/**
 * Raw member row as returned by `members.list`, before display fields are
 * derived. Only the fields read by `deriveMemberDisplayFields` are typed
 * precisely; `nextPaymentDate` may arrive as a `Date` or an ISO string, and the
 * rest of the row is carried through structurally.
 */
type RawMemberRow = {
  currentMembership?: {
    nextPaymentDate?: Date | string | null;
    membershipPlan?: {
      price?: number | null;
      frequency?: string | null;
      isTrial?: boolean | null;
    } | null;
  } | null;
} & Record<string, unknown>;

/**
 * Derives the display-only fields (`membershipType`, `amountDue`, `nextPayment`)
 * on a member row for the members table. Pure — exported so unit tests can
 * cover the "amountDue should be empty when the next payment is in the future"
 * rule without spinning up the whole hook.
 *
 * `amountDue` is the plan's recurring price (one cycle), shown only when
 * `nextPaymentDate` is in the past or absent — i.e. the member actually owes.
 * For a freshly-paid autopay member whose next charge is in the future, the
 * cell is empty.
 */
export function deriveMemberDisplayFields(member: RawMemberRow, now: Date = new Date()): Member {
  const plan = member.currentMembership?.membershipPlan;
  const membership = member.currentMembership;

  let membershipType: Member['membershipType'];
  if (plan) {
    if (plan.isTrial) {
      membershipType = 'free-trial';
    } else if (plan.frequency === 'Monthly') {
      membershipType = 'monthly';
    } else if (plan.frequency === 'Annual') {
      membershipType = 'annual';
    } else {
      membershipType = 'free';
    }
  }

  const nextPayment = membership?.nextPaymentDate
    ? new Date(membership.nextPaymentDate)
    : undefined;

  const isPaid = nextPayment !== undefined && nextPayment.getTime() > now.getTime();
  const amountDue = !isPaid && plan?.price != null && plan.price > 0
    ? Number(plan.price).toFixed(2)
    : undefined;

  // The raw row carries the full member fields at runtime; RawMemberRow only
  // types the subset this function reads, so assert the enriched result is a Member.
  return {
    ...member,
    membershipType,
    amountDue,
    nextPayment,
  } as Member;
}

function cacheReducer(state: CacheState, action: CacheAction): CacheState {
  switch (action.type) {
    case 'RESET':
      return { members: [], loading: false, error: null };
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'LOADING_END':
      return { ...state, loading: false };
    case 'SET_MEMBERS':
      return { ...state, members: action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

/**
 * Custom hook for intelligent members caching with automatic invalidation.
 * Caches members data and revalidates when organization changes or data mutations occur.
 */
export const useMembersCache = (organizationId?: string | undefined) => {
  const [state, dispatch] = useReducer(cacheReducer, {
    members: [],
    loading: true,
    error: null,
  });

  // Use a ref to track the latest revalidate function to avoid stale closure issues
  const revalidateRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const isCacheValid = useCallback((cache: CacheEntry | null): boolean => {
    if (!cache) {
      return false;
    }
    // Cache is invalid if organization changed (when organizationId is provided) or if duration exceeded
    if (organizationId && cache.organizationId !== organizationId) {
      return false;
    }
    const now = Date.now();
    return (now - cache.timestamp) < CACHE_DURATION;
  }, [organizationId]);

  const fetchMembers = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      // Check if we have a valid cache
      if (isCacheValid(cacheStore)) {
        console.info('[Members Cache] Using cached data for organization:', {
          organizationId,
          cacheAge: Date.now() - (cacheStore?.timestamp || 0),
        });
        dispatch({ type: 'SET_MEMBERS', payload: cacheStore!.data });
        return;
      }

      console.info('[Members Cache] Fetching fresh members data for organization:', organizationId);

      const membersData = await client.members.list();
      const rawMembers = (membersData.members || []) as RawMemberRow[];

      const detailedMembers: Member[] = rawMembers.map(member => deriveMemberDisplayFields(member));

      // Update cache
      cacheStore = {
        data: detailedMembers,
        timestamp: Date.now(),
        organizationId: organizationId || '',
      };

      console.info('[Members Cache] Members data fetched and cached:', {
        count: detailedMembers.length,
        organizationId,
      });

      dispatch({ type: 'SET_MEMBERS', payload: detailedMembers });
    } catch (err) {
      // Extract error message from various error types (Error, ORPC errors, etc.)
      let errorMessage = 'Failed to fetch members';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      }

      // Use warn instead of error since this can happen during initial load
      // when organization context isn't fully ready yet
      console.warn('[Members Cache] Failed to fetch members:', {
        error: errorMessage,
        organizationId,
      });

      // If we have cached data and the fetch fails, use the cached data
      if (cacheStore && isCacheValid(cacheStore)) {
        console.warn('[Members Cache] Using stale cache as fallback after fetch error');
        dispatch({ type: 'SET_MEMBERS', payload: cacheStore.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [organizationId, isCacheValid]);

  // Revalidate cache on demand
  const revalidate = useCallback(async () => {
    console.info('[Members Cache] Manual revalidation triggered');
    cacheStore = null; // Clear cache to force fresh fetch
    await fetchMembers();
  }, [fetchMembers]);

  // Keep the ref updated with the latest revalidate function
  useEffect(() => {
    revalidateRef.current = revalidate;
  }, [revalidate]);

  // Register a stable callback for global cache invalidation (only once on mount)
  useEffect(() => {
    const stableCallback = () => {
      // Always call the latest revalidate function via ref
      revalidateRef.current?.();
    };
    revalidateCallbacks.push(stableCallback);
    return () => {
      const index = revalidateCallbacks.indexOf(stableCallback);
      if (index > -1) {
        revalidateCallbacks.splice(index, 1);
      }
    };
  }, []); // Empty deps - register only once

  // Reset state when organization is cleared, or fetch members when it changes
  useEffect(() => {
    if (!organizationId) {
      dispatch({ type: 'RESET' });
      return;
    }

    fetchMembers();
  }, [organizationId, fetchMembers]);

  return {
    members: state.members,
    loading: state.loading,
    error: state.error,
    revalidate,
  };
};

/**
 * Invalidate members cache globally (call this when members are created, updated, or deleted)
 * Returns a promise that resolves when all registered hooks have finished revalidating
 */
export const invalidateMembersCache = async () => {
  console.info('[Members Cache] Global cache invalidation triggered');
  cacheStore = null;
  // Wait for all revalidation callbacks to complete
  await Promise.all(revalidateCallbacks.map(callback => callback()));
};
