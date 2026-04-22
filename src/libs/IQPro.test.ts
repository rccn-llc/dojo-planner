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

// Mock Logger — capture every log so tests can assert the full request/response
// payload tracing required for IQPro debugging.
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};
vi.mock('./Logger', () => ({
  logger: mockLogger,
}));

function mockOAuthOk() {
  mockFetch.mockResolvedValueOnce(new Response(
    JSON.stringify({ access_token: 'test-bearer-token-123', expires_in: 3600 }),
    { status: 200 },
  ));
}

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

  it('should handle achId nested in data object', async () => {
    const tokenizeAch = await getTokenizeAch();

    mockOAuthAndAchTokenize(
      new Response(JSON.stringify({ statusCode: 'OK', data: { achId: 'ach-id-vault', maskedAccount: '12*****89' } }), { status: 200 }),
    );

    const result = await tokenizeAch({
      accountNumber: '123456789',
      routingNumber: '021000021',
    });

    expect(result).toEqual({ achToken: 'ach-id-vault' });
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

describe('iqproPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('logs both request body and response body in full', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthToken();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { customerId: 'cust_42' } }),
      { status: 200 },
    ));

    const requestBody = { name: 'Acme', referenceId: 'mem_1' };
    const result = await mod.iqproPost('/api/gateway/test-gateway-id/customer', requestBody);

    expect(result).toEqual({ data: { customerId: 'cust_42' } });

    // Request body must be logged with the full JSON serialized
    const requestLog = mockLogger.info.mock.calls.find(c => c[0] === '[IQPro] POST request');

    expect(requestLog?.[1]).toEqual({
      path: '/api/gateway/test-gateway-id/customer',
      body: JSON.stringify(requestBody, null, 2),
    });

    // Response body must also be logged in full
    const responseLog = mockLogger.info.mock.calls.find(c => c[0] === '[IQPro] POST response');

    expect(responseLog?.[1]).toEqual({
      path: '/api/gateway/test-gateway-id/customer',
      status: 200,
      response: JSON.stringify({ data: { customerId: 'cust_42' } }),
    });
  });

  it('logs the full error body on failure and throws with status', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthToken();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      'Validation failed: missing field',
      { status: 400 },
    ));

    await expect(
      mod.iqproPost('/api/gateway/test-gateway-id/customer', { x: 1 }),
    ).rejects.toThrow('IQPro API /api/gateway/test-gateway-id/customer failed: 400 Validation failed: missing field');

    expect(mockLogger.error).toHaveBeenCalledWith('[IQPro] POST failed', {
      path: '/api/gateway/test-gateway-id/customer',
      status: 400,
      response: 'Validation failed: missing field',
    });
  });
});

describe('iqproGet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns parsed JSON and logs request + response', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthToken();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { addresses: [{ customerAddressId: 'addr_1', isBilling: true }] } }),
      { status: 200 },
    ));

    const result = await mod.iqproGet<{ data: { addresses: Array<{ customerAddressId: string }> } }>(
      '/api/gateway/test-gateway-id/customer/cust_42',
    );

    expect(result.data.addresses[0]?.customerAddressId).toBe('addr_1');
    expect(mockLogger.info).toHaveBeenCalledWith('[IQPro] GET request', {
      path: '/api/gateway/test-gateway-id/customer/cust_42',
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[IQPro] GET response',
      expect.objectContaining({
        path: '/api/gateway/test-gateway-id/customer/cust_42',
        status: 200,
      }),
    );
  });
});

describe('iqproPut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('PUTs the body and returns parsed JSON', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthToken();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { id: 'sub_1' } }),
      { status: 200 },
    ));

    const result = await mod.iqproPut('/api/gateway/test-gateway-id/subscription/sub_1', { name: 'X' });

    expect(result).toEqual({ data: { id: 'sub_1' } });

    const call = mockFetch.mock.calls.find(c => (c[0] as string).includes('/subscription/sub_1'))!;

    expect(call[1].method).toBe('PUT');
    expect(JSON.parse(call[1].body)).toEqual({ name: 'X' });
  });
});

describe('calculateTransactionFees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('sends token (not BIN) when both could be supplied', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthToken();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({
        data: {
          baseAmount: 100,
          taxAmount: 8.5,
          surchargeAmount: 3,
          serviceFeesAmount: 0,
          convenienceFeesAmount: 0,
          amount: 111.5,
          isSurchargeable: true,
          isPinCapable: false,
          surchargeRate: 0.03,
          tip: 0,
          cardBrand: 'Visa',
          cardType: 'credit',
        },
      }),
      { status: 200 },
    ));

    const result = await mod.calculateTransactionFees({
      baseAmount: 100,
      processorId: 'proc_1',
      state: 'CA',
      paymentMethod: 'card',
      token: 'tok_xyz',
      creditCardBin: '424242',
    });

    expect(result.amount).toBe(111.5);
    expect(result.surchargeAmount).toBe(3);

    const feesCall = mockFetch.mock.calls.find(c => (c[0] as string).includes('/calculatefees'))!;
    const body = JSON.parse(feesCall[1].body);

    // token preferred over BIN
    expect(body.token).toBe('tok_xyz');
    expect(body.creditCardBin).toBeUndefined();
    expect(body.state).toBe('CA');
    expect(body.processorId).toBe('proc_1');
    expect(body.transactionType).toBe('Sale');
    expect(body.addTaxToTotal).toBe(true);
  });

  it('falls back to BIN when no token is provided', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthToken();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { baseAmount: 50, taxAmount: 0, surchargeAmount: 0, serviceFeesAmount: 0, convenienceFeesAmount: 0, amount: 50, isSurchargeable: false, isPinCapable: false, surchargeRate: 0, tip: 0, cardBrand: null, cardType: null } }),
      { status: 200 },
    ));

    await mod.calculateTransactionFees({
      baseAmount: 50,
      processorId: 'proc_1',
      state: 'CA',
      paymentMethod: 'card',
      creditCardBin: '424242',
    });

    const feesCall = mockFetch.mock.calls.find(c => (c[0] as string).includes('/calculatefees'))!;
    const body = JSON.parse(feesCall[1].body);

    expect(body.token).toBeUndefined();
    expect(body.creditCardBin).toBe('424242');
  });
});

describe('getGatewayProcessors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('extracts default card and ACH processor IDs', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthToken();
    mod.resetGatewayProcessors();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({
        data: {
          processors: [
            { processorId: 'card_proc', isDefaultCard: true, isDefaultAch: false },
            { processorId: 'ach_proc', isDefaultCard: false, isDefaultAch: true },
            { processorId: 'other_proc', isDefaultCard: false, isDefaultAch: false },
          ],
        },
      }),
      { status: 200 },
    ));

    const result = await mod.getGatewayProcessors();

    expect(result).toEqual({ cardProcessorId: 'card_proc', achProcessorId: 'ach_proc' });
  });

  it('returns nulls when IQPro is not configured', async () => {
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
    vi.resetModules();

    const { getGatewayProcessors, resetGatewayProcessors } = await import('./IQPro');

    resetGatewayProcessors();
    const result = await getGatewayProcessors();

    expect(result).toEqual({ cardProcessorId: null, achProcessorId: null });

    // Restore
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
