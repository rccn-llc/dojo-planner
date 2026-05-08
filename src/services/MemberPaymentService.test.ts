import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'uuid-test-stub'),
}));

const dbMocks = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMocks }));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ _type: 'eq', value: val })),
  and: vi.fn((...conds) => ({ _type: 'and', conds })),
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
  isIQProConfigured: vi.fn().mockReturnValue(true),
  computeFeeBreakdown: vi.fn(),
  getCustomerPaymentMethod: vi.fn(),
  getGatewayProcessors: vi.fn().mockResolvedValue({
    cardProcessorId: 'card_proc_001',
    achProcessorId: 'ach_proc_001',
  }),
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
    isPaymentEnabled: vi.fn().mockReturnValue(true),
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

let dbState: {
  existingCustomerId: string | null;
  savedPmRow: { iqproPaymentMethodId: string; type: string; last4: string | null } | null;
  setCalls: Array<Record<string, unknown>>;
  insertCalls: Array<Record<string, unknown>>;
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
    values: vi.fn((vals: Record<string, unknown>) => {
      dbState.insertCalls.push(vals);
      return Promise.resolve();
    }),
  });
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
    const result = await processMemberPayment(baseParams);

    expect(result.success).toBe(true);
    expect(result.status).toBe('approved');

    // Memberships are non-taxable by default
    expect(computeFeeBreakdown).toHaveBeenCalledWith(
      100,
      false,
      expect.objectContaining({ processorId: 'card_proc_001', token: 'tex-tok-abc' }),
    );

    expect(mockProvider.processPayment).toHaveBeenCalledWith(
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

  it('autopay: creates subscription THEN runs immediate Sale', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    const result = await processMemberPayment({
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'monthly',
      memberMembershipId: 'mm_1',
    });

    expect(result.success).toBe(true);
    expect(mockProvider.createSubscription).toHaveBeenCalledWith(
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
    const result = await processMemberPayment({
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'monthly',
      memberMembershipId: 'mm_1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Subscription created but initial charge failed/);

    const wroteAutopay = dbState.setCalls.some(s => s.billingType === 'autopay' || s.iqproSubscriptionId);

    expect(wroteAutopay).toBe(false);

    const txInsert = dbState.insertCalls.find(i => i.iqproTransactionId === 'tx_decline');

    expect(txInsert?.status).toBe('declined');
  });

  it('falls back to creditCardBin when no card token is provided', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment({ ...baseParams, cardToken: undefined });

    const callArgs = vi.mocked(computeFeeBreakdown).mock.calls[0]!;

    expect(callArgs[2]).toEqual(expect.objectContaining({ creditCardBin: '424242' }));
    expect(callArgs[2]).not.toHaveProperty('token');
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
    await processMemberPayment({
      ...baseParams,
      paymentMethod: 'ach',
      cardToken: undefined,
      cardFirstSix: undefined,
      achRoutingNumber: '021000021',
      achAccountNumber: '987654321',
      achAccountType: 'Checking',
    });

    const feeArgs = vi.mocked(computeFeeBreakdown).mock.calls[0]!;

    expect(feeArgs[2].processorId).toBe('ach_proc_001');
    expect(feeArgs[2].token).toBe('ach-tok-xyz');
    expect(feeArgs[2]).not.toHaveProperty('creditCardBin');

    expect(mockProvider.processPayment).toHaveBeenCalledWith(
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
    await processMemberPayment({
      ...baseParams,
      appliedCoupon: { id: 'cpn_1', code: 'SAVE25', type: 'Fixed Amount', amount: '25', description: '$25 off' },
    });

    expect(computeFeeBreakdown).toHaveBeenCalledWith(75, false, expect.any(Object));
  });

  it('Percentage coupon: discount applied before fee calc', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce({ ...baseFees, baseAmount: 90, amount: 93.75 });

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment({
      ...baseParams,
      appliedCoupon: { id: 'cpn_2', code: 'TEN_PCT', type: 'Percentage', amount: '10', description: '10% off' },
    });

    expect(computeFeeBreakdown).toHaveBeenCalledWith(90, false, expect.any(Object));
  });

  it('throws clear error when no gateway processor is configured', async () => {
    const iqpro = await import('@/libs/IQPro');
    vi.mocked(iqpro.getGatewayProcessors).mockResolvedValueOnce({
      cardProcessorId: null,
      achProcessorId: null,
    });

    const { processMemberPayment } = await import('./MemberPaymentService');
    const result = await processMemberPayment(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No card processor configured/);
  });

  it('reuses an existing IQPro customer ID and skips createCustomer', async () => {
    resetDbMock({ existingCustomerId: 'cust_existing_999' });
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment(baseParams);

    expect(mockProvider.createCustomer).not.toHaveBeenCalled();
    expect(mockProvider.processPayment).toHaveBeenCalledWith(
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
    await processMemberPayment({ ...baseParams, isTaxable: true });

    expect(computeFeeBreakdown).toHaveBeenCalledWith(100, true, expect.any(Object));
    expect(mockProvider.processPayment).toHaveBeenCalledWith(
      expect.objectContaining({ isTaxable: true }),
    );
  });

  // ── Saved-PM (vaulted) branch ────────────────────────────────────────────

  it('saved branch: missing iqproCustomerId returns friendly error', async () => {
    resetDbMock({ existingCustomerId: null });
    const { processMemberPayment } = await import('./MemberPaymentService');

    const result = await processMemberPayment({ ...baseParams, paymentMethodSource: 'saved' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no saved customer record/);
    expect(mockProvider.createCustomer).not.toHaveBeenCalled();
    expect(mockProvider.createPaymentMethod).not.toHaveBeenCalled();
    expect(mockProvider.processPayment).not.toHaveBeenCalled();
  });

  it('saved branch: missing payment_method row returns friendly error', async () => {
    resetDbMock({ existingCustomerId: 'cust_have', savedPmRow: null });
    const { processMemberPayment } = await import('./MemberPaymentService');

    const result = await processMemberPayment({ ...baseParams, paymentMethodSource: 'saved' });

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
    const result = await processMemberPayment({ ...baseParams, paymentMethodSource: 'saved' });

    expect(result.success).toBe(true);
    expect(mockProvider.createCustomer).not.toHaveBeenCalled();
    expect(mockProvider.createPaymentMethod).not.toHaveBeenCalled();
    expect(getCustomerPaymentMethod).toHaveBeenCalledWith('cust_have', 'pm_saved_1');
    expect(computeFeeBreakdown).toHaveBeenCalledWith(
      100,
      false,
      expect.objectContaining({ creditCardBin: '424242' }),
    );
    expect(mockProvider.processPayment).toHaveBeenCalledWith(
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
    await processMemberPayment(baseParams);

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
    await processMemberPayment(baseParams);

    expect(mockSendReceipt).not.toHaveBeenCalled();
  });

  it('receipt email: sent on approved autopay with isRecurring=true', async () => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    vi.mocked(computeFeeBreakdown).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');
    await processMemberPayment({
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'monthly',
      memberMembershipId: 'mm_1',
    });

    expect(mockSendReceipt).toHaveBeenCalledWith(expect.objectContaining({
      isRecurring: true,
    }));
  });
});
