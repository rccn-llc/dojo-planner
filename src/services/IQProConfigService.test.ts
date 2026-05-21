import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

vi.mock('@/libs/Env', () => ({
  Env: {
    IQPRO_CONFIG_ENCRYPTION_KEY: TEST_KEY_HEX,
    IQPRO_CLIENT_ID: 'env-client-id',
    IQPRO_CLIENT_SECRET: 'env-client-secret',
    IQPRO_GATEWAY_ID: 'env-gateway-id',
    IQPRO_SCOPE: 'env-scope',
    IQPRO_OAUTH_URL: 'https://oauth.example/token',
    IQPRO_BASE_URL: 'https://api.example',
  },
}));

vi.mock('@/libs/Logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ _type: 'eq', value: val })),
}));

const orgFindFirst = vi.fn();
const platformFindFirst = vi.fn();
const insertOnConflict = vi.fn().mockResolvedValue(undefined);
const insertValues = vi.fn().mockReturnValue({ onConflictDoUpdate: insertOnConflict });
const insertFn = vi.fn().mockReturnValue({ values: insertValues });

vi.mock('@/libs/DB', () => ({
  db: {
    query: {
      organizationSchema: { findFirst: (...args: unknown[]) => orgFindFirst(...args) },
      platformConfigSchema: { findFirst: (...args: unknown[]) => platformFindFirst(...args) },
    },
    insert: (...args: unknown[]) => insertFn(...args),
  },
}));

