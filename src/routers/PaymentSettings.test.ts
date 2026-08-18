import type { AuditContext } from '@/types/Audit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('./AuthGuards', () => ({ guardRole: vi.fn() }));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
// The real error CLASS is re-exported: the router narrows with `instanceof`,
// so a stubbed class would make that check silently false and let the 500
// regression back in.
vi.mock('@/services/PaymentProviderConfigService', async () => {
  const actual = await vi.importActual<typeof import('@/services/PaymentProviderConfigService')>(
    '@/services/PaymentProviderConfigService',
  );
  return {
    MissingClientSecretError: actual.MissingClientSecretError,
    getIQProConfigForAdmin: vi.fn(),
    updateIQProConfig: vi.fn(),
  };
});

const adminContext: AuditContext = { userId: 'u1', orgId: 'org-1', role: ORG_ROLE.ADMIN };

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('PaymentSettings Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConfig', () => {
    it('admits ACADEMY_OWNER (and higher) and never returns the secret value', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getIQProConfigForAdmin } = await import('@/services/PaymentProviderConfigService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(getIQProConfigForAdmin).mockResolvedValue({
        clientId: 'cid',
        gatewayId: 'gid',
        hasSecret: true,
        source: 'org',
      });

      const { getConfig } = await import('./PaymentSettings');
      const result = await callHandler(getConfig);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(result).toMatchObject({ clientId: 'cid', gatewayId: 'gid', hasSecret: true });
      expect(JSON.stringify(result)).not.toContain('secret-value');
    });
  });

  describe('updateConfig', () => {
    it('persists the config and emits a success audit with secret-redacted change diff', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateIQProConfig } = await import('@/services/PaymentProviderConfigService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(updateIQProConfig).mockResolvedValue({
        clientIdChanged: true,
        clientSecretChanged: true,
        gatewayIdChanged: false,
      });

      const { updateConfig } = await import('./PaymentSettings');
      const result = await callHandler(updateConfig, {
        clientId: 'new-cid',
        clientSecret: 'super-secret-value',
        gatewayId: 'gid',
      });

      expect(result).toEqual({ success: true });

      const auditCall = vi.mocked(audit).mock.calls[0]!;

      expect(auditCall[1]).toBe(AUDIT_ACTION.IQPRO_CONFIG_UPDATE);
      expect(auditCall[2]).toBe(AUDIT_ENTITY_TYPE.ORGANIZATION);
      // The secret value must never appear in audit metadata.
      expect(JSON.stringify(auditCall[3])).not.toContain('super-secret-value');
      expect(auditCall[3]).toMatchObject({ status: 'success' });
    });

    it('treats blank clientSecret as "no change"', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateIQProConfig } = await import('@/services/PaymentProviderConfigService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(updateIQProConfig).mockResolvedValue({
        clientIdChanged: false,
        clientSecretChanged: false,
        gatewayIdChanged: false,
      });

      const { updateConfig } = await import('./PaymentSettings');
      await callHandler(updateConfig, {
        clientId: 'cid',
        gatewayId: 'gid',
      });

      expect(updateIQProConfig).toHaveBeenCalledWith('org-1', expect.objectContaining({
        clientId: 'cid',
        gatewayId: 'gid',
      }));
    });

    it('emits failure audit and rethrows on service error', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateIQProConfig } = await import('@/services/PaymentProviderConfigService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(adminContext);
      vi.mocked(updateIQProConfig).mockRejectedValue(new Error('encryption key missing'));

      const { updateConfig } = await import('./PaymentSettings');

      await expect(callHandler(updateConfig, { clientId: 'c', gatewayId: 'g' })).rejects.toThrow('encryption key missing');

      expect(audit).toHaveBeenCalledWith(
        adminContext,
        AUDIT_ACTION.IQPRO_CONFIG_UPDATE,
        AUDIT_ENTITY_TYPE.ORGANIZATION,
        expect.objectContaining({ status: 'failure', error: 'encryption key missing' }),
      );
    });
  });
});

describe('updateConfig — first save without a client secret', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400, not 500, when there is no stored secret to merge with', async () => {
    // Regression: a bare Error here became an opaque INTERNAL_SERVER_ERROR.
    // An admin editing only the client id on an org that has never saved
    // credentials is a client-side mistake and must say so.
    const { guardRole } = await import('./AuthGuards');
    vi.mocked(guardRole).mockResolvedValue(adminContext);

    const { MissingClientSecretError, updateIQProConfig } = await import(
      '@/services/PaymentProviderConfigService',
    );
    vi.mocked(updateIQProConfig).mockRejectedValue(new MissingClientSecretError());

    const { updateConfig } = await import('./PaymentSettings');

    await expect(
      callHandler(updateConfig, { clientId: 'cid', gatewayId: 'gid' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
