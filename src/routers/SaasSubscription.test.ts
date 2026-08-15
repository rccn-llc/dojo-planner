import type { AuditContext } from '@/types/Audit';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('./AuthGuards', () => ({ guardRole: vi.fn() }));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
vi.mock('@/services/ClerkRolesService', () => ({ getAcademyOwner: vi.fn() }));
vi.mock('@/services/PaymentProviderConfigService', () => ({ resolvePlatformIQProConfig: vi.fn() }));
vi.mock('@/services/SaasSubscriptionService', () => ({
  subscribe: vi.fn(),
  changePlan: vi.fn(),
  cancelSubscription: vi.fn(),
  getBillingHistory: vi.fn(),
  getCurrentSubscription: vi.fn(),
}));
vi.mock('@/libs/IQPro', () => ({ getTokenizationConfig: vi.fn() }));
vi.mock('@/libs/Logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const adminContext: AuditContext = {
  userId: 'user-admin',
  orgId: 'org-1',
  role: ORG_ROLE.ADMIN,
};

const platformConfig = {
  clientId: 'c',
  clientSecret: 's',
  gatewayId: 'g',
  scope: 'sc',
  oauthUrl: 'https://o',
  baseUrl: 'https://b',
  source: 'platform' as const,
};

const owner = { clerkUserId: 'user-owner', email: 'owner@e.com', firstName: 'Owen', lastName: 'Er' };

const subscribeInput = {
  orgName: 'Test Dojo',
  adminEmail: 'admin@e.com',
  planId: 'basic' as const,
  billingCycle: 'monthly' as const,
  cardToken: 'tok',
  cardFirstSix: '424242',
  cardLastFour: '4242',
  cardExpiry: '12/30',
};

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('SaasSubscription Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('subscribeToPlan', () => {
    it('throws when no academy owner is assigned in Clerk', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { resolvePlatformIQProConfig } = await import('@/services/PaymentProviderConfigService');
      const { getAcademyOwner } = await import('@/services/ClerkRolesService');
      const { subscribe } = await import('@/services/SaasSubscriptionService');

      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(resolvePlatformIQProConfig).mockResolvedValue(platformConfig);
      vi.mocked(getAcademyOwner).mockResolvedValue(null);

      const { subscribeToPlan } = await import('./SaasSubscription');

      await expect(callHandler(subscribeToPlan, subscribeInput)).rejects.toThrow(/Academy Owner/);
      expect(subscribe).not.toHaveBeenCalled();
    });

    it('passes the resolved owner and billing email to subscribe()', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { resolvePlatformIQProConfig } = await import('@/services/PaymentProviderConfigService');
      const { getAcademyOwner } = await import('@/services/ClerkRolesService');
      const { subscribe } = await import('@/services/SaasSubscriptionService');

      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(resolvePlatformIQProConfig).mockResolvedValue(platformConfig);
      vi.mocked(getAcademyOwner).mockResolvedValue(owner);
      vi.mocked(subscribe).mockResolvedValue({ success: true });

      const { subscribeToPlan } = await import('./SaasSubscription');
      const result = await callHandler(subscribeToPlan, subscribeInput);

      expect(result).toEqual({ success: true });
      expect(subscribe).toHaveBeenCalledWith(
        platformConfig,
        expect.objectContaining({
          orgId: 'org-1',
          responsibleClerkUserId: 'user-owner',
          adminEmail: 'owner@e.com',
        }),
      );
    });

    it('falls back to the input email when the owner has no email', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { resolvePlatformIQProConfig } = await import('@/services/PaymentProviderConfigService');
      const { getAcademyOwner } = await import('@/services/ClerkRolesService');
      const { subscribe } = await import('@/services/SaasSubscriptionService');

      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(resolvePlatformIQProConfig).mockResolvedValue(platformConfig);
      vi.mocked(getAcademyOwner).mockResolvedValue({ ...owner, email: '' });
      vi.mocked(subscribe).mockResolvedValue({ success: true });

      const { subscribeToPlan } = await import('./SaasSubscription');
      await callHandler(subscribeToPlan, subscribeInput);

      expect(subscribe).toHaveBeenCalledWith(
        platformConfig,
        expect.objectContaining({ adminEmail: 'admin@e.com' }),
      );
    });
  });

  describe('getCurrentPlan', () => {
    it('enriches the subscription with the responsible owner display info', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { auth } = await import('@clerk/nextjs/server');
      const { getAcademyOwner } = await import('@/services/ClerkRolesService');
      const { getCurrentSubscription } = await import('@/services/SaasSubscriptionService');

      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(auth).mockResolvedValue({ sessionClaims: {} } as any);
      vi.mocked(getCurrentSubscription).mockResolvedValue({
        planId: 'basic',
        planName: 'Basic',
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodEnd: null,
        isSuperAdmin: false,
        hasActiveSubscription: true,
        responsibleClerkUserId: 'user-owner',
      });
      vi.mocked(getAcademyOwner).mockResolvedValue(owner);

      const { getCurrentPlan } = await import('./SaasSubscription');
      const result = await callHandler(getCurrentPlan) as { responsibleOwner: unknown };

      expect(result.responsibleOwner).toEqual({ name: 'Owen Er', email: 'owner@e.com' });
    });

    it('returns null responsibleOwner when none exists', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { auth } = await import('@clerk/nextjs/server');
      const { getAcademyOwner } = await import('@/services/ClerkRolesService');
      const { getCurrentSubscription } = await import('@/services/SaasSubscriptionService');

      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(auth).mockResolvedValue({ sessionClaims: {} } as any);
      vi.mocked(getCurrentSubscription).mockResolvedValue({
        planId: null,
        planName: null,
        status: null,
        billingCycle: null,
        currentPeriodEnd: null,
        isSuperAdmin: false,
        hasActiveSubscription: false,
        responsibleClerkUserId: null,
      });
      vi.mocked(getAcademyOwner).mockResolvedValue(null);

      const { getCurrentPlan } = await import('./SaasSubscription');
      const result = await callHandler(getCurrentPlan) as { responsibleOwner: unknown };

      expect(result.responsibleOwner).toBeNull();
    });
  });
});
