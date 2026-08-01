import { useCallback, useEffect, useReducer, useRef } from 'react';
import { client } from '@/libs/Orpc';
import { clearInFlight, dedupeRequest } from './dedupeRequest';

// =============================================================================
// TYPES
// =============================================================================

export type CatalogItemType = 'merchandise' | 'event_access';

export type CatalogVariant = {
  id: string;
  catalogItemId: string;
  name: string;
  price: number;
  stockQuantity: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CatalogItemImage = {
  id: string;
  catalogItemId: string;
  url: string;
  thumbnailUrl: string | null;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: Date;
};

export type CatalogCategory = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
};

export type CatalogItem = {
  id: string;
  organizationId: string;
  type: CatalogItemType;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  sku: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  eventId: string | null;
  maxPerOrder: number;
  trackInventory: boolean;
  lowStockThreshold: number;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  showOnKiosk: boolean;
  createdAt: Date;
  updatedAt: Date;
  variants: CatalogVariant[];
  images: CatalogItemImage[];
  categories: CatalogCategory[];
  totalStock: number;
};

type CacheEntry = {
  data: CatalogItem[];
  timestamp: number;
  organizationId: string;
};

type CacheState = {
  items: CatalogItem[];
  loading: boolean;
  revalidating: boolean;
  error: string | null;
};

type CacheAction
  = | { type: 'RESET' }
    | { type: 'LOADING_START' }
    | { type: 'REVALIDATING_START' }
    | { type: 'LOADING_END' }
    | { type: 'SET_ITEMS'; payload: CatalogItem[] }
    | { type: 'SET_ERROR'; payload: string };

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cacheStore: CacheEntry | null = null;
const revalidateCallbacks: Array<() => void | Promise<void>> = [];

function cacheReducer(state: CacheState, action: CacheAction): CacheState {
  switch (action.type) {
    case 'RESET':
      return { items: [], loading: false, revalidating: false, error: null };
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'REVALIDATING_START':
      return { ...state, revalidating: true, error: null };
    case 'LOADING_END':
      return { ...state, loading: false, revalidating: false };
    case 'SET_ITEMS':
      return { ...state, items: action.payload, loading: false, revalidating: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false, revalidating: false };
    default:
      return state;
  }
}

/**
 * Custom hook for intelligent catalog items caching with automatic invalidation.
 */
