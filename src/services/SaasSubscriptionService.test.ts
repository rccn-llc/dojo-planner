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

// Mock IQPro REST helpers
vi.mock('@/libs/IQPro', () => ({
  iqproPost: vi.fn(),
  iqproGet: vi.fn(),
  iqproPut: vi.fn(),
  getGatewayProcessors: vi.fn().mockResolvedValue({
    cardProcessorId: 'test-card-processor-001',
    achProcessorId: 'test-ach-processor-001',
  }),
}));

vi.mock('@/libs/Env', () => ({
  Env: {},
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

// Far-future period end (ms) so active/trial fixtures pass the expiry backstop
// in hasActiveSubscription/getCurrentSubscription regardless of when tests run.
const FUTURE_PERIOD_END = 4_000_000_000_000; // ~2096

describe('SaasSubscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function setupModule() {
    const iqpro = await import('@/libs/IQPro');
    const { db } = await import('@/libs/DB');
    const service = await import('./SaasSubscriptionService');
    return {
      service,
      db,
      iqproPost: vi.mocked(iqpro.iqproPost),
      iqproGet: vi.mocked(iqpro.iqproGet),
      iqproPut: vi.mocked(iqpro.iqproPut),
    };
  }

  // ===== getCurrentSubscription =====

  describe('getCurrentSubscription', () => {
    it('returns plan data from DB for an active subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: 'growth',
        iqproSubscriptionStatus: 'active',
        iqproBillingCycle: 'monthly',
        iqproCurrentPeriodEnd: FUTURE_PERIOD_END,
      });

      const result = await service.getCurrentSubscription('test-org-123');

      expect(result).toEqual({
        planId: 'growth',
        planName: 'Growth',
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodEnd: FUTURE_PERIOD_END,
        isSuperAdmin: false,
        hasActiveSubscription: true,
        responsibleClerkUserId: null,
      });
    });

    it('returns the responsible clerk user id when set', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: 'growth',
        iqproSubscriptionStatus: 'active',
        iqproBillingCycle: 'monthly',
        iqproCurrentPeriodEnd: FUTURE_PERIOD_END,
        iqproSaasResponsibleClerkUserId: 'user-owner-1',
      });

      const result = await service.getCurrentSubscription('test-org-123');

      expect(result.responsibleClerkUserId).toBe('user-owner-1');
    });

    it('returns plan data for a trial subscription', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: 'basic',
        iqproSubscriptionStatus: 'trial',
        iqproBillingCycle: 'annual',
        iqproCurrentPeriodEnd: FUTURE_PERIOD_END,
      });

      const result = await service.getCurrentSubscription('test-org-123');

      expect(result.hasActiveSubscription).toBe(true);
      expect(result.status).toBe('trial');
    });

    it('reports hasActiveSubscription=false when an active plan is past its period end', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionPlanId: 'growth',
        iqproSubscriptionStatus: 'active',
        iqproBillingCycle: 'monthly',
        iqproCurrentPeriodEnd: Date.now() - 10 * 24 * 60 * 60 * 1000, // expired beyond grace
      });

      const result = await service.getCurrentSubscription('test-org-123');

      expect(result.status).toBe('active'); // raw status preserved
      expect(result.hasActiveSubscription).toBe(false); // but treated as inactive
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
        responsibleClerkUserId: null,
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
        iqproCurrentPeriodEnd: FUTURE_PERIOD_END,
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
        responsibleClerkUserId: null,
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
        iqproCurrentPeriodEnd: FUTURE_PERIOD_END,
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
      const { service, db, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: null });

      iqproPost
        // 1. customer create
        .mockResolvedValueOnce({ data: { customerId: 'iqpro-cust-001' } })
        // 2. payment method create
        .mockResolvedValueOnce({ data: { customerPaymentMethodId: 'iqpro-pm-001', last4: '4242' } })
        // 3. subscription create
        .mockResolvedValueOnce({ data: { subscriptionId: 'iqpro-sub-001' } })
        // 4. immediate first-period Sale
        .mockResolvedValueOnce({ data: { transaction: { transactionId: 'iqpro-tx-001', status: 'captured' } } });

      const result = await service.subscribe(testConfig, baseParams);

      expect(result).toEqual({ success: true });

      // Immediate first-period Sale charged the saved payment method.
      expect(iqproPost).toHaveBeenNthCalledWith(
        4,
        testConfig,
        '/api/gateway/test-gateway-001/transaction',
        expect.objectContaining({
          type: 'Sale',
          paymentMethod: expect.objectContaining({
            customer: expect.objectContaining({
              customerId: 'iqpro-cust-001',
              customerPaymentMethodId: 'iqpro-pm-001',
            }),
          }),
        }),
      );

      // Customer created
      expect(iqproPost).toHaveBeenNthCalledWith(
        1,
        testConfig,
        '/api/gateway/test-gateway-001/customer',
        expect.objectContaining({
          name: 'Test Dojo',
          referenceId: 'test-org-123',
        }),
      );

      // Payment method created with maskedCard
      expect(iqproPost).toHaveBeenNthCalledWith(
        2,
        testConfig,
        '/api/gateway/test-gateway-001/customer/iqpro-cust-001/payment',
        expect.objectContaining({
          card: {
            token: 'tok_test_abc123',
            expirationDate: '12/27',
            maskedCard: '424242******4242',
          },
          isDefault: true,
        }),
      );

      // Subscription created
      expect(iqproPost).toHaveBeenNthCalledWith(
        3,
        testConfig,
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

      expect(db.update).toHaveBeenCalled();
    });

    it('persists the responsible clerk user id when provided', async () => {
      const { service, db, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'existing-cust-001' });

      iqproPost
        .mockResolvedValueOnce({ data: { customerPaymentMethodId: 'iqpro-pm-009' } })
        .mockResolvedValueOnce({ data: { subscriptionId: 'iqpro-sub-009' } })
        .mockResolvedValueOnce({ data: { transaction: { transactionId: 'iqpro-tx-009', status: 'captured' } } });

      const result = await service.subscribe(testConfig, {
        ...baseParams,
        responsibleClerkUserId: 'user-owner-99',
      });

      expect(result.success).toBe(true);

      // The final update() that writes the subscription fields must include the
      // responsible owner. db.update returns a fixed { set } chain mock.
      const updateResults = vi.mocked(db.update).mock.results;
      const setMock = updateResults[updateResults.length - 1]!.value.set as ReturnType<typeof vi.fn>;
      const persisted = setMock.mock.calls.find(
        ([arg]) => arg && 'iqproSubscriptionStatus' in arg,
      )?.[0];

      expect(persisted).toMatchObject({
        iqproSubscriptionStatus: 'active',
        iqproSaasResponsibleClerkUserId: 'user-owner-99',
      });
    });

    it('reuses existing IQPro customer if already present', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'existing-cust-001' });

      iqproPost
        // No customer call — straight to payment method
        .mockResolvedValueOnce({ data: { customerPaymentMethodId: 'iqpro-pm-002' } })
        .mockResolvedValueOnce({ data: { subscriptionId: 'iqpro-sub-002' } })
        .mockResolvedValueOnce({ data: { transaction: { transactionId: 'iqpro-tx-002', status: 'captured' } } });

      const result = await service.subscribe(testConfig, baseParams);

      expect(result.success).toBe(true);
      // Three calls: payment method + subscription + immediate Sale. No customer create.
      expect(iqproPost).toHaveBeenCalledTimes(3);
      expect(iqproPost).toHaveBeenNthCalledWith(
        1,
        testConfig,
        '/api/gateway/test-gateway-001/customer/existing-cust-001/payment',
        expect.any(Object),
      );
    });

    it('returns error for unknown plan ID', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'existing-cust-001' });

      iqproPost.mockResolvedValueOnce({ data: { customerPaymentMethodId: 'iqpro-pm-003' } });

      const result = await service.subscribe(testConfig, { ...baseParams, planId: 'enterprise' as any });

      expect(result).toEqual({ success: false, error: 'Invalid plan' });
    });

    it('builds annual subscription with correct billingPeriodId and schedule', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'existing-cust-001' });

      iqproPost
        .mockResolvedValueOnce({ data: { customerPaymentMethodId: 'iqpro-pm-004' } })
        .mockResolvedValueOnce({ data: { subscriptionId: 'iqpro-sub-annual' } })
        .mockResolvedValueOnce({ data: { transaction: { transactionId: 'iqpro-tx-annual', status: 'captured' } } });

      const result = await service.subscribe(testConfig, { ...baseParams, billingCycle: 'annual' });

      expect(result.success).toBe(true);

      const subPayload = iqproPost.mock.calls[1]![2] as Record<string, any>;

      expect(subPayload.recurrence.billingPeriodId).toBe(6);
      expect(subPayload.recurrence.schedule.monthsOfYear).toBeDefined();
      expect(subPayload.lineItems[0].unitOfMeasureId).toBe(4);
      expect(subPayload.lineItems[0].unitPrice).toBe(348); // annual total for basic
    });

    it('falls back to cardNumber for maskedCard when token data not provided', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'existing-cust-001' });

      iqproPost
        .mockResolvedValueOnce({ data: { customerPaymentMethodId: 'iqpro-pm-005' } })
        .mockResolvedValueOnce({ data: { subscriptionId: 'iqpro-sub-003' } })
        .mockResolvedValueOnce({ data: { transaction: { transactionId: 'iqpro-tx-003', status: 'captured' } } });

      await service.subscribe(testConfig, {
        ...baseParams,
        cardToken: undefined,
        cardFirstSix: undefined,
        cardLastFour: undefined,
        cardNumber: '4111111111111111',
      });

      const pmPayload = iqproPost.mock.calls[0]![2] as Record<string, any>;

      expect(pmPayload.card.token).toBe('4111111111111111');
      expect(pmPayload.card.maskedCard).toBe('411111******1111');
    });

    it('returns error when subscription POST throws', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'existing-cust-001' });

      iqproPost
        .mockResolvedValueOnce({ data: { customerPaymentMethodId: 'iqpro-pm-006' } })
        .mockRejectedValueOnce(new Error('Gateway timeout'));

      const result = await service.subscribe(testConfig, baseParams);

      expect(result).toEqual({ success: false, error: 'Gateway timeout' });
    });

    it('extracts subscriptionId from response.data or response directly', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'existing-cust-001' });

      iqproPost
        .mockResolvedValueOnce({ data: { customerPaymentMethodId: 'iqpro-pm-007' } })
        // Response without nested data wrapper
        .mockResolvedValueOnce({ subscriptionId: 'iqpro-sub-direct' })
        .mockResolvedValueOnce({ data: { transaction: { transactionId: 'iqpro-tx-direct', status: 'captured' } } });

      const result = await service.subscribe(testConfig, baseParams);

      expect(result.success).toBe(true);
    });

    it('returns failure (and does not activate) when the immediate charge is declined', async () => {
      const { service, db, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'existing-cust-001' });

      iqproPost
        .mockResolvedValueOnce({ data: { customerPaymentMethodId: 'iqpro-pm-dec' } })
        .mockResolvedValueOnce({ data: { subscriptionId: 'iqpro-sub-dec' } })
        // Immediate Sale declined
        .mockResolvedValueOnce({ data: { transaction: { transactionId: 'iqpro-tx-dec', status: 'declined', processorResponseText: 'Card declined' } } });

      const result = await service.subscribe(testConfig, baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/first charge failed/i);

      // The org must NOT be marked active: only the payment-method update should
      // have run (the activation update happens after a successful charge).
      const setCalls = vi.mocked(db.update).mock.results.flatMap(r => (r.value.set as ReturnType<typeof vi.fn>).mock.calls);
      const activated = setCalls.some(([arg]) => arg && arg.iqproSubscriptionStatus === 'active');

      expect(activated).toBe(false);
    });
  });

  // ===== changePlan =====

  describe('changePlan', () => {
    it('updates subscription and DB with new plan details', async () => {
      const { service, db, iqproPut } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproSubscriptionId: 'iqpro-sub-001' });
      iqproPut.mockResolvedValueOnce({});

      const result = await service.changePlan(testConfig, 'test-org-123', 'growth', 'monthly');

      expect(result).toEqual({ success: true });

      expect(iqproPut).toHaveBeenCalledWith(
        testConfig,
        '/api/gateway/test-gateway-001/subscription/iqpro-sub-001',
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
      const { service, iqproPut } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproSubscriptionId: null });

      const result = await service.changePlan(testConfig, 'test-org-123', 'growth', 'monthly');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no active paid subscription/i);
      expect(iqproPut).not.toHaveBeenCalled();
    });

    it('returns error when org not found', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue(undefined);

      const result = await service.changePlan(testConfig, 'test-org-123', 'growth', 'monthly');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no active paid subscription/i);
    });

    it('rejects a synthetic seed subscription without calling IQPro', async () => {
      const { service, iqproPut } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproSubscriptionId: 'seed_org_sub_abc' });

      const result = await service.changePlan(testConfig, 'test-org-123', 'growth', 'monthly');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no active paid subscription/i);
      expect(iqproPut).not.toHaveBeenCalled();
    });

    it('returns error for unknown plan ID', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproSubscriptionId: 'iqpro-sub-001' });

      const result = await service.changePlan(testConfig, 'test-org-123', 'enterprise' as any, 'monthly');

      expect(result).toEqual({ success: false, error: 'Invalid plan' });
    });

    it('handles annual billing cycle correctly', async () => {
      const { service, iqproPut } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproSubscriptionId: 'iqpro-sub-001' });
      iqproPut.mockResolvedValueOnce({});

      const result = await service.changePlan(testConfig, 'test-org-123', 'growth', 'annual');

      expect(result.success).toBe(true);

      const callArgs = iqproPut.mock.calls[0]![2] as Record<string, any>;

      expect(callArgs.lineItems[0].unitPrice).toBe(1188); // annual total for growth
      expect(callArgs.lineItems[0].unitOfMeasureId).toBe(4);
    });

    it('returns error when IQPro update fails', async () => {
      const { service, iqproPut } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproSubscriptionId: 'iqpro-sub-001' });
      iqproPut.mockRejectedValue(new Error('Update failed'));

      const result = await service.changePlan(testConfig, 'test-org-123', 'growth', 'monthly');

      expect(result).toEqual({ success: false, error: 'Update failed' });
    });
  });

  // ===== cancelSubscription =====

  describe('cancelSubscription', () => {
    it('cancels IQPro subscription and updates DB status', async () => {
      const { service, db, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproSubscriptionId: 'iqpro-sub-001' });
      iqproPost.mockResolvedValueOnce({});

      const result = await service.cancelSubscription(testConfig, 'test-org-123', false);

      expect(result).toEqual({ success: true });

      expect(iqproPost).toHaveBeenCalledWith(
        testConfig,
        '/api/gateway/test-gateway-001/subscription/iqpro-sub-001/cancel',
        { cancel: { now: true, endOfBillingPeriod: false } },
      );

      expect(db.update).toHaveBeenCalled();
    });

    it('cancels at end of billing period when endOfPeriod is true', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproSubscriptionId: 'iqpro-sub-001' });
      iqproPost.mockResolvedValueOnce({});

      const result = await service.cancelSubscription(testConfig, 'test-org-123', true);

      expect(result).toEqual({ success: true });

      expect(iqproPost).toHaveBeenCalledWith(
        testConfig,
        '/api/gateway/test-gateway-001/subscription/iqpro-sub-001/cancel',
        { cancel: { now: false, endOfBillingPeriod: true } },
      );
    });

    it('rejects when no subscription ID exists, without calling IQPro or mutating state', async () => {
      const { service, db, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproSubscriptionId: null });

      const result = await service.cancelSubscription(testConfig, 'test-org-123', false);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no active paid subscription/i);
      expect(iqproPost).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('rejects a synthetic seed subscription without calling IQPro or mutating state', async () => {
      const { service, db, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproSubscriptionId: 'seed_org_sub_xyz' });

      const result = await service.cancelSubscription(testConfig, 'test-org-123', false);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no active paid subscription/i);
      expect(iqproPost).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('returns error when IQPro cancel fails', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproSubscriptionId: 'iqpro-sub-001' });
      iqproPost.mockRejectedValue(new Error('Cancel API error'));

      const result = await service.cancelSubscription(testConfig, 'test-org-123', false);

      expect(result).toEqual({ success: false, error: 'Cancel API error' });
    });
  });

  // ===== getBillingHistory =====

  describe('getBillingHistory', () => {
    it('searches transactions by the org customer id and maps them', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'iqpro-cust-001' });

      iqproPost.mockResolvedValueOnce({
        data: {
          results: [
            { transactionId: 'tx-001', status: 'Settled', amountCaptured: 49, createdDateTime: '2025-02-15', maskedCard: '424242******4242' },
            { transactionId: 'tx-002', statusDescription: 'Captured', amount: 49, createdDateTime: '2025-01-15', maskedCard: '424242******1111' },
          ],
        },
      });

      const result = await service.getBillingHistory(testConfig, 'test-org-123');

      expect(result).toEqual([
        { invoiceId: 'tx-001', status: 'Settled', amount: 49, invoiceDate: '2025-02-15', dueDate: null, paymentMethodLast4: '4242' },
        { invoiceId: 'tx-002', status: 'Captured', amount: 49, invoiceDate: '2025-01-15', dueDate: null, paymentMethodLast4: '1111' },
      ]);

      expect(iqproPost).toHaveBeenCalledWith(
        testConfig,
        '/api/gateway/test-gateway-001/transaction/search',
        expect.objectContaining({
          customerId: { operator: 'Equal', value: 'iqpro-cust-001' },
        }),
      );
    });

    it('returns empty array when the org has no IQPro customer', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: null });

      const result = await service.getBillingHistory(testConfig, 'test-org-123');

      expect(result).toEqual([]);
      expect(iqproPost).not.toHaveBeenCalled();
    });

    it('returns empty array when org not found', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue(undefined);

      const result = await service.getBillingHistory(testConfig, 'test-org-123');

      expect(result).toEqual([]);
    });

    it('returns empty array when the search API call fails', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'iqpro-cust-001' });
      iqproPost.mockRejectedValueOnce(new Error('API error'));

      const result = await service.getBillingHistory(testConfig, 'test-org-123');

      expect(result).toEqual([]);
    });

    it('handles transactions without status or card gracefully', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'iqpro-cust-001' });
      iqproPost.mockResolvedValueOnce({
        data: { results: [{ transactionId: 'tx-003', amount: 99 }] },
      });

      const result = await service.getBillingHistory(testConfig, 'test-org-123');

      expect(result).toEqual([
        { invoiceId: 'tx-003', status: null, amount: 99, invoiceDate: null, dueDate: null, paymentMethodLast4: null },
      ]);
    });

    it('handles a response without the data wrapper', async () => {
      const { service, iqproPost } = await setupModule();

      mockFindFirst().mockResolvedValue({ iqproCustomerId: 'iqpro-cust-001' });
      iqproPost.mockResolvedValueOnce({
        results: [{ transactionId: 'tx-direct', status: 'Settled', amountCaptured: 125, createdDateTime: '2025-03-01', maskedCard: '555555******4444' }],
      });

      const result = await service.getBillingHistory(testConfig, 'test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]!.invoiceId).toBe('tx-direct');
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

    // ----- expiry backstop -----

    const DAY_MS = 24 * 60 * 60 * 1000;

    it('returns true for active subscription with a future period end', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionStatus: 'active',
        iqproCurrentPeriodEnd: Date.now() + 10 * DAY_MS,
        stripeSubscriptionStatus: null,
      });

      expect(await service.hasActiveSubscription('test-org-123')).toBe(true);
    });

    it('returns false for active subscription expired beyond the grace window', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionStatus: 'active',
        iqproCurrentPeriodEnd: Date.now() - 10 * DAY_MS, // well past the 3-day grace
        stripeSubscriptionStatus: null,
      });

      expect(await service.hasActiveSubscription('test-org-123')).toBe(false);
    });

    it('still active within the grace window just after period end', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionStatus: 'active',
        iqproCurrentPeriodEnd: Date.now() - 1 * DAY_MS, // within 3-day grace
        stripeSubscriptionStatus: null,
      });

      expect(await service.hasActiveSubscription('test-org-123')).toBe(true);
    });

    it('treats trial with an expired period end as inactive', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionStatus: 'trial',
        iqproCurrentPeriodEnd: Date.now() - 10 * DAY_MS,
        stripeSubscriptionStatus: null,
      });

      expect(await service.hasActiveSubscription('test-org-123')).toBe(false);
    });

    it('treats a null period end as non-expiring (active)', async () => {
      const { service } = await setupModule();

      mockFindFirst().mockResolvedValue({
        iqproSubscriptionStatus: 'active',
        iqproCurrentPeriodEnd: null,
        stripeSubscriptionStatus: null,
      });

      expect(await service.hasActiveSubscription('test-org-123')).toBe(true);
    });
  });
});
