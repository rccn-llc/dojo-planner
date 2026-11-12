import type { CorsPolicy } from '@/libs/Cors';
import { corsJson, evaluateCors, preflightResponse } from '@/libs/Cors';
import { logger } from '@/libs/Logger';
import { getClientIP } from '@/libs/RateLimit';
import { statusCache as cache, statusLimiter as polls } from '@/libs/SignupRouteState';
import { readSignupStatus } from '@/services/SignupFlowService';
import { signupAllowedOrigins } from '@/utils/SignupConfig';
import { isSignupRequestId, isSignupToken } from '@/validations/SignupTokens';

/**
 * What the www form (and the confirm page) poll after a submit. Answers with
 * fixed public wording only; an unknown id and a wrong token both answer 404.
 *
 * Polling is protected in memory, per server instance — a coarse bound, but
 * one that needs no extra service: a per-IP count per minute, and a 2-second
 * cache per request so a tab polling fast reads the database at most every 2s.
 */

export const runtime = 'nodejs';

const CACHE_MS = 2000;
const MAX_CACHED = 5000;

function corsPolicy(): CorsPolicy {
  return {
    allowedOrigins: signupAllowedOrigins(),
    methods: ['POST', 'GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Accept'],
    exposeHeaders: ['Retry-After'],
    maxAgeSeconds: 600,
  };
}

export const OPTIONS = async (request: Request) => preflightResponse(request, corsPolicy());

export const GET = async (request: Request) => {
  const cors = evaluateCors(request, corsPolicy());
  const reply = (body: unknown, status: number, extra?: Record<string, string>) =>
    corsJson(body, status, cors.headers, extra);

  // Same-origin pages (the confirm page) and curl send no Origin; a foreign
  // page that does must be on the list.
  if (cors.originPresent && !cors.allowed) {
    return reply({ error: 'origin_not_allowed' }, 403);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const token = url.searchParams.get('token');
  // Anything not shaped like an id and token we issue is a miss — it never
  // reaches the database (or, through a database error, the logs).
  if (!isSignupRequestId(id) || !isSignupToken(token)) {
    return reply({ error: 'not_found' }, 404);
  }

  const now = Date.now();
  if (!polls.allow(getClientIP(request), now)) {
    return reply({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }

  const cacheKey = `${id}:${token}`;
  const cached = cache.get(cacheKey);
  if (cached && now - cached.at < CACHE_MS) {
    return reply(cached.status, 200);
  }

  try {
    const status = await readSignupStatus(id, token);
    if (!status) {
      return reply({ error: 'not_found' }, 404);
    }
    if (cache.size > MAX_CACHED) {
      cache.clear();
    }
    cache.set(cacheKey, { at: now, status });
    return reply(status, 200);
  } catch (error) {
    logger.error('[Signup] Status read failed', { error: error instanceof Error ? error.message : String(error) });
    return reply({ error: 'unavailable' }, 503);
  }
};
