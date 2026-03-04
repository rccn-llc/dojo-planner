import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock Env
vi.mock('./Env', () => ({
  Env: {
    IQPRO_CLIENT_ID: 'test-client-id',
    IQPRO_CLIENT_SECRET: 'test-client-secret',
    IQPRO_SCOPE: 'test-scope',
    IQPRO_OAUTH_URL: 'https://sandbox.oauth.example.com/token',
    IQPRO_BASE_URL: 'https://sandbox.api.basyspro.com',
    IQPRO_GATEWAY_ID: 'test-gateway-id',
  },
}));

// Mock Logger
vi.mock('./Logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('tokenizeAch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset cached OAuth token between tests
  });

  async function getTokenizeAch() {
    const mod = await import('./IQPro');
    mod.resetOAuthToken();
    return mod.tokenizeAch;
  }

  function mockOAuthAndAchTokenize(achResponse: Response) {
    mockFetch
      // First call: OAuth token request
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'test-bearer-token-123',
        expires_in: 3600,
      }), { status: 200 }))
      // Second call: ACH tokenization
      .mockResolvedValueOnce(achResponse);
  }

  it('should tokenize ACH successfully and return achToken', async () => {
    const tokenizeAch = await getTokenizeAch();

    mockOAuthAndAchTokenize(
      new Response(JSON.stringify({ achToken: 'ach-tok-abc123' }), { status: 200 }),
    );

    const result = await tokenizeAch({
      accountNumber: '123456789',
      routingNumber: '021000021',
      achAccountType: 'Checking',
    });

    expect(result).toEqual({ achToken: 'ach-tok-abc123' });

    // Verify the ACH tokenization fetch call
    const achCall = mockFetch.mock.calls[1]!;

    expect(achCall[0]).toBe('https://sandbox.api.basyspro.com/vault/api/v1/Tokenize/Ach');
    expect(achCall[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-bearer-token-123',
        'Content-Type': 'application/json',
      },
    });

    const body = JSON.parse(achCall[1].body);

    expect(body).toEqual({
      accountNumber: '123456789',
      routingNumber: '021000021',
      secCode: 'WEB',
      achAccountType: 'Checking',
    });
  });

  it('should handle achToken nested in data object', async () => {
    const tokenizeAch = await getTokenizeAch();

    mockOAuthAndAchTokenize(
      new Response(JSON.stringify({ data: { achToken: 'ach-tok-nested' } }), { status: 200 }),
    );

    const result = await tokenizeAch({
      accountNumber: '987654321',
      routingNumber: '021000021',
    });

    expect(result).toEqual({ achToken: 'ach-tok-nested' });
  });

  it('should handle token field as fallback', async () => {
    const tokenizeAch = await getTokenizeAch();

    mockOAuthAndAchTokenize(
      new Response(JSON.stringify({ token: 'ach-tok-fallback' }), { status: 200 }),
    );

    const result = await tokenizeAch({
      accountNumber: '987654321',
      routingNumber: '021000021',
    });

    expect(result).toEqual({ achToken: 'ach-tok-fallback' });
  });

  it('should default secCode to WEB and achAccountType to Checking', async () => {
    const tokenizeAch = await getTokenizeAch();

    mockOAuthAndAchTokenize(
      new Response(JSON.stringify({ achToken: 'ach-tok-defaults' }), { status: 200 }),
    );

    await tokenizeAch({
      accountNumber: '123456789',
      routingNumber: '021000021',
    });

    const body = JSON.parse(mockFetch.mock.calls[1]![1].body);

    expect(body.secCode).toBe('WEB');
    expect(body.achAccountType).toBe('Checking');
  });

  it('should pass Savings account type when specified', async () => {
    const tokenizeAch = await getTokenizeAch();

    mockOAuthAndAchTokenize(
      new Response(JSON.stringify({ achToken: 'ach-tok-savings' }), { status: 200 }),
    );

    await tokenizeAch({
      accountNumber: '123456789',
      routingNumber: '021000021',
      achAccountType: 'Savings',
    });

    const body = JSON.parse(mockFetch.mock.calls[1]![1].body);

    expect(body.achAccountType).toBe('Savings');
  });

  it('should throw when API returns non-200 status', async () => {
    const tokenizeAch = await getTokenizeAch();

    mockOAuthAndAchTokenize(
      new Response('Bad Request', { status: 400 }),
    );

    await expect(tokenizeAch({
      accountNumber: '123456789',
      routingNumber: '021000021',
    })).rejects.toThrow('ACH tokenization failed: 400');
  });

  it('should throw when response is missing achToken', async () => {
    const tokenizeAch = await getTokenizeAch();

    mockOAuthAndAchTokenize(
      new Response(JSON.stringify({ someOtherField: 'value' }), { status: 200 }),
    );

    await expect(tokenizeAch({
      accountNumber: '123456789',
      routingNumber: '021000021',
    })).rejects.toThrow('ACH tokenization response missing achToken');
  });

  it('should throw when IQPro is not configured', async () => {
    // Override the Env mock to remove required values
    vi.doMock('./Env', () => ({
      Env: {
        IQPRO_CLIENT_ID: undefined,
        IQPRO_CLIENT_SECRET: undefined,
        IQPRO_SCOPE: undefined,
        IQPRO_OAUTH_URL: undefined,
        IQPRO_BASE_URL: undefined,
        IQPRO_GATEWAY_ID: undefined,
      },
    }));

    // Re-import to pick up new mock
    vi.resetModules();
    const { tokenizeAch } = await import('./IQPro');

    await expect(tokenizeAch({
      accountNumber: '123456789',
      routingNumber: '021000021',
    })).rejects.toThrow('IQPro is not configured');

    // Restore original mock for other tests
    vi.doMock('./Env', () => ({
      Env: {
        IQPRO_CLIENT_ID: 'test-client-id',
        IQPRO_CLIENT_SECRET: 'test-client-secret',
        IQPRO_SCOPE: 'test-scope',
        IQPRO_OAUTH_URL: 'https://sandbox.oauth.example.com/token',
        IQPRO_BASE_URL: 'https://sandbox.api.basyspro.com',
        IQPRO_GATEWAY_ID: 'test-gateway-id',
      },
    }));
  });
});
