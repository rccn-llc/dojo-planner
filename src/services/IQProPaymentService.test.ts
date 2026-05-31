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

const testConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  gatewayId: 'test-gateway-001',
  scope: 'test-scope',
  oauthUrl: 'https://sandbox.oauth.example.com/token',
  baseUrl: 'https://sandbox.api.basyspro.com',
  source: 'env' as const,
};

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

      const result = await provider.createCustomer(testConfig, {
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
        testConfig,
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

      expect(iqproGet).toHaveBeenCalledWith(testConfig, '/api/gateway/test-gateway-001/customer/cust_123');
    });

    it('skips the GET when no address is supplied', async () => {
      const { provider, iqproPost, iqproGet } = await loadProvider();

      iqproPost.mockResolvedValueOnce({ data: { customerId: 'cust_noaddr' } });

      const result = await provider.createCustomer(testConfig, {
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

      const result = await provider.createPaymentMethod(testConfig, {
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
        testConfig,
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

      const result = await provider.createPaymentMethod(testConfig, {
        customerId: 'cust_123',
        paymentMethod: 'ach',
        achRoutingNumber: '021000021',
        achAccountNumber: '987654321',
        achAccountType: 'Savings',
      });

      expect(result.paymentMethodId).toBe('pm_ach_1');
      expect(result.achToken).toBe('ach-tok-xyz');

      expect(tokenizeAch).toHaveBeenCalledWith(testConfig, {
        accountNumber: '987654321',
        routingNumber: '021000021',
        secCode: 'PPD',
        achAccountType: 'Savings',
      });

      expect(iqproPost).toHaveBeenCalledWith(
        testConfig,
        '/api/gateway/test-gateway-001/customer/cust_123/payment',
        {
          ach: {
            token: 'ach-tok-xyz',
            secCode: 'PPD',
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

  // ── Canonical FeeBreakdown shapes for processPayment tests ────────────
  const nonTaxableFees = {
    baseAmount: 100,
    taxAmount: 0,
    taxPct: 0,
    serviceFeeAmount: 3.75,
    serviceFeePct: 3.75,
    amount: 103.75,
  };
  const taxableFees = {
    baseAmount: 100,
    taxAmount: 3.75,
    taxPct: 3.75,
    serviceFeeAmount: 3.75,
    serviceFeePct: 3.75,
    amount: 107.5,
  };

  const baseBilling = {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '5550123456',
    addressLine1: '1 Market St',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94103',
    country: 'US',
  };

  describe('processPayment — payload shapes', () => {
    it('non-vaulted card + non-taxable (membership): customer-ref with billing address, no Tax adjustment', async () => {
      const { provider, iqproPost } = await loadProvider();
      iqproPost.mockResolvedValueOnce({
        data: { transaction: { transactionId: 'tx_42', status: 'Captured' } },
      });

      const result = await provider.processPayment(testConfig, {
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 103.75,
        currency: 'USD',
        description: 'Adult BJJ Monthly',
        feeBreakdown: nonTaxableFees,
        customerBillingAddressId: 'addr_billing_1',
        billingAddress: baseBilling,
      });

      expect(result.success).toBe(true);

      const p = iqproPost.mock.calls[0]![2] as Record<string, any>;

      // Non-taxable remit: taxAmount: 0, isTaxExempt: true
      expect(p.remit).toEqual({
        baseAmount: 100,
        taxAmount: 0,
        isTaxExempt: true,
        currencyCode: 'USD',
        addTaxToTotal: true,
        // ServiceFee always present (percentage), no Tax adjustment for non-taxable
        paymentAdjustments: [
          { type: 'ServiceFee', percentage: 3.75, flatAmount: null },
        ],
      });
      // Customer-ref shape with billing address ID
      expect(p.paymentMethod).toEqual({
        customer: {
          customerId: 'cust_123',
          customerPaymentMethodId: 'pm_card_1',
          customerBillingAddressId: 'addr_billing_1',
        },
      });
      // address[] block included for non-vaulted charges
      expect(p.address).toHaveLength(1);
      expect(p.address[0]).toEqual(expect.objectContaining({
        isPhysical: true,
        isBilling: true,
        isShipping: false,
        company: null,
      }));
      // line items: localTaxPercent 0 for non-taxable
      expect(p.lineItems[0].localTaxPercent).toBe(0);
    });

    it('non-vaulted ACH + non-taxable: paymentMethod.ach (inline), NOT customer-ref', async () => {
      const { provider, iqproPost } = await loadProvider();
      iqproPost.mockResolvedValueOnce({
        data: { transaction: { transactionId: 'tx_ach', status: 'Captured' } },
      });

      await provider.processPayment(testConfig, {
        customerId: 'cust_123',
        paymentMethodId: 'pm_ach_1',
        amount: 103.75,
        currency: 'USD',
        description: 'Adult BJJ ACH',
        feeBreakdown: nonTaxableFees,
        ach: {
          achToken: 'ach-tok-xyz',
          secCode: 'PPD',
          routingNumber: '021000021',
          accountType: 'Checking',
        },
        billingAddress: baseBilling,
      });

      const p = iqproPost.mock.calls[0]![2] as Record<string, any>;

      // ACH new-charge: inline ach, NOT customer-ref (matches kiosk)
      expect(p.paymentMethod).toEqual({
        ach: {
          achToken: 'ach-tok-xyz',
          secCode: 'PPD',
          routingNumber: '021000021',
          accountType: 'Checking',
          checkNumber: null,
          accountHolderAuth: { dlState: null, dlNumber: null },
        },
      });
      // address[] still included for non-vaulted charges
      expect(p.address).toHaveLength(1);
    });

    it('non-vaulted card + taxable (event/store): Tax + ServiceFee adjustments, taxAmount: null', async () => {
      const { provider, iqproPost } = await loadProvider();
      iqproPost.mockResolvedValueOnce({
        data: { transaction: { transactionId: 'tx_event', status: 'Captured' } },
      });

      await provider.processPayment(testConfig, {
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 107.5,
        currency: 'USD',
        description: 'Seminar registration',
        feeBreakdown: taxableFees,
        isTaxable: true,
        billingAddress: baseBilling,
      });

      const p = iqproPost.mock.calls[0]![2] as Record<string, any>;

      // Taxable remit: taxAmount: null + isTaxExempt: false
      expect(p.remit.taxAmount).toBeNull();
      expect(p.remit.isTaxExempt).toBe(false);
      // Both Tax + ServiceFee adjustments present
      expect(p.remit.paymentAdjustments).toEqual([
        { type: 'Tax', percentage: null, flatAmount: 3.75 },
        { type: 'ServiceFee', percentage: 3.75, flatAmount: null },
      ]);
      // Line items must carry localTaxPercent for taxable
      expect(p.lineItems[0].localTaxPercent).toBe(3.75);
    });

    it('vaulted card: customer-ref WITHOUT billing address ID, NO top-level address[]', async () => {
      const { provider, iqproPost } = await loadProvider();
      iqproPost.mockResolvedValueOnce({
        data: { transaction: { transactionId: 'tx_vault', status: 'Captured' } },
      });

      await provider.processPayment(testConfig, {
        customerId: 'cust_existing',
        paymentMethodId: 'pm_saved',
        amount: 103.75,
        currency: 'USD',
        description: 'Vaulted membership',
        feeBreakdown: nonTaxableFees,
        vaulted: true,
        // billingAddress would be ignored because vaulted=true
        billingAddress: baseBilling,
      });

      const p = iqproPost.mock.calls[0]![2] as Record<string, any>;

      // Vaulted: no customerBillingAddressId in customer ref
      expect(p.paymentMethod).toEqual({
        customer: {
          customerId: 'cust_existing',
          customerPaymentMethodId: 'pm_saved',
        },
      });
      // No top-level address[] for vaulted charges (IQPro has it via the vault)
      expect(p.address).toBeUndefined();
    });

    it('vaulted ACH: customer-ref shape (NOT inline ach)', async () => {
      const { provider, iqproPost } = await loadProvider();
      iqproPost.mockResolvedValueOnce({
        data: { transaction: { transactionId: 'tx_vault_ach', status: 'Captured' } },
      });

      await provider.processPayment(testConfig, {
        customerId: 'cust_existing',
        paymentMethodId: 'pm_ach_saved',
        amount: 103.75,
        currency: 'USD',
        description: 'Vaulted ACH membership',
        feeBreakdown: nonTaxableFees,
        vaulted: true,
        // even with `ach` block, vaulted should override to customer-ref
        ach: {
          achToken: 'ach-tok-saved',
          secCode: 'PPD',
          routingNumber: '021000021',
          accountType: 'Checking',
        },
      });

      const p = iqproPost.mock.calls[0]![2] as Record<string, any>;

      expect(p.paymentMethod).toEqual({
        customer: {
          customerId: 'cust_existing',
          customerPaymentMethodId: 'pm_ach_saved',
        },
      });
      expect(p.address).toBeUndefined();
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

      const result = await provider.processPayment(testConfig, {
        customerId: 'cust_123',
        paymentMethodId: 'pm_ach_1',
        amount: 100,
        currency: 'USD',
        description: 'ACH sandbox',
        feeBreakdown: nonTaxableFees,
        ach: {
          achToken: 'ach-tok-xyz',
          secCode: 'PPD',
          routingNumber: '021000021',
          accountType: 'Checking',
        },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('approved');
    });

    it('returns declined with processor response text', async () => {
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

      const result = await provider.processPayment(testConfig, {
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 100,
        currency: 'USD',
        description: 'Decline',
        feeBreakdown: nonTaxableFees,
      });

      expect(result.success).toBe(false);
      expect(result.declineReason).toBe('Insufficient funds');
    });

    it('returns declined when iqproPost throws', async () => {
      const { provider, iqproPost } = await loadProvider();
      iqproPost.mockRejectedValueOnce(new Error('boom'));

      const result = await provider.processPayment(testConfig, {
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 100,
        currency: 'USD',
        description: 'Failure',
        feeBreakdown: nonTaxableFees,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('boom');
    });

    it('lineItems array (membership + signup fee): emits one IQPro lineItem per entry', async () => {
      const { provider, iqproPost } = await loadProvider();
      iqproPost.mockResolvedValueOnce({
        data: { transaction: { transactionId: 'tx_signup', status: 'Captured' } },
      });

      await provider.processPayment(testConfig, {
        customerId: 'cust_123',
        paymentMethodId: 'pm_card_1',
        amount: 257.30,
        currency: 'USD',
        description: 'Membership: 12 Month Commitment (Gold)',
        feeBreakdown: nonTaxableFees,
        customerBillingAddressId: 'addr_billing_1',
        billingAddress: baseBilling,
        lineItems: [
          { name: 'Membership: 12 Month Commitment (Gold)', description: 'Membership: 12 Month Commitment (Gold)', unitPrice: 149, discount: 0 },
          { name: 'Sign-up fee', description: 'Sign-up fee — 12 Month Commitment (Gold)', unitPrice: 99, discount: 0 },
        ],
      });

      const p = iqproPost.mock.calls[0]![2] as Record<string, any>;

      expect(p.lineItems).toHaveLength(2);
      expect(p.lineItems[0]).toEqual(expect.objectContaining({
        name: 'Membership: 12 Month Commitment (Gold)',
        unitPrice: 149,
        discount: 0,
        quantity: 1,
      }));
      expect(p.lineItems[1]).toEqual(expect.objectContaining({
        name: 'Sign-up fee',
        unitPrice: 99,
        discount: 0,
        quantity: 1,
      }));
    });
  });

  describe('createSubscription', () => {
    it('posts the subscription with billing+remittance addresses, MBR prefix, and YEAR/MONTH unit', async () => {
      const { provider, iqproPost } = await loadProvider();

      iqproPost.mockResolvedValueOnce({ data: { subscriptionId: 'sub_1' } });

      const result = await provider.createSubscription(testConfig, {
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
        paymentAdjustments: [{ type: 'ServiceFee', percentage: 3.75, flatAmount: null }],
      });

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBe('sub_1');

      const [, path, payload] = iqproPost.mock.calls[0]!;

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
      expect(p.paymentAdjustments).toEqual([{ type: 'ServiceFee', percentage: 3.75, flatAmount: null }]);
    });

    it('sets billingPeriodId 6 + monthsOfYear for annual subscriptions', async () => {
      const { provider, iqproPost } = await loadProvider();

      iqproPost.mockResolvedValueOnce({ data: { subscriptionId: 'sub_annual' } });

      await provider.createSubscription(testConfig, {
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

      const p = iqproPost.mock.calls[0]![2] as Record<string, any>;

      expect(p.recurrence.billingPeriodId).toBe(6);
      expect(p.recurrence.schedule).toEqual({ minutes: [0], hours: [0], daysOfMonth: [15], monthsOfYear: [4] });
      expect(p.lineItems[0].unitOfMeasureId).toBe(4); // YEAR
    });
  });
});
