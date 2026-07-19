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

// Capturing db mock — the cancellation-fee test below asserts on inserted rows.
// `normalizeFrequency` tests don't touch the db, so the stub is inert for them.
const dbInsertValues = vi.fn();
const dbUpdateWhere = vi.fn();
const dbMock = {
  insert: vi.fn(() => ({ values: dbInsertValues })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: dbUpdateWhere })) })),
  query: {
    memberMembershipSchema: { findFirst: vi.fn().mockResolvedValue(undefined) },
  },
};
vi.mock('@/libs/DB', () => ({ db: dbMock }));
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
  auditEventSchema: {},
  couponSchema: {},
  couponUsageSchema: {},
  memberMembershipSchema: { id: 'id', memberId: 'member_id', status: 'status' },
  memberSchema: { id: 'id', status: 'status' },
  membershipPlanSchema: {},
  paymentMethodSchema: {},
  transactionSchema: {},
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
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

describe('cancelMembershipLifecycle — records cancellation fee in billing history (#239)', () => {
  const makeCtx = (cancellationFee: number) => ({
    member: {
      id: 'mem-1',
      organizationId: 'org-1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: null,
      iqproCustomerId: null, // synthetic/no IQPro → live charge path is skipped
    },
    membership: {
      id: 'mm-1',
      memberId: 'mem-1',
      membershipPlanId: 'plan-1',
      status: 'active',
      iqproSubscriptionId: null,
      iqproHoldFeeSubscriptionId: null,
    },
    plan: {
      id: 'plan-1',
      name: 'Monthly Unlimited',
      cancellationFee,
      holdFeeAmount: 0,
      holdFeeFrequency: null,
      holdLimitPerYear: null,
    },
  });

  it('inserts a pending cancellation_fee row when a fee is owed but no live charge ran', async () => {
    const { cancelMembershipLifecycle } = await import('./MemberPaymentService');

    const result = await cancelMembershipLifecycle({ config: null, ctx: makeCtx(50), waiveFee: false });

    // The fee is recorded even though IQPro never charged it.
    const feeInsert = dbInsertValues.mock.calls
      .map(c => c[0])
      .find((row: any) => row?.transactionType === 'cancellation_fee');

    expect(feeInsert).toMatchObject({
      organizationId: 'org-1',
      memberId: 'mem-1',
      memberMembershipId: 'mm-1',
      transactionType: 'cancellation_fee',
      amount: 50,
      status: 'pending',
    });
    expect(result.cancellationFeeCharged).toBe(50);
    expect(result.success).toBe(true);
  });

  it('does NOT record a fee row when the fee is waived', async () => {
    const { cancelMembershipLifecycle } = await import('./MemberPaymentService');

    await cancelMembershipLifecycle({ config: null, ctx: makeCtx(50), waiveFee: true });

    const feeInsert = dbInsertValues.mock.calls
      .map(c => c[0])
      .find((row: any) => row?.transactionType === 'cancellation_fee');

    expect(feeInsert).toBeUndefined();
  });

  it('does NOT record a fee row when the plan has no cancellation fee', async () => {
    const { cancelMembershipLifecycle } = await import('./MemberPaymentService');

    await cancelMembershipLifecycle({ config: null, ctx: makeCtx(0), waiveFee: false });

    const feeInsert = dbInsertValues.mock.calls
      .map(c => c[0])
      .find((row: any) => row?.transactionType === 'cancellation_fee');

    expect(feeInsert).toBeUndefined();
  });
});
