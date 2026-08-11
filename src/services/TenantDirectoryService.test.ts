import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      findFirst.mockResolvedValue(undefined);

      await expect(service.resolveTenant('org_a')).rejects.toThrow(
        service.TenantNotProvisionedError,
      );
      // It consulted the real directory rather than taking the shortcut.
      expect(findFirst).toHaveBeenCalled();
    });

    it('falls through to the directory when the hatch is unset', async () => {
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
      findFirst.mockResolvedValue(undefined);

      await expect(service.resolveTenant('org_brand_new')).rejects.toThrow(
        service.TenantNotProvisionedError,
      );
      expect(insert).not.toHaveBeenCalled();
    });

    it('does not register when no encryption key is available', async () => {
      delete envValues.CONTROL_PLANE_ENCRYPTION_KEY;
      findFirst.mockResolvedValue(undefined);

      await expect(service.resolveTenant('org_brand_new')).rejects.toThrow(
        service.TenantNotProvisionedError,
      );
      expect(insert).not.toHaveBeenCalled();
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
      findFirst.mockResolvedValue(undefined);

      await expect(service.getDbForOrg('org_missing')).rejects.toThrow(
        service.TenantNotProvisionedError,
      );
      expect(getTenantDb).not.toHaveBeenCalled();
    });
  });
});
