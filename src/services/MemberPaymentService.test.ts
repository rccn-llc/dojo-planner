import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'uuid-test-stub'),
}));

const dbMocks = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMocks }));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ _type: 'eq', value: val })),
  and: vi.fn((...conds) => ({ _type: 'and', conds })),
  inArray: vi.fn((_col, vals) => ({ _type: 'inArray', vals })),
  desc: vi.fn(col => ({ _type: 'desc', col })),
  sql: Object.assign(
    vi.fn((..._args) => ({ _type: 'sql' })),
    { raw: vi.fn() },
  ),
}));

vi.mock('@/models/Schema', () => ({
  memberSchema: { id: 'id', iqproCustomerId: 'iqpro_customer_id' },
  paymentMethodSchema: {
    memberId: 'member_id',
    iqproPaymentMethodId: 'iqpro_payment_method_id',
    type: 'type',
    last4: 'last4',
    isDefault: 'is_default',
  },
  transactionSchema: {},
  memberMembershipSchema: { id: 'id' },
  couponSchema: {
    id: 'id',
    perUserLimit: 'per_user_limit',
    usageCount: 'usage_count',
  },
  couponUsageSchema: {
    couponId: 'coupon_id',
    memberId: 'member_id',
    transactionId: 'transaction_id',
  },
}));

vi.mock('@/libs/IQPro', () => ({
  computeFeeBreakdown: vi.fn(),
  getCustomerPaymentMethod: vi.fn(),
  getGatewayProcessors: vi.fn().mockResolvedValue({
    cardProcessorId: 'card_proc_001',
    achProcessorId: 'ach_proc_001',
  }),
  iqproGet: vi.fn(),
  iqproPost: vi.fn(),
  iqproPut: vi.fn(),
  assertTransactionApproved: vi.fn(),
  buildServiceFeeAdjustment: vi.fn(() => ({ type: 'ServiceFee', percentage: 3.75, flatAmount: null })),
}));

const testConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  gatewayId: 'test-gateway-001',
  scope: 'test-scope',
  oauthUrl: 'https://sandbox.oauth.example.com/token',
  baseUrl: 'https://sandbox.api.basyspro.com',
  source: 'env' as const,
};

vi.mock('./OrganizationService', () => ({
  getOrganizationTaxRate: vi.fn().mockResolvedValue(3.75),
}));

vi.mock('@/libs/Logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockProvider = {
  createCustomer: vi.fn(),
  createPaymentMethod: vi.fn(),
  processPayment: vi.fn(),
  createSubscription: vi.fn(),
};

vi.mock('./PaymentProviderService', async () => {
  const actual = await vi.importActual<typeof import('./PaymentProviderService')>('./PaymentProviderService');
  return {
    ...actual,
    getPaymentProvider: vi.fn().mockResolvedValue(mockProvider),
  };
});

const mockSendReceipt = vi.fn().mockResolvedValue(true);
vi.mock('./EmailService', () => ({
  sendPaymentReceiptEmail: mockSendReceipt,
}));

// ── DB mock helper ─────────────────────────────────────────────────────────
//
// The orchestrator's DB usage:
// - select-from-where-limit (existing customer iqproCustomerId)
// - select-from-where-orderBy-limit (saved PM lookup, only on vaulted branch)
// - update-set-where (set iqproCustomerId / membership fields)
// - insert-values (payment method + transaction + coupon usage)

// insertCalls stores whatever was passed to `db.insert(...).values(arg)`.
// The orchestrator passes both single rows (payment_method, coupon_usage)
// and arrays of rows (transactions — one row when no signup fee, two when
// present), so the type is the union.
type InsertArg = Record<string, unknown> | Array<Record<string, unknown>>;

let dbState: {
  existingCustomerId: string | null;
  savedPmRow: { iqproPaymentMethodId: string; type: string; last4: string | null } | null;
  setCalls: Array<Record<string, unknown>>;
  insertCalls: InsertArg[];
  selectIndex: number;
};

