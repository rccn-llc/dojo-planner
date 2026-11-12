import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const authorized = vi.fn();
vi.mock('@/libs/CronAuth', () => ({ isAuthorizedCronRequest: (r: Request) => authorized(r) }));
const listStuck = vi.fn();
const settle = vi.fn();
const listUnalerted = vi.fn();
vi.mock('@/services/SignupRequestService', () => ({
  listStuckSignups: () => listStuck(),
  settleSignupTimeouts: (row: unknown) => settle(row),
  listUnalertedFailedSignups: () => listUnalerted(),
}));
const alert = vi.fn();
vi.mock('@/services/SignupAlertService', () => ({ alertSignupFailure: (id: string) => alert(id) }));
vi.mock('@/libs/Logger', () => ({ logger: { info: vi.fn() } }));

const req = () => new Request('https://example.test/api/cron/signup-alerts');

describe('signup-alerts cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorized.mockReturnValue(true);
    listStuck.mockResolvedValue([{ id: 'stuck-1' }, { id: 'stuck-2' }]);
    settle.mockResolvedValueOnce({ becameFailed: true }).mockResolvedValueOnce({ becameFailed: false });
    listUnalerted.mockResolvedValue([{ id: 'stuck-1' }, { id: 'old-1' }]);
    alert.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  });

  it('401s without the cron secret and touches nothing', async () => {
    authorized.mockReturnValue(false);

    expect((await GET(req())).status).toBe(401);
    expect(listStuck).not.toHaveBeenCalled();
  });

  it('fails stuck requests, then sends every unsent alert', async () => {
    const res = await GET(req());

    expect(await res.json()).toEqual({ failedStuck: 1, alerted: 1 });
    expect(alert.mock.calls.map(c => c[0])).toEqual(['stuck-1', 'old-1']);
  });
});
