import { Buffer } from 'node:buffer';
import { createCipheriv, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptConnectionString, encryptConnectionString, tenantEncryptionKey } from './TenantCrypto';

const KEY_HEX = 'b'.repeat(64);
const CONN = 'postgresql://user:pass@ep-example-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved.CONTROL_PLANE_ENCRYPTION_KEY = process.env.CONTROL_PLANE_ENCRYPTION_KEY;
  saved.IQPRO_CONFIG_ENCRYPTION_KEY = process.env.IQPRO_CONFIG_ENCRYPTION_KEY;
  delete process.env.CONTROL_PLANE_ENCRYPTION_KEY;
  delete process.env.IQPRO_CONFIG_ENCRYPTION_KEY;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

describe('tenantEncryptionKey', () => {
  it('returns null when no key is configured', () => {
    expect(tenantEncryptionKey()).toBeNull();
  });

  it('prefers CONTROL_PLANE_ENCRYPTION_KEY over the IQPro key', () => {
    // The two secret domains are deliberately separate: a connection string is
    // a higher trust tier than a payment gateway id.
    process.env.CONTROL_PLANE_ENCRYPTION_KEY = KEY_HEX;
    process.env.IQPRO_CONFIG_ENCRYPTION_KEY = 'c'.repeat(64);

    expect(tenantEncryptionKey()?.toString('hex')).toBe(KEY_HEX);
  });

  it('falls back to the IQPro key so local dev works without a second secret', () => {
    process.env.IQPRO_CONFIG_ENCRYPTION_KEY = KEY_HEX;

    expect(tenantEncryptionKey()?.toString('hex')).toBe(KEY_HEX);
  });

  it('rejects a malformed key rather than producing garbage ciphertext', () => {
    process.env.CONTROL_PLANE_ENCRYPTION_KEY = 'not-hex';

    expect(() => tenantEncryptionKey()).toThrow(/64 hex chars/);
  });
});

describe('round trip', () => {
  const key = Buffer.from(KEY_HEX, 'hex');

  it('decrypts what it encrypted', () => {
    expect(decryptConnectionString(encryptConnectionString(CONN, key), key)).toBe(CONN);
  });

  it('uses a fresh IV per call, so identical inputs differ on disk', () => {
    // GCM catastrophically fails on IV reuse — and registerTenants encrypts the
    // SAME string once per org, which is exactly the reuse scenario.
    const a = encryptConnectionString(CONN, key);
    const b = encryptConnectionString(CONN, key);

    expect(a).not.toBe(b);
    expect(decryptConnectionString(a, key)).toBe(decryptConnectionString(b, key));
  });

  it('reads ciphertext produced by the pre-existing hand-rolled implementation', () => {
    // Four call sites hand-rolled this block before it was extracted. The stored
    // rows must stay readable, so the layout has to match byte-for-byte:
    // base64( iv(12) || authTag(16) || ciphertext ).
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(CONN, 'utf8'), cipher.final()]);
    const legacy = Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');

    expect(decryptConnectionString(legacy, key)).toBe(CONN);
  });

  it('rejects a truncated value rather than returning a partial string', () => {
    expect(() => decryptConnectionString('c2hvcnQ=', key)).toThrow(/too short/);
  });

  it('rejects a tampered auth tag', () => {
    const good = encryptConnectionString(CONN, key);
    const buf = Buffer.from(good, 'base64');
    buf[13] = buf[13]! ^ 0xFF; // flip a bit inside the auth tag

    expect(() => decryptConnectionString(buf.toString('base64'), key)).toThrow();
  });

  it('rejects the wrong key', () => {
    const other = Buffer.from('d'.repeat(64), 'hex');

    expect(() => decryptConnectionString(encryptConnectionString(CONN, key), other)).toThrow();
  });
});
