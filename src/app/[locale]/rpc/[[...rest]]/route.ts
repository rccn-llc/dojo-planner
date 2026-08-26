import { auth } from '@clerk/nextjs/server';
import { RPCHandler } from '@orpc/server/fetch';
import { auditLogger, logger } from '@/libs/Logger';
import { getClientIP, isRateLimitingEnabled, rpcRateLimiter, unauthenticatedRateLimiter } from '@/libs/RateLimit';
import { runWithTenant } from '@/libs/TenantContext';
import { router } from '@/routers';
import { getDbForOrg, TenantNotProvisionedError, TenantUnavailableError } from '@/services/TenantDirectoryService';
import { deriveRpcPrefix } from './rpcPrefix';

const handler = new RPCHandler(router);

/**
 * Applies rate limiting to the request based on authentication status.
 * Returns a 429 response if rate limit is exceeded.
 *
 * `orgId` is passed in rather than re-derived: the caller already resolved it
 * to select the tenant database, and Clerk's `auth()` is request-deduped
 * anyway.
 */
async function applyRateLimit(request: Request, orgId: string | null | undefined): Promise<Response | null> {
  if (!isRateLimitingEnabled()) {
    return null;
  }

  const clientIP = getClientIP(request);

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
  // Resolved once and reused for both rate limiting and tenant selection.
  const { orgId } = await auth();

  const rateLimitResponse = await applyRateLimit(request, orgId);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const prefix = deriveRpcPrefix(new URL(request.url).pathname);

  // Unauthenticated / org-less requests still reach the handler, deliberately
  // WITHOUT a tenant scope, so `guardAuth()` produces its JSON 401 rather than
  // an HTML redirect (see the rewrite-not-redirect note in src/proxy.ts). Any
  // handler that reaches for the database without passing a guard first now
  // throws — the desired fail-closed behaviour.
  if (!orgId) {
    const { response } = await handler.handle(request, { prefix });
    return response ?? new Response('Not found', { status: 404 });
  }

  let tenantDb;
  try {
    tenantDb = await getDbForOrg(orgId);
  } catch (error) {
    if (error instanceof TenantNotProvisionedError) {
      return Response.json({ error: 'Organization not provisioned' }, { status: 409 });
    }
    if (error instanceof TenantUnavailableError) {
      return Response.json({ error: 'Organization temporarily unavailable' }, { status: 503 });
    }
    // Anything else is unexpected. Log it: an unlogged rethrow surfaces as a
    // bare 500 with no explanation, which is how a tenancy misconfiguration
    // can look identical to an application bug.
    logger.error('[RPC] Failed to resolve tenant database', {
      orgId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  return runWithTenant({ orgId, db: tenantDb, source: 'rpc' }, async () => {
    const { response } = await handler.handle(request, { prefix, context: { orgId } });
    return response ?? new Response('Not found', { status: 404 });
  });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