function resetDbMock(opts: {
  existingCustomerId?: string | null;
  savedPmRow?: { iqproPaymentMethodId: string; type: string; last4: string | null } | null;
} = {}) {
  dbState = {
    existingCustomerId: opts.existingCustomerId ?? null,
    savedPmRow: opts.savedPmRow ?? null,
    setCalls: [],
    insertCalls: [],
    selectIndex: 0,
  };

  // Each call to db.select() chooses a different chain based on its order:
  //   1. customer lookup (limit 1) → [{ iqproCustomerId }]
  //   2. saved PM lookup (orderBy + limit 1) → [savedPmRow]
  //   3. perUserLimit lookup (when applicableCoupon set, in checkPerUserCouponLimit)
  // Defaulting all `where + limit` chains to read selectIndex correctly.
  dbMocks.select.mockImplementation(() => {
    const idx = dbState.selectIndex++;
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(
              dbState.savedPmRow ? [dbState.savedPmRow] : [],
            ),
          }),
          limit: vi.fn().mockResolvedValue(
            idx === 0
              ? [{ iqproCustomerId: dbState.existingCustomerId }]
              : [],
          ),
        }),
      }),
    };
  });

  dbMocks.update.mockReturnValue({
    set: vi.fn((vals: Record<string, unknown>) => {
      dbState.setCalls.push(vals);
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
  });

  dbMocks.insert.mockReturnValue({
    values: vi.fn((vals: InsertArg) => {
      dbState.insertCalls.push(vals);
      return Promise.resolve();
    }),
  });

  dbMocks.delete.mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });

  // db.transaction(cb) runs the callback with a `tx` that reuses the same
  // insert/update/select/delete recorders, so writes performed inside a
  // transaction land in the same dbState.insertCalls / setCalls the assertions
  // read. `tx.query.*.findFirst` (cancel path) resolves to no other active
  // membership by default.
  dbMocks.transaction.mockImplementation(async (cb: any) =>
    cb({
      insert: dbMocks.insert,
      update: dbMocks.update,
      select: dbMocks.select,
      delete: dbMocks.delete,
      query: {
        memberMembershipSchema: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    }),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('processMemberPayment', () => {
  const baseParams = {
    organizationId: 'org_x',
    memberId: 'mem_42',
    memberEmail: 'jane@example.com',
    memberFirstName: 'Jane',
    memberLastName: 'Doe',
    memberPhone: '5550123456',
    memberAddress: {
      street: '1 Market St',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94103',
      country: 'US',
    },
    paymentMethod: 'card' as const,
    billingType: 'one-time' as const,
    amount: 100,
    description: 'Test charge',
    cardToken: 'tex-tok-abc',
    cardFirstSix: '424242',
    cardLastFour: '4242',
    cardExpiry: '12/27',
  };

  // Kiosk-shape FeeBreakdown
  const baseFees = {
    baseAmount: 100,
    taxAmount: 0,
    taxPct: 0,
    serviceFeeAmount: 3.75,
    serviceFeePct: 3.75,
    amount: 103.75,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetDbMock();

    mockProvider.createCustomer.mockResolvedValue({
      customerId: 'cust_123',
      billingAddressId: 'addr_billing_1',
    });
    mockProvider.createPaymentMethod.mockResolvedValue({
      paymentMethodId: 'pm_card_1',
      last4: '4242',
    });
    mockProvider.processPayment.mockResolvedValue({
      success: true,
      transactionId: 'tx_42',
      status: 'approved',
    });
    mockProvider.createSubscription.mockResolvedValue({
      success: true,
      subscriptionId: 'sub_42',
    });
  });

  it('one-time membership: computes non-taxable fees, charges via provider', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    const result = await processMemberPayment(testConfig, baseParams);

    expect(result.success).toBe(true);
    expect(result.status).toBe('approved');

    // Memberships are non-taxable by default; taxStatePct passed as 0
    expect(computeFeeBreakdown).toHaveBeenCalledWith(
      testConfig,
      100,
      false,
      0,
      expect.objectContaining({ processorId: 'card_proc_001', token: 'tex-tok-abc' }),
    );

    expect(mockProvider.processPayment).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 103.75,
        currency: 'USD',
        customerBillingAddressId: 'addr_billing_1',
        vaulted: false,
        isTaxable: false,
        feeBreakdown: expect.objectContaining({
          baseAmount: 100,
          taxAmount: 0,
          serviceFeeAmount: 3.75,
        }),
      }),
    );
    expect(mockProvider.createSubscription).not.toHaveBeenCalled();
  });

  it('autopay (monthly): writes firstPaymentDate=now and nextPaymentDate=now+1mo on success', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    const beforeCall = Date.now();
    await processMemberPayment(testConfig, {
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'monthly',
      memberMembershipId: 'mm_1',
    });
    const afterCall = Date.now();

    const membershipSet = dbState.setCalls.find(s => s.iqproSubscriptionId === 'sub_42');

    expect(membershipSet).toBeDefined();
    expect(membershipSet?.firstPaymentDate).toBeInstanceOf(Date);
    expect(membershipSet?.nextPaymentDate).toBeInstanceOf(Date);

    // firstPaymentDate must be ~now
    const firstPaymentMs = (membershipSet?.firstPaymentDate as Date).getTime();

    expect(firstPaymentMs).toBeGreaterThanOrEqual(beforeCall);
    expect(firstPaymentMs).toBeLessThanOrEqual(afterCall);

    // nextPaymentDate should be one month later — same day-of-month when
    // possible, clamped to the last day of the target month when not (e.g.
    // Jan 31 → Feb 28). Either way, the month diff must be exactly 1.
    const nextPaymentDate = membershipSet?.nextPaymentDate as Date;
    const firstPaymentDate = membershipSet?.firstPaymentDate as Date;
    const monthsDiff = (nextPaymentDate.getFullYear() - firstPaymentDate.getFullYear()) * 12
      + (nextPaymentDate.getMonth() - firstPaymentDate.getMonth());

    expect(monthsDiff).toBe(1);

    const lastDayOfNextMonth = new Date(nextPaymentDate.getFullYear(), nextPaymentDate.getMonth() + 1, 0).getDate();

    expect([firstPaymentDate.getDate(), lastDayOfNextMonth]).toContain(nextPaymentDate.getDate());
  });

  it('autopay (annual): nextPaymentDate is exactly one year later', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, {
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'annual',
      memberMembershipId: 'mm_1',
    });

    const membershipSet = dbState.setCalls.find(s => s.iqproSubscriptionId === 'sub_42');
    const next = membershipSet?.nextPaymentDate as Date;
    const first = membershipSet?.firstPaymentDate as Date;

    expect(next.getFullYear() - first.getFullYear()).toBe(1);
    expect(next.getMonth()).toBe(first.getMonth());
    expect(next.getDate()).toBe(first.getDate());
  });

  it('autopay (weekly): nextPaymentDate is exactly 7 days later', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, {
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'weekly',
      memberMembershipId: 'mm_1',
    });

    const membershipSet = dbState.setCalls.find(s => s.iqproSubscriptionId === 'sub_42');
    const next = membershipSet?.nextPaymentDate as Date;
    const first = membershipSet?.firstPaymentDate as Date;
    const diffMs = next.getTime() - first.getTime();

    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('autopay (semi-annual): nextPaymentDate is exactly six months later', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, {
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'semi-annual',
      memberMembershipId: 'mm_1',
    });

    const membershipSet = dbState.setCalls.find(s => s.iqproSubscriptionId === 'sub_42');
    const next = membershipSet?.nextPaymentDate as Date;
    const first = membershipSet?.firstPaymentDate as Date;
    const monthsDiff = (next.getFullYear() - first.getFullYear()) * 12
      + (next.getMonth() - first.getMonth());

    expect(monthsDiff).toBe(6);

    // Day-of-month is preserved when possible, clamped to last day of target
    // month otherwise (e.g. May 31 → Nov 30).
    const lastDayOfNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();

    expect([first.getDate(), lastDayOfNextMonth]).toContain(next.getDate());
  });

  it('autopay: writes NOTHING to membership row when memberMembershipId is missing (regression guard)', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, {
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'monthly',
      // memberMembershipId intentionally omitted — exactly the pre-fix bug.
    });

    // The autopay db.update path is gated on memberMembershipId. Without it,
    // no membership row gets `iqproSubscriptionId` / `nextPaymentDate` set —
    // which is the bug this whole fix is about. Test guards that callers
    // (the wizards) MUST pass memberMembershipId.
    const membershipSet = dbState.setCalls.find(s => s.iqproSubscriptionId === 'sub_42');

    expect(membershipSet).toBeUndefined();
  });

  it('autopay: creates subscription THEN runs immediate Sale', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    const result = await processMemberPayment(testConfig, {
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'monthly',
      memberMembershipId: 'mm_1',
    });

    expect(result.success).toBe(true);
    expect(mockProvider.createSubscription).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        frequency: 'monthly',
        vaulted: false,
        // Memberships emit ServiceFee only (no Tax)
        paymentAdjustments: [
          { type: 'ServiceFee', percentage: 3.75, flatAmount: null },
        ],
      }),
    );

    expect(mockProvider.processPayment).toHaveBeenCalledTimes(1);
    expect(mockProvider.processPayment).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({
        amount: 103.75,
        metadata: expect.objectContaining({ iqproSubscriptionId: 'sub_42' }),
      }),
    );

    const membershipSet = dbState.setCalls.find(s => s.iqproSubscriptionId === 'sub_42');

    expect(membershipSet).toBeDefined();
    expect(membershipSet?.billingType).toBe('autopay');
  });

  it('autopay: surfaces failure when initial charge declines', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);
    mockProvider.processPayment.mockResolvedValue({
      success: false,
      status: 'declined',
      transactionId: 'tx_decline',
      declineReason: 'Insufficient funds',
    });

    const { processMemberPayment } = await import('./MemberPaymentService');
    const result = await processMemberPayment(testConfig, {
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'monthly',
      memberMembershipId: 'mm_1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Subscription created but initial charge failed/);

    const wroteAutopay = dbState.setCalls.some(s => s.billingType === 'autopay' || s.iqproSubscriptionId);

    expect(wroteAutopay).toBe(false);

    // Transaction inserts now use an array form (one row when no signup
    // fee, two rows when present). Find the array containing the declined tx.
    const txInsertArray = dbState.insertCalls.find(
      (call): call is Array<Record<string, unknown>> =>
        Array.isArray(call) && call.some(r => r.iqproTransactionId === 'tx_decline'),
    );
    const txInsert = txInsertArray?.find(r => r.iqproTransactionId === 'tx_decline');

    expect(txInsert?.status).toBe('declined');
  });

  it('falls back to creditCardBin when no card token is provided', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, { ...baseParams, cardToken: undefined });

    const callArgs = vi.mocked(computeFeeBreakdown).mock.calls[0]!;

    expect(callArgs[4]).toEqual(expect.objectContaining({ creditCardBin: '424242' }));
    expect(callArgs[4]).not.toHaveProperty('token');
  });

  it('ACH new payment: passes achToken to fee calc, sends inline ach to provider', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce({
      ...baseFees,
      serviceFeeAmount: 0,
      amount: 100,
    });

    mockProvider.createPaymentMethod.mockResolvedValue({
      paymentMethodId: 'pm_ach_1',
      last4: '1234',
      achToken: 'ach-tok-xyz',
    });

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, {
      ...baseParams,
      paymentMethod: 'ach',
      cardToken: undefined,
      cardFirstSix: undefined,
      achRoutingNumber: '021000021',
      achAccountNumber: '987654321',
      achAccountType: 'Checking',
    });

    const feeArgs = vi.mocked(computeFeeBreakdown).mock.calls[0]!;

    expect(feeArgs[4].processorId).toBe('ach_proc_001');
    expect(feeArgs[4].token).toBe('ach-tok-xyz');
    expect(feeArgs[4]).not.toHaveProperty('creditCardBin');

    expect(mockProvider.processPayment).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({
        ach: {
          achToken: 'ach-tok-xyz',
          secCode: 'PPD',
          routingNumber: '021000021',
          accountType: 'Checking',
        },
      }),
    );
  });

  it('Fixed Amount coupon: discount applied before fee calc', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce({ ...baseFees, baseAmount: 75, amount: 78.75 });

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, {
      ...baseParams,
      appliedCoupon: { id: 'cpn_1', code: 'SAVE25', type: 'Fixed Amount', amount: '25', description: '$25 off' },
    });

    expect(computeFeeBreakdown).toHaveBeenCalledWith(testConfig, 75, false, 0, expect.any(Object));
  });

  it('Percentage coupon: discount applied before fee calc', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce({ ...baseFees, baseAmount: 90, amount: 93.75 });

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, {
      ...baseParams,
      appliedCoupon: { id: 'cpn_2', code: 'TEN_PCT', type: 'Percentage', amount: '10', description: '10% off' },
    });

    expect(computeFeeBreakdown).toHaveBeenCalledWith(testConfig, 90, false, 0, expect.any(Object));
  });

  it('throws clear error when no gateway processor is configured', async () => {
    const iqpro = await import('@/libs/IQPro');
    vi.mocked(iqpro.getGatewayProcessors).mockResolvedValueOnce({
      cardProcessorId: null,
      achProcessorId: null,
    });

    const { processMemberPayment } = await import('./MemberPaymentService');
    const result = await processMemberPayment(testConfig, baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No card processor configured/);
  });

  it('reuses an existing IQPro customer ID and skips createCustomer', async () => {
    resetDbMock({ existingCustomerId: 'cust_existing_999' });
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, baseParams);

    expect(mockProvider.createCustomer).not.toHaveBeenCalled();
    expect(mockProvider.processPayment).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({ customerId: 'cust_existing_999' }),
    );
  });

  // ── isTaxable branch ────────────────────────────────────────────────────

  it('isTaxable: true (event/store) — fee calc and provider both told it is taxable', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce({
      ...baseFees,
      taxAmount: 3.75,
      taxPct: 3.75,
      amount: 107.5,
    });

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, { ...baseParams, isTaxable: true });

    // taxStatePct (3.75 from getOrganizationTaxRate mock) is threaded through as 3rd arg
    expect(computeFeeBreakdown).toHaveBeenCalledWith(testConfig, 100, true, 3.75, expect.any(Object));
    expect(mockProvider.processPayment).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({ isTaxable: true }),
    );
  });

  it('isTaxable: true — calls getOrganizationTaxRate with the org ID', async () => {
    const { getOrganizationTaxRate } = await import('./OrganizationService');
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce({ ...baseFees, taxAmount: 5.25, taxPct: 5.25, amount: 109 });
    vi.mocked(getOrganizationTaxRate).mockResolvedValueOnce(5.25);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, { ...baseParams, isTaxable: true });

    expect(getOrganizationTaxRate).toHaveBeenCalledWith('org_x');
    expect(computeFeeBreakdown).toHaveBeenCalledWith(testConfig, 100, true, 5.25, expect.any(Object));
  });

  it('isTaxable: false — does not call getOrganizationTaxRate', async () => {
    const { getOrganizationTaxRate } = await import('./OrganizationService');
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);
    vi.mocked(getOrganizationTaxRate).mockClear();

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, { ...baseParams, isTaxable: false });

    expect(getOrganizationTaxRate).not.toHaveBeenCalled();
    expect(computeFeeBreakdown).toHaveBeenCalledWith(testConfig, 100, false, 0, expect.any(Object));
  });

  // ── Saved-PM (vaulted) branch ────────────────────────────────────────────

  it('saved branch: missing iqproCustomerId returns friendly error', async () => {
    resetDbMock({ existingCustomerId: null });
    const { processMemberPayment } = await import('./MemberPaymentService');

    const result = await processMemberPayment(testConfig, { ...baseParams, paymentMethodSource: 'saved' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no saved customer record/);
    expect(mockProvider.createCustomer).not.toHaveBeenCalled();
    expect(mockProvider.createPaymentMethod).not.toHaveBeenCalled();
    expect(mockProvider.processPayment).not.toHaveBeenCalled();
  });

  it('saved branch: missing payment_method row returns friendly error', async () => {
    resetDbMock({ existingCustomerId: 'cust_have', savedPmRow: null });
    const { processMemberPayment } = await import('./MemberPaymentService');

    const result = await processMemberPayment(testConfig, { ...baseParams, paymentMethodSource: 'saved' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no saved payment method/);
    expect(mockProvider.createPaymentMethod).not.toHaveBeenCalled();
  });

  it('saved branch: charges via vaulted=true, no createCustomer/createPaymentMethod', async () => {
    resetDbMock({
      existingCustomerId: 'cust_have',
      savedPmRow: { iqproPaymentMethodId: 'pm_saved_1', type: 'card', last4: '4242' },
    });
    const { computeFeeBreakdown, getCustomerPaymentMethod } = await import('@/libs/IQPro');
    vi.mocked(getCustomerPaymentMethod).mockResolvedValueOnce({
      type: 'card',
      firstSix: '424242',
      last4: '4242',
    });
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    const result = await processMemberPayment(testConfig, { ...baseParams, paymentMethodSource: 'saved' });

    expect(result.success).toBe(true);
    expect(mockProvider.createCustomer).not.toHaveBeenCalled();
    expect(mockProvider.createPaymentMethod).not.toHaveBeenCalled();
    expect(getCustomerPaymentMethod).toHaveBeenCalledWith(testConfig, 'cust_have', 'pm_saved_1');
    expect(computeFeeBreakdown).toHaveBeenCalledWith(
      testConfig,
      100,
      false,
      0,
      expect.objectContaining({ creditCardBin: '424242' }),
    );
    expect(mockProvider.processPayment).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({
        customerId: 'cust_have',
        paymentMethodId: 'pm_saved_1',
        vaulted: true,
      }),
    );
  });

  // ── Receipt email gating ───────────────────────────────────────────────

  it('receipt email: sent on approved one-time payment', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, baseParams);

    expect(mockSendReceipt).toHaveBeenCalledTimes(1);
    expect(mockSendReceipt).toHaveBeenCalledWith(expect.objectContaining({
      toEmail: 'jane@example.com',
      taxAmount: 0,
      serviceFeeAmount: 3.75,
      total: 103.75,
      isRecurring: false,
    }));
  });

  it('receipt email: NOT sent on declined transaction', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);
    mockProvider.processPayment.mockResolvedValue({
      success: false,
      status: 'declined',
      transactionId: 'tx_decline',
      declineReason: 'Card declined',
    });

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, baseParams);

    expect(mockSendReceipt).not.toHaveBeenCalled();
  });

  it('receipt email: sent on approved autopay with isRecurring=true', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(testConfig, {
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'monthly',
      memberMembershipId: 'mm_1',
    });

    expect(mockSendReceipt).toHaveBeenCalledWith(expect.objectContaining({
      isRecurring: true,
    }));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SIGNUP FEE — load-bearing: when present, the IQPro recurring subscription
  // MUST be created at the recurring amount only (NOT bundled with the fee),
  // and the initial Sale MUST carry two line items + write two tx rows.
  // Regression guard against the $149/mo plan getting billed at $248/mo.
  // ─────────────────────────────────────────────────────────────────────────

  describe('with signup fee', () => {
    // Plan: $149/mo recurring + $99 one-time signup fee. Service fee 3.75%
    // applied to the post-coupon subtotal ($149 + $99 = $248) → $9.30 SF →
    // gross IQPro Sale ≈ $257.30 (but the local membership row records $149
    // and the signup-fee row records $99 — fees aren't split across rows).
    const planRecurring = 149;
    const planSignupFee = 99;
    const subtotal = planRecurring + planSignupFee;
    const serviceFeeAmount = Math.round(subtotal * 0.0375 * 100) / 100;
    const grossAmount = Math.round((subtotal + serviceFeeAmount) * 100) / 100;
    const feesWithSignup = {
      baseAmount: subtotal,
      taxAmount: 0,
      taxPct: 0,
      serviceFeeAmount,
      serviceFeePct: 3.75,
      amount: grossAmount,
    };

    it('autopay: creates subscription at recurring amount only (not bundled with signup fee)', async () => {
      const { computeFeeBreakdown } = await import('@/libs/IQPro');
      vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(feesWithSignup);

      const { processMemberPayment } = await import('./MemberPaymentService');
      await processMemberPayment(testConfig, {
        ...baseParams,
        amount: planRecurring,
        signupFee: planSignupFee,
        billingType: 'autopay',
        membershipPlanFrequency: 'monthly',
        memberMembershipId: 'mm_signup',
      });

      // The critical assertion: IQPro subscription created at $149, NOT $248
      expect(mockProvider.createSubscription).toHaveBeenCalledWith(
        testConfig,
        expect.objectContaining({
          amount: planRecurring,
        }),
      );

      const subArgs = mockProvider.createSubscription.mock.calls[0]![1];

      expect(subArgs.amount).not.toBe(subtotal);
    });

    it('autopay: initial Sale carries TWO line items (membership + signup fee)', async () => {
      const { computeFeeBreakdown } = await import('@/libs/IQPro');
      vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(feesWithSignup);

      const { processMemberPayment } = await import('./MemberPaymentService');
      await processMemberPayment(testConfig, {
        ...baseParams,
        amount: planRecurring,
        signupFee: planSignupFee,
        billingType: 'autopay',
        membershipPlanFrequency: 'monthly',
        memberMembershipId: 'mm_signup',
        description: 'Membership: 12 Month Commitment (Gold)',
      });

      expect(mockProvider.processPayment).toHaveBeenCalledTimes(1);

      const saleArgs = mockProvider.processPayment.mock.calls[0]![1];

      expect(saleArgs.lineItems).toHaveLength(2);
      expect(saleArgs.lineItems[0]).toEqual(expect.objectContaining({
        unitPrice: planRecurring,
        discount: 0,
      }));
      expect(saleArgs.lineItems[1]).toEqual(expect.objectContaining({
        name: 'Sign-up fee',
        unitPrice: planSignupFee,
        discount: 0,
      }));
      expect(saleArgs.amount).toBe(grossAmount);
    });

    it('autopay: writes TWO local tx rows sharing the same iqproTransactionId', async () => {
      const { computeFeeBreakdown } = await import('@/libs/IQPro');
      vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(feesWithSignup);

      const { processMemberPayment } = await import('./MemberPaymentService');
      await processMemberPayment(testConfig, {
        ...baseParams,
        amount: planRecurring,
        signupFee: planSignupFee,
        billingType: 'autopay',
        membershipPlanFrequency: 'monthly',
        memberMembershipId: 'mm_signup',
        description: 'Membership: 12 Month Commitment (Gold)',
      });

      const txInsert = dbState.insertCalls.find(
        (call): call is Array<Record<string, unknown>> => Array.isArray(call),
      );

      expect(txInsert).toBeDefined();
      expect(txInsert).toHaveLength(2);

      const membershipRow = txInsert!.find(r => r.transactionType === 'membership_payment')!;
      const signupRow = txInsert!.find(r => r.transactionType === 'signup_fee')!;

      expect(membershipRow.amount).toBe(planRecurring);
      expect(signupRow.amount).toBe(planSignupFee);
      expect(membershipRow.iqproTransactionId).toBe('tx_42');
      expect(signupRow.iqproTransactionId).toBe('tx_42');
      expect(signupRow.description).toContain('Sign-up fee');
      expect(signupRow.description).toContain('12 Month Commitment (Gold)');
    });

    it('one-time: single Sale with two line items + two tx rows', async () => {
      const { computeFeeBreakdown } = await import('@/libs/IQPro');
      vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(feesWithSignup);

      const { processMemberPayment } = await import('./MemberPaymentService');
      await processMemberPayment(testConfig, {
        ...baseParams,
        amount: planRecurring,
        signupFee: planSignupFee,
        description: 'Membership: 12 Month Commitment (Gold)',
      });

      expect(mockProvider.createSubscription).not.toHaveBeenCalled();

      const saleArgs = mockProvider.processPayment.mock.calls[0]![1];

      expect(saleArgs.lineItems).toHaveLength(2);

      const txInsert = dbState.insertCalls.find(
        (call): call is Array<Record<string, unknown>> => Array.isArray(call),
      );

      expect(txInsert).toHaveLength(2);

      const types = txInsert!.map(r => r.transactionType);

      expect(types).toContain('membership_payment');
      expect(types).toContain('signup_fee');
    });

    it('signupFee + coupon: discount applies to membership row only', async () => {
      const { computeFeeBreakdown } = await import('@/libs/IQPro');
      // 10% off $149 = $14.90 discount → membership row $134.10, signup $99
      vi.mocked(computeFeeBreakdown).mockResolvedValueOnce({
        ...feesWithSignup,
        baseAmount: 233.10,
        amount: 241.84,
      });

      const { processMemberPayment } = await import('./MemberPaymentService');
      await processMemberPayment(testConfig, {
        ...baseParams,
        amount: planRecurring,
        signupFee: planSignupFee,
        billingType: 'autopay',
        membershipPlanFrequency: 'monthly',
        memberMembershipId: 'mm_signup_coupon',
        appliedCoupon: {
          id: 'coup_10pct',
          code: 'WELCOME10',
          type: 'Percentage',
          amount: '10%',
          description: '10% off',
        },
      });

      // Recurring subscription is on the DISCOUNTED recurring price only
      const subArgs = mockProvider.createSubscription.mock.calls[0]![1];

      expect(subArgs.amount).toBeCloseTo(134.10, 2);

      // Local tx rows: membership = discounted recurring, signup = full fee
      const txInsert = dbState.insertCalls.find(
        (call): call is Array<Record<string, unknown>> => Array.isArray(call),
      )!;
      const membershipRow = txInsert.find(r => r.transactionType === 'membership_payment')!;
      const signupRow = txInsert.find(r => r.transactionType === 'signup_fee')!;

      expect(membershipRow.amount as number).toBeCloseTo(134.10, 2);
      expect(signupRow.amount).toBe(planSignupFee); // coupon NEVER applies to signup fee
    });

    it('signupFee === 0: writes ONE tx row, ONE line item (regression guard)', async () => {
      const { computeFeeBreakdown } = await import('@/libs/IQPro');
      vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

      const { processMemberPayment } = await import('./MemberPaymentService');
      await processMemberPayment(testConfig, {
        ...baseParams,
        amount: planRecurring,
        signupFee: 0,
        billingType: 'autopay',
        membershipPlanFrequency: 'monthly',
        memberMembershipId: 'mm_no_signup',
      });

      // Subscription amount === membership amount (no signup fee folded in)
      const subArgs = mockProvider.createSubscription.mock.calls[0]![1];

      expect(subArgs.amount).toBe(planRecurring);

      // Single line item, single tx row
      const saleArgs = mockProvider.processPayment.mock.calls[0]![1];

      expect(saleArgs.lineItems).toHaveLength(1);

      const txInsert = dbState.insertCalls.find(
        (call): call is Array<Record<string, unknown>> => Array.isArray(call),
      )!;

      expect(txInsert).toHaveLength(1);
      expect(txInsert[0]!.transactionType).toBe('membership_payment');
    });

    it('receipt email: includes both line items when signupFee > 0', async () => {
      const { computeFeeBreakdown } = await import('@/libs/IQPro');
      vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(feesWithSignup);

      const { processMemberPayment } = await import('./MemberPaymentService');
      await processMemberPayment(testConfig, {
        ...baseParams,
        amount: planRecurring,
        signupFee: planSignupFee,
        billingType: 'autopay',
        membershipPlanFrequency: 'monthly',
        memberMembershipId: 'mm_signup_receipt',
        description: 'Membership: 12 Month Commitment (Gold)',
      });

      expect(mockSendReceipt).toHaveBeenCalledTimes(1);

      const receiptArgs = mockSendReceipt.mock.calls[0]![0];

      expect(receiptArgs.lineItems).toHaveLength(2);
      expect(receiptArgs.lineItems[1]).toEqual(expect.objectContaining({
        name: 'Sign-up fee',
        unitPrice: planSignupFee,
        discount: 0,
      }));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// computeNextPaymentDate — calendar-math helper used to fill
// member_membership.nextPaymentDate after a successful autopay charge.
// Uses real Date.setMonth / Date.setFullYear (not 30-day approximations).
// ─────────────────────────────────────────────────────────────────────────

describe('computeNextPaymentDate', () => {
  it('weekly: adds exactly 7 days', async () => {
    const { computeNextPaymentDate } = await import('./MemberPaymentService');
    const from = new Date('2026-06-01T12:00:00Z');
    const next = computeNextPaymentDate(from, 'weekly');

    expect(next.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('monthly: adds exactly 1 month, preserving day-of-month', async () => {
    const { computeNextPaymentDate } = await import('./MemberPaymentService');
    const from = new Date(2026, 5, 15); // 15 June 2026 (local time, no TZ surprises)
    const next = computeNextPaymentDate(from, 'monthly');

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(6); // July
    expect(next.getDate()).toBe(15);
  });

  it('monthly: handles year wraparound (Dec → Jan next year)', async () => {
    const { computeNextPaymentDate } = await import('./MemberPaymentService');
    const from = new Date(2026, 11, 15); // 15 December 2026
    const next = computeNextPaymentDate(from, 'monthly');

    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0); // January
    expect(next.getDate()).toBe(15);
  });

  it('semi-annual: adds exactly 6 months', async () => {
    const { computeNextPaymentDate } = await import('./MemberPaymentService');
    const from = new Date(2026, 0, 15); // 15 January 2026
    const next = computeNextPaymentDate(from, 'semi-annual');

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(6); // July
    expect(next.getDate()).toBe(15);
  });

  it('annual: adds exactly 1 year, preserving month and day', async () => {
    const { computeNextPaymentDate } = await import('./MemberPaymentService');
    const from = new Date(2026, 5, 15); // 15 June 2026
    const next = computeNextPaymentDate(from, 'annual');

    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(5); // June
    expect(next.getDate()).toBe(15);
  });

  it('null (one-time / no recurring): returns the same date unshifted', async () => {
    const { computeNextPaymentDate } = await import('./MemberPaymentService');
    const from = new Date('2026-06-01T12:00:00Z');
    const next = computeNextPaymentDate(from, null);

    expect(next.getTime()).toBe(from.getTime());
  });

  it('monthly: clamps day-of-month (Jan 31 → Feb 28, not Mar 3)', async () => {
    const { computeNextPaymentDate } = await import('./MemberPaymentService');
    const from = new Date(2026, 0, 31); // 31 January 2026 (non-leap)
    const next = computeNextPaymentDate(from, 'monthly');

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(1); // February
    expect(next.getDate()).toBe(28); // clamped to last day of Feb
  });

  it('monthly: clamps day-of-month on a 31-day → 30-day month (May 31 → Jun 30)', async () => {
    const { computeNextPaymentDate } = await import('./MemberPaymentService');
    const from = new Date(2026, 4, 31); // 31 May 2026
    const next = computeNextPaymentDate(from, 'monthly');

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(5); // June
    expect(next.getDate()).toBe(30); // clamped to last day of June
  });
});

describe('chargeOneTimeFee (resilience — #237)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a captured error (never throws) when the subscription fetch fails', async () => {
    const { iqproGet } = await import('@/libs/IQPro');
    // A synthetic/seed subscription id makes IQPro reject the initial fetch —
    // this used to throw straight through and 500 the hold/cancel endpoints.
    vi.mocked(iqproGet).mockRejectedValue(new Error('IQPro 404: subscription not found'));

    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    const result = await chargeOneTimeFee({
      config: testConfig,
      iqproSubscriptionId: 'seed_sub_does_not_exist',
      iqproCustomerId: 'seed_cus_1',
      orgId: 'org-1',
      memberId: 'member-1',
      memberMembershipId: 'mm-1',
      amount: 25,
      transactionType: 'hold_fee',
      description: 'Hold fee',
      caption: 'Hold fee',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('subscription not found');
  });

  it('short-circuits to success with no charge when the amount is zero', async () => {
    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    const result = await chargeOneTimeFee({
      config: testConfig,
      iqproSubscriptionId: 'seed_sub_1',
      iqproCustomerId: 'seed_cus_1',
      orgId: 'org-1',
      memberId: 'member-1',
      memberMembershipId: 'mm-1',
      amount: 0,
      transactionType: 'hold_fee',
      description: 'Hold fee',
      caption: 'Hold fee',
    });

    expect(result).toEqual({ success: true, amountCharged: 0 });
  });

  it('parses a subscription with no saved payment method into a clean error (schema, #WS4)', async () => {
    const { iqproGet } = await import('@/libs/IQPro');
    // A well-formed but payment-method-less subscription: the response parses
    // cleanly and yields no pmId, so we abort with a friendly error instead of
    // charging on a fallback BIN or throwing on an untyped read.
    vi.mocked(iqproGet).mockResolvedValue({ data: { customer: { customerId: 'cus_9' } } } as any);

    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    const result = await chargeOneTimeFee({
      config: testConfig,
      iqproSubscriptionId: 'sub_real_1',
      iqproCustomerId: 'cus_9',
      orgId: 'org-1',
      memberId: 'member-1',
      memberMembershipId: 'mm-1',
      amount: 25,
      transactionType: 'cancellation_fee',
      description: 'Cancellation fee',
      caption: 'Cancellation fee',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No saved payment method');
  });
});
