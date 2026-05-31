import { describe, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';

import { deriveMemberDisplayFields, invalidateMembersCache, useMembersCache } from './useMembersCache';

describe('useMembersCache hook', () => {
  describe('without organization', () => {
    it('should not fetch members when organizationId is undefined', async () => {
      const { result } = await renderHook(() => useMembersCache(undefined));

      expect(result.current.members).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should reset state when organizationId is undefined', async () => {
      const { result } = await renderHook(() => useMembersCache(undefined));

      expect(result.current.members).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should provide a revalidate function', async () => {
      const { result } = await renderHook(() => useMembersCache(undefined));

      expect(typeof result.current.revalidate).toBe('function');
    });
  });

  describe('invalidateMembersCache', () => {
    it('should be an async function', () => {
      expect(typeof invalidateMembersCache).toBe('function');
    });

    it('should return a promise', async () => {
      const result = invalidateMembersCache();

      expect(result).toBeInstanceOf(Promise);

      // Wait for the promise to settle
      await result;
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// deriveMemberDisplayFields — the row-mapper that powers the members table.
// `amountDue` shows the plan's recurring price only when the member is past
// their next payment date (or has none scheduled). For a freshly-paid
// autopay member, the cell is empty.
// ─────────────────────────────────────────────────────────────────────────

describe('deriveMemberDisplayFields', () => {
  const baseMember = {
    id: 'mem_1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
  };
  const now = new Date('2026-06-01T12:00:00Z');
  const oneMonthAhead = new Date('2026-07-01T12:00:00Z');
  const oneDayAgo = new Date('2026-05-31T12:00:00Z');

  it('hides amountDue when the next payment is in the future (paid + current)', () => {
    const result = deriveMemberDisplayFields({
      ...baseMember,
      currentMembership: {
        nextPaymentDate: oneMonthAhead.toISOString(),
        membershipPlan: { price: 149, frequency: 'Monthly', isTrial: false },
      },
    }, now);

    expect(result.amountDue).toBeUndefined();
    expect(result.nextPayment?.getTime()).toBe(oneMonthAhead.getTime());
    expect(result.membershipType).toBe('monthly');
  });

  it('shows amountDue (plan price) when the next payment is in the past', () => {
    const result = deriveMemberDisplayFields({
      ...baseMember,
      currentMembership: {
        nextPaymentDate: oneDayAgo.toISOString(),
        membershipPlan: { price: 149, frequency: 'Monthly', isTrial: false },
      },
    }, now);

    expect(result.amountDue).toBe('149.00');
  });

  it('shows amountDue when nextPaymentDate is missing entirely (no autopay scheduled)', () => {
    const result = deriveMemberDisplayFields({
      ...baseMember,
      currentMembership: {
        nextPaymentDate: null,
        membershipPlan: { price: 149, frequency: 'Monthly', isTrial: false },
      },
    }, now);

    expect(result.amountDue).toBe('149.00');
    expect(result.nextPayment).toBeUndefined();
  });

  it('hides amountDue when plan price is 0 even if past due', () => {
    const result = deriveMemberDisplayFields({
      ...baseMember,
      currentMembership: {
        nextPaymentDate: oneDayAgo.toISOString(),
        membershipPlan: { price: 0, frequency: 'Monthly', isTrial: true },
      },
    }, now);

    expect(result.amountDue).toBeUndefined();
    expect(result.membershipType).toBe('free-trial');
  });

  it('classifies annual plans as annual', () => {
    const result = deriveMemberDisplayFields({
      ...baseMember,
      currentMembership: {
        nextPaymentDate: oneMonthAhead.toISOString(),
        membershipPlan: { price: 1490, frequency: 'Annual', isTrial: false },
      },
    }, now);

    expect(result.membershipType).toBe('annual');
  });

  it('returns the member untouched (no membership) when currentMembership is absent', () => {
    const result = deriveMemberDisplayFields(baseMember, now);

    expect(result.amountDue).toBeUndefined();
    expect(result.nextPayment).toBeUndefined();
    expect(result.membershipType).toBeUndefined();
  });
});
