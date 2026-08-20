'use client';

import { useOrganization } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';
import { clearInFlight } from '@/hooks/dedupeRequest';
import { invalidateCatalogCache, invalidateCatalogCategoriesCache } from '@/hooks/useCatalogCache';
import { invalidateClassesCache } from '@/hooks/useClassesCache';
import { invalidateCouponsCache } from '@/hooks/useCouponsCache';
import { invalidateDashboardCache } from '@/hooks/useDashboardCache';
import { invalidateEventsCache } from '@/hooks/useEventsCache';
import { invalidateInstructorsCache } from '@/hooks/useInstructorsCache';
import { invalidateMembersCache } from '@/hooks/useMembersCache';
import { invalidateMembershipPlansCache } from '@/hooks/useMembershipPlansCache';
import { invalidateOrganizationLocationCache } from '@/hooks/useOrganizationLocation';
import { invalidateProgramsCache } from '@/hooks/useProgramsCache';
import { invalidateReportsCache } from '@/hooks/useReportsCache';
import { invalidateTagsCache } from '@/hooks/useTagsCache';
import { invalidateTransactionsCache } from '@/hooks/useTransactionsCache';

/**
 * Clears every client-side cache when the active organization changes.
 *
 * ── Why this exists on top of per-hook org keys ─────────────────────────────
 *
 * Dashboard data is fetched by client components backed by MODULE-LEVEL caches.
 * The org switcher calls `router.refresh()`, but that only re-renders Server
 * Components — module state survives it, which is why a manual browser reload
 * "fixed" the staleness (a reload destroys the module registry).
 *
 * Each cache hook is now keyed by organization, so in principle this guard is
 * redundant. It is here because the keying is easy to forget: four of thirteen
 * hooks shipped without it, and the symptom is not a crash — it is one tenant's
 * figures rendered under another tenant's name. With this guard, a future cache
 * that forgets to key by org degrades to a redundant refetch instead.
 *
 * Mount ONCE, high in the dashboard tree.
 */
export function useOrgChangeReset(): void {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const previousOrgId = useRef<string | undefined>(undefined);
  const initialised = useRef(false);

  useEffect(() => {
    // Skip the first settled value: on mount there is nothing stale to clear,
    // and resetting here would discard the caches the page just populated and
    // double every initial load.
    if (!initialised.current) {
      if (organizationId) {
        initialised.current = true;
        previousOrgId.current = organizationId;
      }
      return;
    }

    if (!organizationId || organizationId === previousOrgId.current) {
      return;
    }
    previousOrgId.current = organizationId;

    // Synchronous cache drops.
    invalidateDashboardCache();
    invalidateReportsCache();
    invalidateOrganizationLocationCache();
    // Shared in-flight map: a request issued for the previous org must not be
    // adopted by a caller now asking about the new one.
    clearInFlight();

    // The remaining invalidators also notify subscribed components to refetch.
    void Promise.all([
      invalidateMembersCache(),
      invalidateClassesCache(),
      invalidateCatalogCache(),
      invalidateCatalogCategoriesCache(),
      invalidateCouponsCache(),
      invalidateEventsCache(),
      invalidateInstructorsCache(),
      invalidateMembershipPlansCache(),
      invalidateProgramsCache(),
      invalidateTagsCache(),
      invalidateTransactionsCache(),
    ]);
  }, [organizationId]);
}
