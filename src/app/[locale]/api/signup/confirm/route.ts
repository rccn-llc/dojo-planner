import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import { logger } from '@/libs/Logger';
import { createWindowLimiter } from '@/libs/MemoryRateLimit';
import { getClientIP } from '@/libs/RateLimit';
import { confirmAndDispatch } from '@/services/SignupFlowService';
import { isConfirmToken } from '@/validations/SignupTokens';

/**
 * Called by the confirm page (same origin) when the owner clicks Confirm.
 *
 * Deliberately a POST from a page rather than a GET on the emailed link:
 * email security scanners open links before the person does, and a GET that
 * started provisioning would let a scanner create the organization.
 *
 * The emailed token is the real protection (256 random bits). Around it:
 * - JSON only. A cross-site page can send a "simple" text/plain POST without
 *   a preflight; requiring application/json forces one, and this route
 *   answers no CORS, so the browser stops it.
 * - Browsers mark cross-site requests with `Sec-Fetch-Site`; those are refused.
 * - A small body cap and a per-IP limit, so the route cannot be used to
 *   hammer the database with guesses.
 */

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 1024;
const confirms = createWindowLimiter({ limit: 10, windowMs: 60_000 });

/** Exported for tests. */
export function resetConfirmRouteState(): void {
  confirms.reset();
}

const json = (body: unknown, status: number, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export const POST = async (request: Request) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415);
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite !== 'same-origin') {
    return json({ error: 'origin_not_allowed' }, 403);
  }
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }
  if (!confirms.allow(getClientIP(request))) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }

  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }
  let token: unknown;
  try {
    token = (JSON.parse(text) as { token?: unknown } | null)?.token;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!isConfirmToken(token)) {
    return json({ error: 'not_found' }, 404);
  }

  try {
    const outcome = await confirmAndDispatch(token);
    switch (outcome.kind) {
      case 'not_found':
        return json({ error: 'not_found' }, 404);
      case 'expired':
        return json({ error: 'expired' }, 410);
      default:
        // started / already_confirmed / failed: the page shows live status.
        return json({ result: outcome.kind, requestId: outcome.requestId }, 200);
    }
  } catch (error) {
    logger.error('[Signup] Confirm failed', { error: error instanceof Error ? error.message : String(error) });
    return json({ error: 'unavailable' }, 503);
  }
};
