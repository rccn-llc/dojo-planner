import { Buffer } from 'node:buffer';
import { constants, generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const envMock: { SERVICE_FEE_PCT: string; IQPRO_WEBHOOK_PUBLIC_KEY_OVERRIDE?: string } = { SERVICE_FEE_PCT: '3.75' };
vi.mock('./Env', () => ({ Env: envMock }));

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
vi.mock('./Logger', () => ({ logger: mockLogger }));

const testConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  gatewayId: 'test-gateway-id',
  scope: 'test-scope',
  oauthUrl: 'https://sandbox.oauth.example.com/token',
  baseUrl: 'https://sandbox.api.basyspro.com',
  source: 'env' as const,
};

// A real keypair: the signature check is crypto, and mocking it would test
// nothing. Generated once per file.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const PUBLIC_BARE = PUBLIC_PEM.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');

function signText(text: string): string {
  return sign('sha256', Buffer.from(text, 'utf8'), { key: privateKey, padding: constants.RSA_PKCS1_PADDING }).toString('base64');
}

/** Build a webhook body whose `resource` is the exact `resourceText`. */
function body(resourceText: string, signature: string, extra = ''): string {
  return `{"resourceType":"TRANSACTION","subType":"Sale","resource":${resourceText},"traceId":"t-1"${extra},"hashAlg":"SHA256","signatureAlg":"RSA","signature":"${signature}"}`;
}

function mockOAuthOk() {
  mockFetch.mockResolvedValueOnce(new Response(
    JSON.stringify({ access_token: 'test-bearer-token', expires_in: 3600 }),
    { status: 200 },
  ));
}

async function load() {
  const mod = await import('./IQPro');
  mod.resetOAuthTokenCache();
  mod.resetWebhookPublicKeyCache();
  return mod;
}

describe('toPublicKeyPem', () => {
  it('wraps a bare base64 key in PEM headers with 64-char lines', async () => {
    const { toPublicKeyPem } = await load();
    const pem = toPublicKeyPem(PUBLIC_BARE);
    const lines = pem.split('\n');

    expect(lines[0]).toBe('-----BEGIN PUBLIC KEY-----');
    expect(lines.at(-1)).toBe('-----END PUBLIC KEY-----');
    expect(lines.slice(1, -2).every(l => l.length === 64)).toBe(true);
  });

  it('passes an existing PEM through unchanged (trimmed)', async () => {
    const { toPublicKeyPem } = await load();

    expect(toPublicKeyPem(`  ${PUBLIC_PEM}  `)).toBe(PUBLIC_PEM.trim());
  });
});

describe('extractRawJsonMember', () => {
  it('returns the exact source text of a nested object', async () => {
    const { extractRawJsonMember } = await load();
    const raw = '{ "a": 1, "resource": {"x":{"y":[1,2,{"z":"}"}]},"amount":10.50}, "b": "c" }';

    expect(extractRawJsonMember(raw, 'resource')).toBe('{"x":{"y":[1,2,{"z":"}"}]},"amount":10.50}');
  });

  it('handles strings containing braces and escaped quotes before the target', async () => {
    const { extractRawJsonMember } = await load();
    const raw = '{"note":"a \\"quoted\\" {brace}","resource":{"k":"v"}}';

    expect(extractRawJsonMember(raw, 'resource')).toBe('{"k":"v"}');
  });

  it('returns scalar values verbatim', async () => {
    const { extractRawJsonMember } = await load();

    expect(extractRawJsonMember('{"n": 10.50, "t": true}', 'n')).toBe('10.50');
    expect(extractRawJsonMember('{"n": 10.50, "t": true}', 't')).toBe('true');
  });

  it('returns null when the member is absent or the input is not an object', async () => {
    const { extractRawJsonMember } = await load();

    expect(extractRawJsonMember('{"a":1}', 'resource')).toBeNull();
    expect(extractRawJsonMember('{}', 'resource')).toBeNull();
    expect(extractRawJsonMember('[1,2]', 'resource')).toBeNull();
    expect(extractRawJsonMember('{"a" 1}', 'resource')).toBeNull();
    expect(extractRawJsonMember('{a:1}', 'resource')).toBeNull();
    expect(extractRawJsonMember('{"resource":{"unterminated":', 'resource')).toBeNull();
    expect(extractRawJsonMember('{"resource":{"s":"unterminated', 'resource')).toBeNull();
  });
});

