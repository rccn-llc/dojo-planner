import type { PublicSignupStatus } from '@/services/SignupFlowService';
import { SIGNUP_LIMITS } from '@/utils/SignupConfig';
import { createWindowLimiter } from './MemoryRateLimit';

/**
 * In-memory state for the public sign-up routes, per server instance. It lives
 * here rather than in the route files because a Next.js route module may
 * export only handlers and route config — the build's type check rejects a
 * route that also exports a test helper.
 */

/** POST /api/signup/confirm attempts per IP per minute. */
export const confirmLimiter = createWindowLimiter({ limit: 10, windowMs: 60_000 });

/** GET /api/signup/status polls per IP per minute. */
export const statusLimiter = createWindowLimiter({ limit: SIGNUP_LIMITS.statusPollsPerMinute, windowMs: 60_000 });

/** Recent status answers, keyed by `${id}:${token}`. */
export const statusCache = new Map<string, { at: number; status: PublicSignupStatus }>();

/** Clears every limiter and the cache. For tests. */
export function resetSignupRouteState(): void {
  confirmLimiter.reset();
  statusLimiter.reset();
  statusCache.clear();
}
