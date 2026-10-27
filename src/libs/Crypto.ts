/**
 * AES-256-GCM encryption helpers for IQPro `client_secret` values stored in
 * the database. The key is read from `IQPRO_CONFIG_ENCRYPTION_KEY` (32 raw
 * bytes, hex-encoded) at call time so test setups that mutate `process.env`
 * see the new value without restarting the module.
 *
 * Format on disk: base64( iv (12 bytes) || authTag (16 bytes) || ciphertext )
 * The primitives live in `CryptoCore.ts` so Env-free scripts share the format.
 */

import { Buffer } from 'node:buffer';
import { decryptWithKey, encryptWithKey } from './CryptoCore';
import { Env } from './Env';

function loadKey(): Buffer {
  const hex = Env.IQPRO_CONFIG_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('IQPRO_CONFIG_ENCRYPTION_KEY is not set; cannot encrypt or decrypt IQPro secrets');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plaintext: string): string {
  return encryptWithKey(plaintext, loadKey());
}

export function decryptSecret(ciphertextB64: string): string {
  return decryptWithKey(ciphertextB64, loadKey());
}
