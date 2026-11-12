import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSignupRouteState } from '@/libs/SignupRouteState';
import { POST } from './route';

const confirmAndDispatch = vi.fn();
vi.mock('@/services/SignupFlowService', () => ({ confirmAndDispatch: (t: string) => confirmAndDispatch(t) }));
vi.mock('@/libs/Logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const TOKEN = `sc_${'A'.repeat(43)}`;

function post(body: string, headers: Record<string, string> = {}) {
  return new Request('https://app.example.test/api/signup/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers },
    body,
  });
}

const withToken = (token: unknown = TOKEN) => JSON.stringify({ token });

describe('POST /api/signup/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSignupRouteState();
  });

  it.each(['started', 'already_confirmed', 'failed'])('returns 200 for %s so the page shows live status', async (kind) => {
    confirmAndDispatch.mockResolvedValue({ kind, requestId: 'req-1' });
    const res = await POST(post(withToken(), { 'sec-fetch-site': 'same-origin' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: kind, requestId: 'req-1' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(confirmAndDispatch).toHaveBeenCalledWith(TOKEN);
  });

  it('404s an unknown token and 410s an expired one', async () => {
    confirmAndDispatch.mockResolvedValueOnce({ kind: 'not_found' }).mockResolvedValueOnce({ kind: 'expired' });

    expect((await POST(post(withToken()))).status).toBe(404);
    expect((await POST(post(withToken()))).status).toBe(410);
  });

  it('400s malformed JSON and 404s a missing or malformed token without confirming', async () => {
    expect((await POST(post('{nope'))).status).toBe(400);
    expect((await POST(post('null'))).status).toBe(404);
    expect((await POST(post(JSON.stringify({})))).status).toBe(404);
    expect((await POST(post(withToken(7)))).status).toBe(404);
    expect((await POST(post(withToken('sc_1')))).status).toBe(404);
    expect((await POST(post(withToken(`st_${'A'.repeat(43)}`)))).status).toBe(404); // a status token cannot confirm
    expect(confirmAndDispatch).not.toHaveBeenCalled();
  });

  it('415s anything but JSON (a cross-site simple POST cannot skip the preflight)', async () => {
    const res = await POST(post(withToken(), { 'content-type': 'text/plain' }));

    expect(res.status).toBe(415);
    expect(confirmAndDispatch).not.toHaveBeenCalled();
  });

  it('403s a request the browser marks as cross-site', async () => {
    expect((await POST(post(withToken(), { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    expect((await POST(post(withToken(), { 'sec-fetch-site': 'same-site' }))).status).toBe(403);
    expect(confirmAndDispatch).not.toHaveBeenCalled();
  });

  it('413s an oversized body, declared or not', async () => {
    expect((await POST(post(withToken(), { 'content-length': '5000' }))).status).toBe(413);
    expect((await POST(post(JSON.stringify({ token: TOKEN, pad: 'x'.repeat(2000) })))).status).toBe(413);
  });

  it('429s an IP that keeps trying', async () => {
    confirmAndDispatch.mockResolvedValue({ kind: 'not_found' });
    for (let i = 0; i < 10; i++) {
      await POST(post(withToken()));
    }
    const res = await POST(post(withToken()));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(confirmAndDispatch).toHaveBeenCalledTimes(10);
  });

  it('503s without detail when confirming throws', async () => {
    confirmAndDispatch.mockRejectedValue(new Error('internal host'));
    const res = await POST(post(withToken()));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });
});
