import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptWithKey, encryptWithKey, parseKeyHex } from './CryptoCore';
import { decryptConnectionString } from './TenantCrypto';

const KEY_HEX = randomBytes(32).toString('hex');

describe('parseKeyHex', () => {
  it('accepts a 64-char hex key', () => {
    expect(parseKeyHex(KEY_HEX)).toHaveLength(32);
  });

  it('rejects a key of the wrong length or alphabet, naming the variable', () => {
    expect(() => parseKeyHex('abc', 'IQPRO_CONFIG_ENCRYPTION_KEY')).toThrow(/IQPRO_CONFIG_ENCRYPTION_KEY must be 64 hex chars/);
    expect(() => parseKeyHex('z'.repeat(64))).toThrow(/64 hex chars/);
  });
});

describe('encryptWithKey / decryptWithKey', () => {
  const key = parseKeyHex(KEY_HEX);

  it('round-trips', () => {
    expect(decryptWithKey(encryptWithKey('{"provider":"iqpro"}', key), key)).toBe('{"provider":"iqpro"}');
  });

  it('uses a fresh IV per call', () => {
    expect(encryptWithKey('same', key)).not.toBe(encryptWithKey('same', key));
  });

  it('throws on the wrong key rather than returning garbage', () => {
    const other = parseKeyHex(randomBytes(32).toString('hex'));

    expect(() => decryptWithKey(encryptWithKey('secret', key), other)).toThrow();
  });

  it('throws on a truncated payload', () => {
    expect(() => decryptWithKey('AAAA', key)).toThrow(/too short/);
  });

  it('shares the on-disk format with the tenant connection-string cipher', () => {
    // One format everywhere: a blob written here must be readable by every
    // other AES-GCM reader in both apps.
    expect(decryptConnectionString(encryptWithKey('postgres://x', key), key)).toBe('postgres://x');
  });
});
