import type { BillingHistoryItem, CurrentSubscription } from '@/services/SaasSubscriptionService';
import { useCallback, useEffect, useReducer } from 'react';
import { client } from '@/libs/Orpc';

type SubscriptionDataState = {
  currentPlan: CurrentSubscription | null;
  billingHistory: BillingHistoryItem[];
  loading: boolean;
  error: string | null;
};

type Action
  = | { type: 'LOADING_START' }
    | { type: 'SET_DATA'; payload: { currentPlan: CurrentSubscription; billingHistory: BillingHistoryItem[] } }
    | { type: 'SET_ERROR'; payload: string };

function reducer(state: SubscriptionDataState, action: Action): SubscriptionDataState {
  switch (action.type) {
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'SET_DATA':
      return { ...action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, loading: false, error: action.payload };
    default:
      return state;
  }
}

export function useSubscriptionData() {
  const [state, dispatch] = useReducer(reducer, {
    currentPlan: null,
    billingHistory: [],
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    dispatch({ type: 'LOADING_START' });
    try {
      const [plan, history] = await Promise.all([
        client.saasSubscription.getCurrentPlan(),
        client.saasSubscription.getBillingHistory(),
      ]);
      dispatch({
        type: 'SET_DATA',
        payload: {
          currentPlan: plan as CurrentSubscription,
          billingHistory: history as BillingHistoryItem[],
        },
      });
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load subscription data.' });
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, refetch: fetchData };
}
