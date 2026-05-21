import type { AuditContext } from '@/types/Audit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('./AuthGuards', () => ({ guardRole: vi.fn() }));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
vi.mock('@/services/IQProConfigService', () => ({
  getPlatformConfigForAdmin: vi.fn(),
  updatePlatformConfig: vi.fn(),
}));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));

const adminContext: AuditContext = { userId: 'u1', orgId: 'org-1', role: ORG_ROLE.ADMIN };

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('PlatformSettings Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlatformConfig', () => {
    it('rejects non-super-admin admins', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(auth).mockResolvedValue({ sessionClaims: { username: 'random-admin' } } as never);

      const { getPlatformConfig } = await import('./PlatformSettings');

      await expect(callHandler(getPlatformConfig)).rejects.toThrow(/super admin/i);
    });

    it('returns the projection for super-admin users', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { auth } = await import('@clerk/nextjs/server');
      const { getPlatformConfigForAdmin } = await import('@/services/IQProConfigService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(auth).mockResolvedValue({ sessionClaims: { username: 'aguilanegra' } } as never);
      vi.mocked(getPlatformConfigForAdmin).mockResolvedValue({
        clientId: 'pcid',
        gatewayId: 'pgid',
        hasSecret: false,
        source: 'env',
      });

      const { getPlatformConfig } = await import('./PlatformSettings');
      const result = await callHandler(getPlatformConfig);

      expect(result).toEqual({ clientId: 'pcid', gatewayId: 'pgid', hasSecret: false, source: 'env' });
    });
  });

  describe('updatePlatformConfigHandler', () => {
    it('persists and emits a success audit (with secret redacted)', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { auth } = await import('@clerk/nextjs/server');
      const { updatePlatformConfig } = await import('@/services/IQProConfigService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(auth).mockResolvedValue({ sessionClaims: { username: 'aguilanegra' } } as never);
      vi.mocked(updatePlatformConfig).mockResolvedValue({
        clientIdChanged: false,
        clientSecretChanged: true,
        gatewayIdChanged: false,
      });

      const { updatePlatformConfigHandler } = await import('./PlatformSettings');
      const result = await callHandler(updatePlatformConfigHandler, {
        clientId: 'cid',
        clientSecret: 'super-secret-value',
        gatewayId: 'gid',
      });

      expect(result).toEqual({ success: true });

      const auditCall = vi.mocked(audit).mock.calls[0]!;

      expect(auditCall[1]).toBe(AUDIT_ACTION.PLATFORM_IQPRO_CONFIG_UPDATE);
      expect(auditCall[2]).toBe(AUDIT_ENTITY_TYPE.ORGANIZATION);
      expect(JSON.stringify(auditCall[3])).not.toContain('super-secret-value');
    });

    it('rejects when a non-super-admin admin tries to update', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { auth } = await import('@clerk/nextjs/server');
      const { updatePlatformConfig } = await import('@/services/IQProConfigService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(auth).mockResolvedValue({ sessionClaims: { username: 'org-admin' } } as never);

      const { updatePlatformConfigHandler } = await import('./PlatformSettings');

      await expect(callHandler(updatePlatformConfigHandler, {
        clientId: 'cid',
        clientSecret: 'x',
        gatewayId: 'gid',
      })).rejects.toThrow(/super admin/i);
      expect(updatePlatformConfig).not.toHaveBeenCalled();
    });
  });
});
