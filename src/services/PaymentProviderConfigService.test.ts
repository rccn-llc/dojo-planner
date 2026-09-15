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
  and: vi.fn((...parts) => ({ _type: 'and', parts })),
  isNotNull: vi.fn(col => ({ _type: 'isNotNull', col })),
}));

const orgFindFirst = vi.fn();
const platformFindFirst = vi.fn();
const insertOnConflict = vi.fn().mockResolvedValue(undefined);
const insertValues = vi.fn().mockReturnValue({ onConflictDoUpdate: insertOnConflict });
const insertFn = vi.fn().mockReturnValue({ values: insertValues });

/**
 * The saved-payment-method guard runs
 * `select().from().innerJoin().where().limit()`. `savedMethodRows` is what that
 * chain resolves to — empty means "no saved cards", so a provider switch is
 * allowed.
 */
let savedMethodRows: Array<{ id: string }> = [];
const selectLimit = vi.fn(() => Promise.resolve(savedMethodRows));

/**
 * `updatePaymentProviderConfig` now locks the org row up front, so `select()`
 * serves TWO different chains:
 *
 *   - `.from().where().for('update').limit()`  → the locked org row
 *   - `.from().innerJoin().where().limit()`    → the saved-payment-method guard
 *
 * `forUpdateRows` is what the lock read resolves to; `lockedFor` records the
 * lock strength actually requested, so a regression that drops `.for('update')`
 * is caught rather than silently passing.
 */
let lockedFor: string | null = null;
/**
 * The org row the LOCKED read returns, set by `primeOrgRow` below.
 *
 * Deliberately NOT drained from `orgFindFirst`: the locked read and
 * `query.findFirst` are different call sites, and sharing one queue let a test
 * that never touches the update path consume another test's primed row — which
 * surfaced as a resolver test silently falling back to env IQPro credentials.
 */
let lockedOrgRow: Record<string, unknown> | undefined;
const forUpdateLimit = vi.fn(() =>
  Promise.resolve(lockedOrgRow === undefined ? [] : [lockedOrgRow]));

/**
 * Prime the org row for BOTH read paths at once.
 *
 * `updatePaymentProviderConfig` reads it through `select(...).for('update')`
 * while the resolvers use `query.findFirst`. Tests should not have to care
 * which, so this sets both and each test keeps expressing one intent.
 */
function primeOrgRow(row: Record<string, unknown> | undefined): void {
  lockedOrgRow = row;
  orgFindFirst.mockResolvedValueOnce(row);
}
const selectFn = vi.fn((..._args: unknown[]) => ({
  from: () => ({
    innerJoin: () => ({
      where: () => ({ limit: selectLimit }),
    }),
    where: () => ({
      for: (strength: string) => {
        lockedFor = strength;
        return { limit: forUpdateLimit };
      },
    }),
  }),
}));

/**
 * Runs the callback against the same spies, so assertions do not care whether a
 * statement ran inside the transaction. `transactionCalls` proves one was
 * opened at all — the whole point of the fix is that the check and the write
 * share it.
 */
const txHandle = {
  insert: (...args: unknown[]) => insertFn(...args),
  select: (...args: unknown[]) => selectFn(...args),
};

const transactionFn = vi.fn(async (cb: (tx: unknown) => unknown) => cb(txHandle));

