import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock Env
vi.mock('./Env', () => ({
  Env: {
    SERVICE_FEE_PCT: '3.75',
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

const testConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  gatewayId: 'test-gateway-id',
  scope: 'test-scope',
  oauthUrl: 'https://sandbox.oauth.example.com/token',
  baseUrl: 'https://sandbox.api.basyspro.com',
  source: 'env' as const,
};

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
    mod.resetOAuthTokenCache();
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

    const result = await tokenizeAch(testConfig, {
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

    const result = await tokenizeAch(testConfig, {
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

    const result = await tokenizeAch(testConfig, {
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

    const result = await tokenizeAch(testConfig, {
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

    await tokenizeAch(testConfig, {
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

    await tokenizeAch(testConfig, {
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

    await expect(tokenizeAch(testConfig, {
      accountNumber: '123456789',
      routingNumber: '021000021',
    })).rejects.toThrow('ACH tokenization failed: 400');
  });

  it('should throw when response is missing achToken', async () => {
    const tokenizeAch = await getTokenizeAch();

    mockOAuthAndAchTokenize(
      new Response(JSON.stringify({ someOtherField: 'value' }), { status: 200 }),
    );

    await expect(tokenizeAch(testConfig, {
      accountNumber: '123456789',
      routingNumber: '021000021',
    })).rejects.toThrow('ACH tokenization response missing achToken');
  });
});

describe('iqproPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('logs request and response bodies for diagnosis, with credentials and personal data redacted', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { customerId: 'cust_42', email: 'm@example.com' } }),
      { status: 200 },
    ));

    const requestBody = {
      referenceId: 'mem_1',
      card: { token: '4264288H8vbk5555', maskedCard: '426428******5555' },
      address: { email: 'm@example.com', state: 'CA' },
    };
    const result = await mod.iqproPost(testConfig, '/api/gateway/test-gateway-id/customer', requestBody);

    // The caller still gets the real response.
    expect(result).toEqual({ data: { customerId: 'cust_42', email: 'm@example.com' } });

    const requestLog = mockLogger.info.mock.calls.find(c => c[0] === '[IQPro] POST request');

    expect(requestLog?.[1].path).toBe('/api/gateway/test-gateway-id/customer');
    expect(JSON.parse(requestLog?.[1].body)).toEqual({
      referenceId: 'mem_1',
      card: { token: '[redacted]', maskedCard: '••••5555' },
      address: { email: '[redacted]', state: 'CA' },
    });

    const responseLog = mockLogger.info.mock.calls.find(c => c[0] === '[IQPro] POST response');

    expect(responseLog?.[1].status).toBe(200);
    expect(JSON.parse(responseLog?.[1].response)).toEqual({ data: { customerId: 'cust_42', email: '[redacted]' } });
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain('4264288H8vbk5555');
  });

  it('redacts the raw body it embeds in a thrown error', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ statusDetails: ['bad'], token: 'tok-secret' }), { status: 400 }));

    await expect(mod.iqproPost(testConfig, '/x', {})).rejects.toThrow(/\[redacted\]/);
  });

  it('never logs the ACH token returned by tokenization', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { achId: 'ach-secret-token' } }), { status: 200 }));

    await expect(mod.tokenizeAch(testConfig, { accountNumber: '000123456789', routingNumber: '021000021' })).resolves.toEqual({ achToken: 'ach-secret-token' });
    expect(JSON.stringify([...mockLogger.info.mock.calls, ...mockLogger.error.mock.calls])).not.toContain('ach-secret-token');
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain('000123456789');
  });

  it('logs a JSON error body (redacted) on failure and throws with status', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ statusCode: 'BadRequest', statusDetails: ['Validation failed: missing field'] }),
      { status: 400 },
    ));

    await expect(
      mod.iqproPost(testConfig, '/api/gateway/test-gateway-id/customer', { x: 1 }),
    ).rejects.toThrow('Validation failed: missing field');
  });

  it('never logs or embeds a non-JSON error body, only its kind and length', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      'Validation failed: missing field',
      { status: 400 },
    ));

    await expect(
      mod.iqproPost(testConfig, '/api/gateway/test-gateway-id/customer', { x: 1 }),
    ).rejects.toThrow('IQPro API /api/gateway/test-gateway-id/customer failed: 400 [non-JSON text body redacted, 32 chars]');

    expect(mockLogger.error).toHaveBeenCalledWith('[IQPro] POST failed', {
      path: '/api/gateway/test-gateway-id/customer',
      status: 400,
      response: '[non-JSON text body redacted, 32 chars]',
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
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { addresses: [{ customerAddressId: 'addr_1', isBilling: true }] } }),
      { status: 200 },
    ));

    const result = await mod.iqproGet<{ data: { addresses: Array<{ customerAddressId: string }> } }>(
      testConfig,
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
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { id: 'sub_1' } }),
      { status: 200 },
    ));

    const result = await mod.iqproPut(testConfig, '/api/gateway/test-gateway-id/subscription/sub_1', { name: 'X' });

    expect(result).toEqual({ data: { id: 'sub_1' } });

    const call = mockFetch.mock.calls.find(c => (c[0] as string).includes('/subscription/sub_1'))!;

    expect(call[1].method).toBe('PUT');
    expect(JSON.parse(call[1].body)).toEqual({ name: 'X' });
  });
});

