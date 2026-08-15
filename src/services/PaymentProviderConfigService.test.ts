import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const BASE_ENV = {
  IQPRO_CONFIG_ENCRYPTION_KEY: TEST_KEY_HEX,
  IQPRO_CLIENT_ID: 'env-client-id',
  IQPRO_CLIENT_SECRET: 'env-client-secret',
  IQPRO_GATEWAY_ID: 'env-gateway-id',
  IQPRO_SCOPE: 'env-scope',
  IQPRO_OAUTH_URL: 'https://oauth.example/token',
  IQPRO_BASE_URL: 'https://api.example',
};

vi.mock('@/libs/Env', () => ({ Env: BASE_ENV }));

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

// `platform_config` is control-plane, so `resolvePlatformIQProConfig` goes
// through `controlOrganizationDb()` rather than the tenant `db` Proxy.
//
// This spy is DISTINCT from the tenant one above on purpose. Wiring both
// handles to the same spy would let a regression that reverts the platform read
// back to the tenant `db` pass silently — the assertion that `platformFindFirst`
// was never called is what actually pins the plane.
//
// There is no `insert` here because the app no longer writes platform_config:
// the admin UI was removed, leaving `backfillPlatformIQProConfig.ts` as the
// only writer. If a write path returns, add the spy back WITH a
// "never through db" assertion — a bare spy proves nothing.
const controlPlatformFindFirst = vi.fn();

vi.mock('@/libs/ControlPlaneReads', () => ({
  controlOrganizationDb: () => ({
    query: {
      platformConfigSchema: { findFirst: (...args: unknown[]) => controlPlatformFindFirst(...args) },
    },
  }),
}));

