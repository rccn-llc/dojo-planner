import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';

const mockUseOrganization = vi.fn();
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => mockUseOrganization(),
}));

const clearInFlight = vi.fn();
vi.mock('@/hooks/dedupeRequest', () => ({ clearInFlight: () => clearInFlight() }));

// Every invalidator the guard calls, stubbed so we can count them as a group.
const calls: string[] = [];
function stub(name: string) {
  return () => {
    calls.push(name);
  };
}
function asyncStub(name: string) {
  return async () => {
    calls.push(name);
  };
}

vi.mock('@/hooks/useDashboardCache', () => ({ invalidateDashboardCache: stub('dashboard') }));
vi.mock('@/hooks/useReportsCache', () => ({ invalidateReportsCache: stub('reports') }));
vi.mock('@/hooks/useOrganizationLocation', () => ({ invalidateOrganizationLocationCache: stub('location') }));
vi.mock('@/hooks/useMembersCache', () => ({ invalidateMembersCache: asyncStub('members') }));
vi.mock('@/hooks/useClassesCache', () => ({ invalidateClassesCache: asyncStub('classes') }));
vi.mock('@/hooks/useCatalogCache', () => ({
  invalidateCatalogCache: asyncStub('catalog'),
  invalidateCatalogCategoriesCache: asyncStub('catalogCategories'),
}));
vi.mock('@/hooks/useCouponsCache', () => ({ invalidateCouponsCache: asyncStub('coupons') }));
vi.mock('@/hooks/useEventsCache', () => ({ invalidateEventsCache: asyncStub('events') }));
vi.mock('@/hooks/useInstructorsCache', () => ({ invalidateInstructorsCache: asyncStub('instructors') }));
vi.mock('@/hooks/useMembershipPlansCache', () => ({ invalidateMembershipPlansCache: asyncStub('plans') }));
vi.mock('@/hooks/useProgramsCache', () => ({ invalidateProgramsCache: asyncStub('programs') }));
vi.mock('@/hooks/useTagsCache', () => ({ invalidateTagsCache: asyncStub('tags') }));
vi.mock('@/hooks/useTransactionsCache', () => ({ invalidateTransactionsCache: asyncStub('transactions') }));

describe('useOrgChangeReset', () => {
  beforeEach(() => {
    calls.length = 0;
    clearInFlight.mockClear();
    mockUseOrganization.mockReturnValue({ organization: { id: 'org_a' } });
  });

  it('does NOT clear caches on first mount', async () => {
    // An eager reset here would throw away the caches the page just populated
    // and double every initial dashboard load.
    const { useOrgChangeReset } = await import('./useOrgChangeReset');
    const r = await renderHook(() => useOrgChangeReset());

    expect(calls).toEqual([]);
    expect(clearInFlight).not.toHaveBeenCalled();

    await r.unmount();
  });

  it('does NOT clear caches while the organization is still resolving', async () => {
    // Clerk reports `organization: null` briefly on load; that is not a switch.
    mockUseOrganization.mockReturnValue({ organization: null });
    const { useOrgChangeReset } = await import('./useOrgChangeReset');
    const r = await renderHook(() => useOrgChangeReset());

    expect(calls).toEqual([]);

    await r.unmount();
  });

  it('clears every cache when the organization changes', async () => {
    // The guard tracks the previous org in a ref, so the switch must happen
    // within ONE continuous mount — the real dashboard layout never unmounts
    // across a switch. Re-rendering the same instance is what reproduces it;
    // unmounting and remounting would look like a fresh first mount instead.
    const { useOrgChangeReset } = await import('./useOrgChangeReset');
    const r = await renderHook(() => useOrgChangeReset());

    expect(calls).toEqual([]);

    // The switch, on the still-mounted instance.
    mockUseOrganization.mockReturnValue({ organization: { id: 'org_b' } });
    await r.rerender();

    await vi.waitFor(() => {
      expect(calls).toContain('location');
    });

    // The three that matter most for the reported bug, plus the shared
    // in-flight map so a request issued for the old org is not adopted.
    expect(calls).toContain('dashboard');
    expect(calls).toContain('reports');
    expect(calls).toContain('transactions');
    expect(clearInFlight).toHaveBeenCalled();

    await r.unmount();
  });
});
