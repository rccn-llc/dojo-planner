import type { AuditContext } from '@/types/Audit';

import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

// Mock all dependencies
vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('@/libs/Logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('./AuthGuards', () => ({
  guardRole: vi.fn(),
}));
vi.mock('@/services/AuditService', () => ({
  audit: vi.fn(),
}));
vi.mock('@/services/MemberPaymentService', () => ({
  processMemberPayment: vi.fn(),
  registerPaymentMethod: vi.fn(),
}));
vi.mock('@/libs/IQPro', () => ({
  getTokenizationConfig: vi.fn(),
}));
vi.mock('@/services/PaymentProviderConfigService', () => ({
  resolveIQProConfig: vi.fn(),
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

const mockContext: AuditContext = {
  userId: 'test-user-123',
  orgId: 'test-org-456',
  role: ORG_ROLE.FRONT_DESK,
};

const baseInput = {
  memberId: 'test-member-123',
  memberEmail: 'member@test.com',
  memberFirstName: 'John',
  memberLastName: 'Doe',
  paymentMethod: 'card' as const,
  billingType: 'one-time' as const,
  amount: 7900,
  description: 'Monthly membership payment',
};

// Helper to call ORPC handlers
function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('Payment Router', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resolveIQProConfig } = await import('@/services/PaymentProviderConfigService');
    vi.mocked(resolveIQProConfig).mockResolvedValue(testConfig);
  });

  describe('processPayment', () => {
    it('should return result on successful payment (approved)', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { processMemberPayment } = await import('@/services/MemberPaymentService');
      const { audit } = await import('@/services/AuditService');

      const mockResult = {
        success: true,
        status: 'approved' as const,
        transactionId: 'test-txn-789',
      };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(processMemberPayment).mockResolvedValue(mockResult);

      const { processPayment } = await import('./Payment');
      const result = await callHandler(processPayment, baseInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(processMemberPayment).toHaveBeenCalledWith(testConfig, {
        organizationId: 'test-org-456',
        ...baseInput,
      });
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.PAYMENT_PROCESS,
        AUDIT_ENTITY_TYPE.TRANSACTION,
        expect.objectContaining({
          entityId: 'test-txn-789',
          status: 'success',
          error: undefined,
        }),
      );
      expect(result).toEqual(mockResult);
    });

    it('should return result when payment is declined (not throw)', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { processMemberPayment } = await import('@/services/MemberPaymentService');
      const { audit } = await import('@/services/AuditService');

      const declinedResult = {
        success: false,
        status: 'declined' as const,
        declineReason: 'Insufficient funds',
        transactionId: 'test-txn-declined',
        error: 'Card declined',
      };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(processMemberPayment).mockResolvedValue(declinedResult);

      const { processPayment } = await import('./Payment');
      const result = await callHandler(processPayment, baseInput);

      expect(result).toEqual(declinedResult);
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.PAYMENT_PROCESS,
        AUDIT_ENTITY_TYPE.TRANSACTION,
        expect.objectContaining({
          entityId: 'test-txn-declined',
          status: 'failure',
          error: 'Card declined',
        }),
      );
    });

    it('should rethrow ORPCError from guardRole (unauthorized)', async () => {
      const { guardRole } = await import('./AuthGuards');

      const error = new ORPCError('UNAUTHORIZED', {
        message: 'Insufficient permissions',
      });
      vi.mocked(guardRole).mockRejectedValue(error);

      const { processPayment } = await import('./Payment');

      await expect(callHandler(processPayment, baseInput)).rejects.toThrow(error);
    });

    it('should wrap non-ORPC service errors in ORPCError with status 500', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { processMemberPayment } = await import('@/services/MemberPaymentService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(processMemberPayment).mockRejectedValue(
        new Error('Payment processing is not configured. Set IQPRO_* environment variables.'),
      );

      const { processPayment } = await import('./Payment');

      await expect(callHandler(processPayment, baseInput)).rejects.toThrow(
        new ORPCError('Payment processing failed. Please try again.', { status: 500 }),
      );

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.PAYMENT_PROCESS,
        AUDIT_ENTITY_TYPE.TRANSACTION,
        {
          status: 'failure',
          error: 'Payment processing is not configured. Set IQPRO_* environment variables.',
        },
      );
    });

    it('should rethrow ORPCError from service without wrapping', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { processMemberPayment } = await import('@/services/MemberPaymentService');

      const orpcError = new ORPCError('BAD_REQUEST', {
        message: 'Invalid payment data',
      });

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(processMemberPayment).mockRejectedValue(orpcError);

      const { processPayment } = await import('./Payment');

      await expect(callHandler(processPayment, baseInput)).rejects.toThrow(orpcError);
    });

    it('should audit with failure status when service throws', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { processMemberPayment } = await import('@/services/MemberPaymentService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(processMemberPayment).mockRejectedValue(new Error('Network timeout'));

      const { processPayment } = await import('./Payment');

      await expect(callHandler(processPayment, baseInput)).rejects.toThrow();

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.PAYMENT_PROCESS,
        AUDIT_ENTITY_TYPE.TRANSACTION,
        {
          status: 'failure',
          error: 'Network timeout',
        },
      );
    });

    it('should handle non-Error thrown values in catch block', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { processMemberPayment } = await import('@/services/MemberPaymentService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(processMemberPayment).mockRejectedValue('string error');

      const { processPayment } = await import('./Payment');

      await expect(callHandler(processPayment, baseInput)).rejects.toThrow(
        new ORPCError('Payment processing failed. Please try again.', { status: 500 }),
      );

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.PAYMENT_PROCESS,
        AUDIT_ENTITY_TYPE.TRANSACTION,
        {
          status: 'failure',
          error: 'Unknown error',
        },
      );
    });

    it('should log warning when payment is declined', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { processMemberPayment } = await import('@/services/MemberPaymentService');
      const { logger } = await import('@/libs/Logger');

      const declinedResult = {
        success: false,
        status: 'declined' as const,
        declineReason: 'Do not honor',
        transactionId: 'test-txn-warn',
      };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(processMemberPayment).mockResolvedValue(declinedResult);

      const { processPayment } = await import('./Payment');
      await callHandler(processPayment, baseInput);

      expect(logger.warn).toHaveBeenCalledWith('[Payment] Payment declined or failed', {
        memberId: 'test-member-123',
        status: 'declined',
        declineReason: 'Do not honor',
      });
    });
  });

  describe('getTokenizationIframeConfig', () => {
    it('should return tokenization config when IQPro is configured', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getTokenizationConfig } = await import('@/libs/IQPro');

      const mockConfig = {
        origin: 'http://localhost:3000',
        tokenizationId: 'test-token-ex-id',
        tokenScheme: 'test-scheme',
        authenticationKey: 'test-auth-key',
        timestamp: '2025-01-01T00:00:00Z',
        iframeScriptUrl: 'https://sandbox.api.basyspro.com/Iframe/iframe/iframe-v3.js',
      };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getTokenizationConfig).mockResolvedValue(mockConfig);

      const { getTokenizationIframeConfig } = await import('./Payment');
      const input = { origin: 'http://localhost:3000' };
      const result = await callHandler(getTokenizationIframeConfig, input);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getTokenizationConfig).toHaveBeenCalledWith(testConfig, 'http://localhost:3000');
      expect(result).toEqual(mockConfig);
    });

    it('should throw 503 when IQPro is not configured for the org', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { resolveIQProConfig } = await import('@/services/PaymentProviderConfigService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(resolveIQProConfig).mockResolvedValue(null);

      const { getTokenizationIframeConfig } = await import('./Payment');
      const input = { origin: 'http://localhost:3000' };

      await expect(callHandler(getTokenizationIframeConfig, input)).rejects.toThrow(
        /Payment processing is not configured/,
      );
    });

    it('should throw ORPCError when getTokenizationConfig fails', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getTokenizationConfig } = await import('@/libs/IQPro');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getTokenizationConfig).mockRejectedValue(new Error('OAuth failed'));

      const { getTokenizationIframeConfig } = await import('./Payment');
      const input = { origin: 'http://localhost:3000' };

      await expect(callHandler(getTokenizationIframeConfig, input)).rejects.toThrow(
        'Failed to load payment configuration.',
      );
    });

    it('should require FRONT_DESK role', async () => {
      const { guardRole } = await import('./AuthGuards');

      const error = new ORPCError('UNAUTHORIZED', {
        message: 'Insufficient permissions',
      });
      vi.mocked(guardRole).mockRejectedValue(error);

      const { getTokenizationIframeConfig } = await import('./Payment');
      const input = { origin: 'http://localhost:3000' };

      await expect(callHandler(getTokenizationIframeConfig, input)).rejects.toThrow(error);
    });
  });

  describe('registerPaymentMethod', () => {
    const registerInput = {
      memberId: 'test-member-123',
      memberEmail: 'member@test.com',
      memberFirstName: 'John',
      memberLastName: 'Doe',
      paymentMethod: 'card' as const,
    };

    it('should return result on successful registration', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { registerPaymentMethod: registerService } = await import('@/services/MemberPaymentService');
      const { audit } = await import('@/services/AuditService');

      const mockResult = {
        success: true,
        paymentMethodId: 'test-pm-001',
      };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(registerService).mockResolvedValue(mockResult);

      const { registerPaymentMethod } = await import('./Payment');
      const result = await callHandler(registerPaymentMethod, registerInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(registerService).toHaveBeenCalledWith(testConfig, {
        organizationId: 'test-org-456',
        ...registerInput,
      });
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.PAYMENT_METHOD_REGISTER,
        AUDIT_ENTITY_TYPE.PAYMENT_METHOD,
        {
          entityId: 'test-pm-001',
          status: 'success',
          error: undefined,
        },
      );
      expect(result).toEqual(mockResult);
    });

    it('should audit with failure status when registration fails', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { registerPaymentMethod: registerService } = await import('@/services/MemberPaymentService');
      const { audit } = await import('@/services/AuditService');

      const failResult = {
        success: false,
        error: 'Card tokenization failed',
      };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(registerService).mockResolvedValue(failResult);

      const { registerPaymentMethod } = await import('./Payment');
      const result = await callHandler(registerPaymentMethod, registerInput);

      expect(result).toEqual(failResult);
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.PAYMENT_METHOD_REGISTER,
        AUDIT_ENTITY_TYPE.PAYMENT_METHOD,
        {
          entityId: undefined,
          status: 'failure',
          error: 'Card tokenization failed',
        },
      );
    });

    it('should wrap non-ORPC errors in ORPCError with status 500', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { registerPaymentMethod: registerService } = await import('@/services/MemberPaymentService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(registerService).mockRejectedValue(new Error('Gateway timeout'));

      const { registerPaymentMethod } = await import('./Payment');

      await expect(callHandler(registerPaymentMethod, registerInput)).rejects.toThrow(
        new ORPCError('Failed to register payment method. Please try again.', { status: 500 }),
      );

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.PAYMENT_METHOD_REGISTER,
        AUDIT_ENTITY_TYPE.PAYMENT_METHOD,
        {
          status: 'failure',
          error: 'Gateway timeout',
        },
      );
    });

    it('should rethrow ORPCError without wrapping', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { registerPaymentMethod: registerService } = await import('@/services/MemberPaymentService');

      const orpcError = new ORPCError('BAD_REQUEST', {
        message: 'Invalid payment data',
      });

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(registerService).mockRejectedValue(orpcError);

      const { registerPaymentMethod } = await import('./Payment');

      await expect(callHandler(registerPaymentMethod, registerInput)).rejects.toThrow(orpcError);
    });
  });
});