describe('PaymentProviderConfigService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Several tests below call vi.resetModules() + vi.doMock('@/libs/Env') to
    // exercise a different env shape. Without restoring here, that override
    // leaks into every subsequent test — and because resetModules also hands
    // out a fresh module instance (and therefore a fresh cache), the leak
    // surfaces as cache assertions being off by one rather than as an obvious
    // env failure.
    //
    // Re-registering BASE_ENV (rather than vi.doUnmock) is deliberate: unmocking
    // would fall through to the REAL Env module and pull live credentials from
    // the developer's shell into the assertions.
    vi.doMock('@/libs/Env', () => ({ Env: BASE_ENV }));
    vi.resetModules();
    const { resetIQProConfigCache } = await import('./PaymentProviderConfigService');
    resetIQProConfigCache();
  });

  describe('resolveIQProConfig (per-org)', () => {
    it('returns env-only config when DB row has no IQPro fields set', async () => {
      orgFindFirst.mockResolvedValueOnce({});
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');
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
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');
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
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');
      const config = await resolveIQProConfig('org_x');

      expect(config?.source).toBe('mixed');
      expect(config?.clientId).toBe('org-client');
      expect(config?.clientSecret).toBe('env-client-secret');
    });

    it('caches the resolved config (second call does not hit the DB)', async () => {
      orgFindFirst.mockResolvedValueOnce({});
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');
      await resolveIQProConfig('org_x');
      await resolveIQProConfig('org_x');

      expect(orgFindFirst).toHaveBeenCalledTimes(1);
    });

    it('invalidates the cache after updateIQProConfig', async () => {
      orgFindFirst.mockResolvedValue({});
      const { resolveIQProConfig, updateIQProConfig } = await import('./PaymentProviderConfigService');
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
      const { getIQProConfigForAdmin } = await import('./PaymentProviderConfigService');
      const projection = await getIQProConfigForAdmin('org_x');

      expect(JSON.stringify(projection)).not.toContain('super-secret');
      expect(projection.hasSecret).toBe(true);
      expect(projection.source).toBe('org');
    });
  });

  describe('updateIQProConfig', () => {
    it('encrypts the secret before persisting', async () => {
      orgFindFirst.mockResolvedValueOnce({});
      const { updateIQProConfig } = await import('./PaymentProviderConfigService');
      await updateIQProConfig('org_x', { clientId: 'c', clientSecret: 'shhh', gatewayId: 'g' });

      const payload = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;

      expect(payload.iqproConfigClientSecretEncrypted).toBeTypeOf('string');
      expect(payload.iqproConfigClientSecretEncrypted).not.toBe('shhh');
    });

    it('does NOT touch the secret column when clientSecret is blank/omitted', async () => {
      orgFindFirst.mockResolvedValueOnce({ iqproConfigClientId: 'old' });
      const { updateIQProConfig } = await import('./PaymentProviderConfigService');
      const diff = await updateIQProConfig('org_x', { clientId: 'new', gatewayId: 'g' });

      const payload = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;

      expect(payload).not.toHaveProperty('iqproConfigClientSecretEncrypted');
      expect(diff.clientSecretChanged).toBe(false);
    });

    it('reports clientSecretChanged=true when a new secret is provided', async () => {
      orgFindFirst.mockResolvedValueOnce({});
      const { updateIQProConfig } = await import('./PaymentProviderConfigService');
      const diff = await updateIQProConfig('org_x', { clientId: 'c', clientSecret: 'new', gatewayId: 'g' });

      expect(diff.clientSecretChanged).toBe(true);
    });
  });

  describe('resolvePlatformIQProConfig', () => {
    it('returns env-only when platform_config row is missing', async () => {
      controlPlatformFindFirst.mockResolvedValueOnce(undefined);
      const { resolvePlatformIQProConfig } = await import('./PaymentProviderConfigService');
      const config = await resolvePlatformIQProConfig();

      expect(config?.source).toBe('env');
      expect(config?.clientId).toBe('env-client-id');
    });

    it('uses DB values when present and tags source as "platform"', async () => {
      const { encryptSecret } = await import('@/libs/Crypto');
      controlPlatformFindFirst.mockResolvedValueOnce({
        saasProviderClientId: 'saas-client',
        saasProviderClientSecretEncrypted: encryptSecret('saas-secret'),
        saasProviderGatewayId: 'saas-gateway',
      });
      const { resolvePlatformIQProConfig } = await import('./PaymentProviderConfigService');
      const config = await resolvePlatformIQProConfig();

      expect(config?.clientId).toBe('saas-client');
      expect(config?.clientSecret).toBe('saas-secret');
      expect(config?.gatewayId).toBe('saas-gateway');
      expect(config?.source).toBe('platform');
    });
  });

  describe('config resolution returns null', () => {
    it('when env and DB both miss a required field', async () => {
      vi.resetModules();
      vi.doMock('@/libs/Env', () => ({
        Env: { IQPRO_CONFIG_ENCRYPTION_KEY: TEST_KEY_HEX }, // no other IQPRO_*
      }));
      orgFindFirst.mockResolvedValueOnce({});
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');
      const config = await resolveIQProConfig('org_x');

      expect(config).toBeNull();
    });
  });

  describe('platform config uses the control plane, not the tenant db', () => {
    // `platform_config` is a singleton owned by the control plane. Reading or
    // writing it through the tenant `db` Proxy is latent today (both handles
    // resolve to the same physical database) but becomes a real defect at
    // A2/A3: the "singleton" would be written into whichever tenant database
    // happened to be scoped at the time.
    it('reads platform_config through controlOrganizationDb, never through db', async () => {
      controlPlatformFindFirst.mockResolvedValueOnce(undefined);
      const { resolvePlatformIQProConfig } = await import('./PaymentProviderConfigService');
      await resolvePlatformIQProConfig();

      expect(controlPlatformFindFirst).toHaveBeenCalledTimes(1);
      expect(platformFindFirst).not.toHaveBeenCalled();
    });
  });

  describe('resolvePaymentProviderConfig (provider-aware union)', () => {
    it('returns the iqpro branch when payment_provider is iqpro', async () => {
      // Two reads: the discriminator, then the credentials.
      orgFindFirst.mockResolvedValueOnce({ paymentProvider: 'iqpro' });
      orgFindFirst.mockResolvedValueOnce({});
      const { resolvePaymentProviderConfig } = await import('./PaymentProviderConfigService');
      const config = await resolvePaymentProviderConfig('org_x');

      expect(config?.provider).toBe('iqpro');

      // Narrowing on the discriminant must expose the IQPro-only fields.
      if (config?.provider === 'iqpro') {
        expect(config.clientId).toBe('env-client-id');
        expect(config.gatewayId).toBe('env-gateway-id');
        expect(config.source).toBe('env');
      }
    });

    it('defaults to iqpro when the organization row is missing', async () => {
      orgFindFirst.mockResolvedValueOnce(undefined);
      orgFindFirst.mockResolvedValueOnce({});
      const { resolvePaymentProviderConfig } = await import('./PaymentProviderConfigService');
      const config = await resolvePaymentProviderConfig('org_missing');

      expect(config?.provider).toBe('iqpro');
    });

    it('returns null for a square org when no SQUARE_* env is configured', async () => {
      // The mocked Env has no SQUARE_* values, so this is the "provider
      // selected but not yet configured" state — the same null signal callers
      // already handle for unconfigured IQPro.
      orgFindFirst.mockResolvedValueOnce({ paymentProvider: 'square' });
      const { resolvePaymentProviderConfig } = await import('./PaymentProviderConfigService');

      await expect(resolvePaymentProviderConfig('org_sq')).resolves.toBeNull();
    });

    it('returns the square branch when SQUARE_* env is configured', async () => {
      vi.resetModules();
      vi.doMock('@/libs/Env', () => ({
        Env: {
          IQPRO_CONFIG_ENCRYPTION_KEY: TEST_KEY_HEX,
          SQUARE_ACCESS_TOKEN: 'sq-token',
          SQUARE_LOCATION_ID: 'sq-loc',
          SQUARE_APPLICATION_ID: 'sq-app',
          SQUARE_WEBHOOK_SIGNATURE_KEY: 'sq-sig',
          SQUARE_ENVIRONMENT: 'sandbox',
        },
      }));
      orgFindFirst.mockResolvedValueOnce({ paymentProvider: 'square' });
      const { resolvePaymentProviderConfig } = await import('./PaymentProviderConfigService');
      const config = await resolvePaymentProviderConfig('org_sq');

      expect(config?.provider).toBe('square');

      if (config?.provider === 'square') {
        expect(config.accessToken).toBe('sq-token');
        expect(config.locationId).toBe('sq-loc');
        expect(config.applicationId).toBe('sq-app');
        expect(config.webhookSignatureKey).toBe('sq-sig');
        expect(config.environment).toBe('sandbox');
        expect(config.source).toBe('env');
      }
    });

    it('returns null for a square org when one required field is missing', async () => {
      vi.resetModules();
      vi.doMock('@/libs/Env', () => ({
        Env: {
          IQPRO_CONFIG_ENCRYPTION_KEY: TEST_KEY_HEX,
          SQUARE_ACCESS_TOKEN: 'sq-token',
          SQUARE_LOCATION_ID: 'sq-loc',
          SQUARE_APPLICATION_ID: 'sq-app',
          SQUARE_ENVIRONMENT: 'sandbox',
          // SQUARE_WEBHOOK_SIGNATURE_KEY deliberately absent
        },
      }));
      orgFindFirst.mockResolvedValueOnce({ paymentProvider: 'square' });
      const { resolvePaymentProviderConfig } = await import('./PaymentProviderConfigService');

      await expect(resolvePaymentProviderConfig('org_sq')).resolves.toBeNull();
    });
  });

  describe('invalidatePaymentProviderConfig', () => {
    // The cache is keyed by orgId alone, so a provider flip is invisible to it.
    // Without this invalidation the org keeps resolving the PREVIOUS provider's
    // credentials for up to the 60s TTL — on the payment path that means
    // charging the wrong merchant account, not just serving a stale read.
    it('forces the next resolve to re-read the org row', async () => {
      orgFindFirst.mockResolvedValue({});
      const { resolveIQProConfig, invalidatePaymentProviderConfig }
        = await import('./PaymentProviderConfigService');

      await resolveIQProConfig('org_flip');
      await resolveIQProConfig('org_flip');

      expect(orgFindFirst).toHaveBeenCalledTimes(1); // second call served from cache

      invalidatePaymentProviderConfig('org_flip');
      await resolveIQProConfig('org_flip');

      expect(orgFindFirst).toHaveBeenCalledTimes(2);
    });

    it('only invalidates the named org', async () => {
      orgFindFirst.mockResolvedValue({});
      const { resolveIQProConfig, invalidatePaymentProviderConfig }
        = await import('./PaymentProviderConfigService');

      await resolveIQProConfig('org_a');
      await resolveIQProConfig('org_b');

      expect(orgFindFirst).toHaveBeenCalledTimes(2);

      invalidatePaymentProviderConfig('org_a');
      await resolveIQProConfig('org_b'); // still cached

      expect(orgFindFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache bounds and expiry', () => {
    it('expires an entry after the 60s TTL', async () => {
      vi.useFakeTimers();
      try {
        orgFindFirst.mockResolvedValue({});
        const { resolveIQProConfig } = await import('./PaymentProviderConfigService');

        await resolveIQProConfig('org_ttl');

        expect(orgFindFirst).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(59_000);
        await resolveIQProConfig('org_ttl');

        expect(orgFindFirst).toHaveBeenCalledTimes(1); // still fresh

        vi.advanceTimersByTime(2_000); // now past 60s
        await resolveIQProConfig('org_ttl');

        expect(orgFindFirst).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('evicts the oldest entry once the 200-org bound is reached', async () => {
      orgFindFirst.mockResolvedValue({});
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');

      // Fill to the bound. org_0 is the oldest insertion.
      for (let i = 0; i < 200; i++) {
        await resolveIQProConfig(`org_${i}`);
      }

      expect(orgFindFirst).toHaveBeenCalledTimes(200);

      // A hit does NOT refresh position — eviction is insertion-order (FIFO),
      // not true LRU. Touching org_0 here must not save it from eviction.
      await resolveIQProConfig('org_0');

      expect(orgFindFirst).toHaveBeenCalledTimes(200); // served from cache

      await resolveIQProConfig('org_new'); // overflows, evicts org_0

      expect(orgFindFirst).toHaveBeenCalledTimes(201);

      await resolveIQProConfig('org_0'); // must miss now

      expect(orgFindFirst).toHaveBeenCalledTimes(202);

      // org_2 is still cached. (org_1 is NOT: re-caching org_0 on the line
      // above overflowed the bound again and evicted the next-oldest entry.)
      await resolveIQProConfig('org_2');

      expect(orgFindFirst).toHaveBeenCalledTimes(202);
    });
  });

  describe('decryption failure', () => {
    // `decryptOrNull` rethrows despite its name. That is deliberate: a bad or
    // rotated key must hard-fail the payment path rather than silently falling
    // back to env credentials, which would charge a different merchant account.
    it('throws rather than falling back to env credentials', async () => {
      orgFindFirst.mockResolvedValueOnce({
        iqproConfigClientId: 'db-client',
        iqproConfigClientSecretEncrypted: 'not-valid-ciphertext',
        iqproConfigGatewayId: 'db-gateway',
      });
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');

      await expect(resolveIQProConfig('org_bad')).rejects.toThrow(
        /Failed to decrypt stored IQPro client secret/,
      );
    });

    it('throws on the platform path too', async () => {
      controlPlatformFindFirst.mockResolvedValueOnce({
        saasProviderClientId: 'saas-client',
        saasProviderClientSecretEncrypted: 'not-valid-ciphertext',
        saasProviderGatewayId: 'saas-gateway',
      });
      const { resolvePlatformIQProConfig } = await import('./PaymentProviderConfigService');

      await expect(resolvePlatformIQProConfig()).rejects.toThrow(
        /Failed to decrypt stored IQPro client secret/,
      );
    });
  });
});
