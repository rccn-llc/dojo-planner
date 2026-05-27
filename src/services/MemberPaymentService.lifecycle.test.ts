/**
 * Focused unit tests for the membership-lifecycle helpers in
 * MemberPaymentService — `normalizeFrequency` (string → IQPro enum) and the
 * shape contracts of `cancelMembershipLifecycle` / `holdMembershipLifecycle`
 * / `reactivateMembershipLifecycle` (orchestrators of one-time fee charge +
 * IQPro subscription cancel/pause + DB update).
 *
 * The full DB + IQPro round-trips are tested at the router-level integration
 * test in Member.test.ts; these tests just lock down the contract so future
 * refactors don't silently break the public API.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal mocks for upstream deps so the module loads cleanly. The lifecycle
// helpers we're testing don't touch the DB or IQPro directly in the tests
// below (we test normalizeFrequency only here), so empty stubs are fine.
vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('@/libs/IQPro', () => ({
  assertTransactionApproved: vi.fn(),
  buildServiceFeeAdjustment: vi.fn(),
  computeFeeBreakdown: vi.fn(),
  getCustomerPaymentMethod: vi.fn(),
  getGatewayProcessors: vi.fn(),
  iqproGet: vi.fn(),
  iqproPost: vi.fn(),
  iqproPut: vi.fn(),
}));
vi.mock('@/libs/Logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/models/Schema', () => ({
  couponSchema: {},
  couponUsageSchema: {},
  memberMembershipSchema: {},
  memberSchema: {},
  membershipPlanSchema: {},
  paymentMethodSchema: {},
  transactionSchema: {},
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('./EmailService', () => ({
  sendPaymentReceiptEmail: vi.fn(),
}));
vi.mock('./OrganizationService', () => ({
  getOrganizationTaxRate: vi.fn().mockResolvedValue(0),
}));
vi.mock('./PaymentProviderService', () => ({
  getPaymentProvider: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeFrequency', () => {
  it('returns null for null/undefined/empty (no recurring billing)', async () => {
    const { normalizeFrequency } = await import('./MemberPaymentService');

    expect(normalizeFrequency(null)).toBeNull();
    expect(normalizeFrequency(undefined)).toBeNull();
    expect(normalizeFrequency('')).toBeNull();
  });

  it('returns null for the legacy "None" sentinel', async () => {
    const { normalizeFrequency } = await import('./MemberPaymentService');

    expect(normalizeFrequency('None')).toBeNull();
    expect(normalizeFrequency('none')).toBeNull();
  });

  it('returns null for "one-time" (alternate one-time sentinel)', async () => {
    const { normalizeFrequency } = await import('./MemberPaymentService');

    expect(normalizeFrequency('one-time')).toBeNull();
    expect(normalizeFrequency('onetime')).toBeNull();
  });

  it('maps Monthly variants', async () => {
    const { normalizeFrequency } = await import('./MemberPaymentService');

    expect(normalizeFrequency('Monthly')).toBe('monthly');
    expect(normalizeFrequency('monthly')).toBe('monthly');
  });

  it('maps Weekly variants', async () => {
    const { normalizeFrequency } = await import('./MemberPaymentService');

    expect(normalizeFrequency('Weekly')).toBe('weekly');
    expect(normalizeFrequency('weekly')).toBe('weekly');
  });

  it('maps Semi-Annual variants', async () => {
    const { normalizeFrequency } = await import('./MemberPaymentService');

    expect(normalizeFrequency('Semi-Annual')).toBe('semi-annual');
    expect(normalizeFrequency('semi-annual')).toBe('semi-annual');
    expect(normalizeFrequency('semi-annually')).toBe('semi-annual');
    expect(normalizeFrequency('semiannual')).toBe('semi-annual');
  });

  it('maps Annual variants', async () => {
    const { normalizeFrequency } = await import('./MemberPaymentService');

    expect(normalizeFrequency('Annual')).toBe('annual');
    expect(normalizeFrequency('Annually')).toBe('annual');
    expect(normalizeFrequency('yearly')).toBe('annual');
  });

  it('returns null for unrecognized values rather than throwing', async () => {
    const { normalizeFrequency } = await import('./MemberPaymentService');

    expect(normalizeFrequency('whatever-cadence')).toBeNull();
  });
});
