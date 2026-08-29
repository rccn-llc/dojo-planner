import { beforeEach, describe, expect, it, vi } from 'vitest';

const squarePost = vi.fn();

vi.mock('@/libs/Square', async () => {
  const actual = await vi.importActual<typeof import('@/libs/Square')>('@/libs/Square');
  return { ...actual, squarePost: (...a: unknown[]) => squarePost(...a) };
});
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

  describe('unimplemented subscription methods', () => {
    // These RETURN failures rather than throwing. Four have a documented
    // degrade-never-throw contract (#237): a throw would turn a hold or
    // cancel into a 500 and block the local DB write that must still happen.
    it('createSubscription returns a failure', async () => {
      const provider = await loadProvider();

      await expect(provider.createSubscription(squareConfig as never, {} as never))
        .resolves
        .toMatchObject({ success: false });
    });

    it('chargeOneTimeFee returns a failure, never throws', async () => {
      const provider = await loadProvider();

      await expect(provider.chargeOneTimeFee(squareConfig as never, {} as never))
        .resolves
        .toMatchObject({ success: false });
    });

    it('cancelSubscription returns a failure so local cleanup proceeds', async () => {
      const provider = await loadProvider();

      await expect(provider.cancelSubscription(squareConfig as never, 'sub_1'))
        .resolves
        .toMatchObject({ success: false });
    });

    it('setSubscriptionAutoRenewal returns a failure', async () => {
      const provider = await loadProvider();

      await expect(provider.setSubscriptionAutoRenewal(squareConfig as never, 'sub_1', false))
        .resolves
        .toMatchObject({ success: false });
    });

    it('getSubscriptionPaymentMethod returns null', async () => {
      const provider = await loadProvider();

      await expect(provider.getSubscriptionPaymentMethod(squareConfig as never, 'sub_1'))
        .resolves
        .toBeNull();
    });
  });
});
