import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { SIGNUP_GITHUB } from '@/utils/SignupConfig';

/**
 * Start the `onboard-org` GitHub Actions job for one confirmed sign-up.
 *
 * ⚠️ The repository is PUBLIC, so workflow inputs are readable by anyone. Only
 * the request id and the target travel to GitHub; the job reads everything
 * else from the control database.
 */

export const DISPATCH_TOKEN_REJECTED = 'GitHub dispatch token rejected — renew GITHUB_DISPATCH_TOKEN';

export type DispatchResult
  = | { ok: true }
    | { ok: false; retryable: boolean; error: string };

async function dispatchOnce(
  requestId: string,
  target: 'production' | 'preview',
  token: string,
  fetchImpl: typeof fetch,
): Promise<DispatchResult> {
  const url = `https://api.github.com/repos/${SIGNUP_GITHUB.repository}/actions/workflows/${SIGNUP_GITHUB.workflow}/dispatches`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: SIGNUP_GITHUB.ref, inputs: { request_id: requestId, target } }),
    });
  } catch (error) {
    return { ok: false, retryable: true, error: `GitHub dispatch network error: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (res.status === 204 || res.status === 200) {
    return { ok: true };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, retryable: false, error: DISPATCH_TOKEN_REJECTED };
  }
  const detail = (await res.text().catch(() => '')).slice(0, 300);
  if (res.status === 404) {
    return { ok: false, retryable: false, error: `GitHub dispatch 404 — ${SIGNUP_GITHUB.workflow} not on ${SIGNUP_GITHUB.ref}, or the token cannot see ${SIGNUP_GITHUB.repository}` };
  }
  if (res.status >= 500) {
    return { ok: false, retryable: true, error: `GitHub dispatch ${res.status}: ${detail}` };
  }
  return { ok: false, retryable: false, error: `GitHub dispatch ${res.status}: ${detail}` };
}

/** Dispatch, retrying once on a network error or a GitHub 5xx. */
export async function dispatchOnboardWorkflow(
  requestId: string,
  target: 'production' | 'preview',
  options: { token?: string; fetchImpl?: typeof fetch; retryDelayMs?: number } = {},
): Promise<DispatchResult> {
  const token = options.token ?? Env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return { ok: false, retryable: false, error: 'GITHUB_DISPATCH_TOKEN is not set on this deployment' };
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  const first = await dispatchOnce(requestId, target, token, fetchImpl);
  if (first.ok || !first.retryable) {
    return first;
  }
  logger.warn('[Signup] GitHub dispatch failed, retrying once', { requestId, error: first.error });
  await new Promise(resolve => setTimeout(resolve, options.retryDelayMs ?? 1000));
  return dispatchOnce(requestId, target, token, fetchImpl);
}
