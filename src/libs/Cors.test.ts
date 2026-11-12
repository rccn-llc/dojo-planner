import { describe, expect, it } from 'vitest';
import { corsJson, evaluateCors, preflightResponse } from './Cors';

const POLICY = {
  allowedOrigins: ['https://www.dojoplanner.com'],
  methods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  exposeHeaders: ['Retry-After'],
  maxAgeSeconds: 600,
};

function req(origin?: string) {
  return new Request('https://app.example.test/api/signup', { headers: origin ? { origin } : {} });
}

describe('Cors', () => {
  it('echoes an allowed origin exactly, never *', () => {
    const { allowed, originPresent, headers } = evaluateCors(req('https://www.dojoplanner.com'), POLICY);

    expect(allowed).toBe(true);
    expect(originPresent).toBe(true);
    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://www.dojoplanner.com');
    expect(headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    expect(headers.get('Access-Control-Max-Age')).toBe('600');
    expect(headers.get('Vary')).toBe('Origin');
  });

  it('sends no allow headers for another origin', () => {
    const { allowed, headers } = evaluateCors(req('https://evil.example'), POLICY);

    expect(allowed).toBe(false);
    expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(headers.get('Vary')).toBe('Origin');
  });

  it('distinguishes a request with no Origin at all', () => {
    expect(evaluateCors(req(), POLICY)).toMatchObject({ allowed: false, originPresent: false });
  });

  it('omits optional headers the policy does not set', () => {
    const { headers } = evaluateCors(req('https://www.dojoplanner.com'), { ...POLICY, exposeHeaders: undefined, maxAgeSeconds: undefined });

    expect(headers.get('Access-Control-Expose-Headers')).toBeNull();
    expect(headers.get('Access-Control-Max-Age')).toBeNull();
  });

  it('answers a preflight 204 for an allowed origin and 403 otherwise', () => {
    expect(preflightResponse(req('https://www.dojoplanner.com'), POLICY).status).toBe(204);
    expect(preflightResponse(req('https://evil.example'), POLICY).status).toBe(403);
  });

  it('builds an uncached JSON response that keeps the CORS headers and adds extras', async () => {
    const { headers } = evaluateCors(req('https://www.dojoplanner.com'), POLICY);
    const res = corsJson({ error: 'rate_limited' }, 429, headers, { 'Retry-After': '60' });

    expect(res.status).toBe(429);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.dojoplanner.com');
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(await res.json()).toEqual({ error: 'rate_limited' });
  });
});
