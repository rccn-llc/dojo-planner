import type { ProcessMemberPaymentParams, RegisterPaymentMethodParams } from './MemberPaymentService';
import type { IPaymentProvider } from './PaymentProviderService';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────

const mockRandomUUID = vi.fn();

vi.mock('node:crypto', () => ({
  randomUUID: (...args: any[]) => mockRandomUUID(...args),
}));

vi.mock('@/libs/DB', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}));

vi.mock('@/models/Schema', () => ({
  memberSchema: {
    id: 'id',
    organizationId: 'organization_id',
    iqproCustomerId: 'iqpro_customer_id',
  },
  paymentMethodSchema: {
    id: 'id',
    memberId: 'member_id',
    iqproPaymentMethodId: 'iqpro_payment_method_id',
    type: 'type',
    last4: 'last4',
    isDefault: 'is_default',
  },
  transactionSchema: {
    id: 'id',
    organizationId: 'organization_id',
    memberId: 'member_id',
    memberMembershipId: 'member_membership_id',
    iqproTransactionId: 'iqpro_transaction_id',
    transactionType: 'transaction_type',
    amount: 'amount',
    currency: 'currency',
    status: 'status',
    paymentMethod: 'payment_method',
    description: 'description',
    processedAt: 'processed_at',
  },
  memberMembershipSchema: {
    id: 'id',
    iqproSubscriptionId: 'iqpro_subscription_id',
    billingType: 'billing_type',
    firstPaymentDate: 'first_payment_date',
    nextPaymentDate: 'next_payment_date',
  },
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./PaymentProviderService', () => ({
  isPaymentEnabled: vi.fn(() => true),
  getPaymentProvider: vi.fn(),
  resetPaymentProvider: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────

function setupDbMocks(db: any, options: {
  existingCustomerId?: string | null;
  captureInserts?: any[];
} = {}) {
  const { existingCustomerId = null, captureInserts } = options;

  // DB select chain
  const mockSelectLimit = vi.fn().mockResolvedValue([{ iqproCustomerId: existingCustomerId }]);
  const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  vi.mocked(db.select).mockReturnValue({ from: mockSelectFrom } as any);

  // DB update chain
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  vi.mocked(db.update).mockReturnValue({ set: mockUpdateSet } as any);

  // DB insert chain
  if (captureInserts) {
    vi.mocked(db.insert).mockImplementation(() => ({
      values: vi.fn((vals) => {
        captureInserts.push(vals);
        return Promise.resolve();
      }),
    }) as any);
  } else {
    const mockInsertValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: mockInsertValues } as any);
  }

  return { mockUpdateSet, mockUpdateWhere };
}

function makeBaseParams(overrides?: Partial<ProcessMemberPaymentParams>): ProcessMemberPaymentParams {
  return {
    organizationId: 'test-org-456',
    memberId: 'test-member-123',
    memberEmail: 'john@example.com',
    memberFirstName: 'John',
    memberLastName: 'Doe',
    paymentMethod: 'card',
    billingType: 'one-time',
    amount: 5000,
    description: 'Monthly membership',
    cardholderName: 'John Doe',
    cardNumber: '4111111111111111',
    cardExpiry: '12/28',
    cardCvc: '123',
    membershipPlanId: 'test-plan-001',
    memberMembershipId: 'test-mm-001',
    ...overrides,
  };
}

function makeMockProvider(overrides?: Partial<IPaymentProvider>): IPaymentProvider {
  return {
    createCustomer: vi.fn().mockResolvedValue('test-customer-789'),
    createPaymentMethod: vi.fn().mockResolvedValue({
      paymentMethodId: 'test-pm-ext-001',
      last4: '1111',
    }),
    processPayment: vi.fn().mockResolvedValue({
      success: true,
      transactionId: 'test-ext-tx-001',
      status: 'approved' as const,
    }),
    createSubscription: vi.fn().mockResolvedValue({
      success: true,
      subscriptionId: 'test-sub-001',
    }),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('MemberPaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset randomUUID mock to produce deterministic IDs per test
    mockRandomUUID
      .mockReturnValueOnce('test-uuid-pm-001')
      .mockReturnValueOnce('test-uuid-tx-001');
  });

  // ── 1. Payment not enabled ───────────────────────────────────────

  describe('when payment is not enabled', () => {
    it('should throw an error', async () => {
      const { isPaymentEnabled } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(false);

      const { processMemberPayment } = await import('./MemberPaymentService');

      await expect(processMemberPayment(makeBaseParams())).rejects.toThrow(
        'Payment processing is not configured',
      );
    });
  });

  // ── 2. Customer creation ─────────────────────────────────────────

  describe('customer management', () => {
    it('should create a new customer when none exists and store ID in DB', async () => {
      const mockProvider = makeMockProvider();

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      const { mockUpdateSet } = setupDbMocks(db, { existingCustomerId: null });

      const { processMemberPayment } = await import('./MemberPaymentService');
      const result = await processMemberPayment(makeBaseParams());

      expect(result.success).toBe(true);
      expect(mockProvider.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'test-org-456',
          memberId: 'test-member-123',
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
        }),
      );

      // Verify customer ID was stored in member table
      expect(db.update).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith({ iqproCustomerId: 'test-customer-789' });
    });

    // ── 3. Reuse existing customer ID ────────────────────────────

    it('should reuse existing customer ID from DB without creating a new one', async () => {
      const mockProvider = makeMockProvider();

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      setupDbMocks(db, { existingCustomerId: 'existing-cust-999' });

      const { processMemberPayment } = await import('./MemberPaymentService');
      const result = await processMemberPayment(makeBaseParams());

      expect(result.success).toBe(true);
      expect(mockProvider.createCustomer).not.toHaveBeenCalled();
    });
  });

  // ── 4. Payment method creation and persistence ───────────────────

  describe('payment method', () => {
    it('should create payment method via provider and persist to DB', async () => {
      const mockProvider = makeMockProvider();

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      const insertCalls: any[] = [];
      setupDbMocks(db, { existingCustomerId: null, captureInserts: insertCalls });

      const { processMemberPayment } = await import('./MemberPaymentService');
      await processMemberPayment(makeBaseParams());

      expect(mockProvider.createPaymentMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'test-customer-789',
          paymentMethod: 'card',
          cardholderName: 'John Doe',
          cardNumber: '4111111111111111',
          cardExpiry: '12/28',
          cardCvc: '123',
        }),
      );

      // Verify payment method was inserted to DB
      const pmInsert = insertCalls.find((c: any) => c.iqproPaymentMethodId === 'test-pm-ext-001');

      expect(pmInsert).toBeDefined();
      expect(pmInsert).toEqual(
        expect.objectContaining({
          id: 'test-uuid-pm-001',
          memberId: 'test-member-123',
          iqproPaymentMethodId: 'test-pm-ext-001',
          type: 'card',
          last4: '1111',
          isDefault: true,
        }),
      );
    });

    it('should pass cardToken through to provider when provided', async () => {
      const mockProvider = makeMockProvider();

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      setupDbMocks(db, { existingCustomerId: 'test-customer-789' });

      const { processMemberPayment } = await import('./MemberPaymentService');
      await processMemberPayment(makeBaseParams({
        cardToken: 'tok_test_abc123',
      }));

      expect(mockProvider.createPaymentMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          cardToken: 'tok_test_abc123',
        }),
      );
    });
  });

  // ── 5. One-time payment ──────────────────────────────────────────

  describe('one-time payment', () => {
    it('should process payment and create transaction record', async () => {
      const mockProvider = makeMockProvider();

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      const insertCalls: any[] = [];
      const { mockUpdateSet } = setupDbMocks(db, {
        existingCustomerId: 'test-customer-789',
        captureInserts: insertCalls,
      });

      const { processMemberPayment } = await import('./MemberPaymentService');
      const result = await processMemberPayment(makeBaseParams({
        billingType: 'one-time',
      }));

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          status: 'approved',
          transactionId: 'test-uuid-tx-001',
        }),
      );

      expect(mockProvider.processPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'test-customer-789',
          paymentMethodId: 'test-pm-ext-001',
          amount: 5000,
          currency: 'USD',
          description: 'Monthly membership',
        }),
      );

      // Transaction record should have been inserted
      const txInsert = insertCalls.find((c: any) => c.transactionType === 'membership_payment');

      expect(txInsert).toBeDefined();
      expect(txInsert).toEqual(
        expect.objectContaining({
          id: 'test-uuid-tx-001',
          organizationId: 'test-org-456',
          memberId: 'test-member-123',
          amount: 5000,
          currency: 'USD',
          status: 'paid',
          paymentMethod: 'card',
        }),
      );

      // Membership billing info should be updated
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          billingType: 'one-time',
          firstPaymentDate: expect.any(Date),
        }),
      );
    });
  });

  // ── 6. Autopay (subscription) ────────────────────────────────────

  describe('autopay', () => {
    it('should create subscription and update membership', async () => {
      const mockProvider = makeMockProvider();

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      const { mockUpdateSet } = setupDbMocks(db, { existingCustomerId: 'test-customer-789' });

      const { processMemberPayment } = await import('./MemberPaymentService');
      const result = await processMemberPayment(makeBaseParams({
        billingType: 'autopay',
        membershipPlanFrequency: 'monthly',
      }));

      expect(result).toEqual({
        success: true,
        status: 'approved',
      });

      expect(mockProvider.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'test-customer-789',
          paymentMethodId: 'test-pm-ext-001',
          amount: 5000,
          frequency: 'monthly',
          description: 'Monthly membership',
          startDate: expect.any(Date),
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          metadata: expect.objectContaining({
            organizationId: 'test-org-456',
            memberId: 'test-member-123',
            membershipPlanId: 'test-plan-001',
          }),
        }),
      );

      // Should NOT call processPayment for autopay
      expect(mockProvider.processPayment).not.toHaveBeenCalled();

      // Membership should be updated with subscription ID and dates
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          iqproSubscriptionId: 'test-sub-001',
          billingType: 'autopay',
          firstPaymentDate: expect.any(Date),
          nextPaymentDate: expect.any(Date),
        }),
      );
    });

    it('should use annual frequency when membershipPlanFrequency is annual', async () => {
      const mockProvider = makeMockProvider();

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      setupDbMocks(db, { existingCustomerId: 'test-customer-789' });

      const { processMemberPayment } = await import('./MemberPaymentService');
      const result = await processMemberPayment(makeBaseParams({
        billingType: 'autopay',
        membershipPlanFrequency: 'Annual',
      }));

      expect(result.success).toBe(true);
      expect(mockProvider.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ frequency: 'annual' }),
      );
    });

    it('should fall back to one-time payment when frequency is not monthly or annual', async () => {
      const mockProvider = makeMockProvider();

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      setupDbMocks(db, { existingCustomerId: 'test-customer-789' });

      const { processMemberPayment } = await import('./MemberPaymentService');
      const result = await processMemberPayment(makeBaseParams({
        billingType: 'autopay',
        membershipPlanFrequency: 'weekly', // not monthly or annual
      }));

      expect(result.success).toBe(true);
      // Should use processPayment, not createSubscription
      expect(mockProvider.processPayment).toHaveBeenCalled();
      expect(mockProvider.createSubscription).not.toHaveBeenCalled();
    });
  });

  // ── 7. Payment declined ──────────────────────────────────────────

  describe('payment declined', () => {
    it('should return success=false with decline reason for one-time payment', async () => {
      const mockProvider = makeMockProvider({
        processPayment: vi.fn().mockResolvedValue({
          success: false,
          transactionId: 'test-ext-tx-declined',
          status: 'declined' as const,
          declineReason: 'insufficient_funds',
          error: 'Card declined',
        }),
      });

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      const insertCalls: any[] = [];
      setupDbMocks(db, { existingCustomerId: 'test-customer-789', captureInserts: insertCalls });

      const { processMemberPayment } = await import('./MemberPaymentService');
      const result = await processMemberPayment(makeBaseParams());

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          status: 'declined',
          declineReason: 'insufficient_funds',
          error: 'Card declined',
          transactionId: 'test-uuid-tx-001',
        }),
      );

      // Transaction record should still be created with declined status
      const txInsert = insertCalls.find((c: any) => c.transactionType === 'membership_payment');

      expect(txInsert).toBeDefined();
      expect(txInsert.status).toBe('declined');
      expect(txInsert.processedAt).toBeNull();
    });

    it('should return success=false when subscription creation fails', async () => {
      const mockProvider = makeMockProvider({
        createSubscription: vi.fn().mockResolvedValue({
          success: false,
          error: 'Invalid payment method for recurring billing',
        }),
      });

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      setupDbMocks(db, { existingCustomerId: 'test-customer-789' });

      const { processMemberPayment } = await import('./MemberPaymentService');
      const result = await processMemberPayment(makeBaseParams({
        billingType: 'autopay',
        membershipPlanFrequency: 'monthly',
      }));

      expect(result).toEqual({
        success: false,
        status: 'declined',
        error: 'Invalid payment method for recurring billing',
      });
    });
  });

  // ── 8. Error handling ────────────────────────────────────────────

  describe('error handling', () => {
    it('should return declined status when provider throws an Error', async () => {
      const mockProvider = makeMockProvider({
        createPaymentMethod: vi.fn().mockRejectedValue(new Error('Gateway timeout')),
      });

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      setupDbMocks(db, { existingCustomerId: 'test-customer-789' });

      const { processMemberPayment } = await import('./MemberPaymentService');
      const result = await processMemberPayment(makeBaseParams());

      expect(result).toEqual({
        success: false,
        status: 'declined',
        error: 'Gateway timeout',
      });
    });

    it('should return "Unknown error" when provider throws a non-Error value', async () => {
      const mockProvider = makeMockProvider({
        createPaymentMethod: vi.fn().mockRejectedValue('string error'),
      });

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      setupDbMocks(db, { existingCustomerId: 'test-customer-789' });

      const { processMemberPayment } = await import('./MemberPaymentService');
      const result = await processMemberPayment(makeBaseParams());

      expect(result).toEqual({
        success: false,
        status: 'declined',
        error: 'Unknown error',
      });
    });

    it('should log the error when payment processing fails', async () => {
      const mockProvider = makeMockProvider({
        createCustomer: vi.fn().mockRejectedValue(new Error('Network error')),
      });

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      setupDbMocks(db, { existingCustomerId: null });

      const { logger } = await import('@/libs/Logger');

      const { processMemberPayment } = await import('./MemberPaymentService');
      await processMemberPayment(makeBaseParams());

      expect(logger.error).toHaveBeenCalledWith(
        '[MemberPayment] Payment processing failed',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
  });

  // ── 9. registerPaymentMethod ─────────────────────────────────────

  describe('registerPaymentMethod', () => {
    function makeRegisterParams(overrides?: Partial<RegisterPaymentMethodParams>): RegisterPaymentMethodParams {
      return {
        organizationId: 'test-org-456',
        memberId: 'test-member-123',
        memberEmail: 'john@example.com',
        memberFirstName: 'John',
        memberLastName: 'Doe',
        paymentMethod: 'card',
        cardholderName: 'John Doe',
        cardNumber: '4111111111111111',
        cardExpiry: '12/28',
        cardCvc: '123',
        ...overrides,
      };
    }

    it('should throw error when payment is not enabled', async () => {
      const { isPaymentEnabled } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(false);

      const { registerPaymentMethod } = await import('./MemberPaymentService');

      await expect(registerPaymentMethod(makeRegisterParams())).rejects.toThrow(
        'Payment processing is not configured',
      );
    });

    it('should register payment method successfully when no existing IQPro customer', async () => {
      mockRandomUUID.mockReset().mockReturnValueOnce('test-uuid-pm-001');

      const mockProvider = makeMockProvider();

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      const insertCalls: any[] = [];
      const { mockUpdateSet } = setupDbMocks(db, { existingCustomerId: null, captureInserts: insertCalls });

      const { registerPaymentMethod } = await import('./MemberPaymentService');
      const result = await registerPaymentMethod(makeRegisterParams());

      expect(result).toEqual({ success: true, paymentMethodId: 'test-uuid-pm-001' });

      // Should have created a new customer
      expect(mockProvider.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'test-org-456',
          memberId: 'test-member-123',
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
        }),
      );

      // Should have stored the new customer ID in DB
      expect(db.update).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith({ iqproCustomerId: 'test-customer-789' });

      // Should have created a payment method via provider
      expect(mockProvider.createPaymentMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'test-customer-789',
          paymentMethod: 'card',
          cardholderName: 'John Doe',
          cardNumber: '4111111111111111',
          cardExpiry: '12/28',
          cardCvc: '123',
        }),
      );

      // Should have inserted payment method record to DB
      const pmInsert = insertCalls.find((c: any) => c.iqproPaymentMethodId === 'test-pm-ext-001');

      expect(pmInsert).toBeDefined();
      expect(pmInsert).toEqual(
        expect.objectContaining({
          id: 'test-uuid-pm-001',
          memberId: 'test-member-123',
          iqproPaymentMethodId: 'test-pm-ext-001',
          type: 'card',
          last4: '1111',
          isDefault: true,
        }),
      );
    });

    it('should register payment method successfully when customer already exists', async () => {
      mockRandomUUID.mockReset().mockReturnValueOnce('test-uuid-pm-001');

      const mockProvider = makeMockProvider();

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      setupDbMocks(db, { existingCustomerId: 'existing-cust-999' });

      const { registerPaymentMethod } = await import('./MemberPaymentService');
      const result = await registerPaymentMethod(makeRegisterParams());

      expect(result).toEqual({ success: true, paymentMethodId: 'test-uuid-pm-001' });

      // Should NOT have created a new customer
      expect(mockProvider.createCustomer).not.toHaveBeenCalled();

      // Should still have created the payment method using the existing customer
      expect(mockProvider.createPaymentMethod).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'existing-cust-999' }),
      );
    });

    it('should return error on provider failure', async () => {
      const mockProvider = makeMockProvider({
        createPaymentMethod: vi.fn().mockRejectedValue(new Error('Card tokenization failed')),
      });

      const { isPaymentEnabled, getPaymentProvider } = await import('./PaymentProviderService');
      vi.mocked(isPaymentEnabled).mockReturnValue(true);
      vi.mocked(getPaymentProvider).mockResolvedValue(mockProvider);

      const { db } = await import('@/libs/DB');
      setupDbMocks(db, { existingCustomerId: 'existing-cust-999' });

      const { registerPaymentMethod } = await import('./MemberPaymentService');
      const result = await registerPaymentMethod(makeRegisterParams());

      expect(result).toEqual({
        success: false,
        error: 'Card tokenization failed',
      });
    });
  });
});
