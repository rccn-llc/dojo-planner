import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'uuid-test-stub'),
}));

// DB mock state — captured via closures so the per-test `resetDbMock` helper
// can rewire the chain without re-importing the module.
const dbMocks = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMocks }));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ _type: 'eq', value: val })),
}));

vi.mock('@/models/Schema', () => ({
  memberSchema: { id: 'id', iqproCustomerId: 'iqpro_customer_id' },
  paymentMethodSchema: {},
  transactionSchema: {},
  memberMembershipSchema: { id: 'id' },
}));

vi.mock('@/libs/IQPro', () => ({
  isIQProConfigured: vi.fn().mockReturnValue(true),
  calculateTransactionFees: vi.fn(),
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

// ── DB mock helper ─────────────────────────────────────────────────────────
//
// The orchestrator's DB usage is: select-from-where-limit (existing customer),
// update-set-where (set iqproCustomerId / membership fields), insert-values
// (payment method + transaction). We track all `set()` payloads so we can
// assert what was written.

let dbState: {
  existingCustomerId: string | null;
  setCalls: Array<Record<string, unknown>>;
  insertCalls: Array<Record<string, unknown>>;
};

function resetDbMock(existingCustomerId: string | null = null) {
  dbState = { existingCustomerId, setCalls: [], insertCalls: [] };

  dbMocks.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ iqproCustomerId: dbState.existingCustomerId }]),
      }),
    }),
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

  const baseFees = {
    isSurchargeable: true,
    isPinCapable: false,
    surchargeRate: 0.03,
    surchargeAmount: 3,
    serviceFeesAmount: 0,
    convenienceFeesAmount: 0,
    baseAmount: 100,
    amount: 111.5,
    tip: 0,
    taxAmount: 8.5,
    cardBrand: 'Visa' as string | null,
    cardType: 'credit' as string | null,
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

  it('returns a failed result when member address state is missing', async () => {
    const { processMemberPayment } = await import('./MemberPaymentService');

    const result = await processMemberPayment({
      ...baseParams,
      memberAddress: undefined,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Member address state is required/);
  });

  it('one-time payment: calculates fees, calls provider with feeBreakdown + billingAddressId', async () => {
    const { calculateTransactionFees } = await import('@/libs/IQPro');

    vi.mocked(calculateTransactionFees).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');

    const result = await processMemberPayment(baseParams);

    expect(result.success).toBe(true);
    expect(result.status).toBe('approved');

    expect(calculateTransactionFees).toHaveBeenCalledWith({
      baseAmount: 100,
      processorId: 'card_proc_001',
      state: 'CA',
      paymentMethod: 'card',
      token: 'tex-tok-abc',
    });

    expect(mockProvider.processPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 111.5,
        currency: 'USD',
        customerBillingAddressId: 'addr_billing_1',
        feeBreakdown: expect.objectContaining({
          baseAmount: 100,
          taxAmount: 8.5,
          surchargeAmount: 3,
          amount: 111.5,
        }),
        billingAddress: expect.objectContaining({
          firstName: 'Jane',
          state: 'CA',
        }),
        lineItem: expect.objectContaining({
          unitPrice: 100,
          discount: 0,
        }),
      }),
    );

    expect(mockProvider.createSubscription).not.toHaveBeenCalled();
  });

  it('autopay: creates subscription THEN runs immediate Sale charge for the first period', async () => {
    const { calculateTransactionFees } = await import('@/libs/IQPro');

    vi.mocked(calculateTransactionFees).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');

    const result = await processMemberPayment({
      ...baseParams,
      billingType: 'autopay',
      membershipPlanFrequency: 'monthly',
      memberMembershipId: 'mm_1',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('approved');

    expect(mockProvider.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        frequency: 'monthly',
        paymentAdjustments: [
          { type: 'Surcharge', percentage: null, flatAmount: 3 },
        ],
      }),
    );

    expect(mockProvider.processPayment).toHaveBeenCalledTimes(1);
    expect(mockProvider.processPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 111.5,
        feeBreakdown: expect.objectContaining({ amount: 111.5 }),
        metadata: expect.objectContaining({ iqproSubscriptionId: 'sub_42' }),
      }),
    );

    // Membership update wrote iqproSubscriptionId + autopay
    const membershipSet = dbState.setCalls.find(s => s.iqproSubscriptionId === 'sub_42');

    expect(membershipSet).toBeDefined();
    expect(membershipSet?.billingType).toBe('autopay');
  });

  it('autopay: surfaces failure and does NOT update membership when initial charge declines', async () => {
    const { calculateTransactionFees } = await import('@/libs/IQPro');

    vi.mocked(calculateTransactionFees).mockResolvedValueOnce(baseFees);

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
    expect(result.status).toBe('declined');
    expect(result.error).toMatch(/Subscription created but initial charge failed/);

    // Membership must not be flagged as autopay or carry the subscription ID
    const wroteAutopay = dbState.setCalls.some(s => s.billingType === 'autopay' || s.iqproSubscriptionId);

    expect(wroteAutopay).toBe(false);

    // But the failed transaction was still recorded
    const txInsert = dbState.insertCalls.find(i => i.iqproTransactionId === 'tx_decline');

    expect(txInsert).toBeDefined();
    expect(txInsert?.status).toBe('declined');
  });

  it('falls back to creditCardBin when no card token is provided', async () => {
    const { calculateTransactionFees } = await import('@/libs/IQPro');

    vi.mocked(calculateTransactionFees).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');

    await processMemberPayment({
      ...baseParams,
      cardToken: undefined,
    });

    const callArgs = vi.mocked(calculateTransactionFees).mock.calls[0]![0];

    expect(callArgs.creditCardBin).toBe('424242');
    expect(callArgs).not.toHaveProperty('token');
  });

  it('uses ACH processor and passes the achToken (IQPro requires Token or CreditCardBin) for ACH fee calc', async () => {
    const { calculateTransactionFees } = await import('@/libs/IQPro');

    vi.mocked(calculateTransactionFees).mockResolvedValueOnce({
      ...baseFees,
      surchargeAmount: 0,
      taxAmount: 0,
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

    const feeArgs = vi.mocked(calculateTransactionFees).mock.calls[0]![0];

    expect(feeArgs.processorId).toBe('ach_proc_001');
    expect(feeArgs.paymentMethod).toBe('ach');
    expect(feeArgs.token).toBe('ach-tok-xyz');
    expect(feeArgs).not.toHaveProperty('creditCardBin');

    expect(mockProvider.processPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        ach: {
          achToken: 'ach-tok-xyz',
          secCode: 'WEB',
          routingNumber: '021000021',
          accountType: 'Checking',
        },
      }),
    );
  });

  it('applies a Fixed Amount coupon discount before fee calculation', async () => {
    const { calculateTransactionFees } = await import('@/libs/IQPro');

    vi.mocked(calculateTransactionFees).mockResolvedValueOnce({
      ...baseFees,
      baseAmount: 75,
      surchargeAmount: 0,
      taxAmount: 0,
      amount: 75,
    });

    const { processMemberPayment } = await import('./MemberPaymentService');

    await processMemberPayment({
      ...baseParams,
      appliedCoupon: {
        id: 'cpn_1',
        code: 'SAVE25',
        type: 'Fixed Amount',
        amount: '25',
        description: '$25 off',
      },
    });

    expect(calculateTransactionFees).toHaveBeenCalledWith(
      expect.objectContaining({ baseAmount: 75 }),
    );
  });

  it('applies a Percentage coupon discount before fee calculation', async () => {
    const { calculateTransactionFees } = await import('@/libs/IQPro');

    vi.mocked(calculateTransactionFees).mockResolvedValueOnce({
      ...baseFees,
      baseAmount: 90,
      surchargeAmount: 0,
      taxAmount: 0,
      amount: 90,
    });

    const { processMemberPayment } = await import('./MemberPaymentService');

    await processMemberPayment({
      ...baseParams,
      appliedCoupon: {
        id: 'cpn_2',
        code: 'TEN_PCT',
        type: 'Percentage',
        amount: '10',
        description: '10% off',
      },
    });

    // 100 - 10% = 90
    expect(calculateTransactionFees).toHaveBeenCalledWith(
      expect.objectContaining({ baseAmount: 90 }),
    );
  });

  it('throws a clear error when no gateway processor is configured for the payment method', async () => {
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

  it('reuses an existing customer ID and skips createCustomer', async () => {
    resetDbMock('cust_existing_999');
    const { calculateTransactionFees } = await import('@/libs/IQPro');

    vi.mocked(calculateTransactionFees).mockResolvedValueOnce(baseFees);

    const { processMemberPayment } = await import('./MemberPaymentService');

    await processMemberPayment(baseParams);

    expect(mockProvider.createCustomer).not.toHaveBeenCalled();
    expect(mockProvider.processPayment).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust_existing_999' }),
    );
  });
});