describe('verifyIQProWebhookSignature', () => {
  it('accepts a genuine signature over the resource', async () => {
    const { verifyIQProWebhookSignature } = await load();
    const resourceText = '{"transactionId":"tx-1","subscriptionId":"sub-1","status":"DECLINED"}';
    const raw = body(resourceText, signText(resourceText));

    expect(verifyIQProWebhookSignature({ rawBody: raw, resource: JSON.parse(resourceText), signature: signText(resourceText), publicKeyPem: PUBLIC_PEM })).toBe(true);
  });

  it('accepts a signature over .NET decimals that JSON.stringify would rewrite (raw-substring path)', async () => {
    const { verifyIQProWebhookSignature } = await load();
    const resourceText = '{"transactionRemit":{"amount":10.50},"status":"DECLINED"}';
    const sig = signText(resourceText);
    const raw = body(resourceText, sig);

    // Sanity: re-serializing loses the trailing zero, so only the raw path can pass.
    expect(JSON.stringify(JSON.parse(resourceText))).not.toBe(resourceText);
    expect(verifyIQProWebhookSignature({ rawBody: raw, resource: JSON.parse(resourceText), signature: sig, publicKeyPem: PUBLIC_PEM })).toBe(true);
  });

  it('falls back to re-serialization when the raw body is pretty-printed', async () => {
    const { verifyIQProWebhookSignature } = await load();
    const resource = { transactionId: 'tx-2', status: 'SETTLED' };
    const sig = signText(JSON.stringify(resource));
    const pretty = JSON.stringify({ resourceType: 'TRANSACTION', resource, signature: sig }, null, 2);

    expect(verifyIQProWebhookSignature({ rawBody: pretty, resource, signature: sig, publicKeyPem: PUBLIC_PEM })).toBe(true);
  });

  it('rejects a tampered resource', async () => {
    const { verifyIQProWebhookSignature } = await load();
    const original = '{"transactionId":"tx-1","status":"DECLINED"}';
    const tampered = '{"transactionId":"tx-1","status":"SETTLED"}';
    const sig = signText(original);

    expect(verifyIQProWebhookSignature({ rawBody: body(tampered, sig), resource: JSON.parse(tampered), signature: sig, publicKeyPem: PUBLIC_PEM })).toBe(false);
  });

  it('still verifies when unsigned top-level fields change', async () => {
    const { verifyIQProWebhookSignature } = await load();
    const resourceText = '{"transactionId":"tx-1"}';
    const sig = signText(resourceText);
    const raw = body(resourceText, sig, ',"actionDateTime":"2099-01-01T00:00:00Z"');

    expect(verifyIQProWebhookSignature({ rawBody: raw, resource: JSON.parse(resourceText), signature: sig, publicKeyPem: PUBLIC_PEM })).toBe(true);
  });

  it('rejects a signature from a different key', async () => {
    const { verifyIQProWebhookSignature } = await load();
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const resourceText = '{"transactionId":"tx-1"}';
    const sig = sign('sha256', Buffer.from(resourceText), { key: other.privateKey, padding: constants.RSA_PKCS1_PADDING }).toString('base64');

    expect(verifyIQProWebhookSignature({ rawBody: body(resourceText, sig), resource: JSON.parse(resourceText), signature: sig, publicKeyPem: PUBLIC_PEM })).toBe(false);
  });

  it.each([
    ['missing signature', { signature: null }],
    ['empty signature', { signature: '' }],
    ['non-base64 signature', { signature: 'not base64!!' }],
    ['url-safe base64 signature', { signature: 'ab-_cd' }],
    ['missing key', { publicKeyPem: null }],
    ['missing resource', { resource: undefined }],
    ['null resource', { resource: null }],
  ])('fails closed on %s', async (_label, override) => {
    const { verifyIQProWebhookSignature } = await load();
    const resourceText = '{"transactionId":"tx-1"}';
    const params = {
      rawBody: body(resourceText, signText(resourceText)),
      resource: JSON.parse(resourceText) as unknown,
      signature: signText(resourceText) as string | null,
      publicKeyPem: PUBLIC_PEM as string | null,
      ...override,
    };

    expect(verifyIQProWebhookSignature(params)).toBe(false);
  });

  it('fails closed on a malformed key rather than throwing', async () => {
    const { verifyIQProWebhookSignature } = await load();
    const resourceText = '{"transactionId":"tx-1"}';

    expect(verifyIQProWebhookSignature({
      rawBody: body(resourceText, signText(resourceText)),
      resource: JSON.parse(resourceText),
      signature: signText(resourceText),
      publicKeyPem: '-----BEGIN PUBLIC KEY-----\nnope\n-----END PUBLIC KEY-----',
    })).toBe(false);
  });
});

