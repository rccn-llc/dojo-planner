import type { TransactionData } from '@/services/TransactionsService';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { client } from '@/libs/Orpc';
import { clearInFlight, dedupeRequest } from './dedupeRequest';

type CacheEntry = {
  data: TransactionData[];
  timestamp: number;
};

type CacheState = {
  transactions: TransactionData[];
  loading: boolean;
  error: string | null;
};

type CacheAction
  = | { type: 'LOADING_START' }
    | { type: 'SET_DATA'; payload: TransactionData[] }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cacheStore: CacheEntry | null = null;
const revalidateCallbacks: Array<() => void | Promise<void>> = [];

function cacheReducer(state: CacheState, action: CacheAction): CacheState {
  switch (action.type) {
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'SET_DATA':
      return { transactions: action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

export const useTransactionsCache = () => {
  const [state, dispatch] = useReducer(cacheReducer, {
    transactions: [],
    loading: true,
    error: null,
  });

  const revalidateRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const fetchTransactions = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      if (cacheStore && (Date.now() - cacheStore.timestamp) < CACHE_DURATION) {
        dispatch({ type: 'SET_DATA', payload: cacheStore.data });
        return;
      }

      // Several components can mount this hook in the same tick; without
      // de-duping, each one fires its own request against the cold cache.
      const result = await dedupeRequest(`transactions:${'global'}`, async () => client.transactions.list());
      const transactions = (result.transactions ?? []) as TransactionData[];

      cacheStore = { data: transactions, timestamp: Date.now() };
      dispatch({ type: 'SET_DATA', payload: transactions });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch transactions';
      if (cacheStore) {
        dispatch({ type: 'SET_DATA', payload: cacheStore.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: message });
      }
    }
  }, []);

  const revalidate = useCallback(async () => {
    cacheStore = null;
    clearInFlight();
    await fetchTransactions();
  }, [fetchTransactions]);

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
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions: state.transactions,
    loading: state.loading,
    error: state.error,
    revalidate,
  };
};

export const invalidateTransactionsCache = async () => {
  cacheStore = null;
  clearInFlight();
  await Promise.all(revalidateCallbacks.map(cb => cb()));
};
