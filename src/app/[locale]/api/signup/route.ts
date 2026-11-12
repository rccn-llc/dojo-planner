import type { CorsPolicy } from '@/libs/Cors';
import { Buffer } from 'node:buffer';
import { corsJson, evaluateCors, preflightResponse } from '@/libs/Cors';
import { logger } from '@/libs/Logger';
import { logSafeText } from '@/libs/LogRedaction';
import { getClientIP } from '@/libs/RateLimit';
import { decoyAcceptance, submitSignup } from '@/services/SignupFlowService';
import { SIGNUP_LIMITS, signupAllowedOrigins } from '@/utils/SignupConfig';
import { parseSignupPayload } from '@/validations/SignupValidation';

/**
 * Public sign-up from www.dojoplanner.com. The contract (fields, codes,
 * headers) is documented in docs/SIGNUP-API.md; keep the two in step.
 *
 * Cheap checks run first. Nothing is stored until the payload is valid and
 * within the limits, and nothing is provisioned until the owner confirms the
 * emailed link.
 */

export const runtime = 'nodejs';

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

export const POST = async (request: Request) => {
  const cors = evaluateCors(request, corsPolicy());
  const reply = (body: unknown, status: number, extra?: Record<string, string>) =>
    corsJson(body, status, cors.headers, extra);

  // 1. Headers
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return reply({ error: 'unsupported_media_type' }, 415);
  }
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > SIGNUP_LIMITS.maxBodyBytes) {
    return reply({ error: 'payload_too_large' }, 413);
  }

  // 2. Origin — a browser always sends one on a cross-origin POST.
  if (!cors.allowed) {
    logger.warn('[Signup] Origin refused', { origin: logSafeText(request.headers.get('origin') ?? '(none)') });
    return reply({ error: 'origin_not_allowed' }, 403);
  }

  // 3. JSON
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > SIGNUP_LIMITS.maxBodyBytes) {
    return reply({ error: 'payload_too_large' }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ error: 'invalid_json' }, 400);
  }

  // 4–5. Honeypot, then validation
  const parsed = parseSignupPayload(body);
  if (parsed.unknownFields.length > 0) {
    logger.warn('[Signup] Unknown fields ignored', {
      fields: parsed.unknownFields.slice(0, 20).map(name => logSafeText(name, 50)),
    });
  }
  if (parsed.kind === 'honeypot') {
    logger.info('[Signup] Honeypot filled; nothing stored');
    const { requestId, statusToken, statusUrl } = decoyAcceptance();
    return reply({ requestId, statusToken, statusUrl }, 202);
  }
  if (parsed.kind === 'invalid') {
    return reply({ error: 'invalid_request', fields: parsed.fields }, 400);
  }

  // 6–7. Limits, store, email
  try {
    // On Vercel the edge sets X-Forwarded-For to the connecting address,
    // replacing anything the client sent, so it cannot be spoofed to dodge the
    // per-IP limit.
    const ip = getClientIP(request);
    const outcome = await submitSignup(parsed.value, {
      ip: ip === 'unknown' ? null : ip,
      userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
    });
    switch (outcome.kind) {
      case 'accepted':
        return reply({ requestId: outcome.requestId, statusToken: outcome.statusToken, statusUrl: outcome.statusUrl }, 202);
      case 'rate_limited':
        return reply({ error: 'rate_limited' }, 429, { 'Retry-After': String(outcome.retryAfterSeconds) });
      case 'email_failed':
        return reply({ error: 'email_failed' }, 503);
      default:
        return reply({ error: 'unavailable' }, 503);
    }
  } catch (error) {
    logger.error('[Signup] Submit failed', { error: error instanceof Error ? error.message : String(error) });
    return reply({ error: 'unavailable' }, 503);
  }
};
