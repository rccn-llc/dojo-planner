import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The isolation guard is the reason this script exists: a `tenant` row that
 * points at the shared database, or at a database another org already holds, is
 * not a provisioned tenant. Enforcing it here means such a row is never written;
 * `resolveTenant` enforces the same rule at read time.
 */

const selectRows = vi.fn();
const controlDb = { select: () => ({ from: () => selectRows() }) } as never;

vi.mock('pg', () => ({
  Pool: class {
    async query() {
      return { rows: [] };
    }

    async end() {}
  },
}));

const KEY_HEX = 'a'.repeat(64);

async function loadGuard() {
  vi.resetModules();
  process.env.CONTROL_PLANE_ENCRYPTION_KEY = KEY_HEX;
  process.env.DATABASE_URL = 'postgres://shared';
  process.env.CONTROL_DATABASE_URL = 'postgres://control';
  const mod = await import('./provisionTenant');
  return mod.assertDistinctDatabase;
}

describe('assertDistinctDatabase', () => {
  beforeEach(() => {
    selectRows.mockResolvedValue([]);
  });

  it('refuses the shared database', async () => {
    const assertDistinct = await loadGuard();

    await expect(assertDistinct(controlDb, 'org_a', 'postgres://shared'))
      .rejects
      .toThrow(/SHARED database/);
  });

  it('refuses the control database', async () => {
    const assertDistinct = await loadGuard();

    await expect(assertDistinct(controlDb, 'org_a', 'postgres://control'))
      .rejects
      .toThrow(/CONTROL database/);
  });

  it('refuses a database another organization already holds', async () => {
    // Two orgs on one database is the exact failure this migration prevents,
    // and no `region` label would reveal it.
    const { encryptConnectionString } = await import('../libs/TenantCrypto');
    const { Buffer } = await import('node:buffer');
    selectRows.mockResolvedValue([{
      orgId: 'org_other',
      connectionStringEncrypted: encryptConnectionString(
        'postgres://taken',
        Buffer.from(KEY_HEX, 'hex'),
      ),
    }]);
    const assertDistinct = await loadGuard();

    await expect(assertDistinct(controlDb, 'org_a', 'postgres://taken'))
      .rejects
      .toThrow(/already belongs to org_other/);
  });

  it('accepts a genuinely distinct, reachable database', async () => {
    const assertDistinct = await loadGuard();

    await expect(assertDistinct(controlDb, 'org_a', 'postgres://org-a-own'))
      .resolves
      .toBeUndefined();
  });

  it('ignores an undecryptable row rather than failing the whole provision', async () => {
    // A corrupt row is checkTenantReadiness's problem; it cannot collide.
    selectRows.mockResolvedValue([
      { orgId: 'org_other', connectionStringEncrypted: 'not-valid-ciphertext' },
    ]);
    const assertDistinct = await loadGuard();

    await expect(assertDistinct(controlDb, 'org_a', 'postgres://org-a-own'))
      .resolves
      .toBeUndefined();
  });
});

