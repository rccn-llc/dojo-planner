/**
 * CHARACTERIZATION tests for the four IQPro-payload builders that bypass
 * `IPaymentProvider` and POST/PUT raw JSON: `chargeOneTimeFee`,
 * `cancelIQProSubscription`, `setSubscriptionAutoRenewal`, and the hold-fee
 * subscription lookup.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * Phase B3 moves these bodies out of MemberPaymentService and behind the
 * provider interface so a Square org's hold/cancel doesn't silently charge the
 * platform's IQPro merchant. These payloads are byte-for-byte ports of the
 * kiosk's, and their inline comments mark bugs someone already paid for
 * (the '400000' BIN fallback, `addTaxToTotal: true` alongside a zero tax,
 * `unitOfMeasureId: 1`, the exact `recurrence` echo shape on PUT).
 *
 * These tests assert the ENTIRE request body, not a subset. That is
 * deliberate: a characterization test that only checks the fields you
 * remembered to check does not pin a refactor. If one of these fails after the
 * move, the payload changed — fix the code, do NOT update the expectation
 * unless you can name the IQPro behaviour that justifies it.
 *
 * They are intentionally decoupled from HOW the function is reached, so they
 * survive the move: each drives the public entry point and asserts on the
 * mocked `iqproPost` / `iqproPut` / `iqproGet` calls.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbInsertValues = vi.fn();
const dbMock = {
  insert: vi.fn(() => ({ values: dbInsertValues })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  query: {
    memberMembershipSchema: { findFirst: vi.fn().mockResolvedValue(undefined) },
  },
  transaction: vi.fn((cb: any) => cb(dbMock)),
};
vi.mock('@/libs/DB', () => ({ db: dbMock }));

const iqproGet = vi.fn();
const iqproPost = vi.fn();
const iqproPut = vi.fn();
const computeFeeBreakdown = vi.fn();
const getGatewayProcessors = vi.fn();
const buildServiceFeeAdjustment = vi.fn();
const assertTransactionApproved = vi.fn();

vi.mock('@/libs/IQPro', () => ({
  assertTransactionApproved: (...a: unknown[]) => assertTransactionApproved(...a),
  buildServiceFeeAdjustment: (...a: unknown[]) => buildServiceFeeAdjustment(...a),
  computeFeeBreakdown: (...a: unknown[]) => computeFeeBreakdown(...a),
  getCustomerPaymentMethod: vi.fn(),
  getGatewayProcessors: (...a: unknown[]) => getGatewayProcessors(...a),
  iqproGet: (...a: unknown[]) => iqproGet(...a),
  iqproPost: (...a: unknown[]) => iqproPost(...a),
  iqproPut: (...a: unknown[]) => iqproPut(...a),
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
vi.mock('./EmailService', () => ({ sendPaymentReceiptEmail: vi.fn() }));
vi.mock('./OrganizationService', () => ({
  getOrganizationTaxRate: vi.fn().mockResolvedValue(0),
}));

// NOTE: `PaymentProviderService` is deliberately NOT mocked. These payloads now
// live in `IQProPaymentService`, reached through the real factory — mocking the
// factory would stub out exactly the code under test and let the payloads drift
// unnoticed, which is the opposite of what a characterization test is for.
// Only the transport (`@/libs/IQPro`) is mocked, so the assertions still see
// the real request bodies.

/** What the router resolves and hands to the orchestrator. */
const CONFIG = {
  provider: 'iqpro' as const,
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  gatewayId: 'gw_123',
  scope: 'test-scope',
  oauthUrl: 'https://oauth.example/token',
  baseUrl: 'https://api.example',
  source: 'org' as const,
};

/**
 * What the IQPro transport actually receives. The provider narrows the union
 * at its boundary (`requireIQPro`) and strips the `provider` discriminant, so
 * every `libs/IQPro` helper still sees the plain `IQProConfig` it always did.
 */