vi.mock('@/libs/DB', () => ({
  db: {
    query: {
      organizationSchema: { findFirst: (...args: unknown[]) => orgFindFirst(...args) },
      platformConfigSchema: { findFirst: (...args: unknown[]) => platformFindFirst(...args) },
    },
    insert: (...args: unknown[]) => insertFn(...args),
    select: (...args: unknown[]) => selectFn(...args),
    transaction: (cb: (tx: unknown) => unknown) => transactionFn(cb),
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
    // clearAllMocks() wipes implementations as well as calls, so both of these
    // must be reinstated every test or they silently resolve to undefined.
    lockedOrgRow = undefined;
    lockedFor = null;
    forUpdateLimit.mockImplementation(() =>
      Promise.resolve(lockedOrgRow === undefined ? [] : [lockedOrgRow]));
    transactionFn.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txHandle));
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

    it('prefers the stored blob over env', async () => {
      const { encryptSecret } = await import('@/libs/Crypto');
      orgFindFirst.mockResolvedValueOnce({
        paymentProviderConfigEncrypted: encryptSecret(JSON.stringify({
          provider: 'iqpro',
          credentials: { clientId: 'org-client', clientSecret: 'org-secret', gatewayId: 'org-gateway' },
        })),
      });
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');
      const config = await resolveIQProConfig('org_x');

      expect(config?.clientId).toBe('org-client');
      expect(config?.clientSecret).toBe('org-secret');
      expect(config?.gatewayId).toBe('org-gateway');
      expect(config?.source).toBe('org');
    });

    it('ignores a blob belonging to a DIFFERENT provider and falls back to env', async () => {
      // Defensive: a Square blob on an org resolving IQPro credentials must not
      // be read as IQPro credentials. Guards against charging the wrong
      // merchant if the discriminator column and blob ever disagree.
      const { encryptSecret } = await import('@/libs/Crypto');
      orgFindFirst.mockResolvedValueOnce({
        paymentProviderConfigEncrypted: encryptSecret(JSON.stringify({
          provider: 'square',
          credentials: {
            accessToken: 'sq-token',
            locationId: 'sq-loc',
            applicationId: 'sq-app',
            environment: 'sandbox',
            webhookSignatureKey: 'sq-sig',
          },
        })),
      });
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');
      const config = await resolveIQProConfig('org_x');

      expect(config?.clientId).toBe('env-client-id');
      expect(config?.source).toBe('env');
    });

    it('reports decryptable-but-invalid JSON as malformed, and LOGS it', async () => {
      // `JSON.parse` used to sit outside the malformed-blob path, so a
      // truncated or partially-written blob threw a raw SyntaxError straight
      // out of the function: never logged, and surfaced to the caller as an
      // opaque parse error instead of the documented "credentials are
      // malformed". Both corruption modes must report identically.
      const { encryptSecret } = await import('@/libs/Crypto');
      const { logger } = await import('@/libs/Logger');
      orgFindFirst.mockResolvedValueOnce({
        paymentProviderConfigEncrypted: encryptSecret('{"provider":"iqpro"'),
      });
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');

      await expect(resolveIQProConfig('org_badjson')).rejects.toThrow(/malformed/i);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('not valid JSON'),
        expect.anything(),
      );
    });

    it('throws on a structurally invalid blob rather than falling back', async () => {
      // Readable ciphertext but the wrong shape means corrupt or
      // partially-written data. Falling back to env here could silently charge
      // a different merchant, so it is a hard failure.
      const { encryptSecret } = await import('@/libs/Crypto');
      orgFindFirst.mockResolvedValueOnce({
        paymentProviderConfigEncrypted: encryptSecret(JSON.stringify({ provider: 'iqpro', credentials: { clientId: 'only-this' } })),
      });
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');

      await expect(resolveIQProConfig('org_x')).rejects.toThrow(/malformed/i);
    });

    it('caches the resolved config (second call does not hit the DB)', async () => {
      orgFindFirst.mockResolvedValueOnce({});
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');
      await resolveIQProConfig('org_x');
      await resolveIQProConfig('org_x');

      expect(orgFindFirst).toHaveBeenCalledTimes(1);
    });

    it('invalidates the cache after updatePaymentProviderConfig', async () => {
      orgFindFirst.mockResolvedValue({});
      const { resolveIQProConfig, updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');
      await resolveIQProConfig('org_x');
      await updatePaymentProviderConfig('org_x', { provider: 'iqpro', clientId: 'new', clientSecret: 'new', gatewayId: 'new' });
      await resolveIQProConfig('org_x');

      // 1 read for the initial resolve + 1 for the re-resolve. The update's own
      // org read no longer goes through findFirst: it is the locked
      // `select(...).for('update')` inside the transaction, counted separately
      // below. The point of the test is that the re-resolve hit the DB at all,
      // i.e. the cache was invalidated.
      expect(orgFindFirst).toHaveBeenCalledTimes(2);
      expect(forUpdateLimit).toHaveBeenCalledTimes(1);
    });
  });

  describe('getIQProConfigForAdmin', () => {
    it('never returns the secret value, only hasSecret', async () => {
      const { encryptSecret } = await import('@/libs/Crypto');
      orgFindFirst.mockResolvedValueOnce({
        paymentProviderConfigEncrypted: encryptSecret(JSON.stringify({
          provider: 'iqpro',
          credentials: { clientId: 'org-client', clientSecret: 'super-secret', gatewayId: 'org-gateway' },
        })),
      });
      const { getIQProConfigForAdmin } = await import('./PaymentProviderConfigService');
      const projection = await getIQProConfigForAdmin('org_x');

      expect(JSON.stringify(projection)).not.toContain('super-secret');
      expect(projection.hasSecret).toBe(true);
      expect(projection.source).toBe('org');
    });
  });

  describe('updatePaymentProviderConfig', () => {
    it('writes provider and blob from the SAME discriminant for Square', async () => {
      // ⚠️ The regression test for a live wrong-merchant bug: the old writer
      // hardcoded `iqpro` in both the column and the blob, so saving from the
      // settings form silently flipped a Square org back to IQPro and its next
      // member payment charged the wrong merchant account.
      savedMethodRows = [];
      primeOrgRow({ paymentProvider: 'square' });
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');
      await updatePaymentProviderConfig('org_x', {
        provider: 'square',
        applicationId: 'sandbox-app',
        locationId: 'L123',
        environment: 'sandbox',
        accessToken: 'sq-token',
        webhookSignatureKey: 'sq-webhook',
      });

      const payload = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;

      expect(payload.paymentProvider).toBe('square');

      // `resolvePaymentProviderConfig` treats the column as authoritative and a
      // mismatched blob as absent, so a divergence silently falls back to env
      // credentials rather than failing.
      const { decryptSecret } = await import('@/libs/Crypto');
      const blob = JSON.parse(decryptSecret(payload.paymentProviderConfigEncrypted as string));

      expect(blob.provider).toBe('square');
      expect(payload.paymentProviderConfigEncrypted).not.toContain('sq-token');
    });

    it('REFUSES a provider switch while saved payment methods exist', async () => {
      // Provider ids do not transfer: every saved card and autopay
      // subscription would be orphaned at the old processor.
      savedMethodRows = [{ id: 'pm_1' }, { id: 'pm_2' }];
      primeOrgRow({ paymentProvider: 'iqpro' });
      const { updatePaymentProviderConfig, ProviderSwitchBlockedError } = await import(
        './PaymentProviderConfigService',
      );

      await expect(updatePaymentProviderConfig('org_x', {
        provider: 'square',
        applicationId: 'a',
        locationId: 'l',
        environment: 'sandbox',
        accessToken: 't',
        webhookSignatureKey: 'k',
      })).rejects.toBeInstanceOf(ProviderSwitchBlockedError);

      // Nothing written — a blocked switch leaves the org exactly as it was.
      expect(insertValues).not.toHaveBeenCalled();

      savedMethodRows = [];
    });

    it('allows a credential rotation WITHIN a provider even with saved cards', async () => {
      // Only a switch strands saved methods; rotating keys does not.
      savedMethodRows = [{ id: 'pm_1' }];
      primeOrgRow({ paymentProvider: 'iqpro' });
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');
      await updatePaymentProviderConfig('org_x', {
        provider: 'iqpro',
        clientId: 'c',
        clientSecret: 's',
        gatewayId: 'g',
      });

      expect(insertValues).toHaveBeenCalled();

      savedMethodRows = [];
    });

    it('does not reuse an IQPro secret as a Square access token', async () => {
      // The stored blob belongs to the other provider, so there is nothing to
      // merge — a first Square save must supply its own token.
      savedMethodRows = [];
      const { encryptSecret } = await import('@/libs/Crypto');
      primeOrgRow({
        paymentProvider: 'square',
        paymentProviderConfigEncrypted: encryptSecret(JSON.stringify({
          provider: 'iqpro',
          credentials: { clientId: 'c', clientSecret: 'iqpro-secret', gatewayId: 'g' },
        })),
      });
      const { updatePaymentProviderConfig, MissingClientSecretError } = await import(
        './PaymentProviderConfigService',
      );

      await expect(updatePaymentProviderConfig('org_x', {
        provider: 'square',
        applicationId: 'a',
        locationId: 'l',
        environment: 'sandbox',
      })).rejects.toBeInstanceOf(MissingClientSecretError);
    });

    it('names the SQUARE field in the error, not an IQPro client secret', async () => {
      // A Square org saving without an access token was told "A client secret
      // is required ... IQPro credentials" — a credential its form does not
      // even show, so the message was unactionable.
      savedMethodRows = [];
      primeOrgRow({ paymentProvider: 'square' });
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');

      await expect(updatePaymentProviderConfig('org_x', {
        provider: 'square',
        applicationId: 'a',
        locationId: 'l',
        environment: 'sandbox',
        webhookSignatureKey: 'wh',
      })).rejects.toMatchObject({
        field: 'squareAccessToken',
        message: expect.stringContaining('access token'),
      });
    });

    it('names the webhook signature key when THAT is what is missing', async () => {
      savedMethodRows = [];
      primeOrgRow({ paymentProvider: 'square' });
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');

      await expect(updatePaymentProviderConfig('org_x', {
        provider: 'square',
        applicationId: 'a',
        locationId: 'l',
        environment: 'sandbox',
        accessToken: 'tok',
      })).rejects.toMatchObject({
        field: 'squareWebhookSignatureKey',
        message: expect.stringContaining('webhook signature key'),
      });
    });

    it('still names the IQPro client secret for an IQPro save', async () => {
      savedMethodRows = [];
      primeOrgRow({});
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');

      await expect(updatePaymentProviderConfig('org_x', {
        provider: 'iqpro',
        clientId: 'c',
        gatewayId: 'g',
      })).rejects.toMatchObject({
        field: 'iqproClientSecret',
        message: expect.stringContaining('client secret'),
      });
    });

    it('reports secretChanged when ONLY the webhook signature key is rotated', async () => {
      // The webhook key authenticates every inbound Square webhook. Reporting
      // only the access token left the audit trail claiming the secret was
      // unchanged after that key had just been rotated.
      savedMethodRows = [];
      const { encryptSecret } = await import('@/libs/Crypto');
      primeOrgRow({
        paymentProvider: 'square',
        paymentProviderConfigEncrypted: encryptSecret(JSON.stringify({
          provider: 'square',
          credentials: {
            accessToken: 'tok',
            locationId: 'l',
            applicationId: 'a',
            environment: 'sandbox',
            webhookSignatureKey: 'old-key',
          },
        })),
      });
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');

      const diff = await updatePaymentProviderConfig('org_x', {
        provider: 'square',
        applicationId: 'a',
        locationId: 'l',
        environment: 'sandbox',
        webhookSignatureKey: 'rotated-key',
      });

      expect(diff.secretChanged).toBe(true);
    });

    it('reports secretChanged false when NEITHER Square secret is supplied', async () => {
      savedMethodRows = [];
      const { encryptSecret } = await import('@/libs/Crypto');
      primeOrgRow({
        paymentProvider: 'square',
        paymentProviderConfigEncrypted: encryptSecret(JSON.stringify({
          provider: 'square',
          credentials: {
            accessToken: 'tok',
            locationId: 'l',
            applicationId: 'a',
            environment: 'sandbox',
            webhookSignatureKey: 'key',
          },
        })),
      });
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');

      const diff = await updatePaymentProviderConfig('org_x', {
        provider: 'square',
        applicationId: 'a',
        locationId: 'l-changed',
        environment: 'sandbox',
      });

      expect(diff.secretChanged).toBe(false);
      expect(diff.credentialsChanged).toBe(true);
    });

    it('runs the saved-method check and the write in ONE locked transaction', async () => {
      // The check and the write used to be independent statements, so a card
      // registered between them was stranded at the old processor anyway —
      // exactly what the check exists to prevent. The org row is locked FOR
      // UPDATE so two concurrent saves serialise instead of both writing.
      savedMethodRows = [];
      primeOrgRow({ paymentProvider: 'iqpro' });
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');

      await updatePaymentProviderConfig('org_x', {
        provider: 'square',
        applicationId: 'a',
        locationId: 'l',
        environment: 'sandbox',
        accessToken: 'tok',
        webhookSignatureKey: 'wh',
      });

      expect(transactionFn).toHaveBeenCalledTimes(1);
      expect(lockedFor).toBe('update');
      expect(insertValues).toHaveBeenCalled();
    });

    it('does NOT write when the switch is blocked by a saved method', async () => {
      // The throw must abort the transaction, leaving the org exactly as it was.
      savedMethodRows = [{ id: 'pm_1' }];
      primeOrgRow({ paymentProvider: 'iqpro' });
      const { updatePaymentProviderConfig, ProviderSwitchBlockedError } = await import(
        './PaymentProviderConfigService',
      );

      await expect(updatePaymentProviderConfig('org_x', {
        provider: 'square',
        applicationId: 'a',
        locationId: 'l',
        environment: 'sandbox',
        accessToken: 'tok',
        webhookSignatureKey: 'wh',
      })).rejects.toBeInstanceOf(ProviderSwitchBlockedError);

      expect(insertValues).not.toHaveBeenCalled();

      savedMethodRows = [];
    });

    it('encrypts the credentials before persisting', async () => {
      primeOrgRow({});
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');
      await updatePaymentProviderConfig('org_x', { provider: 'iqpro', clientId: 'c', clientSecret: 'shhh', gatewayId: 'g' });

      const payload = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
      const blob = payload.paymentProviderConfigEncrypted as string;

      expect(blob).toBeTypeOf('string');
      expect(blob).not.toContain('shhh');
      expect(payload.paymentProvider).toBe('iqpro');
    });

    it('PRESERVES the stored secret when clientSecret is blank/omitted', async () => {
      // The settings form never sends the secret back to the browser, so an
      // admin editing only the client/gateway id submits it blank. Because the
      // blob is a single value, an overwrite would silently blank the secret
      // and break the org's payments — so the update MERGES.
      const { encryptSecret, decryptSecret } = await import('@/libs/Crypto');
      primeOrgRow({
        paymentProviderConfigEncrypted: encryptSecret(JSON.stringify({
          provider: 'iqpro',
          credentials: { clientId: 'old', clientSecret: 'keep-me', gatewayId: 'old-gw' },
        })),
      });
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');
      const diff = await updatePaymentProviderConfig('org_x', { provider: 'iqpro', clientId: 'new', gatewayId: 'g' });

      const payload = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
      const stored = JSON.parse(decryptSecret(payload.paymentProviderConfigEncrypted as string));

      expect(stored.credentials.clientSecret).toBe('keep-me');
      expect(stored.credentials.clientId).toBe('new');
      expect(diff.secretChanged).toBe(false);
    });

    it('refuses the first save when no secret is supplied', async () => {
      // No stored blob to merge with, so there is nothing to preserve — better
      // a clear error than writing credentials that cannot authenticate.
      primeOrgRow({});
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');

      await expect(updatePaymentProviderConfig('org_x', { provider: 'iqpro', clientId: 'c', gatewayId: 'g' }))
        .rejects
        .toThrow(/client secret is required/i);
    });

    it('reports clientSecretChanged=true when a new secret is provided', async () => {
      primeOrgRow({});
      const { updatePaymentProviderConfig } = await import('./PaymentProviderConfigService');
      const diff = await updatePaymentProviderConfig('org_x', { provider: 'iqpro', clientId: 'c', clientSecret: 'new', gatewayId: 'g' });

      expect(diff.secretChanged).toBe(true);
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
      // ONE read. The provider column and the credential blob must come from
      // the same row snapshot — a second read could straddle a provider switch
      // and pair a fresh "iqpro" discriminator with another configuration's
      // credentials (or, worse, the IQPRO_* env fallback on a Square org).
      orgFindFirst.mockResolvedValueOnce({ paymentProvider: 'iqpro' });
      const { resolvePaymentProviderConfig } = await import('./PaymentProviderConfigService');
      const config = await resolvePaymentProviderConfig('org_x');

      expect(config?.provider).toBe('iqpro');
      expect(orgFindFirst).toHaveBeenCalledTimes(1);

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
        paymentProviderConfigEncrypted: 'not-valid-ciphertext',
      });
      const { resolveIQProConfig } = await import('./PaymentProviderConfigService');

      await expect(resolveIQProConfig('org_bad')).rejects.toThrow(
        /Failed to decrypt stored payment provider credentials/,
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
