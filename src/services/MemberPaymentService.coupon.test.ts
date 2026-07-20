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
  paymentMethodSchema: {},
  transactionSchema: {
    id: 'id',
    organizationId: 'organization_id',
    status: 'status',
  },
  memberMembershipSchema: { id: 'id' },
  couponSchema: {
    id: 'id',
    perUserLimit: 'per_user_limit',
    usageCount: 'usage_count',
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
};

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

  it('rejects with a friendly error when prior usages reach perUserLimit', async () => {
    // First select call: fetch coupon's perUserLimit
    // Second select call: count prior usages by this member
    dbMocks.select
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ perUserLimit: 1 }]) }) }),
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
      // 1) perUserLimit lookup
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ perUserLimit: 3 }]) }) }),
      })
      // 2) priorUsages count
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([{ count: 1 }]) }),
      })
      // 3) member fetch (existing customer lookup) — not the same path as above
      // The actual processMemberPayment also does a member.iqproCustomerId fetch
      // but since we're stopping the test before that with a missing-state
      // assertion, we don't need to extend the mock here.
      .mockReturnValue({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ iqproCustomerId: null }]) }) }),
      });

    // We don't run the full flow — the limit check should pass and then the
    // function continues. We just need to assert it didn't short-circuit on
    // the coupon limit. Make the IQPro side fail fast so the test stays fast.
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
  });

  const originalTx = {
    id: 'tx-original',
    organizationId: 'org-1',
    memberId: 'mem-1',
    memberMembershipId: null,
    transactionType: 'membership_payment',
    amount: 100,
    currency: 'USD',
    status: 'paid',
    paymentMethod: 'card',
  };

  // db.transaction(cb) runs the callback with a `tx` that reuses the same
  // recorders, mirroring how the refund flow reads/writes inside the transaction
  // (original lookup + guarded status flip + refund-row insert).
  function wireTransaction() {
    dbMocks.transaction.mockImplementation(async (cb: any) =>
      cb({
        select: dbMocks.select,
        update: dbMocks.update,
        insert: dbMocks.insert,
        delete: dbMocks.delete,
      }),
    );
  }

  it('throws TransactionNotFoundError when the transaction is not in the org', async () => {
    wireTransaction();
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    const { refundTransaction, TransactionNotFoundError } = await import('./MemberPaymentService');

    await expect(refundTransaction('tx-missing', 'org-1')).rejects.toBeInstanceOf(TransactionNotFoundError);
  });

  it('throws TransactionAlreadyRefundedError when the transaction is already refunded', async () => {
    wireTransaction();
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ ...originalTx, status: 'refunded' }]) }) }),
    });

    const { refundTransaction, TransactionAlreadyRefundedError } = await import('./MemberPaymentService');

    await expect(refundTransaction('tx-original', 'org-1')).rejects.toBeInstanceOf(TransactionAlreadyRefundedError);
  });

  it('inserts a refund row, marks original refunded, and reverses linked coupon usage', async () => {
    wireTransaction();
    // 1) Original transaction lookup (inside the transaction)
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([originalTx]) }) }),
    });

    const insertCalls: Array<Record<string, unknown>> = [];
    dbMocks.insert.mockReturnValue({
      values: vi.fn((vals: Record<string, unknown>) => {
        insertCalls.push(vals);
        return Promise.resolve();
      }),
    });

    const updateSetCalls: Array<Record<string, unknown>> = [];
    dbMocks.update.mockReturnValue({
      set: vi.fn((vals: Record<string, unknown>) => {
        updateSetCalls.push(vals);
        // The guarded status flip calls `.returning()`; return one row so the
        // flip is treated as successful. The coupon-decrement update calls
        // `.where()` and awaits it directly.
        return {
          where: vi.fn(() => {
            const p: any = Promise.resolve();
            p.returning = () => Promise.resolve([{ id: 'tx-original' }]);
            return p;
          }),
        };
      }),
    });

    // 2) coupon_usage rows tied to this transaction (one redemption to reverse)
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([{ id: 'usage-1', couponId: 'cpn-1' }]) }),
    });

    const deleteWhereCalls: unknown[] = [];
    dbMocks.delete.mockReturnValue({
      where: vi.fn((cond: unknown) => {
        deleteWhereCalls.push(cond);
        return Promise.resolve();
      }),
    });

    const { refundTransaction } = await import('./MemberPaymentService');
    const result = await refundTransaction('tx-original', 'org-1');

    expect(result.refundTransactionId).toBe('uuid-test-stub');
    expect(result.originalTransactionId).toBe('tx-original');
    expect(result.decrementedCoupons).toBe(1);

    // Refund insert payload — negative amount, status='paid', refund type
    expect(insertCalls[0]).toMatchObject({
      transactionType: 'refund',
      amount: -100,
      status: 'paid',
    });

    // Original was flipped to status: refunded
    expect(updateSetCalls[0]).toMatchObject({ status: 'refunded' });

    // Decrement update fired on couponSchema (any usageCount-related set)
    expect(updateSetCalls.some(call => 'usageCount' in call)).toBe(true);

    // coupon_usage row was deleted
    expect(deleteWhereCalls.length).toBeGreaterThan(0);
  });

  it('rejects a concurrent double-refund: the guarded status flip updates 0 rows', async () => {
    wireTransaction();
    // Original read still shows a refundable row (the race partner flipped it
    // AFTER our read)...
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([originalTx]) }) }),
    });
    dbMocks.insert.mockReturnValue({ values: vi.fn(() => Promise.resolve()) });
    // ...but the guarded flip (WHERE status != 'refunded') returns 0 rows,
    // proving another refund already committed → we must abort, not insert.
    const insertSpy = vi.fn(() => Promise.resolve());
    dbMocks.insert.mockReturnValue({ values: insertSpy });
    dbMocks.update.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: () => Promise.resolve([]) })) })),
    });

    const { refundTransaction, TransactionAlreadyRefundedError } = await import('./MemberPaymentService');

    await expect(refundTransaction('tx-original', 'org-1')).rejects.toBeInstanceOf(TransactionAlreadyRefundedError);
    // No refund row was inserted — the flip failing aborts the transaction.
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('groups the decrement per coupon: two usages of the same coupon → one -2 update', async () => {
    wireTransaction();
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([originalTx]) }) }),
    });
    dbMocks.insert.mockReturnValue({ values: vi.fn(() => Promise.resolve()) });

    const updateSetCalls: Array<Record<string, unknown>> = [];
    dbMocks.update.mockReturnValue({
      set: vi.fn((vals: Record<string, unknown>) => {
        updateSetCalls.push(vals);
        return {
          where: vi.fn(() => {
            const p: any = Promise.resolve();
            p.returning = () => Promise.resolve([{ id: 'tx-original' }]);
            return p;
          }),
        };
      }),
    });
    dbMocks.delete.mockReturnValue({ where: vi.fn(() => Promise.resolve()) });
    // Same coupon redeemed twice on the one transaction.
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([
        { id: 'usage-1', couponId: 'cpn-1' },
        { id: 'usage-2', couponId: 'cpn-1' },
      ]) }),
    });

    const { refundTransaction } = await import('./MemberPaymentService');
    const result = await refundTransaction('tx-original', 'org-1');

    expect(result.decrementedCoupons).toBe(2);

    // Exactly ONE usageCount decrement update (grouped), not two.
    const usageCountUpdates = updateSetCalls.filter(c => 'usageCount' in c);

    expect(usageCountUpdates).toHaveLength(1);
  });

  it('handles transactions with no linked coupon usage (decrementedCoupons=0)', async () => {
    wireTransaction();
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([originalTx]) }) }),
    });
    dbMocks.insert.mockReturnValue({ values: vi.fn(() => Promise.resolve()) });
    dbMocks.update.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: () => Promise.resolve([{ id: 'tx-original' }]) })) })),
    });
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });

    const { refundTransaction } = await import('./MemberPaymentService');
    const result = await refundTransaction('tx-original', 'org-1');

    expect(result.decrementedCoupons).toBe(0);
  });
});