const { provider: _provider, ...IQPRO_CONFIG } = CONFIG;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('chargeOneTimeFee — IQPro Sale payload', () => {
  /** A subscription response carrying a saved CARD payment method. */
  function cardSubscription() {
    return {
      data: {
        customer: { customerId: 'cust_abc' },
        paymentMethod: {
          customerPaymentMethod: {
            paymentMethodId: 'pm_xyz',
            card: { maskedNumber: '424242******4242' },
          },
        },
      },
    };
  }

  function primeApprovedCharge() {
    getGatewayProcessors.mockResolvedValue({ cardProcessorId: 'cardproc_1', achProcessorId: 'achproc_1' });
    computeFeeBreakdown.mockResolvedValue({
      baseAmount: 50,
      taxAmount: 0,
      taxPct: 0,
      serviceFeeAmount: 1.88,
      serviceFeePct: 3.75,
      amount: 51.88,
    });
    buildServiceFeeAdjustment.mockReturnValue({ type: 'ServiceFee', percentage: 3.75, flatAmount: null });
    iqproPost.mockResolvedValue({ data: { transaction: { transactionId: 'tx_1', status: 'Approved' } } });
  }

  const baseArgs = {
    config: CONFIG,
    providerSubscriptionId: 'sub_1',
    providerCustomerId: 'cust_fallback',
    orgId: 'org_1',
    memberId: 'mem_1',
    memberMembershipId: 'mm_1',
    amount: 50,
    transactionType: 'cancellation_fee' as const,
    description: 'Cancellation fee for Adult BJJ',
    caption: 'Cancellation Fee',
  };

  it('POSTs the exact Sale body for a saved card', async () => {
    iqproGet.mockResolvedValue(cardSubscription());
    primeApprovedCharge();

    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    const result = await chargeOneTimeFee(baseArgs);

    expect(result.success).toBe(true);

    // Whole-body assertion. See file header before relaxing this.
    expect(iqproPost).toHaveBeenCalledWith(
      IQPRO_CONFIG,
      '/api/gateway/gw_123/transaction',
      {
        type: 'Sale',
        remit: {
          baseAmount: 50,
          taxAmount: 0,
          isTaxExempt: true,
          currencyCode: 'USD',
          addTaxToTotal: true,
          paymentAdjustments: [{ type: 'ServiceFee', percentage: 3.75, flatAmount: null }],
        },
        paymentMethod: {
          customer: {
            customerId: 'cust_abc',
            customerPaymentMethodId: 'pm_xyz',
          },
        },
        lineItems: [
          {
            name: 'Cancellation Fee',
            description: 'Cancellation fee for Adult BJJ',
            quantity: 1,
            unitPrice: 50,
            discount: 0,
            freightAmount: 0,
            unitOfMeasureId: 1,
            localTaxPercent: 0,
            nationalTaxPercent: 0,
          },
        ],
        caption: 'Cancellation Fee',
      },
    );
  });

  it('fetches the subscription from the gateway-scoped path', async () => {
    iqproGet.mockResolvedValue(cardSubscription());
    primeApprovedCharge();

    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    await chargeOneTimeFee(baseArgs);

    expect(iqproGet).toHaveBeenCalledWith(IQPRO_CONFIG, '/api/gateway/gw_123/subscription/sub_1');
  });

  it('computes fees as NON-taxable with the card BIN and card processor', async () => {
    iqproGet.mockResolvedValue(cardSubscription());
    primeApprovedCharge();

    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    await chargeOneTimeFee(baseArgs);

    // Lifecycle fees are non-taxable per Basys guidance on non-store charges.
    expect(computeFeeBreakdown).toHaveBeenCalledWith(IQPRO_CONFIG, 50, false, 0, {
      processorId: 'cardproc_1',
      creditCardBin: '424242',
    });
  });

  it('falls back to the 400000 test BIN when the vault exposes no masked number', async () => {
    iqproGet.mockResolvedValue({
      data: {
        customer: { customerId: 'cust_abc' },
        paymentMethod: { customerPaymentMethod: { paymentMethodId: 'pm_xyz', card: {} } },
      },
    });
    primeApprovedCharge();

    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    await chargeOneTimeFee(baseArgs);

    expect(computeFeeBreakdown).toHaveBeenCalledWith(
      IQPRO_CONFIG,
      50,
      false,
      0,
      expect.objectContaining({ creditCardBin: '400000' }),
    );
  });

  it('uses the ACH processor and omits the BIN for a saved bank account', async () => {
    iqproGet.mockResolvedValue({
      data: {
        customer: { customerId: 'cust_abc' },
        paymentMethod: { customerPaymentMethod: { paymentMethodId: 'pm_ach' } },
      },
    });
    primeApprovedCharge();

    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    await chargeOneTimeFee(baseArgs);

    expect(computeFeeBreakdown).toHaveBeenCalledWith(IQPRO_CONFIG, 50, false, 0, {
      processorId: 'achproc_1',
      creditCardBin: undefined,
    });
  });

  it('falls back to the passed customerId when the subscription omits one', async () => {
    iqproGet.mockResolvedValue({
      data: {
        paymentMethod: {
          customerPaymentMethod: { paymentMethodId: 'pm_xyz', card: { maskedNumber: '424242******4242' } },
        },
      },
    });
    primeApprovedCharge();

    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    await chargeOneTimeFee(baseArgs);

    expect(iqproPost).toHaveBeenCalledWith(
      IQPRO_CONFIG,
      expect.any(String),
      expect.objectContaining({
        paymentMethod: { customer: { customerId: 'cust_fallback', customerPaymentMethodId: 'pm_xyz' } },
      }),
    );
  });

  it('short-circuits without any IQPro call when the amount is zero', async () => {
    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    const result = await chargeOneTimeFee({ ...baseArgs, amount: 0 });

    expect(result).toEqual({ success: true, amountCharged: 0 });
    expect(iqproGet).not.toHaveBeenCalled();
    expect(iqproPost).not.toHaveBeenCalled();
  });

  it('returns a soft failure (never throws) when the subscription has no payment method', async () => {
    iqproGet.mockResolvedValue({ data: { customer: { customerId: 'cust_abc' } } });

    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    const result = await chargeOneTimeFee(baseArgs);

    expect(result.success).toBe(false);
    expect(iqproPost).not.toHaveBeenCalled();
  });

  it('degrades to a soft failure when the subscription fetch throws (#237)', async () => {
    // Regression guard: a synthetic/seed subscription id makes this GET 404.
    // It must not become a 500 in the caller.
    iqproGet.mockRejectedValue(new Error('404 subscription not found'));

    const { chargeOneTimeFee } = await import('./MemberPaymentService');
    const result = await chargeOneTimeFee(baseArgs);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('cancelIQProSubscription — cancel payload', () => {
  it('POSTs now:true / endOfBillingPeriod:false by default', async () => {
    iqproPost.mockResolvedValue({});

    const { cancelIQProSubscription } = await import('./MemberPaymentService');
    const result = await cancelIQProSubscription(CONFIG, 'sub_1');

    expect(result).toEqual({ success: true });
    expect(iqproPost).toHaveBeenCalledWith(
      IQPRO_CONFIG,
      '/api/gateway/gw_123/subscription/sub_1/cancel',
      { cancel: { now: true, endOfBillingPeriod: false } },
    );
  });

  it('inverts both flags when endOfBillingPeriod is requested', async () => {
    iqproPost.mockResolvedValue({});

    const { cancelIQProSubscription } = await import('./MemberPaymentService');
    await cancelIQProSubscription(CONFIG, 'sub_1', { endOfBillingPeriod: true });

    expect(iqproPost).toHaveBeenCalledWith(
      IQPRO_CONFIG,
      '/api/gateway/gw_123/subscription/sub_1/cancel',
      { cancel: { now: false, endOfBillingPeriod: true } },
    );
  });

  it('returns the error rather than throwing, so local cleanup can proceed', async () => {
    iqproPost.mockRejectedValue(new Error('gateway exploded'));

    const { cancelIQProSubscription } = await import('./MemberPaymentService');
    const result = await cancelIQProSubscription(CONFIG, 'sub_1');

    expect(result).toEqual({ success: false, error: 'gateway exploded' });
  });
});

describe('setSubscriptionAutoRenewal — recurrence echo on PUT', () => {
  const SUB = {
    data: {
      name: 'MBR-0001',
      prefix: 'MBR',
      recurrence: {
        termStartDate: '2026-01-01',
        billingStartDate: '2026-01-01',
        isAutoRenewed: true,
        allowProration: false,
        trialLengthInDays: 0,
        invoiceLengthInDays: 30,
        billingPeriod: { billingPeriodId: 4 },
        schedule: { minutes: [0], hours: [0], daysOfMonth: [1] },
      },
    },
  };

  it('echoes the full recurrence block with only isAutoRenewed flipped (pause)', async () => {
    iqproGet.mockResolvedValue(SUB);
    iqproPut.mockResolvedValue({});

    const { setSubscriptionAutoRenewal } = await import('./MemberPaymentService');
    const result = await setSubscriptionAutoRenewal(CONFIG, 'sub_1', false);

    expect(result).toEqual({ success: true });
    // NOTE: billingPeriodId is LIFTED out of the nested billingPeriod object.
    // IQPro returns it nested and expects it flat on write.
    expect(iqproPut).toHaveBeenCalledWith(
      IQPRO_CONFIG,
      '/api/gateway/gw_123/subscription/sub_1',
      {
        name: 'MBR-0001',
        prefix: 'MBR',
        recurrence: {
          termStartDate: '2026-01-01',
          billingStartDate: '2026-01-01',
          isAutoRenewed: false,
          allowProration: false,
          trialLengthInDays: 0,
          invoiceLengthInDays: 30,
          billingPeriodId: 4,
          schedule: { minutes: [0], hours: [0], daysOfMonth: [1] },
        },
      },
    );
  });

  it('sets isAutoRenewed true on resume', async () => {
    iqproGet.mockResolvedValue(SUB);
    iqproPut.mockResolvedValue({});

    const { setSubscriptionAutoRenewal } = await import('./MemberPaymentService');
    await setSubscriptionAutoRenewal(CONFIG, 'sub_1', true);

    expect(iqproPut).toHaveBeenCalledWith(
      IQPRO_CONFIG,
      expect.any(String),
      expect.objectContaining({
        recurrence: expect.objectContaining({ isAutoRenewed: true }),
      }),
    );
  });

  it('omits recurrence entirely when the subscription has none', async () => {
    iqproGet.mockResolvedValue({ data: { name: 'MBR-0002', prefix: 'MBR' } });
    iqproPut.mockResolvedValue({});

    const { setSubscriptionAutoRenewal } = await import('./MemberPaymentService');
    await setSubscriptionAutoRenewal(CONFIG, 'sub_1', false);

    expect(iqproPut).toHaveBeenCalledWith(
      IQPRO_CONFIG,
      '/api/gateway/gw_123/subscription/sub_1',
      { name: 'MBR-0002', prefix: 'MBR' },
    );
  });

  it('returns the error rather than throwing', async () => {
    iqproGet.mockRejectedValue(new Error('nope'));

    const { setSubscriptionAutoRenewal } = await import('./MemberPaymentService');
    const result = await setSubscriptionAutoRenewal(CONFIG, 'sub_1', false);

    expect(result).toEqual({ success: false, error: 'nope' });
  });
});