describe('isAlreadyCutOver — the provisioning guard', () => {
  const SHARED = 'postgres://shared';
  const CONTROL = 'postgres://control';

  beforeEach(() => {
    process.env.CONTROL_PLANE_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('does NOT refuse a registerTenants row, which is active on the SHARED database', async () => {
    // The bug this pins: the guard checked `status === 'active'`, but
    // registerTenants writes 'active' for every org it registers against the
    // shared database. That made the normal starting state for a cutover —
    // registered, active, shared — permanently unprovisionable.
    const { encryptConnectionString, tenantEncryptionKey } = await import('../libs/TenantCrypto');
    const { isAlreadyCutOver } = await import('./provisionTenant');
    const stored = encryptConnectionString(SHARED, tenantEncryptionKey()!);

    expect(isAlreadyCutOver(stored, SHARED, CONTROL)).toBe(false);
  });

  it('does not refuse a sentinel row', async () => {
    const { SHARED_DATABASE_SENTINEL } = await import('../libs/TenantCrypto');
    const { isAlreadyCutOver } = await import('./provisionTenant');

    expect(isAlreadyCutOver(SHARED_DATABASE_SENTINEL, SHARED, CONTROL)).toBe(false);
  });

  it('REFUSES an org already on its own database', async () => {
    // Re-provisioning would mint a second Neon project and overwrite the row,
    // orphaning the first database with that org's data still in it.
    const { encryptConnectionString, tenantEncryptionKey } = await import('../libs/TenantCrypto');
    const { isAlreadyCutOver } = await import('./provisionTenant');
    const stored = encryptConnectionString('postgres://tenant-a', tenantEncryptionKey()!);

    expect(isAlreadyCutOver(stored, SHARED, CONTROL)).toBe(true);
  });

  it('does not treat an undecryptable row as cut over', async () => {
    // A key mismatch should surface as a real error later, not as a silent
    // "nothing to do" that looks like success.
    const { isAlreadyCutOver } = await import('./provisionTenant');

    expect(isAlreadyCutOver('not-valid-ciphertext', SHARED, CONTROL)).toBe(false);
  });
});

describe('expectedTableNames — what a complete schema means', () => {
  it('parses every table the baseline creates', async () => {
    // Used to decide whether a pre-existing destination is fully migrated. If
    // this under-counts, a healthy database gets rejected; if it over-counts,
    // a partial one gets accepted and the copy fails part-way through.
    const { expectedTableNames } = await import('./provisionTenant');
    const names = expectedTableNames();

    expect(names.length).toBe(42);
    expect(names).toContain('member');
    expect(names).toContain('tenant');
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('isAlreadyCutOver — failing closed', () => {
  beforeEach(() => {
    process.env.CONTROL_PLANE_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('THROWS when the shared connection string is unknown', async () => {
    // The bug: with DATABASE_URL unset, `decrypted !== undefined` is true for
    // EVERY row, so every org looked cut over and provisioning refused with
    // "nothing to do" — a guard failing OPEN. It must refuse to answer instead.
    const { encryptConnectionString, tenantEncryptionKey } = await import('../libs/TenantCrypto');
    const { isAlreadyCutOver } = await import('./provisionTenant');
    const stored = encryptConnectionString('postgres://shared', tenantEncryptionKey()!);

    expect(() => isAlreadyCutOver(stored, undefined, 'postgres://control')).toThrow(/DATABASE_URL is not set/);
  });
});

describe('--repoint parsing', () => {
  const original = process.argv;

  afterEach(() => {
    process.argv = original;
  });

  it('carries the org id so it cannot be re-run against a different org', async () => {
    // Matches purgeTenantData's double-confirmation: --repoint takes a LIVE
    // org out of service, so a command recalled from shell history must not
    // apply to an org it was never reviewed against.
    process.argv = [
      'node',
      'provisionTenant',
      '--orgId=org_a',
      '--connection-string=postgres://new',
      '--repoint=org_a',
    ];
    const { parseArgsForTest } = await import('./provisionTenant');

    expect(parseArgsForTest()).toMatchObject({ orgId: 'org_a', repoint: 'org_a' });
  });

  it('is undefined when the flag is absent, so the guard still refuses', async () => {
    process.argv = ['node', 'provisionTenant', '--orgId=org_a', '--connection-string=postgres://new'];
    const { parseArgsForTest } = await import('./provisionTenant');

    expect(parseArgsForTest().repoint).toBeUndefined();
  });

  it('requires --connection-string, since this script no longer creates databases', async () => {
    process.argv = ['node', 'provisionTenant', '--orgId=org_a'];
    const { parseArgsForTest } = await import('./provisionTenant');

    expect(() => parseArgsForTest()).toThrow(/does not mint databases/);
  });
});
