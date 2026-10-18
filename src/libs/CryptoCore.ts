/**
 * AES-256-GCM primitives with an EXPLICIT key, shared by `Crypto.ts` and the
 * ops scripts.
 *
 * Kept free of `@/libs/Env` on purpose: importing `Env` validates the whole
 * application environment, which an operator running a script against a remote
 * database has no reason to hold (see `src/libs/EnvFiles.ts`). `Crypto.ts`
 * resolves the key from `Env` and delegates here, so the app and the scripts
 * cannot drift onto two on-disk formats.
 *
 * Format on disk: base64( iv (12 bytes) || authTag (16 bytes) || ciphertext ) —
 * byte-identical to what the kiosk's `src/lib/crypto.ts` reads.
 */

import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_HEX_PATTERN = /^[0-9a-f]{64}$/i;

/** Parse a 32-byte hex key, throwing a message that names the problem. */
export function parseKeyHex(hex: string, name = 'encryption key'): Buffer {
  if (!KEY_HEX_PATTERN.test(hex)) {
    throw new Error(`${name} must be 64 hex chars (32 bytes)`);
  }
  return Buffer.from(hex, 'hex');
}

/** Encrypt with a fresh IV per call — never reuse one under GCM. */
export function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/** Throws on a wrong key, a truncated payload, or a failed auth tag. */
export function decryptWithKey(ciphertextB64: string, key: Buffer): string {
  const buf = Buffer.from(ciphertextB64, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('encrypted payload is too short');
  }
  const decipher = createDecipheriv(ALGORITHM, key, buf.subarray(0, IV_BYTES));
  decipher.setAuthTag(buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(buf.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
}
