import { Buffer } from 'node:buffer';
import { createCipheriv, randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_KEY_HEX = 'a'.repeat(64);

/**
 * Produce REAL ciphertext the service can decrypt. The previous versions of
 * these tests used placeholder strings, which meant they could never exercise
 * the check that actually matters — the one that inspects the decrypted
 * connection string.
 */
function encryptConnectionString(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(TEST_KEY_HEX, 'hex'), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

type InsertedTenantRow = { connectionStringEncrypted: string };

const findFirst = vi.fn();
const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
const values = vi.fn((_row: InsertedTenantRow) => ({ onConflictDoNothing }));
const insert = vi.fn(() => ({ values }));

vi.mock('@/libs/ControlDb', () => ({
  controlDb: {
    query: { tenantSchema: { findFirst: (...args: unknown[]) => findFirst(...args) } },
    insert: (...args: unknown[]) => insert(...(args as [])),
  },
}));

const getTenantDb = vi.fn(() => ({ __handle: true }));
const invalidateTenantPool = vi.fn();

vi.mock('@/libs/TenantDb', () => ({
  getTenantDb: (...args: unknown[]) => getTenantDb(...(args as [])),
  invalidateTenantPool: (...args: unknown[]) => invalidateTenantPool(...(args as [])),
}));

// Mutable stand-in for the validated Env object.
const envValues: Record<string, string | undefined> = {};

vi.mock('@/libs/Env', () => ({
  Env: new Proxy({}, { get: (_target, prop: string) => envValues[prop] }),
}));

// TenantCrypto reads process.env directly (it is shared with ops scripts that
// must not pull in the validated Env). Point its key lookup at the same
// `envValues` store so tests keep ONE source of truth for env state; the real
// encrypt/decrypt are left untouched so the round trip is genuinely exercised.
vi.mock('@/libs/TenantCrypto', async () => {
  const actual = await vi.importActual<typeof import('@/libs/TenantCrypto')>('@/libs/TenantCrypto');
  return {
    ...actual,
    tenantEncryptionKey: () => {
      const hex = envValues.CONTROL_PLANE_ENCRYPTION_KEY ?? envValues.IQPRO_CONFIG_ENCRYPTION_KEY;
      return hex ? Buffer.from(hex, 'hex') : null;
    },
  };
});

/** A tenant row as the control plane would return it. */
function tenantRow(overrides: Record<string, unknown> = {}) {
  return {
    orgId: 'org_a',
    // Placeholder ciphertext; decryption is stubbed per-test where it matters.
    connectionStringEncrypted: 'encrypted-value',
    region: 'aws-us-east-2',
    status: 'active',
    schemaVersion: '0000_baseline',
    ...overrides,
  };
}

describe('tenantDirectoryService', () => {
  let service: typeof import('./TenantDirectoryService');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    for (const key of Object.keys(envValues)) {
      delete envValues[key];
    }
    envValues.NODE_ENV = 'test';

    service = await import('./TenantDirectoryService');
    service.resetTenantDirectoryCache();
  });

  describe('the dev escape hatch', () => {
    it('short-circuits to DEFAULT_TENANT_DATABASE_URL outside production', async () => {
      envValues.DEFAULT_TENANT_DATABASE_URL = 'postgres://local';

      const tenant = await service.resolveTenant('org_anything');

      expect(tenant.connectionString).toBe('postgres://local');
      expect(tenant.region).toBe('local');
      // No control-plane read at all — that is the point of the hatch.
      expect(findFirst).not.toHaveBeenCalled();
    });

    it('REFUSES to honour the escape hatch in production', async () => {
      // SECURITY: this is the single most important assertion in the file.
      // Without this guard, a production deploy that happened to have
      // DEFAULT_TENANT_DATABASE_URL set would route EVERY organization to one
      // database — the exact cross-tenant leak this architecture prevents.
      envValues.NODE_ENV = 'production';
      envValues.DEFAULT_TENANT_DATABASE_URL = 'postgres://should-be-ignored';
      envValues.DATABASE_URL = 'postgres://tenant';
      envValues.CONTROL_PLANE_ENCRYPTION_KEY = 'a'.repeat(64);
      findFirst.mockResolvedValue(tenantRow({
        region: 'aws-us-east-1',
        connectionStringEncrypted: encryptConnectionString('postgres://org-own-db'),
      }));

      // The hatch is ignored: resolution goes through the directory and lands
      // on the row's own database, not on DEFAULT_TENANT_DATABASE_URL.
      await expect(service.resolveTenant('org_a')).resolves.toMatchObject({
        connectionString: 'postgres://org-own-db',
      });
      // It consulted the real directory rather than taking the shortcut.
      expect(findFirst).toHaveBeenCalled();
    });

    it('falls through to the directory when the hatch is unset', async () => {
      envValues.CONTROL_DATABASE_URL = 'postgres://control';
      envValues.DATABASE_URL = 'postgres://tenant';
      // With the hatch unset the directory IS consulted, and an unknown org is
      // now fatal rather than auto-registered.
      findFirst.mockResolvedValue(undefined);

      await expect(service.resolveTenant('org_a')).rejects.toBeInstanceOf(service.TenantNotProvisionedError);
      expect(findFirst).toHaveBeenCalled();
    });
  });

  describe('resolution errors', () => {
    beforeEach(() => {
      envValues.CONTROL_PLANE_ENCRYPTION_KEY = 'a'.repeat(64);
    });

    it.each(['provisioning', 'migrating', 'suspended', 'archived'])(
      'throws TenantUnavailableError when status is %s',
      async (status) => {
        findFirst.mockResolvedValue(tenantRow({ status }));

        await expect(service.resolveTenant('org_a')).rejects.toThrow(
          service.TenantUnavailableError,
        );
      },
    );

    it('does not cache an unavailable tenant', async () => {
      // A migrating tenant flips back to active shortly; caching the failure
      // would extend the outage by up to the TTL.
      findFirst.mockResolvedValue(tenantRow({ status: 'migrating' }));

      await expect(service.resolveTenant('org_a')).rejects.toThrow();
      await expect(service.resolveTenant('org_a')).rejects.toThrow();

      expect(findFirst).toHaveBeenCalledTimes(2);
    });

    it('throws when no encryption key is configured', async () => {
      delete envValues.CONTROL_PLANE_ENCRYPTION_KEY;
      findFirst.mockResolvedValue(tenantRow());

      await expect(service.resolveTenant('org_a')).rejects.toThrow(
        /CONTROL_PLANE_ENCRYPTION_KEY/,
      );
    });

    it('rejects a truncated ciphertext rather than returning garbage', async () => {
      findFirst.mockResolvedValue(tenantRow({ connectionStringEncrypted: 'AAAA' }));

      await expect(service.resolveTenant('org_a')).rejects.toThrow(/too short/);
    });
  });

  describe('unprovisioned organizations fail closed', () => {
    beforeEach(() => {
      envValues.CONTROL_PLANE_ENCRYPTION_KEY = 'a'.repeat(64);
      envValues.DATABASE_URL = 'postgres://local';
    });

    it('REFUSES an organization with no tenant row', async () => {
      // This replaced auto-registration. An org is provisioned deliberately —
      // its database created and its row written before anyone can sign in —
      // so a missing row means something is wrong. Registering it against a
      // default would route that org at a database nobody chose, which is the
      // exact fault this architecture exists to make impossible.
      findFirst.mockResolvedValue(undefined);

      await expect(service.resolveTenant('org_unknown')).rejects.toBeInstanceOf(
        service.TenantNotProvisionedError,
      );
    });

    it('does not write anything when refusing', async () => {
      // The old path inserted a directory row as a side effect of a read.
      findFirst.mockResolvedValue(undefined);

      await expect(service.resolveTenant('org_unknown')).rejects.toThrow();
      expect(insert).not.toHaveBeenCalled();
    });

    it('REFUSES a row still carrying the shared-database sentinel', async () => {
      // The sentinel meant "serve this org from the shared database", which no
      // longer exists as a concept. Such a row is stale, and serving it would
      // be a guess.
      findFirst.mockResolvedValue({
        orgId: 'org_a',
        connectionStringEncrypted: '__shared_database__',
        region: 'shared',
        status: 'active',
        schemaVersion: null,
      });

      await expect(service.resolveTenant('org_a')).rejects.toBeInstanceOf(
        service.TenantNotProvisionedError,
      );
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      envValues.DEFAULT_TENANT_DATABASE_URL = 'postgres://local';
    });

    it('resetTenantDirectoryCache(orgId) also drops that tenant pool', () => {
      service.resetTenantDirectoryCache('org_a');

      expect(invalidateTenantPool).toHaveBeenCalledWith('org_a');
    });

    it('resetTenantDirectoryCache() clears everything without touching pools', () => {
      expect(() => service.resetTenantDirectoryCache()).not.toThrow();
      expect(invalidateTenantPool).not.toHaveBeenCalled();
    });
  });

  describe('getDbForOrg', () => {
    it('resolves the tenant and hands its connection string to the pool cache', async () => {
      envValues.DEFAULT_TENANT_DATABASE_URL = 'postgres://local';

      await service.getDbForOrg('org_a');

      expect(getTenantDb).toHaveBeenCalledWith('org_a', 'postgres://local');
    });
  });

  describe('shared-database rows in split mode', () => {
    beforeEach(() => {
      envValues.CONTROL_DATABASE_URL = 'postgres://control';
      envValues.DATABASE_URL = 'postgres://shared-tenant';
      envValues.TENANCY_MODE = 'split';
      envValues.CONTROL_PLANE_ENCRYPTION_KEY = TEST_KEY_HEX;
    });

    it('SERVES a row whose connection string IS the shared database — it is simply not cut over yet', async () => {
      // The A2 hole, re-expressed for the per-org model. `registerTenants.ts`
      // encrypts DATABASE_URL as every tenant's connection string and labels
      // the row with a plausible real region ('aws-us-east-1'), so a
      // region-based guard waves it through.
      //
      // The DECRYPTED string is still what decides — but the answer is now
      // "serve this from the shared database", not "refuse". Refusing is what
      // forced an all-or-nothing cutover: every organization not yet migrated
      // would 409 the moment one was.
      envValues.DATABASE_URL = 'postgres://shared-tenant';
      findFirst.mockResolvedValue(tenantRow({
        region: 'aws-us-east-1',
        connectionStringEncrypted: encryptConnectionString('postgres://shared-tenant'),
      }));

      await expect(service.resolveTenant('org_a')).resolves.toMatchObject({
        connectionString: 'postgres://shared-tenant',
      });
    });

    it('serves a CUT-OVER row from its own database while others stay shared', async () => {
      // The property the whole phase exists to establish: one organization
      // moves, the rest are untouched, with no coordinated flag flip.
      envValues.DATABASE_URL = 'postgres://shared-tenant';
      findFirst.mockResolvedValue(tenantRow({
        region: 'aws-us-east-1',
        connectionStringEncrypted: encryptConnectionString('postgres://org-a-own-db'),
      }));

      await expect(service.resolveTenant('org_a')).resolves.toMatchObject({
        connectionString: 'postgres://org-a-own-db',
      });
    });

    it('SERVES a genuinely provisioned per-tenant row', async () => {
      // The contrast case: its own database, a real region. Must resolve.
      findFirst.mockResolvedValue(tenantRow({
        region: 'aws-us-east-1',
        connectionStringEncrypted: encryptConnectionString('postgres://org-a-own-db'),
      }));

      await expect(service.resolveTenant('org_a')).resolves.toMatchObject({
        connectionString: 'postgres://org-a-own-db',
        region: 'aws-us-east-1',
      });
    });

    it('still serves a shared row in SHARED mode', async () => {
      // The guard must not fire before the flip — this is the no-op criterion.
      envValues.TENANCY_MODE = 'shared';
      findFirst.mockResolvedValue(tenantRow({
        region: 'shared',
        connectionStringEncrypted: encryptConnectionString('postgres://shared-tenant'),
      }));

      await expect(service.resolveTenant('org_a')).resolves.toMatchObject({
        connectionString: 'postgres://shared-tenant',
      });
    });
  });
});

describe('connectionHost', () => {
  it('logs the host and NEVER the credentials', async () => {
    const { connectionHost } = await import('./TenantDirectoryService');
    // A connection string carries a password. This runs on every resolution,
    // so a naive log of the whole string would put tenant database passwords
    // into Better Stack permanently.
    const host = connectionHost(
      'postgresql://neondb_owner:npg_secret_not_real@ep-x-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
    );

    expect(host).toBe('ep-x-pooler.us-east-1.aws.neon.tech');
    expect(host).not.toContain('npg_secret_not_real');
    expect(host).not.toContain('neondb_owner');
  });

  it('degrades rather than throwing on an unparseable string', async () => {
    // Logging must never be able to break a database resolution.
    const { connectionHost } = await import('./TenantDirectoryService');

    expect(connectionHost('__shared_database__')).toBe('unparseable');
  });
});
