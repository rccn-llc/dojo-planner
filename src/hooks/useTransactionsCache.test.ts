import { describe, expect, it, vi } from 'vitest';

import { renderHook } from 'vitest-browser-react';
import { invalidateTransactionsCache, useTransactionsCache } from './useTransactionsCache';

// These hooks read the active org themselves so their caches can be keyed by
// it; without this mock the real Clerk module is imported and the browser-mode
// suite dies on `process is not defined`.
const mockUseOrganization = vi.fn(() => ({ organization: { id: 'org_test' } }));
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => mockUseOrganization(),
}));

describe('useTransactionsCache hook', () => {
  describe('basic functionality', () => {
    it('should have correct initial state structure', async () => {
      const { result } = await renderHook(() => useTransactionsCache());

      expect(result.current).toHaveProperty('transactions');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('revalidate');
    });

    it('should provide transactions as an array', async () => {
      const { result } = await renderHook(() => useTransactionsCache());

      expect(Array.isArray(result.current.transactions)).toBe(true);
    });

    it('should provide loading as a boolean', async () => {
      const { result } = await renderHook(() => useTransactionsCache());

      expect(typeof result.current.loading).toBe('boolean');
    });

    it('should provide error as null or string', async () => {
      const { result } = await renderHook(() => useTransactionsCache());

      expect(result.current.error === null || typeof result.current.error === 'string').toBe(true);
    });

    it('should provide revalidate as a function', async () => {
      const { result } = await renderHook(() => useTransactionsCache());

      expect(typeof result.current.revalidate).toBe('function');
    });

    it('should have revalidate function that returns a promise', async () => {
      const { result } = await renderHook(() => useTransactionsCache());

      const revalidateResult = result.current.revalidate();

      expect(revalidateResult).toBeInstanceOf(Promise);

      await revalidateResult;
    });
  });

  describe('invalidateTransactionsCache', () => {
    it('should be an async function', () => {
      expect(typeof invalidateTransactionsCache).toBe('function');
    });

    it('should return a promise', async () => {
      const result = invalidateTransactionsCache();

      expect(result).toBeInstanceOf(Promise);

      await result;
    });
  });
});