describe('computeFeeBreakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('non-taxable (membership) returns 0 tax + IQPro service fee', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    // /calculatefees response — IQPro returns the flat service-fee amount
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { serviceFeesAmount: 3.75 } }),
      { status: 200 },
    ));

    const result = await mod.computeFeeBreakdown(testConfig, 100, /* isTaxable */ false, /* taxStatePct */ 3.75, {
      processorId: 'proc_1',
      token: 'tok_xyz',
    });

    expect(result.baseAmount).toBe(100);
    expect(result.taxAmount).toBe(0);
    expect(result.taxPct).toBe(0);
    expect(result.serviceFeeAmount).toBe(3.75);
    expect(result.serviceFeePct).toBe(3.75);
    expect(result.amount).toBe(103.75);

    // Verify the /calculatefees request body — sends ServiceFee adjustment
    // with percentage (not flatAmount, IQPro requirement) and the token.
    const feesCall = mockFetch.mock.calls.find(c => (c[0] as string).includes('/calculatefees'))!;
    const body = JSON.parse(feesCall[1].body);

    expect(body.baseAmount).toBe(100);
    expect(body.processorId).toBe('proc_1');
    expect(body.transactionType).toBe('Sale');
    expect(body.taxAmount).toBe(0);
    expect(body.token).toBe('tok_xyz');
    expect(body.creditCardBin).toBeUndefined();
    expect(body.paymentAdjustments).toEqual([
      { type: 'ServiceFee', percentage: 3.75, flatAmount: null },
    ]);
  });

  it('taxable (event/store) computes tax locally + IQPro service fee', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { serviceFeesAmount: 3.75 } }),
      { status: 200 },
    ));

    const result = await mod.computeFeeBreakdown(testConfig, 100, /* isTaxable */ true, /* taxStatePct */ 3.75, {
      processorId: 'proc_1',
      creditCardBin: '424242',
    });

    expect(result.baseAmount).toBe(100);
    expect(result.taxAmount).toBe(3.75); // 100 * 3.75%
    expect(result.taxPct).toBe(3.75);
    expect(result.serviceFeeAmount).toBe(3.75);
    expect(result.amount).toBe(107.5); // 100 + 3.75 + 3.75
  });

  it('taxable with 0 tax rate yields no tax (default for new orgs)', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { serviceFeesAmount: 3.75 } }),
      { status: 200 },
    ));

    const result = await mod.computeFeeBreakdown(testConfig, 100, /* isTaxable */ true, /* taxStatePct */ 0, {
      processorId: 'proc_1',
      token: 'tok_xyz',
    });

    expect(result.taxAmount).toBe(0);
    expect(result.taxPct).toBe(0);
    expect(result.amount).toBe(103.75);
  });

  it('taxable with custom tax rate (e.g. 5.25%) computes correctly', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { serviceFeesAmount: 3.75 } }),
      { status: 200 },
    ));

    const result = await mod.computeFeeBreakdown(testConfig, 100, /* isTaxable */ true, /* taxStatePct */ 5.25, {
      processorId: 'proc_1',
      token: 'tok_xyz',
    });

    expect(result.taxAmount).toBe(5.25);
    expect(result.taxPct).toBe(5.25);
    expect(result.amount).toBe(109); // 100 + 5.25 + 3.75
  });

  it('clamps a negative taxStatePct to 0 (corrupt location_tax_rate must not credit the card)', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { serviceFeesAmount: 3.75 } }),
      { status: 200 },
    ));

    const result = await mod.computeFeeBreakdown(testConfig, 100, /* isTaxable */ true, /* taxStatePct */ -50, {
      processorId: 'proc_1',
      token: 'tok_xyz',
    });

    expect(result.taxAmount).toBe(0);
    expect(result.taxPct).toBe(0);
    expect(result.amount).toBe(103.75); // 100 + 0 + 3.75
  });

  it('clamps an over-100 taxStatePct to 100', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { serviceFeesAmount: 0 } }),
      { status: 200 },
    ));

    const result = await mod.computeFeeBreakdown(testConfig, 100, /* isTaxable */ true, /* taxStatePct */ 999, {
      processorId: 'proc_1',
      token: 'tok_xyz',
    });

    expect(result.taxPct).toBe(100);
    expect(result.taxAmount).toBe(100);
  });

  it('falls back to creditCardBin when token is not provided', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { serviceFeesAmount: 0 } }),
      { status: 200 },
    ));

    await mod.computeFeeBreakdown(testConfig, 50, false, 0, {
      processorId: 'proc_1',
      creditCardBin: '424242',
    });

    const feesCall = mockFetch.mock.calls.find(c => (c[0] as string).includes('/calculatefees'))!;
    const body = JSON.parse(feesCall[1].body);

    expect(body.creditCardBin).toBe('424242');
    expect(body.token).toBeUndefined();
  });
});

