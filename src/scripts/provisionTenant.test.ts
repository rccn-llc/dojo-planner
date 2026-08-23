import { beforeEach, describe, expect, it, vi } from 'vitest';

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
