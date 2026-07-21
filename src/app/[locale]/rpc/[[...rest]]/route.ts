import { auth } from '@clerk/nextjs/server';
import { RPCHandler } from '@orpc/server/fetch';
import { auditLogger } from '@/libs/Logger';
import { getClientIP, isRateLimitingEnabled, rpcRateLimiter, unauthenticatedRateLimiter } from '@/libs/RateLimit';
import { router } from '@/routers';

const handler = new RPCHandler(router);

/**
 * Derives the ORPC prefix from the request pathname.
 *
 * This route is mounted under the `[locale]` segment, so an incoming request may
 * arrive either as `/rpc/...` (default locale, no prefix) or as
 * `/{locale}/rpc/...` (non-default locale, e.g. `/ja/rpc/...`). ORPC strips a
 * single static prefix; if we hardcode `/rpc`, a locale-prefixed request never
 * matches a procedure and falls through to a plain-text 404 — which the ORPC
 * client cannot parse, surfacing as MALFORMED_ORPC_ERROR_RESPONSE.
 */
export function deriveRpcPrefix(pathname: string): `/${string}` {
  const localePrefix = pathname.match(/^(\/[^/]+)?\/rpc/)?.[1];
  // The capture group, when present, always begins with `/` (e.g. `/ja`), so the
  // composed prefix is always `/${string}` at runtime.
  return (localePrefix ? `${localePrefix}/rpc` : '/rpc') as `/${string}`;
}

/**
 * Applies rate limiting to the request based on authentication status.
 * Returns a 429 response if rate limit is exceeded.
 */
async function applyRateLimit(request: Request): Promise<Response | null> {
  if (!isRateLimitingEnabled()) {
    return null;
  }

  const clientIP = getClientIP(request);

  // Check authentication status to determine rate limit tier
  const { orgId } = await auth();

  const limiter = orgId ? rpcRateLimiter : unauthenticatedRateLimiter;
  const identifier = orgId ?? clientIP;

  const result = await limiter.limit(identifier);

  if (!result.success) {
    const identifierType = orgId ? 'org' : 'ip';

    // Log rate limit exceeded for audit trail
    auditLogger.warn(`[RATE_LIMIT] RPC rate limit exceeded for ${identifierType}:${identifier}`, {
      identifierType,
      identifier,
      clientIP,
      remaining: result.remaining,
      reset: new Date(result.reset).toISOString(),
      path: new URL(request.url).pathname,
    });

    return new Response(
      JSON.stringify({
        error: 'Too Many Requests',
        retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
        limit: result.limit,
        remaining: result.remaining,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
          'Retry-After': String(Math.ceil((result.reset - Date.now()) / 1000)),
        },
      },
    );
  }

  return null;
}

async function handleRequest(request: Request) {
  // Apply rate limiting before processing
  const rateLimitResponse = await applyRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const prefix = deriveRpcPrefix(new URL(request.url).pathname);

  const { response } = await handler.handle(request, { prefix });

  return response ?? new Response('Not found', { status: 404 });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
