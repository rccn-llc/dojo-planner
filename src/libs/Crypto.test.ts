import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

vi.mock('./Env', () => ({
  Env: {
    IQPRO_CONFIG_ENCRYPTION_KEY: TEST_KEY_HEX,
  },
}));

describe('Crypto', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('round-trips a plaintext value', async () => {
    const { encryptSecret, decryptSecret } = await import('./Crypto');
    const plaintext = 'my-super-secret-iqpro-client-secret-value';
    const cipher = encryptSecret(plaintext);

    expect(cipher).not.toBe(plaintext);
    expect(decryptSecret(cipher)).toBe(plaintext);
  });

  it('produces a fresh IV per encrypt (same plaintext → different ciphertext)', async () => {
    const { encryptSecret } = await import('./Crypto');
    const plaintext = 'identical-input';
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);

    expect(a).not.toBe(b);
  });

  it('rejects a tampered ciphertext (auth tag mismatch)', async () => {
    const { encryptSecret, decryptSecret } = await import('./Crypto');
    const cipher = encryptSecret('hello');
    const tampered = Buffer.from(cipher, 'base64');
    // Flip a bit deep inside the ciphertext body (past iv + tag).
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0x01;

    expect(() => decryptSecret(tampered.toString('base64'))).toThrow();
  });

  it('rejects truncated payloads', async () => {
    const { decryptSecret } = await import('./Crypto');

    expect(() => decryptSecret('AAAA')).toThrow('too short');
  });

  it('throws a clear error when the key env var is missing', async () => {
    vi.doMock('./Env', () => ({
      Env: { IQPRO_CONFIG_ENCRYPTION_KEY: undefined },
    }));
    const { encryptSecret } = await import('./Crypto');

    expect(() => encryptSecret('x')).toThrow('IQPRO_CONFIG_ENCRYPTION_KEY');
  });
});
