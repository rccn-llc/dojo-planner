import { describe, expect, it, vi } from 'vitest';
import { DISPATCH_TOKEN_REJECTED, dispatchOnboardWorkflow } from './SignupDispatchService';

const envMock = vi.hoisted((): { GITHUB_DISPATCH_TOKEN?: string } => ({}));
vi.mock('@/libs/Env', () => ({ Env: envMock }));
vi.mock('@/libs/Logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const TOKEN = 'test_github_token_not_real';
const REQUEST_ID = '6f1c2b8e-0000-4000-8000-000000000001';

function fetchReturning(...statuses: number[]) {
  const fetchImpl = vi.fn();
  for (const status of statuses) {
    fetchImpl.mockResolvedValueOnce(new Response(status === 204 ? null : 'detail', { status }));
  }
  return fetchImpl;
}

describe('dispatchOnboardWorkflow', () => {
  it('starts onboard-org on main with ONLY the request id and target', async () => {
    const fetchImpl = fetchReturning(204);

    expect(await dispatchOnboardWorkflow(REQUEST_ID, 'production', { token: TOKEN, fetchImpl })).toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0]!;

    expect(url).toBe('https://api.github.com/repos/rccn-llc/dojo-planner/actions/workflows/onboard-org.yml/dispatches');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    // The repository is public: nothing but the id may travel in the inputs.
    expect(JSON.parse(init.body)).toEqual({ ref: 'main', inputs: { request_id: REQUEST_ID, target: 'production' } });
  });

  it('refuses without a token, without calling GitHub', async () => {
    const fetchImpl = vi.fn();

    const result = await dispatchOnboardWorkflow(REQUEST_ID, 'preview', { fetchImpl });

    expect(result).toEqual({ ok: false, retryable: false, error: expect.stringContaining('GITHUB_DISPATCH_TOKEN') });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads the token from the environment by default', async () => {
    envMock.GITHUB_DISPATCH_TOKEN = TOKEN;
    const fetchImpl = fetchReturning(204);

    await dispatchOnboardWorkflow(REQUEST_ID, 'preview', { fetchImpl });

    expect(fetchImpl.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${TOKEN}`);

    delete envMock.GITHUB_DISPATCH_TOKEN;
  });

  it.each([401, 403])('names the token when GitHub answers %s, without retrying', async (status) => {
    const fetchImpl = fetchReturning(status);

    expect(await dispatchOnboardWorkflow(REQUEST_ID, 'production', { token: TOKEN, fetchImpl }))
      .toEqual({ ok: false, retryable: false, error: DISPATCH_TOKEN_REJECTED });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('explains a 404 and a 422 without retrying', async () => {
    const notFound = await dispatchOnboardWorkflow(REQUEST_ID, 'production', { token: TOKEN, fetchImpl: fetchReturning(404) });
    const unprocessable = await dispatchOnboardWorkflow(REQUEST_ID, 'production', { token: TOKEN, fetchImpl: fetchReturning(422) });

    expect(notFound).toMatchObject({ ok: false, retryable: false, error: expect.stringContaining('onboard-org.yml') });
    expect(unprocessable).toMatchObject({ ok: false, retryable: false, error: expect.stringContaining('422') });
  });

  it('retries a 5xx once and succeeds', async () => {
    const fetchImpl = fetchReturning(502, 204);

    expect(await dispatchOnboardWorkflow(REQUEST_ID, 'production', { token: TOKEN, fetchImpl, retryDelayMs: 0 })).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries a network error once, then gives up', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

    const result = await dispatchOnboardWorkflow(REQUEST_ID, 'production', { token: TOKEN, fetchImpl, retryDelayMs: 0 });

    expect(result).toEqual({ ok: false, retryable: true, error: expect.stringContaining('ECONNRESET') });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
