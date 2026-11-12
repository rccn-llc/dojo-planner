import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'test_cron_secret_not_real_123';
const envMock: { CRON_SECRET?: string } = { CRON_SECRET: SECRET };
vi.mock('@/libs/Env', () => ({ Env: envMock }));

function req(auth?: string) {
  return new Request('https://example.test/api/cron/x', { headers: auth ? { authorization: auth } : {} });
}

describe('isAuthorizedCronRequest', () => {
  beforeEach(() => {
    envMock.CRON_SECRET = SECRET;
  });

  it('accepts the exact bearer secret', async () => {
    const { isAuthorizedCronRequest } = await import('./CronAuth');

    expect(isAuthorizedCronRequest(req(`Bearer ${SECRET}`))).toBe(true);
  });

  it.each([
    ['no header', undefined],
    ['a wrong secret', 'Bearer wrong_secret_value_here_x'],
    ['a different length', 'Bearer x'],
  ])('refuses %s', async (_label, auth) => {
    const { isAuthorizedCronRequest } = await import('./CronAuth');

    expect(isAuthorizedCronRequest(req(auth))).toBe(false);
  });

  it('refuses everything when CRON_SECRET is unset', async () => {
    delete envMock.CRON_SECRET;
    const { isAuthorizedCronRequest } = await import('./CronAuth');

    expect(isAuthorizedCronRequest(req(`Bearer ${SECRET}`))).toBe(false);
  });
});
