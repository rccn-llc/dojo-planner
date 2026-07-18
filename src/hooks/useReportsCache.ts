import type { ReportChartData, ReportCurrentValues, ReportRange } from '@/services/ReportsService';
import { useCallback, useEffect, useReducer } from 'react';
import { client } from '@/libs/Orpc';

// Hook for fetching report current values (the overview cards)
type CurrentValuesState = {
  data: ReportCurrentValues | null;
  loading: boolean;
  error: string | null;
};

type CurrentValuesAction
  = | { type: 'LOADING_START' }
    | { type: 'SET_DATA'; payload: ReportCurrentValues }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000;
let currentValuesCache: { data: ReportCurrentValues; timestamp: number } | null = null;

function currentValuesReducer(state: CurrentValuesState, action: CurrentValuesAction): CurrentValuesState {
  switch (action.type) {
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'SET_DATA':
      return { data: action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

export const useReportCurrentValues = () => {
  const [state, dispatch] = useReducer(currentValuesReducer, {
    data: null,
    loading: true,
    error: null,
  });

  const fetch = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      if (currentValuesCache && (Date.now() - currentValuesCache.timestamp) < CACHE_DURATION) {
        dispatch({ type: 'SET_DATA', payload: currentValuesCache.data });
        return;
      }

      const result = await client.reports.currentValues() as ReportCurrentValues;
      currentValuesCache = { data: result, timestamp: Date.now() };
      dispatch({ type: 'SET_DATA', payload: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch report data';
      if (currentValuesCache) {
        dispatch({ type: 'SET_DATA', payload: currentValuesCache.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: message });
      }
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
  };
};

// Hook for fetching report detail data (chart + insights for a specific report)
type ReportDetailState = {
  chartData: ReportChartData | null;
  insights: string[];
  loading: boolean;
  error: string | null;
};

type ReportDetailAction
  = | { type: 'LOADING_START' }
    | { type: 'SET_DATA'; payload: { chartData: ReportChartData; insights: string[] } }
    | { type: 'SET_ERROR'; payload: string };

function reportDetailReducer(state: ReportDetailState, action: ReportDetailAction): ReportDetailState {
  switch (action.type) {
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'SET_DATA':
      return { chartData: action.payload.chartData, insights: action.payload.insights, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

export const useReportDetail = (reportType: string | null, range?: ReportRange) => {
  const [state, dispatch] = useReducer(reportDetailReducer, {
    chartData: null,
    insights: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!reportType) {
      return;
    }

    let cancelled = false;

    const fetchDetail = async () => {
      dispatch({ type: 'LOADING_START' });
      try {
        const [chartData, insights] = await Promise.all([
          client.reports.chartData({
            reportType: reportType as Parameters<typeof client.reports.chartData>[0]['reportType'],
            ...(range ? { range } : {}),
          }) as Promise<ReportChartData>,
          client.reports.insights({ reportType: reportType as Parameters<typeof client.reports.insights>[0]['reportType'] }) as Promise<string[]>,
        ]);

        if (!cancelled) {
          dispatch({ type: 'SET_DATA', payload: { chartData, insights } });
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to fetch report detail';
          dispatch({ type: 'SET_ERROR', payload: message });
        }
      }
    };

    fetchDetail();

    return () => {
      cancelled = true;
    };
    // `range` is part of the cache key — switching it re-fetches.
  }, [reportType, range]);

  return {
    chartData: state.chartData,
    insights: state.insights,
    loading: state.loading,
    error: state.error,
  };
};
