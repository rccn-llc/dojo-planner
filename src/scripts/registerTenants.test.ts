import { Buffer } from 'node:buffer';
import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SHARED_DATABASE_SENTINEL } from '../libs/TenantCrypto';
import { assertNoTenantCutOver } from './registerTenants';

const KEY = Buffer.from('a'.repeat(64), 'hex');
const SHARED = 'postgres://shared';

/** Same envelope TenantCrypto writes: base64(iv || authTag || ciphertext). */
function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function dbReturning(rows: { orgId: string; encrypted: string }[]) {
  return { select: () => ({ from: () => Promise.resolve(rows) }) } as never;
}

describe('assertNoTenantCutOver — the destructive-script guard', () => {
  it('REFUSES once any organization is on its own database', async () => {
    // This script writes ONE connection string as EVERY tenant's. Running it
    // after a cutover would overwrite that org's real string with the shared
    // one and route every organization into shared data.
    const db = dbReturning([
      { orgId: 'org_shared', encrypted: SHARED_DATABASE_SENTINEL },
      { orgId: 'org_cutover', encrypted: encrypt('postgres://tenant-a') },
    ]);

    await expect(assertNoTenantCutOver(db, SHARED, KEY)).rejects.toThrow(/org_cutover/);
  });

  it('catches a cut-over row whose REGION still says shared-era', async () => {
    // The A2 leak. `registerTenants` itself writes region 'aws-us-east-1', so a
    // region-based guard passes rows it should stop. The predicate must be the
    // decrypted connection string.
    const db = dbReturning([
      { orgId: 'org_cutover', encrypted: encrypt('postgres://tenant-a') },
    ]);

    await expect(assertNoTenantCutOver(db, SHARED, KEY)).rejects.toThrow(/already on their own database/);
  });

  it('allows the run while every row still points at the shared database', async () => {
    // Both encodings of "not cut over" must pass: the sentinel, and a row
    // encrypted from DATABASE_URL (what this script itself writes).
    const db = dbReturning([
      { orgId: 'org_a', encrypted: SHARED_DATABASE_SENTINEL },
      { orgId: 'org_b', encrypted: encrypt(SHARED) },
    ]);

    await expect(assertNoTenantCutOver(db, SHARED, KEY)).resolves.toBeUndefined();
  });

  it('allows the run on a fresh control plane with no tenant rows', async () => {
    await expect(assertNoTenantCutOver(dbReturning([]), SHARED, KEY)).resolves.toBeUndefined();
  });

  it('does not mistake an undecryptable row for a cutover', async () => {
    // A key mismatch is a real problem, but it is checkTenantReadiness's to
    // report. Treating it as a cutover here would block the script with a
    // misleading message naming an org that may not be cut over at all.
    const db = dbReturning([{ orgId: 'org_bad_key', encrypted: 'not-valid-ciphertext' }]);

    await expect(assertNoTenantCutOver(db, SHARED, KEY)).resolves.toBeUndefined();
  });
});

describe('module import safety', () => {
  it('does not run main() on import', async () => {
    // Importing used to execute main() as a side effect, which opens a database
    // and calls process.exit(1) on failure — surfacing in vitest as an
    // unhandled rejection that can mask a real failure elsewhere.
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await import('./registerTenants');

    expect(exit).not.toHaveBeenCalled();

    exit.mockRestore();
  });
});
