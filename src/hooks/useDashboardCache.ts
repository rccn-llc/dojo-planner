import type { ChartData, FinancialStats, MembershipStats } from '@/services/DashboardService';
import { useCallback, useEffect, useReducer } from 'react';
import { client } from '@/libs/Orpc';
import { dedupeRequest } from './dedupeRequest';

type DashboardData = {
  membershipStats: MembershipStats | null;
  financialStats: FinancialStats | null;
  memberAverageData: ChartData | null;
  earningsData: ChartData | null;
};

type CacheEntry = {
  data: DashboardData;
  timestamp: number;
};

type CacheState = DashboardData & {
  loading: boolean;
  error: string | null;
};

type CacheAction
  = | { type: 'LOADING_START' }
    | { type: 'SET_DATA'; payload: DashboardData }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000;
let cacheStore: CacheEntry | null = null;

function cacheReducer(state: CacheState, action: CacheAction): CacheState {
  switch (action.type) {
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'SET_DATA':
      return { ...action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

export const useDashboardCache = () => {
  const [state, dispatch] = useReducer(cacheReducer, {
    membershipStats: null,
    financialStats: null,
    memberAverageData: null,
    earningsData: null,
    loading: true,
    error: null,
  });

  const fetchDashboard = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      if (cacheStore && (Date.now() - cacheStore.timestamp) < CACHE_DURATION) {
        dispatch({ type: 'SET_DATA', payload: cacheStore.data });
        return;
      }

      // De-duped as one unit: this fans out to four endpoints, so a second
      // instance mounting against the cold cache would double all of them.
      const data = await dedupeRequest('dashboard', async () => {
        const [membershipStats, financialStats, memberAverageData, earningsData] = await Promise.all([
          client.dashboard.membershipStats() as Promise<MembershipStats>,
          client.dashboard.financialStats() as Promise<FinancialStats>,
          client.dashboard.memberAverageChart() as Promise<ChartData>,
          client.dashboard.earningsChart() as Promise<ChartData>,
        ]);

        return { membershipStats, financialStats, memberAverageData, earningsData } as DashboardData;
      });

      cacheStore = { data, timestamp: Date.now() };
      dispatch({ type: 'SET_DATA', payload: data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch dashboard data';
      if (cacheStore) {
        dispatch({ type: 'SET_DATA', payload: cacheStore.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: message });
      }
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return {
    membershipStats: state.membershipStats,
    financialStats: state.financialStats,
    memberAverageData: state.memberAverageData,
    earningsData: state.earningsData,
    loading: state.loading,
    error: state.error,
  };
};
