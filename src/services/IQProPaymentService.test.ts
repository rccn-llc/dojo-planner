import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the IQPro client singleton
vi.mock('@/libs/IQPro', () => ({
  getIQProClient: vi.fn(),
  getGatewayProcessors: vi.fn().mockResolvedValue({
    cardProcessorId: 'test-card-processor-001',
    achProcessorId: 'test-ach-processor-001',
  }),
  tokenizeAch: vi.fn().mockResolvedValue({ achToken: 'ach-tok-test-001' }),
}));

// Mock the logger to suppress output during tests
vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockClient() {
  return {
    customers: {
      create: vi.fn(),
      createPaymentMethod: vi.fn(),
    },
    transactions: {
      create: vi.fn(),
      getServiceContext: vi.fn().mockReturnValue({ gatewayContext: { gatewayId: 'test-gateway-001' } }),
    },
    subscriptions: {
      create: vi.fn(),
    },
    post: vi.fn(),
  };
}

describe('IQProPaymentProvider', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.resetModules();
    mockClient = createMockClient();
  });

  async function getProviderWithClient(client: ReturnType<typeof createMockClient> | null = mockClient) {
    const { getIQProClient } = await import('@/libs/IQPro');
    vi.mocked(getIQProClient).mockReturnValue(client as any);
    const { IQProPaymentProvider } = await import('./IQProPaymentService');
    return new IQProPaymentProvider();
  }

  describe('createCustomer', () => {
    it('passes correct params and returns customer ID', async () => {
      const provider = await getProviderWithClient();

      mockClient.customers.create.mockResolvedValue({
        customerId: 'test-customer-123',
      });

      const result = await provider.createCustomer({
        organizationId: 'test-org-456',
        memberId: 'test-member-789',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '(555) 012-3456',
        address: {
          street: '123 Main St',
          apartment: 'Apt 4B',
          city: 'Springfield',
          state: 'IL',
          zipCode: '62701',
          country: 'US',
        },
      });

      expect(result).toBe('test-customer-123');
      expect(mockClient.customers.create).toHaveBeenCalledWith({
        name: 'John Doe',
        referenceId: 'test-member-789',
        addresses: [
          {
            addressLine1: '123 Main St',
            addressLine2: 'Apt 4B',
            city: 'Springfield',
            state: 'IL',
            postalCode: '62701',
            country: 'US',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '5550123456',
            isBilling: true,
          },
        ],
      });
    });

    it('throws if client is not configured', async () => {
      const provider = await getProviderWithClient(null);

      await expect(
        provider.createCustomer({
          organizationId: 'test-org-456',
          memberId: 'test-member-789',
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
        }),
      ).rejects.toThrow('IQPro client is not configured');
    });
  });

  describe('createPaymentMethod', () => {
    it('sends InsertCard with token when cardToken is provided (PCI-compliant path)', async () => {
      const provider = await getProviderWithClient();

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        paymentMethodId: 'test-pm-tokenized-001',
        last4: '4242',
      });

      const result = await provider.createPaymentMethod({
        customerId: 'test-customer-123',
        paymentMethod: 'card',
        cardholderName: 'John Doe',
        cardToken: 'tok_test_abc123',
        cardFirstSix: '424242',
        cardLastFour: '4242',
        cardExpiry: '12/25',
        cardCvc: '123',
      });

      expect(result).toEqual({
        paymentMethodId: 'test-pm-tokenized-001',
        last4: '4242',
      });

      expect(mockClient.customers.createPaymentMethod).toHaveBeenCalledWith(
        'test-customer-123',
        {
          card: {
            token: 'tok_test_abc123',
            expirationDate: '12/25',
            maskedCard: '424242******4242',
          },
          isDefault: true,
        },
      );
    });

    it('sends InsertCard with raw card number as token when cardToken is not provided (fallback path)', async () => {
      const provider = await getProviderWithClient();

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        paymentMethodId: 'test-pm-raw-001',
        last4: '1111',
      });

      const result = await provider.createPaymentMethod({
        customerId: 'test-customer-123',
        paymentMethod: 'card',
        cardholderName: 'John Doe',
        cardNumber: '4111111111111111',
        cardExpiry: '12/25',
        cardCvc: '123',
      });

      expect(result).toEqual({
        paymentMethodId: 'test-pm-raw-001',
        last4: '1111',
      });

      // BIN derived from cardNumber: first 6 digits = '411111'
      expect(mockClient.customers.createPaymentMethod).toHaveBeenCalledWith(
        'test-customer-123',
        {
          card: {
            token: '4111111111111111',
            expirationDate: '12/25',
            maskedCard: '411111******1111',
          },
          isDefault: true,
        },
      );
    });

    it('falls back to maskedCard last4 when last4 is not returned', async () => {
      const provider = await getProviderWithClient();

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        paymentMethodId: 'test-pm-card-789',
        card: { maskedCard: '****1234' },
      });

      const result = await provider.createPaymentMethod({
        customerId: 'test-customer-123',
        paymentMethod: 'card',
        cardholderName: 'John Doe',
        cardNumber: '4111111111111234',
        cardExpiry: '12/28',
        cardCvc: '123',
      });

      expect(result.last4).toBe('1234');
    });

    it('tokenizes ACH and passes achToken to payment method creation', async () => {
      const provider = await getProviderWithClient();
      const { tokenizeAch } = await import('@/libs/IQPro');

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        paymentMethodId: 'test-pm-ach-456',
        last4: '6789',
      });

      const result = await provider.createPaymentMethod({
        customerId: 'test-customer-123',
        paymentMethod: 'ach',
        achAccountHolder: 'John Doe',
        achRoutingNumber: '021000021',
        achAccountNumber: '123456789',
      });

      expect(result).toEqual({
        paymentMethodId: 'test-pm-ach-456',
        last4: '6789',
        achToken: 'ach-tok-test-001',
      });

      // Verify tokenizeAch was called with correct params
      expect(tokenizeAch).toHaveBeenCalledWith({
        accountNumber: '123456789',
        routingNumber: '021000021',
        secCode: 'WEB',
        achAccountType: 'Checking',
      });

      // Verify the tokenized achToken is used in the payment method creation
      expect(mockClient.customers.createPaymentMethod).toHaveBeenCalledWith(
        'test-customer-123',
        {
          ach: {
            token: 'ach-tok-test-001',
            secCode: 'WEB',
            routingNumber: '021000021',
            accountType: 'Checking',
            checkNumber: null,
            accountHolderAuth: { dlState: null, dlNumber: null },
          },
          isDefault: true,
        },
      );
    });

    it('passes Savings account type for ACH when specified', async () => {
      const provider = await getProviderWithClient();
      const { tokenizeAch } = await import('@/libs/IQPro');

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        paymentMethodId: 'test-pm-ach-savings',
        last4: '6789',
      });

      await provider.createPaymentMethod({
        customerId: 'test-customer-123',
        paymentMethod: 'ach',
        achAccountHolder: 'John Doe',
        achRoutingNumber: '021000021',
        achAccountNumber: '123456789',
        achAccountType: 'Savings',
      });

      expect(tokenizeAch).toHaveBeenCalledWith(
        expect.objectContaining({ achAccountType: 'Savings' }),
      );

      expect(mockClient.customers.createPaymentMethod).toHaveBeenCalledWith(
        'test-customer-123',
        expect.objectContaining({
          ach: expect.objectContaining({ accountType: 'Savings' }),
        }),
      );
    });

    it('propagates error when ACH tokenization fails', async () => {
      const provider = await getProviderWithClient();
      const { tokenizeAch } = await import('@/libs/IQPro');
      vi.mocked(tokenizeAch).mockRejectedValueOnce(new Error('Tokenization unavailable'));

      await expect(
        provider.createPaymentMethod({
          customerId: 'test-customer-123',
          paymentMethod: 'ach',
          achAccountHolder: 'John Doe',
          achRoutingNumber: '021000021',
          achAccountNumber: '123456789',
        }),
      ).rejects.toThrow('Tokenization unavailable');

      // Should NOT call createPaymentMethod when tokenization fails
      expect(mockClient.customers.createPaymentMethod).not.toHaveBeenCalled();
    });

    it('falls back to maskedAccount last4 for ACH when last4 is not returned', async () => {
      const provider = await getProviderWithClient();

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        paymentMethodId: 'test-pm-ach-789',
        ach: { maskedAccount: '****5678' },
      });

      const result = await provider.createPaymentMethod({
        customerId: 'test-customer-123',
        paymentMethod: 'ach',
        achAccountHolder: 'John Doe',
        achRoutingNumber: '021000021',
        achAccountNumber: '123455678',
      });

      expect(result.last4).toBe('5678');
    });
  });

  describe('processPayment', () => {
    it('converts amount from dollars to cents and includes Remit + customer payment method', async () => {
      const provider = await getProviderWithClient();

      mockClient.transactions.create.mockResolvedValue({
        id: 'test-tx-123',
        status: 'captured',
        processorResponseMessage: undefined,
      });

      await provider.processPayment({
        customerId: 'test-customer-123',
        paymentMethodId: 'test-pm-123',
        amount: 149.99,
        currency: 'USD',
        description: 'Monthly membership',
      });

      expect(mockClient.transactions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 14999,
          Remit: { totalAmount: 14999 },
          paymentMethod: {
            customer: {
              customerId: 'test-customer-123',
              customerPaymentMethodId: 'test-pm-123',
            },
          },
        }),
      );
    });

    it('maps approved status correctly for captured transactions', async () => {
      const provider = await getProviderWithClient();

      mockClient.transactions.create.mockResolvedValue({
        id: 'test-tx-approved',
        status: 'captured',
        processorResponseMessage: undefined,
      });

      const result = await provider.processPayment({
        customerId: 'test-customer-123',
        paymentMethodId: 'test-pm-123',
        amount: 50,
        currency: 'USD',
        description: 'Payment',
      });

      expect(result).toEqual({
        success: true,
        transactionId: 'test-tx-approved',
        status: 'approved',
        declineReason: undefined,
      });
    });

    it('maps declined status correctly for declined transactions', async () => {
      const provider = await getProviderWithClient();

      mockClient.transactions.create.mockResolvedValue({
        id: 'test-tx-declined',
        status: 'declined',
        processorResponseMessage: 'Insufficient funds',
      });

      const result = await provider.processPayment({
        customerId: 'test-customer-123',
        paymentMethodId: 'test-pm-123',
        amount: 100,
        currency: 'USD',
        description: 'Payment',
      });

      expect(result).toEqual({
        success: false,
        transactionId: 'test-tx-declined',
        status: 'declined',
        declineReason: 'Insufficient funds',
      });
    });

    it('returns declined with error message when transaction throws', async () => {
      const provider = await getProviderWithClient();

      mockClient.transactions.create.mockRejectedValue(new Error('Gateway timeout'));

      const result = await provider.processPayment({
        customerId: 'test-customer-123',
        paymentMethodId: 'test-pm-123',
        amount: 50,
        currency: 'USD',
        description: 'Payment',
      });

      expect(result).toEqual({
        success: false,
        status: 'declined',
        error: 'Gateway timeout',
      });
    });

    it('bypasses SDK and calls API directly for ACH transactions', async () => {
      const provider = await getProviderWithClient();

      mockClient.post.mockResolvedValue({
        data: {
          transaction: {
            transactionId: 'test-tx-ach',
            status: 'Captured',
          },
        },
      });

      const result = await provider.processPayment({
        customerId: 'test-customer-123',
        paymentMethodId: 'test-pm-ach-123',
        amount: 149,
        currency: 'USD',
        description: 'ACH Payment',
        ach: {
          achToken: 'ach-tok-123',
          secCode: 'WEB',
          routingNumber: '111111111',
          accountType: 'Checking',
        },
      });

      // Should NOT use SDK transactions.create for ACH
      expect(mockClient.transactions.create).not.toHaveBeenCalled();

      // Should call API directly via client.post
      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/gateway/test-gateway-001/transaction',
        expect.objectContaining({
          type: 'Sale',
          remit: {
            baseAmount: 149,
            totalAmount: 149,
            currencyCode: 'USD',
          },
          paymentMethod: {
            customer: {
              customerId: 'test-customer-123',
              customerPaymentMethodId: 'test-pm-ach-123',
            },
          },
          ach: {
            achToken: 'ach-tok-123',
            secCode: 'WEB',
            routingNumber: '111111111',
            accountType: 'Checking',
            checkNumber: null,
            accountHolderAuth: { dlState: null, dlNumber: null },
          },
          caption: 'ACH Payment',
        }),
      );

      expect(result).toEqual({
        success: true,
        transactionId: 'test-tx-ach',
        status: 'approved',
        declineReason: undefined,
      });
    });

    it('uses SDK transactions.create for card payments (no direct API call)', async () => {
      const provider = await getProviderWithClient();

      mockClient.transactions.create.mockResolvedValue({
        id: 'test-tx-card',
        status: 'captured',
      });

      await provider.processPayment({
        customerId: 'test-customer-123',
        paymentMethodId: 'test-pm-card-123',
        amount: 50,
        currency: 'USD',
        description: 'Card Payment',
      });

      // Card payments use SDK
      expect(mockClient.transactions.create).toHaveBeenCalled();

      // Should NOT call API directly for card payments
      expect(mockClient.post).not.toHaveBeenCalled();

      const callArgs = mockClient.transactions.create.mock.calls[0]![0] as Record<string, unknown>;

      expect(callArgs.ach).toBeUndefined();
    });
  });

  describe('createSubscription', () => {
    const baseSubscriptionParams = {
      customerId: 'test-customer-123',
      paymentMethodId: 'test-pm-123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '(555) 012-3456',
      address: {
        street: '123 Main St',
        apartment: 'Apt 4B',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        country: 'US',
      },
    };

    it('builds correct payload for monthly frequency via direct API call', async () => {
      const provider = await getProviderWithClient();

      mockClient.post.mockResolvedValue({
        data: { subscriptionId: 'test-sub-monthly-123' },
      });

      const startDate = new Date(2025, 2, 15); // March 15, 2025

      const result = await provider.createSubscription({
        ...baseSubscriptionParams,
        amount: 79,
        frequency: 'monthly',
        startDate,
        description: 'Monthly BJJ Membership',
      });

      expect(result).toEqual({
        success: true,
        subscriptionId: 'test-sub-monthly-123',
      });

      // Should bypass SDK and call API directly
      expect(mockClient.subscriptions.create).not.toHaveBeenCalled();
      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/gateway/test-gateway-001/subscription',
        expect.any(Object),
      );

      const callArgs = mockClient.post.mock.calls[0]![1] as Record<string, any>;

      // Required top-level fields
      expect(callArgs.prefix).toBe('MBR');
      expect(callArgs.subscriptionStatusId).toBe(1);

      // Recurrence — monthly uses billingPeriodId=4, no monthsOfYear
      expect(callArgs.recurrence.billingPeriodId).toBe(4);
      expect(callArgs.recurrence.schedule.minutes).toEqual([0]);
      expect(callArgs.recurrence.schedule.hours).toEqual([0]);
      expect(callArgs.recurrence.schedule.daysOfMonth).toEqual([15]);
      expect(callArgs.recurrence.schedule.monthsOfYear).toBeUndefined();
      expect(callArgs.recurrence.isAutoRenewed).toBe(true);
      expect(callArgs.recurrence.allowProration).toBe(false);
      expect(callArgs.recurrence.trialLengthInDays).toBe(0);
      expect(callArgs.recurrence.invoiceLengthInDays).toBe(1);

      // Two addresses: billing + remittance (must be separate)
      expect(callArgs.addresses).toHaveLength(2);
      expect(callArgs.addresses[0]).toEqual({
        isBilling: true,
        isShipping: false,
        isRemittance: false,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '5550123456',
        state: 'IL',
        country: 'US',
        addressLine1: '123 Main St',
        addressLine2: 'Apt 4B',
        city: 'Springfield',
        postalCode: '62701',
      });
      expect(callArgs.addresses[1]).toEqual({
        isBilling: false,
        isShipping: false,
        isRemittance: true,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        country: 'US',
      });

      // Payment method includes processor IDs
      expect(callArgs.paymentMethod.cardProcessorId).toBe('test-card-processor-001');
      expect(callArgs.paymentMethod.achProcessorId).toBe('test-ach-processor-001');

      // Line item — unitPrice in dollars (not cents), discount required
      expect(callArgs.lineItems[0].unitPrice).toBe(79);
      expect(callArgs.lineItems[0].discount).toBe(0);
      expect(callArgs.lineItems[0].unitOfMeasureId).toBe(3);
      expect(callArgs.lineItems[0].description).toBe('monthly membership payment');
    });

    it('builds correct payload for annual frequency', async () => {
      const provider = await getProviderWithClient();

      mockClient.post.mockResolvedValue({
        data: { subscriptionId: 'test-sub-annual-456' },
      });

      const startDate = new Date(2025, 5, 1); // June 1, 2025

      const result = await provider.createSubscription({
        ...baseSubscriptionParams,
        amount: 790,
        frequency: 'annual',
        startDate,
        description: 'Annual BJJ Membership',
      });

      expect(result).toEqual({
        success: true,
        subscriptionId: 'test-sub-annual-456',
      });

      const callArgs = mockClient.post.mock.calls[0]![1] as Record<string, any>;

      // Annual uses billingPeriodId=6, includes monthsOfYear with start month only
      expect(callArgs.recurrence.billingPeriodId).toBe(6);
      expect(callArgs.recurrence.schedule.monthsOfYear).toEqual([6]);
      expect(callArgs.recurrence.schedule.daysOfMonth).toEqual([1]);
      expect(callArgs.recurrence.schedule.minutes).toEqual([0]);
      expect(callArgs.recurrence.schedule.hours).toEqual([0]);

      // Line item — unitPrice in dollars (not cents), discount required
      expect(callArgs.lineItems[0].unitPrice).toBe(790);
      expect(callArgs.lineItems[0].discount).toBe(0);
      expect(callArgs.lineItems[0].unitOfMeasureId).toBe(4);
      expect(callArgs.lineItems[0].description).toBe('annual membership payment');
    });

    it('defaults country and state when no address is provided', async () => {
      const provider = await getProviderWithClient();

      mockClient.post.mockResolvedValue({
        data: { subscriptionId: 'test-sub-no-addr' },
      });

      const result = await provider.createSubscription({
        ...baseSubscriptionParams,
        phone: undefined,
        address: undefined,
        amount: 79,
        frequency: 'monthly',
        startDate: new Date(2025, 0, 1),
        description: 'Monthly Membership',
      });

      expect(result.success).toBe(true);

      const callArgs = mockClient.post.mock.calls[0]![1] as Record<string, any>;

      // Billing address defaults country to US and state to N/A
      expect(callArgs.addresses[0]).toEqual({
        isBilling: true,
        isShipping: false,
        isRemittance: false,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        state: 'N/A',
        country: 'US',
      });

      // Remittance address
      expect(callArgs.addresses[1]).toEqual({
        isBilling: false,
        isShipping: false,
        isRemittance: true,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        country: 'US',
      });
    });

    it('returns error when subscription creation fails', async () => {
      const provider = await getProviderWithClient();

      mockClient.post.mockRejectedValue(new Error('Subscription API error'));

      const result = await provider.createSubscription({
        ...baseSubscriptionParams,
        amount: 79,
        frequency: 'monthly',
        startDate: new Date(),
        description: 'Monthly Membership',
      });

      expect(result).toEqual({
        success: false,
        error: 'Subscription API error',
      });
    });
  });
});
