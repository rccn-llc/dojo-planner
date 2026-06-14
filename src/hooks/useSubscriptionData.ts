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

/**
 * Fetches the org's SaaS subscription + billing history.
 *
 * @param enabled When `false`, the hook does NOT auto-fetch (use this to defer
 *   the IQPro round-trips until the subscription dialog is actually opened).
 *   When it transitions `false` → `true`, the data is (re)fetched, so passing
 *   the dialog's `open` flag refetches fresh data each time it opens. Defaults
 *   to `true` for callers that always want the data.
 */
export function useSubscriptionData(enabled: boolean = true) {
  const [state, dispatch] = useReducer(reducer, {
    currentPlan: null,
    billingHistory: [],
    loading: enabled,
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
    if (enabled) {
      fetchData();
    }
  }, [enabled, fetchData]);

  return { ...state, refetch: fetchData };
}
