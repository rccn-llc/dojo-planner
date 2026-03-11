import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/libs/DB';

// Mock DB
vi.mock('@/libs/DB', () => ({
  db: {
    query: {
      organizationSchema: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

// Mock IQPro client
vi.mock('@/libs/IQPro', () => ({
  getIQProClient: vi.fn(),
  getGatewayProcessors: vi.fn().mockResolvedValue({
    cardProcessorId: 'test-card-processor-001',
    achProcessorId: 'test-ach-processor-001',
  }),
}));

// Mock logger
vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock drizzle-orm eq
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ _type: 'eq', value: val })),
}));

// Helper to mock findFirst with partial org data (avoids full schema type requirement)
const mockFindFirst = () => vi.mocked(db.query.organizationSchema.findFirst) as ReturnType<typeof vi.fn>;

function createMockClient() {
  return {
    customers: {
      create: vi.fn(),
      createPaymentMethod: vi.fn(),
    },
    subscriptions: {
      get: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
    },
    transactions: {
      getServiceContext: vi.fn().mockReturnValue({
        gatewayContext: { gatewayId: 'test-gateway-001' },
      }),
    },
    post: vi.fn(),
  };
}

describe('SaasSubscriptionService', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.resetModules();
    mockClient = createMockClient();
  });

  async function setupModule(client: ReturnType<typeof createMockClient> | null = mockClient) {
    const { getIQProClient } = await import('@/libs/IQPro');
    vi.mocked(getIQProClient).mockReturnValue(client as any);
    const { db } = await import('@/libs/DB');
    const service = await import('./SaasSubscriptionService');
    return { service, db };
  }

  // ===== getCurrentSubscription =====

  describe('getCurrentSubscription', () => {
    it('returns plan data from DB for an active subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: 'growth',
        iqproSubscriptionStatus: 'active',
        iqproBillingCycle: 'monthly',
        iqproCurrentPeriodEnd: 1700000000000,
      });

      const result = await service.getCurrentSubscription('test-org-123');

      expect(result).toEqual({
        planId: 'growth',
        planName: 'Growth',
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodEnd: 1700000000000,
        isSuperAdmin: false,
        hasActiveSubscription: true,
      });
    });

    it('returns plan data for a trial subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: 'basic',
        iqproSubscriptionStatus: 'trial',
        iqproBillingCycle: 'annual',
        iqproCurrentPeriodEnd: 1700000000000,
      });

      const result = await service.getCurrentSubscription('test-org-123');

      expect(result.hasActiveSubscription).toBe(true);
      expect(result.status).toBe('trial');
    });

    it('auto-grants Basic plan for super admin without active subscription', async () => {
      const { service, db } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: null,
        iqproSubscriptionStatus: null,
        iqproBillingCycle: null,
        iqproCurrentPeriodEnd: null,
      });

      const result = await service.getCurrentSubscription('test-org-123', 'aguilanegra');

      expect(result).toEqual({
        planId: 'basic',
        planName: 'Basic',
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodEnd: null,
        isSuperAdmin: true,
        hasActiveSubscription: true,
      });

      // Should have updated the DB with the auto-granted plan
      expect(db.update).toHaveBeenCalled();
    });

    it('does not auto-grant for super admin who already has an active subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: 'growth',
        iqproSubscriptionStatus: 'active',
        iqproBillingCycle: 'monthly',
        iqproCurrentPeriodEnd: 1700000000000,
      });

      const result = await service.getCurrentSubscription('test-org-123', 'aguilanegra');

      expect(result.planId).toBe('growth');
      expect(result.isSuperAdmin).toBe(true);
      expect(result.hasActiveSubscription).toBe(true);
    });

    it('returns null plan for non-super-admin without subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: null,
        iqproSubscriptionStatus: null,
        iqproBillingCycle: null,
        iqproCurrentPeriodEnd: null,
      });

      const result = await service.getCurrentSubscription('test-org-123', 'regularuser');

      expect(result).toEqual({
        planId: null,
        planName: null,
        status: null,
        billingCycle: null,
        currentPeriodEnd: null,
        isSuperAdmin: false,
        hasActiveSubscription: false,
      });
    });

    it('returns null plan when no username provided and no subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: null,
        iqproSubscriptionStatus: null,
        iqproBillingCycle: null,
        iqproCurrentPeriodEnd: null,
      });

      const result = await service.getCurrentSubscription('test-org-123');

      expect(result.planId).toBeNull();
      expect(result.isSuperAdmin).toBe(false);
      expect(result.hasActiveSubscription).toBe(false);
    });

    it('returns cancelled status as not active', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: 'basic',
        iqproSubscriptionStatus: 'cancelled',
        iqproBillingCycle: 'monthly',
        iqproCurrentPeriodEnd: 1700000000000,
      });

      const result = await service.getCurrentSubscription('test-org-123');

      expect(result.hasActiveSubscription).toBe(false);
      expect(result.status).toBe('cancelled');
    });

    it('auto-grants Basic for super admin with cancelled subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: 'basic',
        iqproSubscriptionStatus: 'cancelled',
        iqproBillingCycle: 'monthly',
        iqproCurrentPeriodEnd: null,
      });

      const result = await service.getCurrentSubscription('test-org-123', 'richardhoppes');

      expect(result.planId).toBe('basic');
      expect(result.status).toBe('active');
      expect(result.isSuperAdmin).toBe(true);
      expect(result.hasActiveSubscription).toBe(true);
    });
  });

  // ===== subscribe =====

  describe('subscribe', () => {
    const baseParams = {
      orgId: 'test-org-123',
      orgName: 'Test Dojo',
      adminEmail: 'admin@testdojo.com',
      planId: 'basic' as const,
      billingCycle: 'monthly' as const,
      cardToken: 'tok_test_abc123',
      cardFirstSix: '424242',
      cardLastFour: '4242',
      cardExpiry: '12/27',
    };

    it('creates customer, payment method, and subscription successfully', async () => {
      const { service, db } = await setupModule();

      // No existing customer
      mockFindFirst().mockResolvedValue({
        iqproCustomerId: null,
      });

      mockClient.customers.create.mockResolvedValue({
        customerId: 'iqpro-cust-001',
      });

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        customerPaymentMethodId: 'iqpro-pm-001',
        last4: '4242',
      });

      mockClient.post.mockResolvedValue({
        data: { subscriptionId: 'iqpro-sub-001' },
      });

      const result = await service.subscribe(baseParams);

      expect(result).toEqual({ success: true });

      // Customer created
      expect(mockClient.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Dojo',
          referenceId: 'test-org-123',
        }),
      );

      // Payment method created with maskedCard
      expect(mockClient.customers.createPaymentMethod).toHaveBeenCalledWith(
        'iqpro-cust-001',
        expect.objectContaining({
          card: {
            token: 'tok_test_abc123',
            expirationDate: '12/27',
            maskedCard: '424242******4242',
          },
          isDefault: true,
        }),
      );

      // Subscription created via API
      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/gateway/test-gateway-001/subscription',
        expect.objectContaining({
          customerId: 'iqpro-cust-001',
          subscriptionStatusId: 1,
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              unitPrice: 49,
              discount: 0,
              unitOfMeasureId: 3,
            }),
          ]),
        }),
      );

      // DB updated with subscription info
      expect(db.update).toHaveBeenCalled();
    });

    it('reuses existing IQPro customer if already present', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproCustomerId: 'existing-cust-001',
      });

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        customerPaymentMethodId: 'iqpro-pm-002',
      });

      mockClient.post.mockResolvedValue({
        data: { subscriptionId: 'iqpro-sub-002' },
      });

      const result = await service.subscribe(baseParams);

      expect(result.success).toBe(true);
      // Should NOT create a new customer
      expect(mockClient.customers.create).not.toHaveBeenCalled();
      // Should use existing customer ID for payment method
      expect(mockClient.customers.createPaymentMethod).toHaveBeenCalledWith(
        'existing-cust-001',
        expect.any(Object),
      );
    });

    it('returns error for unknown plan ID', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproCustomerId: 'existing-cust-001',
      });

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        customerPaymentMethodId: 'iqpro-pm-003',
      });

      const result = await service.subscribe({
        ...baseParams,
        planId: 'enterprise' as any,
      });

      expect(result).toEqual({ success: false, error: 'Invalid plan' });
    });

    it('builds annual subscription with correct billingPeriodId and schedule', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproCustomerId: 'existing-cust-001',
      });

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        customerPaymentMethodId: 'iqpro-pm-004',
      });

      mockClient.post.mockResolvedValue({
        data: { subscriptionId: 'iqpro-sub-annual' },
      });

      const result = await service.subscribe({
        ...baseParams,
        billingCycle: 'annual',
      });

      expect(result.success).toBe(true);

      const callArgs = mockClient.post.mock.calls[0]![1] as Record<string, any>;

      expect(callArgs.recurrence.billingPeriodId).toBe(6);
      expect(callArgs.recurrence.schedule.monthsOfYear).toBeDefined();
      expect(callArgs.lineItems[0].unitOfMeasureId).toBe(4);
      expect(callArgs.lineItems[0].unitPrice).toBe(348); // annual total for basic
    });

    it('falls back to cardNumber for maskedCard when token data not provided', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproCustomerId: 'existing-cust-001',
      });

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        customerPaymentMethodId: 'iqpro-pm-005',
      });

      mockClient.post.mockResolvedValue({
        data: { subscriptionId: 'iqpro-sub-003' },
      });

      await service.subscribe({
        ...baseParams,
        cardToken: undefined,
        cardFirstSix: undefined,
        cardLastFour: undefined,
        cardNumber: '4111111111111111',
      });

      expect(mockClient.customers.createPaymentMethod).toHaveBeenCalledWith(
        'existing-cust-001',
        expect.objectContaining({
          card: expect.objectContaining({
            token: '4111111111111111',
            maskedCard: '411111******1111',
          }),
        }),
      );
    });

    it('returns error when client.post throws', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproCustomerId: 'existing-cust-001',
      });

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        customerPaymentMethodId: 'iqpro-pm-006',
      });

      mockClient.post.mockRejectedValue(new Error('Gateway timeout'));

      const result = await service.subscribe(baseParams);

      expect(result).toEqual({ success: false, error: 'Gateway timeout' });
    });

    it('throws when IQPro client is not configured', async () => {
      const { service } = await setupModule(null);

      await expect(service.subscribe(baseParams)).rejects.toThrow('IQPro client is not configured');
    });

    it('extracts subscriptionId from response.data or response directly', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproCustomerId: 'existing-cust-001',
      });

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        customerPaymentMethodId: 'iqpro-pm-007',
      });

      // Response without nested data
      mockClient.post.mockResolvedValue({
        subscriptionId: 'iqpro-sub-direct',
      });

      const result = await service.subscribe(baseParams);

      expect(result.success).toBe(true);
    });

    it('throws when gateway context is missing', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproCustomerId: 'existing-cust-001',
      });

      mockClient.customers.createPaymentMethod.mockResolvedValue({
        customerPaymentMethodId: 'iqpro-pm-008',
      });

      mockClient.transactions.getServiceContext.mockReturnValue({});

      const result = await service.subscribe(baseParams);

      expect(result).toEqual({ success: false, error: 'Gateway context is required' });
    });
  });

  // ===== changePlan =====

  describe('changePlan', () => {
    it('updates subscription and DB with new plan details', async () => {
      const { service, db } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: 'iqpro-sub-001',
      });

      mockClient.subscriptions.update.mockResolvedValue({});

      const result = await service.changePlan('test-org-123', 'growth', 'monthly');

      expect(result).toEqual({ success: true });

      expect(mockClient.subscriptions.update).toHaveBeenCalledWith(
        'iqpro-sub-001',
        expect.objectContaining({
          name: 'Dojo Planner Growth Plan',
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              name: 'Growth Plan',
              unitPrice: 125,
              discount: 0,
              unitOfMeasureId: 3,
            }),
          ]),
        }),
      );

      expect(db.update).toHaveBeenCalled();
    });

    it('returns error when no active subscription exists', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: null,
      });

      const result = await service.changePlan('test-org-123', 'growth', 'monthly');

      expect(result).toEqual({ success: false, error: 'No active subscription to change' });
      expect(mockClient.subscriptions.update).not.toHaveBeenCalled();
    });

    it('returns error when org not found', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue(undefined);

      const result = await service.changePlan('test-org-123', 'growth', 'monthly');

      expect(result).toEqual({ success: false, error: 'No active subscription to change' });
    });

    it('returns error for unknown plan ID', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: 'iqpro-sub-001',
      });

      const result = await service.changePlan('test-org-123', 'enterprise' as any, 'monthly');

      expect(result).toEqual({ success: false, error: 'Invalid plan' });
    });

    it('handles annual billing cycle correctly', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: 'iqpro-sub-001',
      });

      mockClient.subscriptions.update.mockResolvedValue({});

      const result = await service.changePlan('test-org-123', 'growth', 'annual');

      expect(result.success).toBe(true);

      const callArgs = mockClient.subscriptions.update.mock.calls[0]![1] as Record<string, any>;

      expect(callArgs.lineItems[0].unitPrice).toBe(1188); // annual total for growth
      expect(callArgs.lineItems[0].unitOfMeasureId).toBe(4);
    });

    it('returns error when IQPro update fails', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: 'iqpro-sub-001',
      });

      mockClient.subscriptions.update.mockRejectedValue(new Error('Update failed'));

      const result = await service.changePlan('test-org-123', 'growth', 'monthly');

      expect(result).toEqual({ success: false, error: 'Update failed' });
    });
  });

  // ===== cancelSubscription =====

  describe('cancelSubscription', () => {
    it('cancels IQPro subscription and updates DB status', async () => {
      const { service, db } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: 'iqpro-sub-001',
      });

      mockClient.subscriptions.cancel.mockResolvedValue({});

      const result = await service.cancelSubscription('test-org-123', false);

      expect(result).toEqual({ success: true });

      expect(mockClient.subscriptions.cancel).toHaveBeenCalledWith(
        'iqpro-sub-001',
        { cancel: { now: true, endOfBillingPeriod: false } },
      );

      expect(db.update).toHaveBeenCalled();
    });

    it('cancels at end of billing period when endOfPeriod is true', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: 'iqpro-sub-001',
      });

      mockClient.subscriptions.cancel.mockResolvedValue({});

      const result = await service.cancelSubscription('test-org-123', true);

      expect(result).toEqual({ success: true });

      expect(mockClient.subscriptions.cancel).toHaveBeenCalledWith(
        'iqpro-sub-001',
        { cancel: { now: false, endOfBillingPeriod: true } },
      );
    });

    it('updates DB without calling IQPro when no subscription ID exists', async () => {
      const { service, db } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: null,
      });

      const result = await service.cancelSubscription('test-org-123', false);

      expect(result).toEqual({ success: true });

      // Should NOT call IQPro cancel
      expect(mockClient.subscriptions.cancel).not.toHaveBeenCalled();

      // Should still update DB to cancelled
      expect(db.update).toHaveBeenCalled();
    });

    it('returns error when IQPro cancel fails', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: 'iqpro-sub-001',
      });

      mockClient.subscriptions.cancel.mockRejectedValue(new Error('Cancel API error'));

      const result = await service.cancelSubscription('test-org-123', false);

      expect(result).toEqual({ success: false, error: 'Cancel API error' });
    });
  });

  // ===== getBillingHistory =====

  describe('getBillingHistory', () => {
    it('returns formatted invoices from IQPro subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: 'iqpro-sub-001',
      });

      mockClient.subscriptions.get.mockResolvedValue({
        data: {
          invoices: [
            {
              invoiceId: 'inv-001',
              status: { name: 'Paid' },
              amountCaptured: 49,
              invoiceDate: '2025-01-15',
              dueDate: '2025-01-15',
            },
            {
              invoiceId: 'inv-002',
              status: { name: 'Pending' },
              amountCaptured: 49,
              invoiceDate: '2025-02-15',
              dueDate: '2025-02-15',
            },
          ],
          paymentMethod: {
            customerPaymentMethod: {
              card: { maskedCard: '424242******4242' },
            },
          },
        },
      });

      const result = await service.getBillingHistory('test-org-123');

      expect(result).toEqual([
        {
          invoiceId: 'inv-001',
          status: 'Paid',
          amount: 49,
          invoiceDate: '2025-01-15',
          dueDate: '2025-01-15',
          paymentMethodLast4: '4242',
        },
        {
          invoiceId: 'inv-002',
          status: 'Pending',
          amount: 49,
          invoiceDate: '2025-02-15',
          dueDate: '2025-02-15',
          paymentMethodLast4: '4242',
        },
      ]);
    });

    it('returns empty array when no subscription exists', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: null,
      });

      const result = await service.getBillingHistory('test-org-123');

      expect(result).toEqual([]);
    });

    it('returns empty array when org not found', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue(undefined);

      const result = await service.getBillingHistory('test-org-123');

      expect(result).toEqual([]);
    });

    it('returns empty array when IQPro API call fails', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: 'iqpro-sub-001',
      });

      mockClient.subscriptions.get.mockRejectedValue(new Error('API error'));

      const result = await service.getBillingHistory('test-org-123');

      expect(result).toEqual([]);
    });

    it('handles invoices without status or payment method gracefully', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: 'iqpro-sub-001',
      });

      mockClient.subscriptions.get.mockResolvedValue({
        invoices: [
          {
            invoiceId: 'inv-003',
            amountCaptured: 99,
          },
        ],
      });

      const result = await service.getBillingHistory('test-org-123');

      expect(result).toEqual([
        {
          invoiceId: 'inv-003',
          status: null,
          amount: 99,
          invoiceDate: null,
          dueDate: null,
          paymentMethodLast4: null,
        },
      ]);
    });

    it('handles response with data wrapper vs direct response', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionId: 'iqpro-sub-001',
      });

      // Response without data wrapper
      mockClient.subscriptions.get.mockResolvedValue({
        invoices: [
          {
            invoiceId: 'inv-direct',
            status: { name: 'Paid' },
            amountCaptured: 125,
            invoiceDate: '2025-03-01',
            dueDate: '2025-03-01',
          },
        ],
        paymentMethod: {
          customerPaymentMethod: {
            card: { maskedCard: '555555******4444' },
          },
        },
      });

      const result = await service.getBillingHistory('test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]!.invoiceId).toBe('inv-direct');
      expect(result[0]!.paymentMethodLast4).toBe('4444');
    });
  });

  // ===== hasActiveSubscription =====

  describe('hasActiveSubscription', () => {
    it('returns true for active IQPro subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionStatus: 'active',
        stripeSubscriptionStatus: null,
      });

      const result = await service.hasActiveSubscription('test-org-123');

      expect(result).toBe(true);
    });

    it('returns true for trial IQPro subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionStatus: 'trial',
        stripeSubscriptionStatus: null,
      });

      const result = await service.hasActiveSubscription('test-org-123');

      expect(result).toBe(true);
    });

    it('returns true for active Stripe subscription (fallback)', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionStatus: null,
        stripeSubscriptionStatus: 'active',
      });

      const result = await service.hasActiveSubscription('test-org-123');

      expect(result).toBe(true);
    });

    it('returns false for cancelled IQPro and no Stripe subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionStatus: 'cancelled',
        stripeSubscriptionStatus: null,
      });

      const result = await service.hasActiveSubscription('test-org-123');

      expect(result).toBe(false);
    });

    it('returns false when org not found', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue(undefined);

      const result = await service.hasActiveSubscription('test-org-123');

      expect(result).toBe(false);
    });

    it('returns false when both subscriptions are null', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionStatus: null,
        stripeSubscriptionStatus: null,
      });

      const result = await service.hasActiveSubscription('test-org-123');

      expect(result).toBe(false);
    });

    it('returns false for cancelled IQPro even with non-active Stripe', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionStatus: 'cancelled',
        stripeSubscriptionStatus: 'past_due',
      });

      const result = await service.hasActiveSubscription('test-org-123');

      expect(result).toBe(false);
    });
  });
});
