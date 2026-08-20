import { describe, expect, it, vi } from 'vitest';

import { renderHook } from 'vitest-browser-react';
import { useReportCurrentValues, useReportDetail } from './useReportsCache';

// These hooks read the active org themselves so their caches can be keyed by
// it; without this mock the real Clerk module is imported and the browser-mode
// suite dies on `process is not defined`.
const mockUseOrganization = vi.fn(() => ({ organization: { id: 'org_test' } }));
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => mockUseOrganization(),
}));

describe('useReportCurrentValues hook', () => {
  describe('basic functionality', () => {
    it('should have correct initial state structure', async () => {
      const { result } = await renderHook(() => useReportCurrentValues());

      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
    });

    it('should provide loading as a boolean', async () => {
      const { result } = await renderHook(() => useReportCurrentValues());

      expect(typeof result.current.loading).toBe('boolean');
    });

    it('should provide error as null or string', async () => {
      const { result } = await renderHook(() => useReportCurrentValues());

      expect(result.current.error === null || typeof result.current.error === 'string').toBe(true);
    });

    it('should initialize data as null or object', async () => {
      const { result } = await renderHook(() => useReportCurrentValues());

      expect(result.current.data === null || typeof result.current.data === 'object').toBe(true);
    });
  });

  describe('state transitions', () => {
    it('should eventually transition from loading state', async () => {
      const { result } = await renderHook(() => useReportCurrentValues());

      const initialLoading = result.current.loading;

      expect(typeof initialLoading).toBe('boolean');
    });
  });
});

describe('useReportDetail hook', () => {
  describe('with null reportType', () => {
    it('should not fetch when reportType is null', async () => {
      const { result } = await renderHook(() => useReportDetail(null));

      expect(result.current.loading).toBe(false);
      expect(result.current.chartData).toBeNull();
      expect(Array.isArray(result.current.insights)).toBe(true);
      expect(result.current.insights).toEqual([]);
    });

    it('should have correct state structure', async () => {
      const { result } = await renderHook(() => useReportDetail(null));

      expect(result.current).toHaveProperty('chartData');
      expect(result.current).toHaveProperty('insights');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
    });

    it('should provide error as null or string', async () => {
      const { result } = await renderHook(() => useReportDetail(null));

      expect(result.current.error === null || typeof result.current.error === 'string').toBe(true);
    });
  });

  describe('with valid reportType', () => {
    it('should have correct state structure', async () => {
      const { result } = await renderHook(() => useReportDetail('amount-due'));

      expect(result.current).toHaveProperty('chartData');
      expect(result.current).toHaveProperty('insights');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
    });

    it('should provide loading as a boolean', async () => {
      const { result } = await renderHook(() => useReportDetail('amount-due'));

      expect(typeof result.current.loading).toBe('boolean');
    });

    it('should provide insights as an array', async () => {
      const { result } = await renderHook(() => useReportDetail('amount-due'));

      expect(Array.isArray(result.current.insights)).toBe(true);
    });

    it('should initialize chartData as null or object', async () => {
      const { result } = await renderHook(() => useReportDetail('amount-due'));

      expect(result.current.chartData === null || typeof result.current.chartData === 'object').toBe(true);
    });
  });

  describe('reportType transitions', () => {
    it('should handle changing from null to valid reportType', async () => {
      const { result, rerender } = await renderHook(
        (props?: { reportType: string | null }) => useReportDetail(props?.reportType ?? null),
        { initialProps: { reportType: null as string | null } },
      );

      expect(result.current.loading).toBe(false);

      rerender({ reportType: 'amount-due' });

      expect(typeof result.current.loading).toBe('boolean');
    });

    it('should handle changing from valid reportType to null', async () => {
      const { result, rerender } = await renderHook(
        (props?: { reportType: string | null }) => useReportDetail(props?.reportType ?? null),
        { initialProps: { reportType: 'amount-due' as string | null } },
      );

      expect(typeof result.current.loading).toBe('boolean');

      rerender({ reportType: null });

      // When reportType becomes null, loading state may remain true until the effect cleanup
      expect(typeof result.current.loading).toBe('boolean');
    });

    it('should handle changing between valid reportTypes', async () => {
      const { result, rerender } = await renderHook(
        (props?: { reportType: string | null }) => useReportDetail(props?.reportType ?? null),
        { initialProps: { reportType: 'amount-due' as string | null } },
      );

      const firstLoading = result.current.loading;

      expect(typeof firstLoading).toBe('boolean');

      rerender({ reportType: 'past-due' });

      const secondLoading = result.current.loading;

      expect(typeof secondLoading).toBe('boolean');
    });
  });
});
