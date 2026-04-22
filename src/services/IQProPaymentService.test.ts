import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Env so the service can read IQPRO_GATEWAY_ID and IQPRO_BASE_URL
vi.mock('@/libs/Env', () => ({
  Env: {
    IQPRO_GATEWAY_ID: 'test-gateway-001',
    IQPRO_BASE_URL: 'https://sandbox.api.basyspro.com',
  },
}));

// Mock the IQPro REST helpers — every test asserts the exact path + payload.
vi.mock('@/libs/IQPro', () => ({
  iqproPost: vi.fn(),
  iqproGet: vi.fn(),
  tokenizeAch: vi.fn().mockResolvedValue({ achToken: 'ach-tok-test-001' }),
  getGatewayProcessors: vi.fn().mockResolvedValue({
    cardProcessorId: 'test-card-processor-001',
    achProcessorId: 'test-ach-processor-001',
  }),
}));

vi.mock('@/libs/Logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe('IQProPaymentProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function loadProvider() {
    const { IQProPaymentProvider } = await import('./IQProPaymentService');
    const { iqproPost, iqproGet, tokenizeAch, getGatewayProcessors } = await import('@/libs/IQPro');
    return {
      provider: new IQProPaymentProvider(),
      iqproPost: vi.mocked(iqproPost),
      iqproGet: vi.mocked(iqproGet),
      tokenizeAch: vi.mocked(tokenizeAch),
      getGatewayProcessors: vi.mocked(getGatewayProcessors),
    };
  }

  describe('createCustomer', () => {
    it('POSTs the customer with normalized country and follows up with a GET to resolve the billing-address ID', async () => {
      const { provider, iqproPost, iqproGet } = await loadProvider();

      iqproPost.mockResolvedValueOnce({ data: { customerId: 'cust_123' } });
      iqproGet.mockResolvedValueOnce({
        data: {
          addresses: [{ customerAddressId: 'addr_billing_1', isBilling: true }],
        },
      });

      const result = await provider.createCustomer({
        organizationId: 'org_x',
        memberId: 'mem_42',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '(555) 012-3456',
        address: {
          street: '1 Market St',
          apartment: 'Apt 4',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94103',
          country: 'United States',
        },
      });

      expect(result).toEqual({ customerId: 'cust_123', billingAddressId: 'addr_billing_1' });

      expect(iqproPost).toHaveBeenCalledWith(
        '/api/gateway/test-gateway-001/customer',
        expect.objectContaining({
          name: 'Jane Doe',
          referenceId: 'mem_42',
          addresses: [
            expect.objectContaining({
              addressLine1: '1 Market St',
              addressLine2: 'Apt 4',
              city: 'San Francisco',
              state: 'CA',
              postalCode: '94103',
              country: 'US', // 'United States' normalized
              firstName: 'Jane',
              lastName: 'Doe',
              email: 'jane@example.com',
              phone: '5550123456',
              isBilling: true,
            }),
          ],
        }),
      );

      expect(iqproGet).toHaveBeenCalledWith('/api/gateway/test-gateway-001/customer/cust_123');
    });

    it('skips the GET when no address is supplied', async () => {
      const { provider, iqproPost, iqproGet } = await loadProvider();

      iqproPost.mockResolvedValueOnce({ data: { customerId: 'cust_noaddr' } });

      const result = await provider.createCustomer({
        organizationId: 'org_x',
        memberId: 'mem_99',
        email: 'noaddr@example.com',
        firstName: 'No',
        lastName: 'Addr',
      });

      expect(result).toEqual({ customerId: 'cust_noaddr', billingAddressId: undefined });
      expect(iqproGet).not.toHaveBeenCalled();
    });
  });

  describe('createPaymentMethod', () => {
    it('sends the canonical card payload with tokenized data and BIN-formatted maskedCard', async () => {
      const { provider, iqproPost } = await loadProvider();

      iqproPost.mockResolvedValueOnce({ data: { customerPaymentMethodId: 'pm_card_1', last4: '4242' } });

      const result = await provider.createPaymentMethod({
        customerId: 'cust_123',
        paymentMethod: 'card',
        cardToken: 'tex-tok-abc',
        cardFirstSix: '424242',
        cardLastFour: '4242',
        cardExpiry: '12/27',
      });

      expect(result.paymentMethodId).toBe('pm_card_1');
      expect(result.last4).toBe('4242');

      expect(iqproPost).toHaveBeenCalledWith(
        '/api/gateway/test-gateway-001/customer/cust_123/payment',
        {
          card: {
            token: 'tex-tok-abc',
            expirationDate: '12/27',
            maskedCard: '424242******4242',
          },
          isDefault: true,
        },
      );
    });

    it('tokenizes ACH first then sends the canonical ACH payload', async () => {
      const { provider, iqproPost, tokenizeAch } = await loadProvider();

      tokenizeAch.mockResolvedValueOnce({ achToken: 'ach-tok-xyz' });
      iqproPost.mockResolvedValueOnce({ data: { customerPaymentMethodId: 'pm_ach_1' } });

      const result = await provider.createPaymentMethod({
        customerId: 'cust_123',
        paymentMethod: 'ach',
        achRoutingNumber: '021000021',
        achAccountNumber: '987654321',
        achAccountType: 'Savings',
      });

      expect(result.paymentMethodId).toBe('pm_ach_1');
      expect(result.achToken).toBe('ach-tok-xyz');

      expect(tokenizeAch).toHaveBeenCalledWith({
        accountNumber: '987654321',
        routingNumber: '021000021',
        secCode: 'WEB',
        achAccountType: 'Savings',
      });

      expect(iqproPost).toHaveBeenCalledWith(
        '/api/gateway/test-gateway-001/customer/cust_123/payment',
        {
          ach: {
            token: 'ach-tok-xyz',
            secCode: 'WEB',
            routingNumber: '021000021',
            accountType: 'Savings',
            checkNumber: null,
            accountHolderAuth: { dlState: null, dlNumber: null },
          },
          isDefault: true,
        },
      );
    });
  });

  describe('processPayment', () => {
    it('builds the full Sale payload with feeBreakdown, paymentAdjustments, address and lineItems', async () => {
      const { provider, iqproPost } = await loadProvider();

      iqproPost.mockResolvedValueOnce({
        data: {
          transaction: {
            transactionId: 'tx_42',
            status: 'Captured',
          },
        },
      });

      const result = await provider.processPayment({
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 111.5,
        currency: 'USD',
        description: 'Adult BJJ Membership Monthly',
        feeBreakdown: {
          baseAmount: 100,
          taxAmount: 8.5,
          surchargeAmount: 3,
          serviceFeesAmount: 0,
          convenienceFeesAmount: 0,
          amount: 111.5,
        },
        customerBillingAddressId: 'addr_billing_1',
        billingAddress: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          phone: '5550123456',
          addressLine1: '1 Market St',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94103',
          country: 'US',
        },
        lineItem: {
          name: 'Adult BJJ',
          description: 'Monthly membership',
          unitPrice: 100,
          discount: 0,
        },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('approved');
      expect(result.transactionId).toBe('tx_42');

      const [path, payload] = iqproPost.mock.calls[0]!;

      expect(path).toBe('/api/gateway/test-gateway-001/transaction');

      const p = payload as Record<string, any>;

      expect(p.type).toBe('Sale');
      // Remit block has tax + adjustments + currency
      expect(p.remit).toEqual({
        baseAmount: 100,
        taxAmount: 8.5,
        isTaxExempt: false,
        currencyCode: 'USD',
        addTaxToTotal: true,
        paymentAdjustments: [
          { type: 'Surcharge', percentage: null, flatAmount: 3 },
        ],
      });
      // paymentMethod uses customer block only — no card or ach block
      expect(p.paymentMethod).toEqual({
        customer: {
          customerId: 'cust_123',
          customerPaymentMethodId: 'pm_card_1',
          customerBillingAddressId: 'addr_billing_1',
        },
      });
      // address[] block
      expect(p.address).toEqual([
        expect.objectContaining({
          isPhysical: true,
          isBilling: true,
          isShipping: false,
          firstName: 'Jane',
          email: 'jane@example.com',
          state: 'CA',
          country: 'US',
        }),
      ]);
      // line items shape
      expect(p.lineItems).toEqual([
        expect.objectContaining({
          name: 'Adult BJJ',
          description: 'Monthly membership',
          quantity: 1,
          unitPrice: 100,
          discount: 0,
          freightAmount: 0,
          unitOfMeasureId: 1,
        }),
      ]);
      // caption truncated to 19 chars
      expect(p.caption).toBe('Adult BJJ Membershi');
    });

    it('marks the transaction tax-exempt when taxAmount is 0', async () => {
      const { provider, iqproPost } = await loadProvider();

      iqproPost.mockResolvedValueOnce({
        data: { transaction: { transactionId: 'tx_zero', status: 'Captured' } },
      });

      await provider.processPayment({
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 50,
        currency: 'USD',
        description: 'Free state',
        feeBreakdown: {
          baseAmount: 50,
          taxAmount: 0,
          surchargeAmount: 0,
          serviceFeesAmount: 0,
          convenienceFeesAmount: 0,
          amount: 50,
        },
      });

      const p = iqproPost.mock.calls[0]![1] as Record<string, any>;

      expect(p.remit.isTaxExempt).toBe(true);
      expect(p.remit.paymentAdjustments).toBeUndefined();
    });

    it('treats sandbox certification errors as approved (pendingsettlement)', async () => {
      const { provider, iqproPost } = await loadProvider();

      iqproPost.mockResolvedValueOnce({
        data: {
          transaction: {
            transactionId: 'tx_cert',
            status: 'Failed',
            processorResponseText: 'This is not a valid transaction for certification',
          },
        },
      });

      const result = await provider.processPayment({
        customerId: 'cust_123',
        paymentMethodId: 'pm_ach_1',
        amount: 100,
        currency: 'USD',
        description: 'ACH sandbox test',
        ach: {
          achToken: 'ach-tok-xyz',
          secCode: 'WEB',
          routingNumber: '021000021',
          accountType: 'Checking',
        },
        feeBreakdown: {
          baseAmount: 100,
          taxAmount: 0,
          surchargeAmount: 0,
          serviceFeesAmount: 0,
          convenienceFeesAmount: 0,
          amount: 100,
        },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('approved');
    });

    it('returns declined with the processor response text', async () => {
      const { provider, iqproPost } = await loadProvider();

      iqproPost.mockResolvedValueOnce({
        data: {
          transaction: {
            transactionId: 'tx_decline',
            status: 'Declined',
            processorResponseText: 'Insufficient funds',
          },
        },
      });

      const result = await provider.processPayment({
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 100,
        currency: 'USD',
        description: 'Decline',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('declined');
      expect(result.declineReason).toBe('Insufficient funds');
    });

    it('returns declined when iqproPost throws', async () => {
      const { provider, iqproPost } = await loadProvider();

      iqproPost.mockRejectedValueOnce(new Error('boom'));

      const result = await provider.processPayment({
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 100,
        currency: 'USD',
        description: 'Failure',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('declined');
      expect(result.error).toBe('boom');
    });
  });

  describe('createSubscription', () => {
    it('posts the subscription with billing+remittance addresses, MBR prefix, and YEAR/MONTH unit', async () => {
      const { provider, iqproPost } = await loadProvider();

      iqproPost.mockResolvedValueOnce({ data: { subscriptionId: 'sub_1' } });

      const result = await provider.createSubscription({
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 99,
        frequency: 'monthly',
        startDate: new Date('2026-04-15T12:00:00Z'),
        description: 'Adult BJJ',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: '5550123456',
        address: {
          street: '1 Market St',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94103',
          country: 'US',
        },
        paymentAdjustments: [{ type: 'Surcharge', percentage: null, flatAmount: 3 }],
      });

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBe('sub_1');

      const [path, payload] = iqproPost.mock.calls[0]!;

      expect(path).toBe('/api/gateway/test-gateway-001/subscription');

      const p = payload as Record<string, any>;

      expect(p.prefix).toBe('MBR');
      expect(p.subscriptionStatusId).toBe(1);
      expect(p.recurrence.billingPeriodId).toBe(4); // monthly
      expect(p.recurrence.schedule).toEqual({ minutes: [0], hours: [0], daysOfMonth: [15] }); // no monthsOfYear
      expect(p.lineItems[0].unitOfMeasureId).toBe(3); // MONTH
      expect(p.paymentMethod.cardProcessorId).toBe('test-card-processor-001');
      expect(p.paymentMethod.achProcessorId).toBe('test-ach-processor-001');
      expect(p.addresses).toHaveLength(2);
      expect(p.addresses[0].isBilling).toBe(true);
      expect(p.addresses[1].isRemittance).toBe(true);
      expect(p.paymentAdjustments).toEqual([{ type: 'Surcharge', percentage: null, flatAmount: 3 }]);
    });

    it('sets billingPeriodId 6 + monthsOfYear for annual subscriptions', async () => {
      const { provider, iqproPost } = await loadProvider();

      iqproPost.mockResolvedValueOnce({ data: { subscriptionId: 'sub_annual' } });

      await provider.createSubscription({
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 999,
        frequency: 'annual',
        startDate: new Date('2026-04-15T12:00:00Z'),
        description: 'Adult BJJ Annual',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      });

      const p = iqproPost.mock.calls[0]![1] as Record<string, any>;

      expect(p.recurrence.billingPeriodId).toBe(6);
      expect(p.recurrence.schedule).toEqual({ minutes: [0], hours: [0], daysOfMonth: [15], monthsOfYear: [4] });
      expect(p.lineItems[0].unitOfMeasureId).toBe(4); // YEAR
    });
  });
});
