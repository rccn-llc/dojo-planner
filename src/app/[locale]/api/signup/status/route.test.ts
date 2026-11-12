import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, OPTIONS, resetStatusRouteState } from './route';

vi.mock('@/utils/SignupConfig', () => ({
  SIGNUP_LIMITS: { statusPollsPerMinute: 3 },
  signupAllowedOrigins: () => ['https://www.dojoplanner.com'],
}));
const readSignupStatus = vi.fn();
vi.mock('@/services/SignupFlowService', () => ({ readSignupStatus: (...a: unknown[]) => readSignupStatus(...a) }));
vi.mock('@/libs/Logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const ID = '6f1c2a4e-1b2c-4d5e-8f90-0123456789ab';
const TOKEN = `st_${'A'.repeat(43)}`;
const Q = `?id=${ID}&token=${TOKEN}`;
const idN = (n: number) => `6f1c2a4e-1b2c-4d5e-8f90-${String(n).padStart(12, '0')}`;

function get(query: string, headers: Record<string, string> = { 'origin': 'https://www.dojoplanner.com', 'x-forwarded-for': '203.0.113.7' }) {
  return new Request(`https://app.example.test/api/signup/status${query}`, { headers });
}

describe('GET /api/signup/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStatusRouteState();
    readSignupStatus.mockResolvedValue({ state: 'provisioning', step: 'database', message: 'Preparing your database' });
  });

  it('returns the public status with CORS headers', async () => {
    const res = await GET(get(Q));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'provisioning', step: 'database', message: 'Preparing your database' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.dojoplanner.com');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(readSignupStatus).toHaveBeenCalledWith(ID, TOKEN);
  });

  it('serves same-origin and curl requests (no Origin header)', async () => {
    expect((await GET(get(Q, {}))).status).toBe(200);
  });

  it('403s a foreign origin', async () => {
    expect((await GET(get(Q, { origin: 'https://evil.example' }))).status).toBe(403);
  });

  it('404s a wrong token exactly like a missing or oversized parameter', async () => {
    readSignupStatus.mockResolvedValue(null);

    expect((await GET(get(`?id=${ID}&token=st_${'B'.repeat(43)}`))).status).toBe(404);
    expect((await GET(get(`?id=${ID}`))).status).toBe(404);
    expect((await GET(get(`?id=${ID}&token=${'x'.repeat(201)}`))).status).toBe(404);
  });

  it('404s a malformed id or token without reading the database', async () => {
    expect((await GET(get(`?id=req-1&token=${TOKEN}`))).status).toBe(404);
    expect((await GET(get(`?id=${ID}&token=st_1`))).status).toBe(404);
    expect((await GET(get(`?id=${ID}%0A&token=${TOKEN}`))).status).toBe(404);
    expect(readSignupStatus).not.toHaveBeenCalled();
  });

  it('caches a status briefly per request', async () => {
    await GET(get(Q));
    await GET(get(Q));

    expect(readSignupStatus).toHaveBeenCalledTimes(1);
  });

  it('429s an IP polling too fast', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await GET(get(`?id=${idN(i)}&token=${TOKEN}`))).status).toBe(200);
    }
    const res = await GET(get(`?id=${idN(9)}&token=${TOKEN}`));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('503s without detail when the read throws', async () => {
    readSignupStatus.mockRejectedValue(new Error('db at 10.0.0.5'));
    const res = await GET(get(Q));

    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.5');
  });

  it('answers the preflight', async () => {
    const res = await OPTIONS(new Request('https://app.example.test/api/signup/status', { method: 'OPTIONS', headers: { origin: 'https://www.dojoplanner.com' } }));

    expect(res.status).toBe(204);
  });
});