export const useCatalogCache = (organizationId?: string | undefined) => {
  const [state, dispatch] = useReducer(cacheReducer, {
    items: [],
    loading: true,
    revalidating: false,
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

  const fetchCatalogItems = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      // Snapshot the module-global cache into a local so a concurrent
      // invalidate() between the validity check and the read can't null it out
      // (removes the load-bearing non-null assertion).
      const cached = cacheStore;
      if (cached && isCacheValid(cached)) {
        console.info('[Catalog Cache] Using cached data for organization:', {
          organizationId,
          cacheAge: Date.now() - cached.timestamp,
        });
        dispatch({ type: 'SET_ITEMS', payload: cached.data });
        return;
      }

      console.info('[Catalog Cache] Fetching fresh catalog data for organization:', organizationId);

      // Several components can mount this hook in the same tick; without
      // de-duping, each one fires its own request against the cold cache.
      const catalogData = await dedupeRequest(`catalog:${organizationId || ''}`, async () => client.catalog.list());
      const items = (catalogData.items || []) as CatalogItem[];

      cacheStore = {
        data: items,
        timestamp: Date.now(),
        organizationId: organizationId || '',
      };

      console.info('[Catalog Cache] Catalog data fetched and cached:', {
        count: items.length,
        organizationId,
      });

      dispatch({ type: 'SET_ITEMS', payload: items });
    } catch (err) {
      let errorMessage = 'Failed to fetch catalog items';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      }

      console.warn('[Catalog Cache] Failed to fetch catalog items:', {
        error: errorMessage,
        organizationId,
      });

      if (cacheStore && isCacheValid(cacheStore)) {
        console.warn('[Catalog Cache] Using stale cache as fallback after fetch error');
        dispatch({ type: 'SET_ITEMS', payload: cacheStore.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [organizationId, isCacheValid]);

  const revalidate = useCallback(async () => {
    console.info('[Catalog Cache] Manual revalidation triggered');
    dispatch({ type: 'REVALIDATING_START' });
    cacheStore = null;
    clearInFlight();
    await fetchCatalogItems();
  }, [fetchCatalogItems]);

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

    fetchCatalogItems();
  }, [organizationId, fetchCatalogItems]);

  return {
    items: state.items,
    loading: state.loading,
    revalidating: state.revalidating,
    error: state.error,
    revalidate,
  };
};

/**
 * Invalidate catalog cache globally
 */
export const invalidateCatalogCache = async () => {
  console.info('[Catalog Cache] Global cache invalidation triggered');
  cacheStore = null;
  clearInFlight();
  await Promise.all(revalidateCallbacks.map(callback => callback()));
};

// =============================================================================
// CATEGORIES CACHE
// =============================================================================

type CategoryCacheEntry = {
  data: CatalogCategory[];
  timestamp: number;
  organizationId: string;
};

type CategoryCacheState = {
  categories: CatalogCategory[];
  loading: boolean;
  error: string | null;
};

type CategoryCacheAction
  = | { type: 'RESET' }
    | { type: 'LOADING_START' }
    | { type: 'LOADING_END' }
    | { type: 'SET_CATEGORIES'; payload: CatalogCategory[] }
    | { type: 'SET_ERROR'; payload: string };

let categoryCacheStore: CategoryCacheEntry | null = null;
const categoryRevalidateCallbacks: Array<() => void | Promise<void>> = [];

function categoryCacheReducer(state: CategoryCacheState, action: CategoryCacheAction): CategoryCacheState {
  switch (action.type) {
    case 'RESET':
      return { categories: [], loading: false, error: null };
    case 'LOADING_START':
      return { ...state, loading: true, error: null };
    case 'LOADING_END':
      return { ...state, loading: false };
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload, loading: false, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

/**
 * Custom hook for intelligent catalog categories caching with automatic invalidation.
 */
export const useCatalogCategoriesCache = (organizationId?: string | undefined) => {
  const [state, dispatch] = useReducer(categoryCacheReducer, {
    categories: [],
    loading: true,
    error: null,
  });

  const revalidateRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const isCacheValid = useCallback((cache: CategoryCacheEntry | null): boolean => {
    if (!cache) {
      return false;
    }
    if (organizationId && cache.organizationId !== organizationId) {
      return false;
    }
    const now = Date.now();
    return (now - cache.timestamp) < CACHE_DURATION;
  }, [organizationId]);

  const fetchCategories = useCallback(async () => {
    try {
      dispatch({ type: 'LOADING_START' });

      if (isCacheValid(categoryCacheStore)) {
        console.info('[Catalog Categories Cache] Using cached data for organization:', {
          organizationId,
          cacheAge: Date.now() - (categoryCacheStore?.timestamp || 0),
        });
        dispatch({ type: 'SET_CATEGORIES', payload: categoryCacheStore!.data });
        return;
      }

      console.info('[Catalog Categories Cache] Fetching fresh categories data for organization:', organizationId);

      const categoryData = await dedupeRequest(`catalogCategories:${organizationId || ''}`, async () => client.catalog.categoryList());
      const categories = (categoryData.categories || []) as CatalogCategory[];

      categoryCacheStore = {
        data: categories,
        timestamp: Date.now(),
        organizationId: organizationId || '',
      };

      console.info('[Catalog Categories Cache] Categories data fetched and cached:', {
        count: categories.length,
        organizationId,
      });

      dispatch({ type: 'SET_CATEGORIES', payload: categories });
    } catch (err) {
      let errorMessage = 'Failed to fetch categories';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      }

      console.warn('[Catalog Categories Cache] Failed to fetch categories:', {
        error: errorMessage,
        organizationId,
      });

      if (categoryCacheStore && isCacheValid(categoryCacheStore)) {
        console.warn('[Catalog Categories Cache] Using stale cache as fallback after fetch error');
        dispatch({ type: 'SET_CATEGORIES', payload: categoryCacheStore.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [organizationId, isCacheValid]);

  const revalidate = useCallback(async () => {
    console.info('[Catalog Categories Cache] Manual revalidation triggered');
    categoryCacheStore = null;
    clearInFlight();
    await fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    revalidateRef.current = revalidate;
  }, [revalidate]);

  useEffect(() => {
    const stableCallback = () => {
      revalidateRef.current?.();
    };
    categoryRevalidateCallbacks.push(stableCallback);
    return () => {
      const index = categoryRevalidateCallbacks.indexOf(stableCallback);
      if (index > -1) {
        categoryRevalidateCallbacks.splice(index, 1);
      }
    };
  }, []);

  useEffect(() => {
    if (!organizationId) {
      dispatch({ type: 'RESET' });
      return;
    }

    fetchCategories();
  }, [organizationId, fetchCategories]);

  return {
    categories: state.categories,
    loading: state.loading,
    error: state.error,
    revalidate,
  };
};

/**
 * Invalidate categories cache globally
 */
export const invalidateCatalogCategoriesCache = async () => {
  console.info('[Catalog Categories Cache] Global cache invalidation triggered');
  categoryCacheStore = null;
  clearInFlight();
  await Promise.all(categoryRevalidateCallbacks.map(callback => callback()));
};