describe('buildServiceFeeAdjustment / buildTaxAdjustment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('buildServiceFeeAdjustment uses percentage, not flatAmount', async () => {
    const mod = await import('./IQPro');
    const adj = mod.buildServiceFeeAdjustment({
      baseAmount: 100,
      taxAmount: 0,
      taxPct: 0,
      serviceFeeAmount: 3.75,
      serviceFeePct: 3.75,
      amount: 103.75,
    });

    // IQPro rejects flatAmount on ServiceFee adjustments
    expect(adj).toEqual({ type: 'ServiceFee', percentage: 3.75, flatAmount: null });
  });

  it('buildTaxAdjustment uses flatAmount, not percentage', async () => {
    const mod = await import('./IQPro');
    const adj = mod.buildTaxAdjustment({
      baseAmount: 100,
      taxAmount: 3.75,
      taxPct: 3.75,
      serviceFeeAmount: 0,
      serviceFeePct: 0,
      amount: 103.75,
    });

    // IQPro rejects percentage on Tax adjustments
    expect(adj).toEqual({ type: 'Tax', percentage: null, flatAmount: 3.75 });
  });
});

describe('mapTransactionStatus / assertTransactionApproved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each([
    ['Captured', 'approved'],
    ['Settled', 'approved'],
    ['Authorized', 'approved'],
    ['PendingSettlement', 'approved'],
    ['Declined', 'declined'],
    ['Failed', 'declined'],
    ['', 'declined'],
    ['unknown', 'declined'],
  ])('maps status %s -> %s', async (raw, expected) => {
    const mod = await import('./IQPro');

    expect(mod.mapTransactionStatus({ status: raw })).toBe(expected);
  });

  it('assertTransactionApproved throws with processorResponseText on decline', async () => {
    const mod = await import('./IQPro');

    expect(() => mod.assertTransactionApproved({
      status: 'Declined',
      processorResponseText: 'Insufficient funds',
    })).toThrow('Insufficient funds');
  });

  it('assertTransactionApproved is a no-op on approved', async () => {
    const mod = await import('./IQPro');

    expect(() => mod.assertTransactionApproved({ status: 'Captured' })).not.toThrow();
  });
});

describe('getCustomerPaymentMethod', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('extracts BIN + last4 from a saved card', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({
        data: {
          paymentMethods: [
            {
              customerPaymentMethodId: 'pm_1',
              card: { maskedNumber: '424242******4242' },
            },
            { customerPaymentMethodId: 'pm_2', card: { maskedNumber: '555555******5555' } },
          ],
        },
      }),
      { status: 200 },
    ));

    const info = await mod.getCustomerPaymentMethod(testConfig, 'cust_1', 'pm_2');

    expect(info).toEqual({ type: 'card', firstSix: '555555', last4: '5555' });
  });

  it('extracts achToken from a saved ACH PM', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({
        data: {
          paymentMethods: [
            {
              customerPaymentMethodId: 'pm_ach',
              ach: { achToken: 'ach-tok-xyz', accountNumber: 'XXXX1234' },
            },
          ],
        },
      }),
      { status: 200 },
    ));

    const info = await mod.getCustomerPaymentMethod(testConfig, 'cust_1', 'pm_ach');

    expect(info?.type).toBe('ach');
    expect(info?.achToken).toBe('ach-tok-xyz');
    expect(info?.last4).toBe('1234');
  });

  it('returns null when paymentMethodId is not found', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { paymentMethods: [] } }),
      { status: 200 },
    ));

    const info = await mod.getCustomerPaymentMethod(testConfig, 'cust_1', 'pm_missing');

    expect(info).toBeNull();
  });
});

describe('getGatewayProcessors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('extracts default card and ACH processor IDs', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();
    mod.resetGatewayProcessorsCache();

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

    const result = await mod.getGatewayProcessors(testConfig);

    expect(result).toEqual({ cardProcessorId: 'card_proc', achProcessorId: 'ach_proc' });
  });

  it('falls back to the first processor when none is flagged default (#214/#264)', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();
    mod.resetGatewayProcessorsCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({
        data: {
          processors: [
            { processorId: 'p1', isDefaultCard: false, isDefaultAch: false },
            { processorId: 'p2', isDefaultCard: false, isDefaultAch: false },
          ],
        },
      }),
      { status: 200 },
    ));

    const result = await mod.getGatewayProcessors(testConfig);

    // Both fall back to the first available processor rather than null, which
    // previously hard-failed every charge as a "declined" payment.
    expect(result).toEqual({ cardProcessorId: 'p1', achProcessorId: 'p1' });
  });

  it('returns null when the gateway has no processors at all', async () => {
    const mod = await import('./IQPro');
    mod.resetOAuthTokenCache();
    mod.resetGatewayProcessorsCache();

    mockOAuthOk();
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { processors: [] } }),
      { status: 200 },
    ));

    const result = await mod.getGatewayProcessors(testConfig);

    expect(result).toEqual({ cardProcessorId: null, achProcessorId: null });
  });
});