describe('getWebhookPublicKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete envMock.IQPRO_WEBHOOK_PUBLIC_KEY_OVERRIDE;
  });

  it('fetches data.webhookPublicKey from the gateway configuration and wraps it as PEM', async () => {
    const mod = await load();
    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { webhookPublicKey: PUBLIC_BARE } }), { status: 200 }));

    const pem = await mod.getWebhookPublicKey(testConfig);

    expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(mockFetch.mock.calls[1]![0]).toBe('https://sandbox.api.basyspro.com/api/gateway/test-gateway-id/configuration');
  });

  it('caches per gateway and refetches when forced', async () => {
    const mod = await load();
    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { webhookPublicKey: PUBLIC_BARE } }), { status: 200 }));
    await mod.getWebhookPublicKey(testConfig);
    await mod.getWebhookPublicKey(testConfig);

    expect(mockFetch).toHaveBeenCalledTimes(2); // oauth + one configuration GET

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { webhookPublicKey: PUBLIC_BARE } }), { status: 200 }));
    await mod.getWebhookPublicKey(testConfig, { force: true });

    expect(mockFetch).toHaveBeenCalledTimes(3); // token cached, second configuration GET
  });

  it('returns null and warns when the gateway has no webhook configured', async () => {
    const mod = await load();
    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { webhookPublicKey: null } }), { status: 200 }));

    await expect(mod.getWebhookPublicKey(testConfig)).resolves.toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('no webhookPublicKey'), expect.any(Object));
  });

  it('returns null and logs when the request fails', async () => {
    const mod = await load();
    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));

    await expect(mod.getWebhookPublicKey(testConfig)).resolves.toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith('[IQPro] Failed to fetch webhook public key', expect.any(Object));
  });

  it('returns null when a non-Error is thrown', async () => {
    const mod = await load();
    mockFetch.mockRejectedValueOnce('network down');

    await expect(mod.getWebhookPublicKey(testConfig)).resolves.toBeNull();
  });
});

describe('resolveWebhookPublicKey', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete envMock.IQPRO_WEBHOOK_PUBLIC_KEY_OVERRIDE;
    vi.stubEnv('NODE_ENV', originalNodeEnv ?? 'test');
  });

  it('uses the override outside production without calling IQPro', async () => {
    envMock.IQPRO_WEBHOOK_PUBLIC_KEY_OVERRIDE = PUBLIC_BARE;
    const mod = await load();

    const pem = await mod.resolveWebhookPublicKey(testConfig);

    expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('IGNORES the override in production and fetches the gateway key', async () => {
    envMock.IQPRO_WEBHOOK_PUBLIC_KEY_OVERRIDE = PUBLIC_BARE;
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await load();
    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { webhookPublicKey: null } }), { status: 200 }));

    const pem = await mod.resolveWebhookPublicKey(testConfig);

    expect(pem).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('IGNORED'));
  });

  it('fetches the gateway key when no override is set', async () => {
    const mod = await load();
    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { webhookPublicKey: PUBLIC_BARE } }), { status: 200 }));

    await expect(mod.resolveWebhookPublicKey(testConfig)).resolves.toContain('BEGIN PUBLIC KEY');
  });
});