describe('IQProConfigService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetIQProConfigCache } = await import('./IQProConfigService');
    resetIQProConfigCache();
  });

  describe('resolveIQProConfig (per-org)', () => {
    it('returns env-only config when DB row has no IQPro fields set', async () => {
      orgFindFirst.mockResolvedValueOnce({});
      const { resolveIQProConfig } = await import('./IQProConfigService');
      const config = await resolveIQProConfig('org_x');

      expect(config).not.toBeNull();
      expect(config?.clientId).toBe('env-client-id');
      expect(config?.clientSecret).toBe('env-client-secret');
      expect(config?.gatewayId).toBe('env-gateway-id');
      expect(config?.scope).toBe('env-scope');
      expect(config?.source).toBe('env');
    });

    it('prefers DB values over env on a per-field basis', async () => {
      const { encryptSecret } = await import('@/libs/Crypto');
      orgFindFirst.mockResolvedValueOnce({
        iqproConfigClientId: 'org-client',
        iqproConfigClientSecretEncrypted: encryptSecret('org-secret'),
        iqproConfigGatewayId: 'org-gateway',
      });
      const { resolveIQProConfig } = await import('./IQProConfigService');
      const config = await resolveIQProConfig('org_x');

      expect(config?.clientId).toBe('org-client');
      expect(config?.clientSecret).toBe('org-secret');
      expect(config?.gatewayId).toBe('org-gateway');
      expect(config?.source).toBe('org');
    });

    it('tags source as "mixed" when only some fields come from DB', async () => {
      orgFindFirst.mockResolvedValueOnce({
        iqproConfigClientId: 'org-client',
      });
      const { resolveIQProConfig } = await import('./IQProConfigService');
      const config = await resolveIQProConfig('org_x');

      expect(config?.source).toBe('mixed');
      expect(config?.clientId).toBe('org-client');
      expect(config?.clientSecret).toBe('env-client-secret');
    });

    it('caches the resolved config (second call does not hit the DB)', async () => {
      orgFindFirst.mockResolvedValueOnce({});
      const { resolveIQProConfig } = await import('./IQProConfigService');
      await resolveIQProConfig('org_x');
      await resolveIQProConfig('org_x');

      expect(orgFindFirst).toHaveBeenCalledTimes(1);
    });

    it('invalidates the cache after updateIQProConfig', async () => {
      orgFindFirst.mockResolvedValue({});
      const { resolveIQProConfig, updateIQProConfig } = await import('./IQProConfigService');
      await resolveIQProConfig('org_x');
      await updateIQProConfig('org_x', { clientId: 'new', clientSecret: 'new', gatewayId: 'new' });
      await resolveIQProConfig('org_x');

      // 1 read for initial resolve, 1 read inside updateIQProConfig for diff, 1 for re-resolve
      expect(orgFindFirst).toHaveBeenCalledTimes(3);
    });
  });

  describe('getIQProConfigForAdmin', () => {
    it('never returns the secret value, only hasSecret', async () => {
      const { encryptSecret } = await import('@/libs/Crypto');
      orgFindFirst.mockResolvedValueOnce({
        iqproConfigClientId: 'org-client',
        iqproConfigClientSecretEncrypted: encryptSecret('super-secret'),
        iqproConfigGatewayId: 'org-gateway',
      });
      const { getIQProConfigForAdmin } = await import('./IQProConfigService');
      const projection = await getIQProConfigForAdmin('org_x');

      expect(JSON.stringify(projection)).not.toContain('super-secret');
      expect(projection.hasSecret).toBe(true);
      expect(projection.source).toBe('org');
    });
  });

  describe('updateIQProConfig', () => {
    it('encrypts the secret before persisting', async () => {
      orgFindFirst.mockResolvedValueOnce({});
      const { updateIQProConfig } = await import('./IQProConfigService');
      await updateIQProConfig('org_x', { clientId: 'c', clientSecret: 'shhh', gatewayId: 'g' });

      const payload = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;

      expect(payload.iqproConfigClientSecretEncrypted).toBeTypeOf('string');
      expect(payload.iqproConfigClientSecretEncrypted).not.toBe('shhh');
    });

    it('does NOT touch the secret column when clientSecret is blank/omitted', async () => {
      orgFindFirst.mockResolvedValueOnce({ iqproConfigClientId: 'old' });
      const { updateIQProConfig } = await import('./IQProConfigService');
      const diff = await updateIQProConfig('org_x', { clientId: 'new', gatewayId: 'g' });

      const payload = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;

      expect(payload).not.toHaveProperty('iqproConfigClientSecretEncrypted');
      expect(diff.clientSecretChanged).toBe(false);
    });

    it('reports clientSecretChanged=true when a new secret is provided', async () => {
      orgFindFirst.mockResolvedValueOnce({});
      const { updateIQProConfig } = await import('./IQProConfigService');
      const diff = await updateIQProConfig('org_x', { clientId: 'c', clientSecret: 'new', gatewayId: 'g' });

      expect(diff.clientSecretChanged).toBe(true);
    });
  });

  describe('resolvePlatformIQProConfig', () => {
    it('returns env-only when platform_config row is missing', async () => {
      platformFindFirst.mockResolvedValueOnce(undefined);
      const { resolvePlatformIQProConfig } = await import('./IQProConfigService');
      const config = await resolvePlatformIQProConfig();

      expect(config?.source).toBe('env');
      expect(config?.clientId).toBe('env-client-id');
    });

    it('uses DB values when present and tags source as "platform"', async () => {
      const { encryptSecret } = await import('@/libs/Crypto');
      platformFindFirst.mockResolvedValueOnce({
        iqproSaasClientId: 'saas-client',
        iqproSaasClientSecretEncrypted: encryptSecret('saas-secret'),
        iqproSaasGatewayId: 'saas-gateway',
      });
      const { resolvePlatformIQProConfig } = await import('./IQProConfigService');
      const config = await resolvePlatformIQProConfig();

      expect(config?.clientId).toBe('saas-client');
      expect(config?.clientSecret).toBe('saas-secret');
      expect(config?.gatewayId).toBe('saas-gateway');
      expect(config?.source).toBe('platform');
    });

    it('caches and invalidates on updatePlatformConfig', async () => {
      platformFindFirst.mockResolvedValue(undefined);
      const { resolvePlatformIQProConfig, updatePlatformConfig } = await import('./IQProConfigService');
      await resolvePlatformIQProConfig();
      await resolvePlatformIQProConfig();

      expect(platformFindFirst).toHaveBeenCalledTimes(1);

      await updatePlatformConfig({ clientId: 'c', clientSecret: 's', gatewayId: 'g' });
      await resolvePlatformIQProConfig();

      // 1 cached resolve, 1 read inside update for diff, 1 re-resolve after invalidate
      expect(platformFindFirst).toHaveBeenCalledTimes(3);
    });
  });

  describe('config resolution returns null', () => {
    it('when env and DB both miss a required field', async () => {
      vi.resetModules();
      vi.doMock('@/libs/Env', () => ({
        Env: { IQPRO_CONFIG_ENCRYPTION_KEY: TEST_KEY_HEX }, // no other IQPRO_*
      }));
      orgFindFirst.mockResolvedValueOnce({});
      const { resolveIQProConfig } = await import('./IQProConfigService');
      const config = await resolveIQProConfig('org_x');

      expect(config).toBeNull();
    });
  });
});
