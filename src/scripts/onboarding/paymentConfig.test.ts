import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { decryptWithKey, parseKeyHex } from '../../libs/CryptoCore';
import { buildIqproConfigBlob, buildSquareConfigBlob, squareApiBase, verifyIqproCredentials, verifySquareCredentials } from './paymentConfig';

const CREDS = { clientId: 'client-1', clientSecret: 'secret-1', gatewayId: 'gw-1' };
const PLATFORM = { scope: 'scope-1', oauthUrl: 'https://oauth.test/token', baseUrl: 'https://api.test/iqsaas/v1' };

function fetchSequence(...responses: Array<Response | Error>) {
  const impl = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) {
      impl.mockRejectedValueOnce(r);
    } else {
      impl.mockResolvedValueOnce(r);
    }
  }
  return impl as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const tokenOk = () => new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });

describe('buildIqproConfigBlob', () => {
  it('writes the { provider, credentials } shape the planner and kiosk read', () => {
    const key = parseKeyHex(randomBytes(32).toString('hex'));
    const blob = buildIqproConfigBlob(CREDS, key);

    expect(JSON.parse(decryptWithKey(blob, key))).toEqual({ provider: 'iqpro', credentials: CREDS });
  });
});

describe('verifyIqproCredentials', () => {
  it('passes when OAuth and the gateway both succeed, calling the kiosk\'s gateway path', async () => {
    const impl = fetchSequence(tokenOk(), new Response('{}', { status: 200 }));

    expect(await verifyIqproCredentials(CREDS, PLATFORM, impl)).toEqual({ ok: true });
    expect(impl.mock.calls[1]?.[0]).toBe('https://api.test/iqsaas/v1/api/gateway/gw-1');
    expect(impl.mock.calls[1]?.[1]).toMatchObject({ headers: { Authorization: 'Bearer tok' } });
  });

  it('blames the credentials on an OAuth 401', async () => {
    const result = await verifyIqproCredentials(CREDS, PLATFORM, fetchSequence(new Response('', { status: 401 })));

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/Client ID \/ Client Secret/) });
  });

  it('blames the base URL or gateway on a 404 — the production failure', async () => {
    const result = await verifyIqproCredentials(CREDS, PLATFORM, fetchSequence(tokenOk(), new Response('', { status: 404 })));

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/iqsaas\/v1/) });
  });

  it('reports an unreachable OAuth URL', async () => {
    const result = await verifyIqproCredentials(CREDS, PLATFORM, fetchSequence(new Error('ENOTFOUND')));

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/IQPRO_OAUTH_URL.*ENOTFOUND/) });
  });

  it('reports a missing access token', async () => {
    const result = await verifyIqproCredentials(CREDS, PLATFORM, fetchSequence(new Response('{}', { status: 200 })));

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/no access token/) });
  });

  it('reports a gateway the credentials cannot access', async () => {
    const result = await verifyIqproCredentials(CREDS, PLATFORM, fetchSequence(tokenOk(), new Response('', { status: 403 })));

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/no access to that Gateway ID/) });
  });
});

describe('Square', () => {
  const SQUARE = {
    accessToken: 'square-token-1',
    locationId: 'LOC1',
    applicationId: 'sandbox-sq0idb-app',
    environment: 'sandbox' as const,
    webhookSignatureKey: 'sig-key-1',
  };

  it('builds the { provider: "square", credentials } blob Location Settings writes', () => {
    const key = parseKeyHex(randomBytes(32).toString('hex'));

    expect(JSON.parse(decryptWithKey(buildSquareConfigBlob(SQUARE, key), key))).toEqual({ provider: 'square', credentials: SQUARE });
  });

  it('uses each environment\'s own API host', () => {
    expect(squareApiBase('sandbox')).toBe('https://connect.squareupsandbox.com');
    expect(squareApiBase('production')).toBe('https://connect.squareup.com');
  });

  it('passes for an ACTIVE location, reading it on the environment\'s host with the token', async () => {
    const impl = fetchSequence(new Response(JSON.stringify({ location: { name: 'CTA HQ', status: 'ACTIVE' } }), { status: 200 }));

    expect(await verifySquareCredentials(SQUARE, impl)).toEqual({ ok: true, locationName: 'CTA HQ' });
    expect(impl.mock.calls[0]?.[0]).toBe('https://connect.squareupsandbox.com/v2/locations/LOC1');
    expect(impl.mock.calls[0]?.[1]).toMatchObject({ headers: { 'Authorization': 'Bearer square-token-1', 'Square-Version': '2025-01-23' } });
  });

  it('explains a 401 as a token for the wrong environment', async () => {
    const result = await verifySquareCredentials(SQUARE, fetchSequence(new Response('', { status: 401 })));

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/sandbox token does not work against production/) });
  });

  it('explains a 404 as a location from another account', async () => {
    const result = await verifySquareCredentials(SQUARE, fetchSequence(new Response('', { status: 404 })));

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/no location LOC1/) });
  });

  it('refuses an inactive location', async () => {
    const impl = fetchSequence(new Response(JSON.stringify({ location: { status: 'INACTIVE' } }), { status: 200 }));

    expect(await verifySquareCredentials(SQUARE, impl)).toMatchObject({ ok: false, reason: expect.stringMatching(/INACTIVE, not ACTIVE/) });
  });

  it('reports an unreachable Square', async () => {
    const result = await verifySquareCredentials(SQUARE, fetchSequence(new Error('ECONNRESET')));

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/Could not reach Square \(ECONNRESET\)/) });
  });
});
