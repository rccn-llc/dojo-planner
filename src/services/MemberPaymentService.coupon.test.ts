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
  memberSchema: { id: 'id', providerCustomerId: 'provider_customer_id' },
  paymentMethodSchema: {},
  transactionSchema: {
    id: 'id',
    organizationId: 'organization_id',
    status: 'status',
  },
  memberMembershipSchema: { id: 'id' },
  couponSchema: {
    id: 'id',
    organizationId: 'organization_id',
    code: 'code',
    description: 'description',
    discountType: 'discount_type',
    discountValue: 'discount_value',
    applicableTo: 'applicable_to',
    maxDiscountAmount: 'max_discount_amount',
    usageLimit: 'usage_limit',
    usageCount: 'usage_count',
    perUserLimit: 'per_user_limit',
    validFrom: 'valid_from',
    validUntil: 'valid_until',
    status: 'status',
  },
  couponUsageSchema: {
    id: 'id',
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
}));

const testConfig = {
  provider: 'iqpro' as const,
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  gatewayId: 'test-gateway-001',
  scope: 'test-scope',
  oauthUrl: 'https://sandbox.oauth.example.com/token',
  baseUrl: 'https://sandbox.api.basyspro.com',
  source: 'env' as const,
};

vi.mock('./EmailService', () => ({
  sendPaymentReceiptEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/libs/Logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockProvider = {
  createCustomer: vi.fn(),
  createPaymentMethod: vi.fn(),
  processPayment: vi.fn(),
  createSubscription: vi.fn(),
  // Fees now route through the provider. Delegate to the mocked
  // `computeFeeBreakdown` so the existing fee assertions below still describe
  // what IQPro is asked for, and tag the provenance the IQPro provider reports:
  // its service fee is API-quoted, its tax is local arithmetic.
  computeFees: vi.fn(async (config: any, params: any) => {
    const { computeFeeBreakdown } = await import('@/libs/IQPro');
    // Mirror the real provider: narrow the union (dropping `provider`) before
    // touching the IQPro transport, so assertions below see the same config
    // shape production does.
    const { provider: _p, ...iqpro } = config;
    const breakdown = await (computeFeeBreakdown as any)(iqpro, params.baseAmount, params.isTaxable, params.taxStatePct, {
      processorId: params.processorId,
      ...(params.token ? { token: params.token } : {}),
      ...(params.creditCardBin ? { creditCardBin: params.creditCardBin } : {}),
    });
    return { ...breakdown, provenance: { tax: 'local', serviceFee: 'provider' } };
  }),
  chargeOneTimeFee: vi.fn(),
  cancelSubscription: vi.fn().mockResolvedValue({ success: true }),
  setSubscriptionAutoRenewal: vi.fn().mockResolvedValue({ success: true }),
  getSubscriptionPaymentMethod: vi.fn().mockResolvedValue(null),
  reverseTransaction: vi.fn(),
};

const recordExternalRefMock = vi.fn().mockResolvedValue(undefined);
vi.mock('./TenantExternalRefService', () => ({
  REF_TYPE: {
    PROVIDER_SUBSCRIPTION: 'provider_subscription',
    PROVIDER_TRANSACTION: 'provider_transaction',
    PROVIDER_CUSTOMER: 'provider_customer',
  },
  recordExternalRef: (...args: unknown[]) => recordExternalRefMock(...args),
}));

vi.mock('./PaymentProviderService', async () => {
  const actual = await vi.importActual<typeof import('./PaymentProviderService')>('./PaymentProviderService');
  return {
    ...actual,
    getPaymentProvider: vi.fn().mockResolvedValue(mockProvider),
  };
});

// ── Per-user-limit pre-check ────────────────────────────────────────────

describe('processMemberPayment — per-user coupon limit', () => {
  const baseParams = {
    organizationId: 'org_x',
    memberId: 'mem_42',
    memberEmail: 'jane@example.com',
    memberFirstName: 'Jane',
    memberLastName: 'Doe',
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
    appliedCoupon: {
      id: 'cpn-1',
      code: 'TEST20',
      type: 'Percentage' as const,
      amount: '20%',
      description: 'Twenty percent off',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider.processPayment.mockResolvedValue({ success: true, status: 'approved', transactionId: 'tx_1' });
  });

  // An active, permissive coupon row as returned by validateCouponForCharge's
  // first select. Tests override perUserLimit/usageLimit as needed.
  const activeCouponRow = {
    id: 'cpn-1',
    code: 'TEST20',
    description: '20% off',
    discountType: 'percentage',
    discountValue: 20,
    applicableTo: 'all',
    maxDiscountAmount: null,
    usageLimit: null,
    usageCount: 0,
    perUserLimit: 1,
    validFrom: null,
    validUntil: null,
    status: 'active',
  };

  it('rejects with a friendly error when prior usages reach perUserLimit', async () => {
    // validateCouponForCharge: (1) fetch coupon row, (2) count prior usages.
    dbMocks.select
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ ...activeCouponRow, perUserLimit: 1 }]) }) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([{ count: 1 }]) }),
      });

    const { processMemberPayment } = await import('./MemberPaymentService');
    const result = await processMemberPayment(testConfig, baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already used this coupon/i);
    // Critically: provider.processPayment must NOT be called
    expect(mockProvider.processPayment).not.toHaveBeenCalled();
  });

  it('proceeds past the limit check when prior usages are below perUserLimit', async () => {
    dbMocks.select
      // 1) coupon row fetch
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ ...activeCouponRow, perUserLimit: 3 }]) }) }),
      })
      // 2) priorUsages count
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([{ count: 1 }]) }),
      })
      // 3+) member fetch (existing customer lookup). Use mockReturnValueOnce
      // (not a permanent mockReturnValue) so nothing leaks into later tests.
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ providerCustomerId: null }]) }) }),
      });

    // We don't run the full flow — the limit check should pass and then the
    // function continues. Make the IQPro side fail fast so the test stays fast.
    mockProvider.createCustomer.mockRejectedValueOnce(new Error('stop here'));

    const { processMemberPayment } = await import('./MemberPaymentService');
    const result = await processMemberPayment(testConfig, baseParams);

    // The limit check passed — we got past it and into the IQPro path which
    // we forced to fail. The error message should NOT be the limit message.
    expect(result.error).not.toMatch(/already used this coupon/i);
  });
});

