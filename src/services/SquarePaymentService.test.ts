import { beforeEach, describe, expect, it, vi } from 'vitest';

const squarePost = vi.fn();
const squareGet = vi.fn();

vi.mock('@/libs/Square', async () => {
  const actual = await vi.importActual<typeof import('@/libs/Square')>('@/libs/Square');
  return {
    ...actual,
    squarePost: (...a: unknown[]) => squarePost(...a),
    squareGet: (...a: unknown[]) => squareGet(...a),
  };
});

// The plan-variation cache is the only DB touch in this service. `selectRows`
// is what a lookup finds; `selectQueue`, when set, serves successive lookups
// so the insert-race case can return different rows before and after.
let selectRows: Array<{ planVariationId: string }> = [];
let selectQueue: Array<Array<{ planVariationId: string }>> | null = null;
let insertRows: Array<{ planVariationId: string }> = [];
let insertValues: Record<string, unknown> | null = null;

vi.mock('@/libs/DB', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectQueue ? (selectQueue.shift() ?? []) : selectRows),
        }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        insertValues = v;
        return {
          onConflictDoNothing: () => ({ returning: () => Promise.resolve(insertRows) }),
        };
      },
    }),
  },
}));
vi.mock('@/libs/Logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/libs/IQPro', () => ({ getServiceFeePct: () => 3.75 }));

const squareConfig = {
  provider: 'square' as const,
  accessToken: 'sandbox-token',
  locationId: 'L123',
  applicationId: 'sandbox-app',
  environment: 'sandbox' as const,
  webhookSignatureKey: 'whsk',
  source: 'env' as const,
};

async function loadProvider() {
  const { SquarePaymentProvider } = await import('./SquarePaymentService');
  return new SquarePaymentProvider();
}

