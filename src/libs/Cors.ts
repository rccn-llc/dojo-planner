/**
 * CORS for the few routes a page on another origin may call (the public
 * sign-up endpoints). Everything else in the app is same-origin and sends no
 * CORS headers at all.
 *
 * Only exact origins on an allowlist are echoed back — never `*` — and the
 * headers are added to error responses too: without them the browser hides
 * the error body from the calling page, which then cannot tell a validation
 * error from a network failure.
 */

export type CorsPolicy = {
  allowedOrigins: readonly string[];
  methods: readonly string[];
  allowHeaders: readonly string[];
  exposeHeaders?: readonly string[];
  maxAgeSeconds?: number;
};

export type CorsDecision = {
  /** No Origin header: not a browser cross-origin call (curl, server, same-origin GET). */
  originPresent: boolean;
  allowed: boolean;
  headers: Headers;
};

export function evaluateCors(request: Request, policy: CorsPolicy): CorsDecision {
  const origin = request.headers.get('origin');
  const headers = new Headers({ Vary: 'Origin' });

  if (origin === null) {
    return { originPresent: false, allowed: false, headers };
  }

  const allowed = policy.allowedOrigins.includes(origin);
  if (allowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', policy.methods.join(', '));
    headers.set('Access-Control-Allow-Headers', policy.allowHeaders.join(', '));
    if (policy.exposeHeaders?.length) {
      headers.set('Access-Control-Expose-Headers', policy.exposeHeaders.join(', '));
    }
    if (policy.maxAgeSeconds !== undefined) {
      headers.set('Access-Control-Max-Age', String(policy.maxAgeSeconds));
    }
  }
  return { originPresent: true, allowed, headers };
}

/** Answer an OPTIONS preflight: 204 for an allowed origin, 403 otherwise. */
export function preflightResponse(request: Request, policy: CorsPolicy): Response {
  const { allowed, headers } = evaluateCors(request, policy);
  return new Response(null, { status: allowed ? 204 : 403, headers });
}

/** A JSON response carrying the CORS headers already decided for this request. */
export function corsJson(
  body: unknown,
  status: number,
  corsHeaders: Headers,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(extraHeaders ?? {})) {
    headers.set(name, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}
