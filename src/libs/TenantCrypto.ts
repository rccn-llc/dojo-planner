import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import process from 'node:process';

/**
 * AES-256-GCM for tenant connection strings.
 *
 * ── Why this is separate from `libs/Crypto.ts` ──────────────────────────────
 *
 * Same algorithm and same on-disk layout, but a DIFFERENT key. A database
 * connection string is a higher trust tier than a payment gateway id, so the
 * two secret domains are deliberately kept apart. Merging them would mean one
 * compromised key exposes both.
 *
 * ── Why this reads process.env directly ─────────────────────────────────────
 *
 * Every consumer is either an ops script targeting a remote database
 * (`registerTenants`, `checkTenantReadiness`, `provisionTenant`, `seed`) or a
 * hot request path. Importing `@/libs/Env` would validate the WHOLE application
 * environment — Clerk, Stripe, the public keys — turning a two-variable job
 * into a full app config. Same reasoning as `migrateProviderConfigBlob.ts`.
 *
 * ── Layout ──────────────────────────────────────────────────────────────────
 *
 * base64( iv(12) || authTag(16) || ciphertext ) — identical to `libs/Crypto.ts`,
 * so ciphertext written by one is readable by the other given the same key.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * The tenant-connection key, or null when unset.
 *
 * Falls back to the IQPro key so local dev and CI keep working without a second
 * secret configured. Returns null rather than throwing: callers differ on
 * whether a missing key is fatal — `autoRegisterTenant` degrades to a sentinel,
 * the read path must hard-fail.
 */
export function tenantEncryptionKey(): Buffer | null {
  const hex = process.env.CONTROL_PLANE_ENCRYPTION_KEY ?? process.env.IQPRO_CONFIG_ENCRYPTION_KEY;
  if (!hex) {
    return null;
  }
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      'Tenant encryption key must be 64 hex chars (32 bytes). Check '
      + 'CONTROL_PLANE_ENCRYPTION_KEY.',
    );
  }
  return Buffer.from(hex, 'hex');
}

/** Encrypt a connection string. A fresh IV per call — never reuse one under GCM. */
export function encryptConnectionString(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

/**
 * Decrypt a stored connection string.
 *
 * Throws on a bad key, a truncated value, or a failed auth tag. That is
 * deliberate: returning a partial or garbage string would hand a caller
 * something it might try to connect to.
 */
export function decryptConnectionString(ciphertextB64: string, key: Buffer): string {
  const buf = Buffer.from(ciphertextB64, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('encrypted connection string is too short');
  }
  const decipher = createDecipheriv(ALGORITHM, key, buf.subarray(0, IV_BYTES));
  decipher.setAuthTag(buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(buf.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}