describe('squarePaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectRows = [];
    selectQueue = null;
    insertRows = [];
    insertValues = null;
  });

  describe('config narrowing', () => {
    it('REFUSES an IQPro config rather than charging the wrong merchant', async () => {
      // The failure this prevents costs real money and is silent: a dojo's
      // members charged into another merchant's account.
      const provider = await loadProvider();
      const iqproConfig = { provider: 'iqpro', clientId: 'x' } as never;

      await expect(provider.createCustomer(iqproConfig, {
        organizationId: 'o',
        memberId: 'm',
        email: 'e@x.com',
        firstName: 'A',
        lastName: 'B',
      })).rejects.toThrow(/wrong merchant/);
    });
  });

  describe('createCustomer', () => {
    it('retries WITHOUT the phone number when Square rejects it', async () => {
      // Square validates that a phone is DIALABLE, not merely well-formed —
      // every format of a 555-prefix number is refused. A member's phone is
      // optional contact data, so failing the whole charge over it would
      // decline real money for a typo.
      const { SquareApiError } = await import('@/libs/Square');
      squarePost
        .mockRejectedValueOnce(new SquareApiError('/v2/customers', 400, JSON.stringify({
          errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'INVALID_PHONE_NUMBER', detail: 'bad' }],
        })))
        .mockResolvedValueOnce({ customer: { id: 'cust_1' } });

      const provider = await loadProvider();
      const result = await provider.createCustomer(squareConfig as never, {
        organizationId: 'o',
        memberId: 'm',
        email: 'a@example.com',
        firstName: 'A',
        lastName: 'B',
        phone: '5551233456',
      });

      expect(result.customerId).toBe('cust_1');
      expect(squarePost).toHaveBeenCalledTimes(2);

      const [, , retryBody] = squarePost.mock.calls[1] as [unknown, string, Record<string, unknown>];

      expect(retryBody).not.toHaveProperty('phone_number');

      // A fresh idempotency key, or Square would replay the failed attempt.
      const [, , firstBody] = squarePost.mock.calls[0] as [unknown, string, Record<string, unknown>];

      expect(retryBody.idempotency_key).not.toBe(firstBody.idempotency_key);
    });

    it('does NOT retry on an unrelated Square failure', async () => {
      const { SquareApiError } = await import('@/libs/Square');
      squarePost.mockRejectedValueOnce(new SquareApiError('/v2/customers', 400, JSON.stringify({
        errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'BAD_REQUEST', detail: 'nope' }],
      })));

      const provider = await loadProvider();

      await expect(provider.createCustomer(squareConfig as never, {
        organizationId: 'o',
        memberId: 'm',
        email: 'a@example.com',
        firstName: 'A',
        lastName: 'B',
        phone: '5551233456',
      })).rejects.toThrow(/BAD_REQUEST/);
      expect(squarePost).toHaveBeenCalledTimes(1);
    });
  });

  describe('card-only enforcement', () => {
    it('REFUSES ACH', async () => {
      // Square cannot store a bank account and charge it later, so offering
      // ACH would mean this app owning a charge scheduler.
      const provider = await loadProvider();

      await expect(provider.createPaymentMethod(squareConfig as never, {
        customerId: 'c1',
        paymentMethod: 'bank_transfer',
      } as never)).rejects.toThrow(/card-only/);
    });

    it('REFUSES a card with no tokenized source', async () => {
      // Raw card numbers must never reach the server (PCI).
      const provider = await loadProvider();

      await expect(provider.createPaymentMethod(squareConfig as never, {
        customerId: 'c1',
        paymentMethod: 'card',
      })).rejects.toThrow(/Web Payments SDK/);
    });
  });

  describe('processPayment', () => {
    it('maps COMPLETED to approved and returns the payment id', async () => {
      squarePost.mockResolvedValue({ payment: { id: 'pay_1', status: 'COMPLETED' } });
      const provider = await loadProvider();

      const result = await provider.processPayment(squareConfig as never, {
        customerId: 'c1',
        paymentMethodId: 'ccof:card1',
        amount: 42.5,
      } as never);

      expect(result).toMatchObject({ success: true, status: 'approved', transactionId: 'pay_1' });

      // Dollars must cross to Square as integer minor units.
      const [, , body] = squarePost.mock.calls[0]!;

      expect((body as any).amount_money).toEqual({ amount: 4250, currency: 'USD' });
      // Square rejects a stored-card charge without the owning customer.
      expect((body as any).customer_id).toBe('c1');
      expect((body as any).idempotency_key).toBeTruthy();
    });

    it('maps APPROVED to processing, NOT approved', async () => {
      // APPROVED means authorised-not-captured. Treating it as settled would
      // record money we have not actually taken.
      squarePost.mockResolvedValue({ payment: { id: 'pay_2', status: 'APPROVED' } });
      const provider = await loadProvider();

      const result = await provider.processPayment(squareConfig as never, {
        customerId: 'c1',
        paymentMethodId: 'ccof:card1',
        amount: 10,
      } as never);

      expect(result.status).toBe('processing');
      expect(result.success).toBe(false);
    });

    it('returns a soft failure when the API throws', async () => {
      squarePost.mockRejectedValue(new Error('CARD_DECLINED'));
      const provider = await loadProvider();

      const result = await provider.processPayment(squareConfig as never, {
        customerId: 'c1',
        paymentMethodId: 'ccof:card1',
        amount: 10,
      } as never);

      expect(result).toMatchObject({ success: false, status: 'declined' });
      expect(result.error).toContain('CARD_DECLINED');
    });
  });

  describe('createSubscription', () => {
    const subParams = {
      organizationId: 'test-org-456',
      customerId: 'cust_1',
      paymentMethodId: 'ccof:card_1',
      amount: 99.5,
      frequency: 'monthly' as const,
      startDate: new Date('2026-03-04T18:00:00Z'),
      description: 'Adult BJJ',
      firstName: 'A',
      lastName: 'B',
      email: 'a@example.com',
    };

    it('ALWAYS sends card_id — omitting it silently invoices the member instead of charging them', async () => {
      // The most expensive failure mode in this file. Square does not reject a
      // subscription without card_id; it quietly switches to emailing an
      // invoice, so autopay would stop collecting with no error anywhere.
      selectRows = [{ planVariationId: 'var_existing' }];
      squarePost.mockResolvedValueOnce({ subscription: { id: 'sub_1' } });

      const provider = await loadProvider();
      const result = await provider.createSubscription(squareConfig as never, subParams);

      expect(result).toEqual({ success: true, subscriptionId: 'sub_1' });

      const [, path, body] = squarePost.mock.calls[0] as [unknown, string, Record<string, unknown>];

      expect(path).toBe('/v2/subscriptions');
      expect(body.card_id).toBe('ccof:card_1');
    });

    it('REFUSES rather than creating an invoice-billed subscription when no card is saved', async () => {
      const provider = await loadProvider();
      const result = await provider.createSubscription(
        squareConfig as never,
        { ...subParams, paymentMethodId: '' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('saved card');
      expect(squarePost).not.toHaveBeenCalled();
    });

    it('refuses a customer with no email, which Square rejects as CUSTOMER_MISSING_EMAIL', async () => {
      const provider = await loadProvider();
      const result = await provider.createSubscription(squareConfig as never, { ...subParams, email: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('email');
      expect(squarePost).not.toHaveBeenCalled();
    });

    it('overrides the price per subscription, which is what lets ONE variation serve every member', async () => {
      selectRows = [{ planVariationId: 'var_existing' }];
      squarePost.mockResolvedValueOnce({ subscription: { id: 'sub_1' } });

      const provider = await loadProvider();
      await provider.createSubscription(squareConfig as never, subParams);

      const [, , body] = squarePost.mock.calls[0] as [unknown, string, Record<string, unknown>];

      expect(body.price_override_money).toEqual({ amount: 9950, currency: 'USD' });
      expect(body.plan_variation_id).toBe('var_existing');
      // One period after the first, which the app charged itself.
      expect(body.start_date).toBe('2026-04-04');
    });

    it('starts billing one period after the first, for every cadence', async () => {
      const { firstSquareBillingDate } = await import('./SquarePaymentService');
      const start = new Date('2026-03-04T18:00:00Z');

      expect(firstSquareBillingDate(start, 'weekly')).toBe('2026-03-11');
      expect(firstSquareBillingDate(start, 'monthly')).toBe('2026-04-04');
      expect(firstSquareBillingDate(start, 'semi-annual')).toBe('2026-09-04');
      expect(firstSquareBillingDate(start, 'annual')).toBe('2027-03-04');
    });

    it('clamps to the month\'s last day and crosses the year', async () => {
      const { firstSquareBillingDate } = await import('./SquarePaymentService');

      expect(firstSquareBillingDate(new Date('2026-01-31T12:00:00Z'), 'monthly')).toBe('2026-02-28');
      expect(firstSquareBillingDate(new Date('2028-01-31T12:00:00Z'), 'monthly')).toBe('2028-02-29');
      expect(firstSquareBillingDate(new Date('2026-08-31T12:00:00Z'), 'semi-annual')).toBe('2027-02-28');
      expect(firstSquareBillingDate(new Date('2026-12-15T12:00:00Z'), 'monthly')).toBe('2027-01-15');
      expect(firstSquareBillingDate(new Date('2028-02-29T12:00:00Z'), 'annual')).toBe('2029-02-28');
    });

    it('passes the tax RATE, letting Square compute the money on every cycle', async () => {
      // The provider-authoritative rule holding on the recurring path, not
      // just the initial sale.
      selectRows = [{ planVariationId: 'var_existing' }];
      squarePost.mockResolvedValueOnce({ subscription: { id: 'sub_1' } });

      const provider = await loadProvider();
      await provider.createSubscription(squareConfig as never, {
        ...subParams,
        paymentAdjustments: [
          { type: 'Tax', percentage: 8.375, flatAmount: null },
          { type: 'ServiceFee', percentage: 3.75, flatAmount: null },
        ],
      });

      const [, , body] = squarePost.mock.calls[0] as [unknown, string, Record<string, unknown>];

      expect(body.tax_percentage).toBe('8.375');
      // Square taxes the whole override, so the fee is scaled by 1/(1+tax):
      // 99.50 × (1 + 0.0375 / 1.08375) = 102.94 → ×1.08375 = 111.56, the same
      // as the initial sale's 99.50 + 8.33 tax + 3.73 fee.
      expect(body.price_override_money).toEqual({ amount: 10294, currency: 'USD' });
    });

    it('folds the service fee into the price — a subscription has no service-charge field', async () => {
      selectRows = [{ planVariationId: 'var_existing' }];
      squarePost.mockResolvedValueOnce({ subscription: { id: 'sub_1' } });

      const provider = await loadProvider();
      await provider.createSubscription(squareConfig as never, {
        ...subParams,
        amount: 100,
        paymentAdjustments: [{ type: 'ServiceFee', percentage: 3.75, flatAmount: null }],
      });

      const [, , body] = squarePost.mock.calls[0] as [unknown, string, Record<string, unknown>];

      expect(body.price_override_money).toEqual({ amount: 10375, currency: 'USD' });
      expect(body).not.toHaveProperty('tax_percentage');
    });

    it('squareRecurringPrice reproduces the initial-sale total', async () => {
      const { squareRecurringPrice } = await import('./SquarePaymentService');

      expect(squareRecurringPrice(100, 0, 0)).toBe(100);
      expect(squareRecurringPrice(100, 0, 8.375)).toBe(100);
      expect(squareRecurringPrice(100, 3.75, 0)).toBe(103.75);
      // 100 × (1 + 0.0375 / 1.08375) = 103.46 → Square charges 103.46 + 8.66
      // = 112.12 against the initial sale's 112.13. No whole-cent price hits it
      // exactly (103.47 → 112.14); rounding half-up stays within a cent.
      expect(squareRecurringPrice(100, 3.75, 8.375)).toBe(103.46);
    });

    it('omits tax_percentage entirely for a non-taxable membership', async () => {
      selectRows = [{ planVariationId: 'var_existing' }];
      squarePost.mockResolvedValueOnce({ subscription: { id: 'sub_1' } });

      const provider = await loadProvider();
      await provider.createSubscription(squareConfig as never, subParams);

      const [, , body] = squarePost.mock.calls[0] as [unknown, string, Record<string, unknown>];

      expect(body).not.toHaveProperty('tax_percentage');
    });

    it.each([
      ['weekly', 'WEEKLY'],
      ['monthly', 'MONTHLY'],
      ['semi-annual', 'EVERY_SIX_MONTHS'],
      ['annual', 'ANNUAL'],
    ])('maps %s to Square cadence %s', async (frequency, cadence) => {
      // All four map natively. Semi-annual is first-class here, unlike IQPro
      // where it is emulated with a yearly period and two monthsOfYear entries.
      selectRows = [];
      squarePost
        .mockResolvedValueOnce({
          catalog_object: {
            id: 'plan_1',
            subscription_plan_data: { subscription_plan_variations: [{ id: 'var_new' }] },
          },
        })
        .mockResolvedValueOnce({ subscription: { id: 'sub_1' } });
      insertRows = [{ planVariationId: 'var_new' }];

      const provider = await loadProvider();
      await provider.createSubscription(squareConfig as never, { ...subParams, frequency: frequency as never });

      const [, catalogPath, catalogBody] = squarePost.mock.calls[0] as [unknown, string, unknown];

      expect(catalogPath).toBe('/v2/catalog/object');
      expect(catalogBody).toMatchObject({
        object: {
          type: 'SUBSCRIPTION_PLAN',
          subscription_plan_data: {
            subscription_plan_variations: [
              { subscription_plan_variation_data: { phases: [{ cadence, ordinal: 0 }] } },
            ],
          },
        },
      });
      expect(insertValues).toMatchObject({ organizationId: 'test-org-456', cadence, planVariationId: 'var_new' });
    });

    it('reuses a cached variation instead of minting a second catalog object', async () => {
      selectRows = [{ planVariationId: 'var_existing' }];
      squarePost.mockResolvedValueOnce({ subscription: { id: 'sub_1' } });

      const provider = await loadProvider();
      await provider.createSubscription(squareConfig as never, subParams);

      expect(squarePost).toHaveBeenCalledTimes(1);
      expect(squarePost.mock.calls[0]?.[1]).toBe('/v2/subscriptions');
    });

    it('yields to the winner when two concurrent charges race to create the variation', async () => {
      // The unique index is the real guard; the loser must adopt the winner's
      // variation rather than failing the member's first charge.
      selectRows = [];
      squarePost
        .mockResolvedValueOnce({
          catalog_object: {
            id: 'plan_1',
            subscription_plan_data: { subscription_plan_variations: [{ id: 'var_mine' }] },
          },
        })
        .mockResolvedValueOnce({ subscription: { id: 'sub_1' } });
      insertRows = []; // onConflictDoNothing returned nothing — someone else won.
      selectQueue = [[], [{ planVariationId: 'var_theirs' }]];

      const provider = await loadProvider();
      const result = await provider.createSubscription(squareConfig as never, subParams);

      expect(result.success).toBe(true);

      const [, , body] = squarePost.mock.calls[1] as [unknown, string, Record<string, unknown>];

      expect(body.plan_variation_id).toBe('var_theirs');
    });

    it('degrades when Square creates the plan but returns no variation id', async () => {
      selectRows = [];
      squarePost.mockResolvedValueOnce({ catalog_object: { id: 'plan_1', subscription_plan_data: {} } });

      const provider = await loadProvider();
      const result = await provider.createSubscription(squareConfig as never, subParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('variation id');
    });

    it('degrades when the insert conflicts but the winning row cannot be read back', async () => {
      // Should be impossible — a conflict means a row exists. Covered because
      // the alternative is an unexplained crash on the money path.
      selectRows = [];
      squarePost.mockResolvedValueOnce({
        catalog_object: {
          id: 'plan_1',
          subscription_plan_data: { subscription_plan_variations: [{ id: 'var_mine' }] },
        },
      });
      insertRows = [];
      selectQueue = [[], []];

      const provider = await loadProvider();
      const result = await provider.createSubscription(squareConfig as never, subParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('conflicted');
    });

    it('degrades when Square accepts the subscription but returns no id', async () => {
      selectRows = [{ planVariationId: 'var_existing' }];
      squarePost.mockResolvedValueOnce({ subscription: {} });

      const provider = await loadProvider();
      const result = await provider.createSubscription(squareConfig as never, subParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no id');
    });

    it('returns a soft failure rather than throwing when Square rejects the subscription', async () => {
      selectRows = [{ planVariationId: 'var_existing' }];
      squarePost.mockRejectedValueOnce(new Error('Square /v2/subscriptions failed (400)'));

      const provider = await loadProvider();

      await expect(provider.createSubscription(squareConfig as never, subParams))
        .resolves
        .toMatchObject({ success: false });
    });
  });

  describe('chargeOneTimeFee', () => {
    const feeParams = {
      providerSubscriptionId: 'sub_1',
      providerCustomerId: 'cust_1',
      amount: 50,
      description: 'Cancellation fee',
      caption: 'Cancellation fee',
    };

    it('makes NO API call for a zero fee', async () => {
      const provider = await loadProvider();

      await expect(provider.chargeOneTimeFee(squareConfig as never, { ...feeParams, amount: 0 }))
        .resolves
        .toEqual({ success: true, amountCharged: 0 });
      expect(squarePost).not.toHaveBeenCalled();
      expect(squareGet).not.toHaveBeenCalled();
    });

    it('charges the provider-quoted total against the card on the subscription', async () => {
      squareGet.mockResolvedValueOnce({ subscription: { customer_id: 'cust_1', card_id: 'ccof:card_1' } });
      squarePost
        .mockResolvedValueOnce({ order: { total_money: { amount: 5188 }, total_service_charge_money: { amount: 188 } } })
        .mockResolvedValueOnce({ payment: { id: 'pay_1', status: 'COMPLETED' } });

      const provider = await loadProvider();
      const result = await provider.chargeOneTimeFee(squareConfig as never, feeParams);

      expect(result).toMatchObject({ success: true, amountCharged: 51.88, transactionId: 'pay_1', paymentMethodName: 'card' });

      const [, , body] = squarePost.mock.calls[1] as [unknown, string, Record<string, unknown>];

      expect(body.amount_money).toEqual({ amount: 5188, currency: 'USD' });
      expect(body.source_id).toBe('ccof:card_1');
    });

    it('degrades when the subscription has no saved card', async () => {
      squareGet.mockResolvedValueOnce({ subscription: { customer_id: 'cust_1' } });

      const provider = await loadProvider();
      const result = await provider.chargeOneTimeFee(squareConfig as never, feeParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No saved payment method');
    });

    it('RETURNS a failure rather than throwing when the fee call errors (#237)', async () => {
      squareGet.mockResolvedValueOnce({ subscription: { customer_id: 'cust_1', card_id: 'ccof:card_1' } });
      squarePost.mockRejectedValueOnce(new Error('Square /v2/orders/calculate failed (500)'));

      const provider = await loadProvider();

      await expect(provider.chargeOneTimeFee(squareConfig as never, feeParams))
        .resolves
        .toMatchObject({ success: false });
    });

    it('returns a failure rather than throwing when the charge declines', async () => {
      squareGet.mockResolvedValueOnce({ subscription: { customer_id: 'cust_1', card_id: 'ccof:card_1' } });
      squarePost
        .mockResolvedValueOnce({ order: { total_money: { amount: 5000 } } })
        .mockResolvedValueOnce({ payment: { id: 'pay_1', status: 'FAILED' } });

      const provider = await loadProvider();
      const result = await provider.chargeOneTimeFee(squareConfig as never, feeParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('declined');
    });
  });

  describe('lifecycle', () => {
    it.each([
      ['no opts', undefined],
      ['endOfBillingPeriod: true', { endOfBillingPeriod: true }],
      ['endOfBillingPeriod: false', { endOfBillingPeriod: false }],
    ])('always uses POST /cancel — %s', async (_label, opts) => {
      // Sandbox-corrected: Square has no immediate-cancel variant, and
      // PUTting status: DEACTIVATED is refused ("field status is immutable").
      // `opts` exists only because the interface is shared with IQPro.
      squarePost.mockResolvedValueOnce({});

      const provider = await loadProvider();

      await expect(provider.cancelSubscription(squareConfig as never, 'sub_1', opts))
        .resolves
        .toEqual({ success: true });
      expect(squarePost).toHaveBeenCalledTimes(1);
      expect(squarePost.mock.calls[0]?.[1]).toBe('/v2/subscriptions/sub_1/cancel');
    });

    it.each([
      [false, 'pause'],
      [true, 'resume'],
    ])('maps autoRenewal=%s onto Square %s', async (isAutoRenewed, action) => {
      squarePost.mockResolvedValueOnce({});

      const provider = await loadProvider();
      const result = await provider.setSubscriptionAutoRenewal(squareConfig as never, 'sub_1', isAutoRenewed);

      expect(result).toEqual({ success: true });
      expect(squarePost.mock.calls[0]?.[1]).toBe(`/v2/subscriptions/sub_1/${action}`);
    });

    it('sends resume_change_timing, without which Square rejects the resume', async () => {
      // Sandbox-corrected: the field is not marked required but omitting it
      // returns "Resume change timing must not be null", so a reactivate
      // would fail while a hold succeeded.
      squarePost.mockResolvedValueOnce({});

      const provider = await loadProvider();
      await provider.setSubscriptionAutoRenewal(squareConfig as never, 'sub_1', true);

      expect(squarePost.mock.calls[0]?.[2]).toEqual({ resume_change_timing: 'IMMEDIATE' });
    });

    it('sends no timing on a pause', async () => {
      squarePost.mockResolvedValueOnce({});

      const provider = await loadProvider();
      await provider.setSubscriptionAutoRenewal(squareConfig as never, 'sub_1', false);

      expect(squarePost.mock.calls[0]?.[2]).toEqual({});
    });

    it('RETURNS a cancel failure so the local DB write still happens (#237)', async () => {
      squarePost.mockRejectedValueOnce(new Error('Square failed (500)'));

      const provider = await loadProvider();

      await expect(provider.cancelSubscription(squareConfig as never, 'sub_1'))
        .resolves
        .toMatchObject({ success: false });
    });

    it('RETURNS a hold failure rather than throwing a 500', async () => {
      squarePost.mockRejectedValueOnce(new Error('Square failed (500)'));

      const provider = await loadProvider();

      await expect(provider.setSubscriptionAutoRenewal(squareConfig as never, 'sub_1', false))
        .resolves
        .toMatchObject({ success: false });
    });

    it('resolves the saved card off a subscription', async () => {
      squareGet.mockResolvedValueOnce({ subscription: { customer_id: 'cust_1', card_id: 'ccof:card_1' } });

      const provider = await loadProvider();

      await expect(provider.getSubscriptionPaymentMethod(squareConfig as never, 'sub_1'))
        .resolves
        .toEqual({ customerId: 'cust_1', paymentMethodId: 'ccof:card_1', paymentMethodName: 'card' });
    });

    it('returns null rather than throwing when the lookup fails', async () => {
      squareGet.mockRejectedValueOnce(new Error('Square failed (404)'));

      const provider = await loadProvider();

      await expect(provider.getSubscriptionPaymentMethod(squareConfig as never, 'sub_1'))
        .resolves
        .toBeNull();
    });
  });

  describe('decline vs error reporting (retry flow)', () => {
    const feeParams = {
      providerSubscriptionId: 'sub_1',
      providerCustomerId: 'cust_1',
      amount: 50,
      description: 'Retry',
      caption: 'Retry',
    };

    it('flags a FAILED payment as declined and keeps its id', async () => {
      squareGet.mockResolvedValueOnce({ subscription: { customer_id: 'cust_1', card_id: 'ccof:card_1' } });
      squarePost
        .mockResolvedValueOnce({ order: { total_money: { amount: 5000 } } })
        .mockResolvedValueOnce({ payment: { id: 'pay_declined', status: 'FAILED' } });

      const result = await (await loadProvider()).chargeOneTimeFee(squareConfig as never, feeParams);

      expect(result).toMatchObject({ success: false, declined: true, transactionId: 'pay_declined' });
    });

    it('flags a PAYMENT_METHOD_ERROR (CARD_DECLINED) as a decline', async () => {
      const { SquareApiError } = await import('@/libs/Square');
      squareGet.mockResolvedValueOnce({ subscription: { customer_id: 'cust_1', card_id: 'ccof:card_1' } });
      squarePost
        .mockResolvedValueOnce({ order: { total_money: { amount: 5000 } } })
        .mockRejectedValueOnce(new SquareApiError('/v2/payments', 402, JSON.stringify({ errors: [{ category: 'PAYMENT_METHOD_ERROR', code: 'CARD_DECLINED', detail: 'Card declined.' }] })));

      const result = await (await loadProvider()).chargeOneTimeFee(squareConfig as never, feeParams);

      expect(result).toMatchObject({ success: false, declined: true, error: 'CARD_DECLINED' });
    });

    it('does NOT flag a server error as a decline', async () => {
      const { SquareApiError } = await import('@/libs/Square');
      squareGet.mockResolvedValueOnce({ subscription: { customer_id: 'cust_1', card_id: 'ccof:card_1' } });
      squarePost
        .mockResolvedValueOnce({ order: { total_money: { amount: 5000 } } })
        .mockRejectedValueOnce(new SquareApiError('/v2/payments', 500, JSON.stringify({ errors: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR' }] })));

      const result = await (await loadProvider()).chargeOneTimeFee(squareConfig as never, feeParams);

      expect(result.success).toBe(false);
      expect(result.declined).toBeUndefined();
    });
  });

  describe('getSubscriptionPaymentMethod card details', () => {
    it('adds last4, brand, BIN and MM/YY expiry from GET /v2/cards', async () => {
      squareGet
        .mockResolvedValueOnce({ subscription: { customer_id: 'cust_1', card_id: 'ccof:card_1' } })
        .mockResolvedValueOnce({ card: { last_4: '4242', card_brand: 'VISA', exp_month: 3, exp_year: 2029, bin: '424242' } });

      const result = await (await loadProvider()).getSubscriptionPaymentMethod(squareConfig as never, 'sub_1');

      expect(result).toEqual({
        customerId: 'cust_1',
        paymentMethodId: 'ccof:card_1',
        paymentMethodName: 'card',
        last4: '4242',
        cardBrand: 'VISA',
        firstSix: '424242',
        expirationDate: '03/29',
      });
      expect(squareGet.mock.calls[1]?.[1]).toBe('/v2/cards/ccof:card_1');
    });

    it('omits fields the card does not report', async () => {
      squareGet
        .mockResolvedValueOnce({ subscription: { customer_id: 'cust_1', card_id: 'ccof:card_1' } })
        .mockResolvedValueOnce({ card: {} });

      await expect((await loadProvider()).getSubscriptionPaymentMethod(squareConfig as never, 'sub_1'))
        .resolves
        .toEqual({ customerId: 'cust_1', paymentMethodId: 'ccof:card_1', paymentMethodName: 'card' });
    });

    it('still returns the card id when the details lookup fails', async () => {
      squareGet
        .mockResolvedValueOnce({ subscription: { customer_id: 'cust_1', card_id: 'ccof:card_1' } })
        .mockRejectedValueOnce('boom');

      await expect((await loadProvider()).getSubscriptionPaymentMethod(squareConfig as never, 'sub_1'))
        .resolves
        .toMatchObject({ paymentMethodId: 'ccof:card_1' });
    });
  });

  describe('card-update requests (IQPro-only)', () => {
    it('refuses rather than calling Square: it reports card changes by webhook', async () => {
      const provider = await loadProvider();

      await expect(provider.listCustomerPaymentMethods(squareConfig as never, 'cus_1')).resolves.toBeNull();
      await expect(provider.sendPaymentMethodUpdateLink(squareConfig as never, { providerCustomerId: 'cus_1', email: 'm@example.com' })).resolves.toMatchObject({ success: false });
      await expect(provider.setSubscriptionPaymentMethod(squareConfig as never, 'sub_1', 'card_1')).resolves.toMatchObject({ success: false });
      expect(squarePost).not.toHaveBeenCalled();
    });
  });

  describe('closeFailedInvoice', () => {
    it('reads the invoice version, then cancels with it', async () => {
      squareGet.mockResolvedValueOnce({ invoice: { version: 4, status: 'UNPAID' } });
      squarePost.mockResolvedValueOnce({ invoice: { status: 'CANCELED' } });

      const result = await (await loadProvider()).closeFailedInvoice(squareConfig as never, 'inv_1');

      expect(result).toEqual({ success: true });
      expect(squareGet.mock.calls[0]?.[1]).toBe('/v2/invoices/inv_1');
      expect(squarePost.mock.calls[0]?.[1]).toBe('/v2/invoices/inv_1/cancel');
      expect(squarePost.mock.calls[0]?.[2]).toEqual({ version: 4 });
    });

    it('sends version 0 when the invoice reports none', async () => {
      squareGet.mockResolvedValueOnce({});
      squarePost.mockResolvedValueOnce({});

      await (await loadProvider()).closeFailedInvoice(squareConfig as never, 'inv_1');

      expect(squarePost.mock.calls[0]?.[2]).toEqual({ version: 0 });
    });

    it.each(['PAID', 'CANCELED', 'REFUNDED'])('does nothing for an invoice already %s', async (status) => {
      squareGet.mockResolvedValueOnce({ invoice: { version: 2, status } });

      const result = await (await loadProvider()).closeFailedInvoice(squareConfig as never, 'inv_1');

      expect(result).toMatchObject({ success: true, note: expect.stringContaining(status) });
      expect(squarePost).not.toHaveBeenCalled();
    });

    it('RETURNS a failure rather than throwing', async () => {
      squareGet.mockResolvedValueOnce({ invoice: { version: 1, status: 'UNPAID' } });
      squarePost.mockRejectedValueOnce(new Error('Square /cancel failed (400)'));

      await expect((await loadProvider()).closeFailedInvoice(squareConfig as never, 'inv_1'))
        .resolves
        .toMatchObject({ success: false, error: expect.stringContaining('400') });
    });

    it('uses a generic message for a non-Error throw', async () => {
      squareGet.mockRejectedValueOnce('boom');

      await expect((await loadProvider()).closeFailedInvoice(squareConfig as never, 'inv_1'))
        .resolves
        .toEqual({ success: false, error: 'Square invoice cancel failed.' });
    });
  });

  describe('reverseTransaction', () => {
    it('cancels an APPROVED (uncaptured) payment — a void, no money moves', async () => {
      const provider = await loadProvider();
      squareGet.mockResolvedValueOnce({ payment: { status: 'APPROVED', total_money: { amount: 10375, currency: 'USD' } } });
      squarePost.mockResolvedValueOnce({ payment: { status: 'CANCELED' } });

      const result = await provider.reverseTransaction(squareConfig, 'sq-pay-1');

      expect(squareGet).toHaveBeenCalledWith(expect.anything(), '/v2/payments/sq-pay-1');
      expect(squarePost).toHaveBeenCalledWith(expect.anything(), '/v2/payments/sq-pay-1/cancel', {});
      expect(result).toEqual({ success: true, method: 'void' });
    });

    it('refunds a COMPLETED payment for its full total, in minor units, with an idempotency key', async () => {
      const provider = await loadProvider();
      squareGet.mockResolvedValueOnce({ payment: { status: 'COMPLETED', total_money: { amount: 10375, currency: 'USD' } } });
      squarePost.mockResolvedValueOnce({ refund: { id: 'sq-ref-1', status: 'PENDING' } });

      const result = await provider.reverseTransaction(squareConfig, 'sq-pay-1');

      expect(squarePost).toHaveBeenCalledWith(expect.anything(), '/v2/refunds', {
        idempotency_key: expect.any(String),
        payment_id: 'sq-pay-1',
        amount_money: { amount: 10375, currency: 'USD' },
      });
      expect(result).toEqual({ success: true, method: 'refund', refundTransactionId: 'sq-ref-1' });
    });

    it('refunds only what remains after an earlier partial refund', async () => {
      const provider = await loadProvider();
      squareGet.mockResolvedValueOnce({
        payment: { status: 'COMPLETED', total_money: { amount: 10000, currency: 'USD' }, refunded_money: { amount: 2500 } },
      });
      squarePost.mockResolvedValueOnce({ refund: { id: 'sq-ref-2', status: 'COMPLETED' } });

      await provider.reverseTransaction(squareConfig, 'sq-pay-1');

      expect(squarePost.mock.calls[0]![2]).toMatchObject({ amount_money: { amount: 7500 } });
    });

    it.each([
      ['CANCELED', { status: 'CANCELED' }, 'void'],
      ['fully refunded', { status: 'COMPLETED', total_money: { amount: 500 }, refunded_money: { amount: 500 } }, 'refund'],
    ])('reports an already-%s payment as reversed without a second call', async (_label, payment, method) => {
      const provider = await loadProvider();
      squareGet.mockResolvedValueOnce({ payment });

      const result = await provider.reverseTransaction(squareConfig, 'sq-pay-1');

      expect(result).toEqual({ success: true, method, alreadyReversed: true });
      expect(squarePost).not.toHaveBeenCalled();
    });

    it('refuses a FAILED payment', async () => {
      const provider = await loadProvider();
      squareGet.mockResolvedValueOnce({ payment: { status: 'FAILED' } });

      const result = await provider.reverseTransaction(squareConfig, 'sq-pay-1');

      expect(result).toEqual({ success: false, error: expect.stringContaining('FAILED') });
      expect(squarePost).not.toHaveBeenCalled();
    });

    it('fails when Square rejects the refund', async () => {
      const provider = await loadProvider();
      squareGet.mockResolvedValueOnce({ payment: { status: 'COMPLETED', total_money: { amount: 100 } } });
      squarePost.mockResolvedValueOnce({ refund: { status: 'REJECTED' } });

      const result = await provider.reverseTransaction(squareConfig, 'sq-pay-1');

      expect(result).toEqual({ success: false, error: 'Square did not refund the payment (REJECTED).' });
    });

    it('returns transport errors rather than throwing', async () => {
      const provider = await loadProvider();
      squareGet.mockRejectedValueOnce(new Error('NOT_FOUND'));

      const result = await provider.reverseTransaction(squareConfig, 'sq-pay-1');

      expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
    });
  });
});
