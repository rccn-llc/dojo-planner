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
      // Separate planes so auto-registration cannot mask the assertion.
      envValues.CONTROL_DATABASE_URL = 'postgres://control';
      envValues.DATABASE_URL = 'postgres://tenant';
      // The split is now EXPLICIT: distinct connection strings alone no longer
      // separate the planes, so that a deployment can populate and migrate the
      // control database while still serving traffic in shared mode.
      envValues.TENANCY_MODE = 'split';
      findFirst.mockResolvedValue(undefined);

      await expect(service.resolveTenant('org_a')).rejects.toThrow(
        service.TenantNotProvisionedError,
      );
      // It consulted the real directory rather than taking the shortcut.
      expect(findFirst).toHaveBeenCalled();
    });

    it('falls through to the directory when the hatch is unset', async () => {
      envValues.CONTROL_DATABASE_URL = 'postgres://control';
      envValues.DATABASE_URL = 'postgres://tenant';
      // The split is now EXPLICIT: distinct connection strings alone no longer
      // separate the planes, so that a deployment can populate and migrate the
      // control database while still serving traffic in shared mode.
      envValues.TENANCY_MODE = 'split';
      findFirst.mockResolvedValue(undefined);

      await expect(service.resolveTenant('org_a')).rejects.toThrow(
        service.TenantNotProvisionedError,
      );
      expect(findFirst).toHaveBeenCalled();
    });
  });

  describe('resolution errors', () => {
    beforeEach(() => {
      envValues.CONTROL_PLANE_ENCRYPTION_KEY = 'a'.repeat(64);
    });

    it('throws TenantNotProvisionedError when no row exists and auto-registration is off', async () => {
      // A distinct control database means the planes have been separated, so
      // provisioning is explicit from that point on.
      envValues.CONTROL_DATABASE_URL = 'postgres://control';
      envValues.DATABASE_URL = 'postgres://tenant';
      // The split is now EXPLICIT: distinct connection strings alone no longer
      // separate the planes, so that a deployment can populate and migrate the
      // control database while still serving traffic in shared mode.
      envValues.TENANCY_MODE = 'split';
      findFirst.mockResolvedValue(undefined);

      await expect(service.resolveTenant('org_missing')).rejects.toThrow(
        service.TenantNotProvisionedError,
      );
      expect(insert).not.toHaveBeenCalled();
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

  describe('auto-registration', () => {
    beforeEach(() => {
      envValues.CONTROL_PLANE_ENCRYPTION_KEY = 'a'.repeat(64);
      envValues.DATABASE_URL = 'postgres://shared';
      // No CONTROL_DATABASE_URL: both planes still share one database.
    });

    it('registers an unknown organization against the shared database', async () => {
      // A Clerk org can be created at any time — self-serve signup, the Clerk
      // dashboard, an E2E fixture — and none of those know about this app's
      // tenant directory. Failing here would leave the dashboard dead until
      // someone ran a script by hand.
      findFirst.mockResolvedValue(undefined);

      const tenant = await service.resolveTenant('org_brand_new');

      expect(tenant.orgId).toBe('org_brand_new');
      expect(tenant.connectionString).toBe('postgres://shared');
      expect(tenant.status).toBe('active');
      expect(insert).toHaveBeenCalled();
    });

    it('writes a row that decrypts back to the shared connection string', async () => {
      findFirst.mockResolvedValue(undefined);

      await service.resolveTenant('org_brand_new');

      const written = values.mock.calls[0]?.[0];

      expect(written?.connectionStringEncrypted).toBeTruthy();

      // Round-trip through the resolver's own decryption path: seed the row it
      // just wrote and confirm it reads back.
      service.resetTenantDirectoryCache();
      findFirst.mockResolvedValue(tenantRow({
        orgId: 'org_brand_new',
        connectionStringEncrypted: written?.connectionStringEncrypted,
      }));

      const reread = await service.resolveTenant('org_brand_new');

      expect(reread.connectionString).toBe('postgres://shared');
    });

    it('tolerates a concurrent insert (ON CONFLICT DO NOTHING)', async () => {
      findFirst.mockResolvedValue(undefined);

      await service.resolveTenant('org_brand_new');

      expect(onConflictDoNothing).toHaveBeenCalled();
    });

    it('is DISABLED once the control plane is a separate database', async () => {
      // The signal that tenants have been split out. From that point a missing
      // row must fail loudly — silently pointing an unknown org at the shared
      // database would be a cross-tenant leak.
      envValues.CONTROL_DATABASE_URL = 'postgres://control';
      envValues.TENANCY_MODE = 'split';
      findFirst.mockResolvedValue(undefined);

      await expect(service.resolveTenant('org_brand_new')).rejects.toThrow(
        service.TenantNotProvisionedError,
      );
      expect(insert).not.toHaveBeenCalled();
    });

    it('still registers when NO encryption key is configured', async () => {
      // Regression guard: CI provides only CLERK_SECRET_KEY. Requiring a key
      // here made auto-registration silently decline, so every E2E run failed
      // with "No provisioned tenant database". While all orgs share one
      // database the stored value is DATABASE_URL — something the process
      // already holds in plaintext — so a key protects nothing.
      delete envValues.CONTROL_PLANE_ENCRYPTION_KEY;
      delete envValues.IQPRO_CONFIG_ENCRYPTION_KEY;
      findFirst.mockResolvedValue(undefined);

      const tenant = await service.resolveTenant('org_brand_new');

      expect(tenant.connectionString).toBe('postgres://shared');
      expect(insert).toHaveBeenCalled();
      // Stores a marker, never a plaintext connection string.
      expect(values.mock.calls[0]?.[0]?.connectionStringEncrypted).toBe('__shared_database__');
    });

    it('reads the sentinel back as DATABASE_URL', async () => {
      delete envValues.CONTROL_PLANE_ENCRYPTION_KEY;
      delete envValues.IQPRO_CONFIG_ENCRYPTION_KEY;
      findFirst.mockResolvedValue(tenantRow({
        connectionStringEncrypted: '__shared_database__',
      }));

      const tenant = await service.resolveTenant('org_a');

      expect(tenant.connectionString).toBe('postgres://shared');
    });

    it('REFUSES a sentinel row once the planes are separated', async () => {
      // Such a row predates the split. Silently routing that org to the control
      // database would be a cross-tenant leak, so it must fail loudly and be
      // re-provisioned with a real connection string.
      envValues.CONTROL_DATABASE_URL = 'postgres://control';
      envValues.TENANCY_MODE = 'split';
      findFirst.mockResolvedValue(tenantRow({
        connectionStringEncrypted: '__shared_database__',
      }));

      // Typed, not a bare Error: the RPC layer maps known tenancy errors to
      // clear statuses and logs them. An untyped throw fell through to a bare
      // 500 with nothing logged — the opposite of the loud failure split mode
      // is supposed to produce.
      await expect(service.resolveTenant('org_a')).rejects.toThrow(
        service.TenantNotMigratedError,
      );
    });

    it('turns a missing `tenant` table into an actionable deployment error', async () => {
      // A database that predates the control-plane DDL. drizzle records the
      // baseline as applied and will not re-run it, so this is a real and
      // recurring failure mode — it must name the fix rather than surface as a
      // raw Postgres 42P01 on every RPC call.
      const pgError = Object.assign(new Error('relation "tenant" does not exist'), {
        code: '42P01',
      });
      findFirst.mockRejectedValue(pgError);

      await expect(service.resolveTenant('org_a')).rejects.toThrow(
        service.ControlPlaneNotMigratedError,
      );
      await expect(service.resolveTenant('org_a')).rejects.toThrow(/rm -rf local\.db/);
    });

    it('detects the missing table when the driver error is nested under cause', async () => {
      // drizzle re-wraps the driver error, so the pg code moves to `cause`.
      const wrapped = Object.assign(new Error('Failed query'), {
        cause: { code: '42P01' },
      });
      findFirst.mockRejectedValue(wrapped);

      await expect(service.resolveTenant('org_a')).rejects.toThrow(
        service.ControlPlaneNotMigratedError,
      );
    });

    it('rethrows unrelated database errors untouched', async () => {
      findFirst.mockRejectedValue(new Error('connection terminated'));

      await expect(service.resolveTenant('org_a')).rejects.toThrow(/connection terminated/);
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

    it('propagates resolution failures rather than opening a connection', async () => {
      // Separate planes: auto-registration is off, so a missing row is fatal.
      envValues.CONTROL_DATABASE_URL = 'postgres://control';
      envValues.DATABASE_URL = 'postgres://tenant';
      // The split is now EXPLICIT: distinct connection strings alone no longer
      // separate the planes, so that a deployment can populate and migrate the
      // control database while still serving traffic in shared mode.
      envValues.TENANCY_MODE = 'split';
      findFirst.mockResolvedValue(undefined);

      await expect(service.getDbForOrg('org_missing')).rejects.toThrow(
        service.TenantNotProvisionedError,
      );
      expect(getTenantDb).not.toHaveBeenCalled();
    });
  });

  describe('tenancy mode is explicit, not derived', () => {
    // The regression this guards: five behaviours used to flip off the implicit
    // comparison `CONTROL_DATABASE_URL !== DATABASE_URL` — auto-registration,
    // sentinel handling, control-pool sizing, webhook routing, and resolution.
    // Setting one variable flipped all five at once, and one of them (the webhook
    // bootstrap) fails SILENTLY, turning payment status updates into no-ops.
    //
    // Decoupling them is what lets a deployment populate and migrate the control
    // database, verify it, and only then flip the mode.
    it('stays in shared mode when CONTROL_DATABASE_URL is distinct but the mode is unset', async () => {
      envValues.CONTROL_DATABASE_URL = 'postgres://control';
      envValues.DATABASE_URL = 'postgres://tenant';
      delete envValues.TENANCY_MODE;
      findFirst.mockResolvedValue(undefined);

      // Auto-registration is a shared-mode-only behaviour, so it proves the mode.
      const record = await service.resolveTenant('org_staged');

      expect(record.connectionString).toBe('postgres://tenant');
      expect(insert).toHaveBeenCalled();
    });

    it('separates the planes when the mode says so, regardless of the URLs', async () => {
      // Same connection string on both sides — during a staged rollout the flag
      // is what matters, not whether the strings happen to differ.
      envValues.CONTROL_DATABASE_URL = 'postgres://same';
      envValues.DATABASE_URL = 'postgres://same';
      envValues.TENANCY_MODE = 'split';
      findFirst.mockResolvedValue(undefined);

      await expect(service.resolveTenant('org_split')).rejects.toThrow(
        service.TenantNotProvisionedError,
      );
    });
  });

  describe('shared-database rows in split mode', () => {
    beforeEach(() => {
      envValues.CONTROL_DATABASE_URL = 'postgres://control';
      envValues.DATABASE_URL = 'postgres://shared-tenant';
      envValues.TENANCY_MODE = 'split';
      envValues.CONTROL_PLANE_ENCRYPTION_KEY = TEST_KEY_HEX;
    });

    it('REFUSES a row whose connection string IS the shared database', async () => {
      // The A2 hole. `registerTenants.ts` encrypts DATABASE_URL as every
      // tenant's connection string and labels the row with a plausible real
      // region ('aws-us-east-1'), so a region-based guard waves it through.
      // The ciphertext decrypts cleanly and every org lands on one database —
      // silently. Checking the DECRYPTED string is what closes it.
      findFirst.mockResolvedValue(tenantRow({
        region: 'aws-us-east-1',
        connectionStringEncrypted: encryptConnectionString('postgres://shared-tenant'),
      }));

      await expect(service.resolveTenant('org_a')).rejects.toThrow(
        service.TenantNotMigratedError,
      );
    });

    it('REFUSES a row pointing at the CONTROL database', async () => {
      findFirst.mockResolvedValue(tenantRow({
        region: 'aws-us-east-1',
        connectionStringEncrypted: encryptConnectionString('postgres://control'),
      }));

      await expect(service.resolveTenant('org_a')).rejects.toThrow(
        service.TenantNotMigratedError,
      );
    });

    it('REFUSES a shared-era region label even when the string differs', async () => {
      // Belt and braces: a row that was never re-provisioned.
      findFirst.mockResolvedValue(tenantRow({
        region: 'local',
        connectionStringEncrypted: encryptConnectionString('postgres://somewhere-else'),
      }));

      await expect(service.resolveTenant('org_a')).rejects.toThrow(
        service.TenantNotMigratedError,
      );
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