// ── Refund + coupon decrement ───────────────────────────────────────────

describe('refundTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks() clears call history but NOT implementations set via
    // mockReturnValue; reset the select impl so no per-test mock leaks in.
    dbMocks.select.mockReset();
    dbMocks.update.mockReset();
    dbMocks.insert.mockReset();
    dbMocks.delete.mockReset();
    dbMocks.transaction.mockReset();
    mockProvider.reverseTransaction.mockReset();
  });

  const originalTx = {
    id: 'tx-original',
    organizationId: 'org-1',
    memberId: 'mem-1',
    memberMembershipId: null,
    providerTransactionId: null as string | null,
    transactionType: 'membership_payment',
    amount: 100,
    currency: 'USD',
    status: 'paid',
    paymentMethod: 'card',
  };

  /**
   * Wires the refund flow's DB calls, in order:
   *  1. original lookup (select … limit)
   *  2. inside db.transaction: guarded flip (update … returning) + batch insert
   *  3. coupon_usage lookup (select … where) + delete + grouped decrement
   */
  function wire(opts: {
    original?: Record<string, unknown> | null;
    flipped?: Array<Record<string, unknown>>;
    usages?: Array<{ id: string; couponId: string }>;
    insertError?: Error;
  } = {}) {
    const original = opts.original === undefined ? originalTx : opts.original;
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(original ? [original] : []) }) }),
    });
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve(opts.usages ?? []) }),
    });

    const insertCalls: Array<Array<Record<string, unknown>>> = [];
    dbMocks.insert.mockReturnValue({
      values: vi.fn((vals: Array<Record<string, unknown>>) => {
        insertCalls.push(vals);
        return opts.insertError ? Promise.reject(opts.insertError) : Promise.resolve();
      }),
    });

    const updateSetCalls: Array<Record<string, unknown>> = [];
    const flipped = opts.flipped ?? (original ? [original] : []);
    dbMocks.update.mockReturnValue({
      set: vi.fn((vals: Record<string, unknown>) => {
        updateSetCalls.push(vals);
        // The guarded status flip calls `.returning()`; the coupon decrement
        // awaits `.where()` directly.
        return {
          where: vi.fn(() => {
            const p: any = Promise.resolve();
            p.returning = () => Promise.resolve(flipped);
            return p;
          }),
        };
      }),
    });

    const deleteWhereCalls: unknown[] = [];
    dbMocks.delete.mockReturnValue({
      where: vi.fn((cond: unknown) => {
        deleteWhereCalls.push(cond);
        return Promise.resolve();
      }),
    });

    dbMocks.transaction.mockImplementation(async (cb: any) =>
      cb({ select: dbMocks.select, update: dbMocks.update, insert: dbMocks.insert, delete: dbMocks.delete }),
    );

    return { insertCalls, updateSetCalls, deleteWhereCalls };
  }

  it('throws TransactionNotFoundError when the transaction is not in the org', async () => {
    wire({ original: null });
    const { refundTransaction, TransactionNotFoundError } = await import('./MemberPaymentService');

    await expect(refundTransaction('tx-missing', 'org-1', testConfig)).rejects.toBeInstanceOf(TransactionNotFoundError);
  });

  it('throws TransactionAlreadyRefundedError when the transaction is already refunded', async () => {
    wire({ original: { ...originalTx, status: 'refunded' } });
    const { refundTransaction, TransactionAlreadyRefundedError } = await import('./MemberPaymentService');

    await expect(refundTransaction('tx-original', 'org-1', testConfig)).rejects.toBeInstanceOf(TransactionAlreadyRefundedError);
  });

  it.each([
    ['declined charge', { status: 'declined' }],
    ['refund row', { transactionType: 'refund', amount: -100 }],
  ])('refuses to refund a %s without calling the provider', async (_label, overrides) => {
    wire({ original: { ...originalTx, providerTransactionId: 'iq-tx-1', ...overrides } });
    const { refundTransaction, TransactionNotRefundableError } = await import('./MemberPaymentService');

    await expect(refundTransaction('tx-original', 'org-1', testConfig)).rejects.toBeInstanceOf(TransactionNotRefundableError);
    expect(mockProvider.reverseTransaction).not.toHaveBeenCalled();
    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });

  it('bookkeeping-only for a row with no provider charge: inserts a refund row, flips the original, reverses coupons', async () => {
    const { insertCalls, updateSetCalls, deleteWhereCalls } = wire({
      usages: [{ id: 'usage-1', couponId: 'cpn-1' }],
    });
    const { refundTransaction } = await import('./MemberPaymentService');
    const result = await refundTransaction('tx-original', 'org-1', testConfig);

    expect(mockProvider.reverseTransaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      refundTransactionId: 'uuid-test-stub',
      originalTransactionId: 'tx-original',
      decrementedCoupons: 1,
      providerReversal: 'none',
      reversedTransactionIds: ['tx-original'],
    });
    expect(insertCalls[0]).toHaveLength(1);
    expect(insertCalls[0]![0]).toMatchObject({
      transactionType: 'refund',
      amount: -100,
      status: 'paid',
      providerTransactionId: null,
      description: 'Refund for transaction tx-original',
    });
    expect(updateSetCalls[0]).toMatchObject({ status: 'refunded' });
    expect(updateSetCalls.some(call => 'usageCount' in call)).toBe(true);
    expect(deleteWhereCalls.length).toBeGreaterThan(0);
  });

  it('treats synthetic seed_ provider ids as bookkeeping-only', async () => {
    wire({ original: { ...originalTx, providerTransactionId: 'seed_tx_abc' } });
    const { refundTransaction } = await import('./MemberPaymentService');
    const result = await refundTransaction('tx-original', 'org-1', testConfig);

    expect(mockProvider.reverseTransaction).not.toHaveBeenCalled();
    expect(result.providerReversal).toBe('none');
  });

  it('voids an unsettled charge at the provider before writing the books', async () => {
    const original = { ...originalTx, providerTransactionId: 'iq-tx-1' };
    const { insertCalls } = wire({ original });
    mockProvider.reverseTransaction.mockResolvedValue({ success: true, method: 'void' });

    const { refundTransaction } = await import('./MemberPaymentService');
    const result = await refundTransaction('tx-original', 'org-1', testConfig);

    expect(mockProvider.reverseTransaction).toHaveBeenCalledWith(testConfig, 'iq-tx-1');
    // Provider first, books second.
    expect(mockProvider.reverseTransaction.mock.invocationCallOrder[0]!)
      .toBeLessThan(dbMocks.transaction.mock.invocationCallOrder[0]!);
    expect(result.providerReversal).toBe('void');
    expect(insertCalls[0]![0]).toMatchObject({
      providerTransactionId: null,
      description: 'Void of transaction tx-original',
    });
    expect(recordExternalRefMock).toHaveBeenCalledWith('provider_transaction', undefined, 'org-1');
  });

  it('refunds a settled charge and links the provider refund id for webhook routing', async () => {
    const original = { ...originalTx, providerTransactionId: 'iq-tx-1' };
    const { insertCalls } = wire({ original });
    mockProvider.reverseTransaction.mockResolvedValue({ success: true, method: 'refund', refundTransactionId: 'iq-refund-9' });

    const { refundTransaction } = await import('./MemberPaymentService');
    const result = await refundTransaction('tx-original', 'org-1', testConfig);

    expect(result.providerReversal).toBe('refund');
    expect(insertCalls[0]![0]).toMatchObject({
      providerTransactionId: 'iq-refund-9',
      description: 'Refund for transaction tx-original',
    });
    expect(recordExternalRefMock).toHaveBeenCalledWith('provider_transaction', 'iq-refund-9', 'org-1');
  });

  it('reverses every local row of a split Sale (membership + signup fee) together', async () => {
    const membershipRow = { ...originalTx, providerTransactionId: 'iq-tx-1' };
    const signupRow = { ...membershipRow, id: 'tx-signup', transactionType: 'signup_fee', amount: 50 };
    const { insertCalls } = wire({ original: membershipRow, flipped: [membershipRow, signupRow] });
    mockProvider.reverseTransaction.mockResolvedValue({ success: true, method: 'refund', refundTransactionId: 'iq-refund-9' });

    const { refundTransaction } = await import('./MemberPaymentService');
    const result = await refundTransaction('tx-original', 'org-1', testConfig);

    expect(mockProvider.reverseTransaction).toHaveBeenCalledTimes(1);
    expect(result.reversedTransactionIds).toEqual(['tx-original', 'tx-signup']);
    expect(insertCalls[0]!.map(r => r.amount)).toEqual([-100, -50]);
  });

  it('leaves the books untouched when the provider refuses', async () => {
    wire({ original: { ...originalTx, providerTransactionId: 'iq-tx-1' } });
    mockProvider.reverseTransaction.mockResolvedValue({ success: false, error: 'Processor said no' });

    const { refundTransaction, TransactionReversalFailedError } = await import('./MemberPaymentService');
    const promise = refundTransaction('tx-original', 'org-1', testConfig);

    await expect(promise).rejects.toBeInstanceOf(TransactionReversalFailedError);
    await expect(promise).rejects.toThrow('Processor said no');
    expect(dbMocks.transaction).not.toHaveBeenCalled();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it('refuses a provider-backed charge when the org has no payment config', async () => {
    wire({ original: { ...originalTx, providerTransactionId: 'iq-tx-1' } });
    const { refundTransaction, TransactionReversalFailedError } = await import('./MemberPaymentService');

    await expect(refundTransaction('tx-original', 'org-1', null)).rejects.toBeInstanceOf(TransactionReversalFailedError);
    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });

  it('logs loudly and rethrows when the books fail to record a provider reversal', async () => {
    wire({ original: { ...originalTx, providerTransactionId: 'iq-tx-1' }, insertError: new Error('db down') });
    mockProvider.reverseTransaction.mockResolvedValue({ success: true, method: 'void' });

    const { refundTransaction } = await import('./MemberPaymentService');
    const { logger } = await import('@/libs/Logger');

    await expect(refundTransaction('tx-original', 'org-1', testConfig)).rejects.toThrow('db down');
    expect(logger.error).toHaveBeenCalledWith(
      '[MemberPayment] Charge reversed at provider but local refund failed to record',
      expect.objectContaining({ providerTransactionId: 'iq-tx-1', providerReversal: 'void' }),
    );
  });

  it('rejects a concurrent double-refund: the guarded status flip updates 0 rows', async () => {
    const { insertCalls } = wire({ flipped: [] });
    const { refundTransaction, TransactionAlreadyRefundedError } = await import('./MemberPaymentService');

    await expect(refundTransaction('tx-original', 'org-1', testConfig)).rejects.toBeInstanceOf(TransactionAlreadyRefundedError);
    // No refund row was inserted — the flip failing aborts the transaction.
    expect(insertCalls).toHaveLength(0);
  });

  it('groups the decrement per coupon: two usages of the same coupon → one -2 update', async () => {
    const { updateSetCalls } = wire({
      usages: [{ id: 'usage-1', couponId: 'cpn-1' }, { id: 'usage-2', couponId: 'cpn-1' }],
    });
    const { refundTransaction } = await import('./MemberPaymentService');
    const result = await refundTransaction('tx-original', 'org-1', testConfig);

    expect(result.decrementedCoupons).toBe(2);
    expect(updateSetCalls.filter(c => 'usageCount' in c)).toHaveLength(1);
  });

  it('handles transactions with no linked coupon usage (decrementedCoupons=0)', async () => {
    wire();
    const { refundTransaction } = await import('./MemberPaymentService');
    const result = await refundTransaction('tx-original', 'org-1', testConfig);

    expect(result.decrementedCoupons).toBe(0);
  });
});
