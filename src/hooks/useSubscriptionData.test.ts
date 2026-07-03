import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { client } from '@/libs/Orpc';
import { useSubscriptionData } from './useSubscriptionData';

vi.mock('@/libs/Orpc', () => ({
  client: {
    saasSubscription: {
      getCurrentPlan: vi.fn(),
      getBillingHistory: vi.fn(),
    },
  },
}));

const getCurrentPlan = vi.mocked(client.saasSubscription.getCurrentPlan);
const getBillingHistory = vi.mocked(client.saasSubscription.getBillingHistory);

const plan = {
  planId: 'basic',
  planName: 'Basic',
  status: 'active',
  billingCycle: 'monthly',
  currentPeriodEnd: null,
  isSuperAdmin: false,
  hasActiveSubscription: true,
  responsibleClerkUserId: null,
};
const history = [{ invoiceId: 'tx-1', status: 'Settled', amount: 49, invoiceDate: '2025-01-01', dueDate: null, paymentMethodLast4: '4242' }];

describe('useSubscriptionData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentPlan.mockResolvedValue(plan as any);
    getBillingHistory.mockResolvedValue(history as any);
  });

  it('fetches plan + billing history when enabled (default)', async () => {
    const { result } = await renderHook(() => useSubscriptionData());

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getCurrentPlan).toHaveBeenCalledTimes(1);
    expect(getBillingHistory).toHaveBeenCalledTimes(1);
    expect(result.current.currentPlan).toEqual(plan);
    expect(result.current.billingHistory).toEqual(history);
  });

  it('does NOT fetch when disabled', async () => {
    const { result } = await renderHook(() => useSubscriptionData(false));

    expect(getCurrentPlan).not.toHaveBeenCalled();
    expect(getBillingHistory).not.toHaveBeenCalled();
    // Not stuck in a loading state while disabled.
    expect(result.current.loading).toBe(false);
    expect(result.current.currentPlan).toBeNull();
  });

  it('fetches when enabled transitions from false to true', async () => {
    const { result, rerender } = await renderHook(
      (props?: { enabled: boolean }) => useSubscriptionData(props?.enabled ?? false),
      { initialProps: { enabled: false } },
    );

    expect(getCurrentPlan).not.toHaveBeenCalled();

    await rerender({ enabled: true });

    await vi.waitFor(() => {
      expect(getCurrentPlan).toHaveBeenCalledTimes(1);
    });

    expect(result.current.currentPlan).toEqual(plan);
  });

  it('refetch() re-runs the fetch', async () => {
    const { result } = await renderHook(() => useSubscriptionData());

    await vi.waitFor(() => {
      expect(getCurrentPlan).toHaveBeenCalledTimes(1);
    });

    await result.current.refetch();

    expect(getCurrentPlan).toHaveBeenCalledTimes(2);
    expect(getBillingHistory).toHaveBeenCalledTimes(2);
  });

  it('sets an error when a request fails', async () => {
    getBillingHistory.mockRejectedValueOnce(new Error('boom'));

    const { result } = await renderHook(() => useSubscriptionData());

    await vi.waitFor(() => {
      expect(result.current.error).toBe('Failed to load subscription data.');
    });

    expect(result.current.loading).toBe(false);
  });
});
