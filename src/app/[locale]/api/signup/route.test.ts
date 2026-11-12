import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPTIONS, POST } from './route';

vi.mock('@/utils/SignupConfig', () => ({
  SIGNUP_LIMITS: { maxBodyBytes: 4096 },
  signupAllowedOrigins: () => ['https://www.dojoplanner.com'],
}));
const submitSignup = vi.fn();
vi.mock('@/services/SignupFlowService', () => ({
  submitSignup: (...a: unknown[]) => submitSignup(...a),
  decoyAcceptance: () => ({ kind: 'accepted', requestId: 'decoy-id', statusToken: 'st_decoy', statusUrl: 'https://app/decoy' }),
}));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/libs/Logger', () => ({ logger }));

const ORIGIN = 'https://www.dojoplanner.com';
const VALID = {
  academyName: 'Riverside Jiu-Jitsu',
  ownerName: 'Jordan Rivera',
  ownerEmail: 'jordan@example.com',
  ownerPhone: '+1 555 010 0199',
  website: '',
};

function post(body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://app.example.test/api/signup', {
    method: 'POST',
    headers: { 'origin': ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'agent', ...headers },
    body: text,
  });
}

describe('POST /api/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitSignup.mockResolvedValue({ kind: 'accepted', requestId: 'req-1', statusToken: 'st_1', statusUrl: 'https://app/status' });
  });

  it('accepts a valid form: 202 with the status link and CORS headers', async () => {
    const res = await POST(post(VALID));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ requestId: 'req-1', statusToken: 'st_1', statusUrl: 'https://app/status' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    expect(submitSignup).toHaveBeenCalledWith(
      { academyName: 'Riverside Jiu-Jitsu', ownerName: 'Jordan Rivera', ownerEmail: 'jordan@example.com', ownerPhone: '+1 555 010 0199' },
      { ip: '203.0.113.7', userAgent: 'agent' },
    );
  });

  it('accepts a JSON content type with a charset', async () => {
    expect((await POST(post(VALID, { 'content-type': 'application/json; charset=utf-8' }))).status).toBe(202);
  });

  it('records an unknown IP as null', async () => {
    const req = new Request('https://app.example.test/api/signup', {
      method: 'POST',
      headers: { 'origin': ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    await POST(req);

    expect(submitSignup.mock.calls[0]![1]).toEqual({ ip: null, userAgent: null });
  });

  it('415s a non-JSON body', async () => {
    const res = await POST(post(VALID, { 'content-type': 'application/x-www-form-urlencoded' }));

    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'unsupported_media_type' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('413s a body over 4 KB, by header or by actual size', async () => {
    expect((await POST(post(VALID, { 'content-length': '5000' }))).status).toBe(413);
    expect((await POST(post({ ...VALID, padding: 'x'.repeat(5000) }))).status).toBe(413);
  });

  it('403s another origin, and a request with no origin, without reading the body', async () => {
    const other = await POST(post(VALID, { origin: 'https://evil.example' }));

    expect(other.status).toBe(403);
    expect(await other.json()).toEqual({ error: 'origin_not_allowed' });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const none = new Request('https://app.example.test/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID),
    });

    expect((await POST(none)).status).toBe(403);
    expect(submitSignup).not.toHaveBeenCalled();
  });

  it('400s malformed JSON', async () => {
    const res = await POST(post('{not json'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_json' });
  });

  it('400s with a code per invalid field, and stores nothing', async () => {
    const res = await POST(post({ ...VALID, ownerEmail: 'nope', ownerPhone: '' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_request', fields: { ownerEmail: 'invalid', ownerPhone: 'required' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(submitSignup).not.toHaveBeenCalled();
  });

  it('answers a filled honeypot with a normal-looking 202 and stores nothing', async () => {
    const res = await POST(post({ ...VALID, website: 'http://spam.example' }));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ requestId: 'decoy-id', statusToken: 'st_decoy', statusUrl: 'https://app/decoy' });
    expect(submitSignup).not.toHaveBeenCalled();
  });

  it('logs unknown field NAMES (never values), bounded', async () => {
    await POST(post({ ...VALID, email: 'secret@example.com' }));

    expect(logger.warn).toHaveBeenCalledWith('[Signup] Unknown fields ignored', { fields: ['email'] });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret@example.com');
  });

  it('logs request-supplied names without control characters', async () => {
    await POST(post({ ...VALID, 'x\nINFO forged line': '' }));

    expect(logger.warn).toHaveBeenCalledWith('[Signup] Unknown fields ignored', { fields: ['x?INFO forged line'] });
  });

  it('429s with Retry-After when limited', async () => {
    submitSignup.mockResolvedValue({ kind: 'rate_limited', retryAfterSeconds: 900 });
    const res = await POST(post(VALID));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('900');
    expect(await res.json()).toEqual({ error: 'rate_limited' });
  });

  it.each([
    [{ kind: 'email_failed' }, 'email_failed'],
    [{ kind: 'unavailable' }, 'unavailable'],
  ])('503s %o', async (outcome, error) => {
    submitSignup.mockResolvedValue(outcome);
    const res = await POST(post(VALID));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error });
  });

  it('503s without detail when submitting throws', async () => {
    submitSignup.mockRejectedValue(new Error('db at 10.0.0.5 refused'));
    const res = await POST(post(VALID));

    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.5');
  });
});

describe('OPTIONS /api/signup', () => {
  it('answers the preflight for the www origin', async () => {
    const res = await OPTIONS(new Request('https://app.example.test/api/signup', {
      method: 'OPTIONS',
      headers: { 'origin': ORIGIN, 'access-control-request-method': 'POST' },
    }));

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, GET, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Accept');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('600');
  });

  it('refuses the preflight for another origin', async () => {
    const res = await OPTIONS(new Request('https://app.example.test/api/signup', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));

    expect(res.status).toBe(403);
  });
});
