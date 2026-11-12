/**
 * Exact shapes of the public sign-up identifiers, checked before anything
 * reaches the database. No imports: the confirm page (browser) uses this too.
 *
 * Tokens are `sc_` (confirm) or `st_` (status) + 32 random bytes in base64url
 * (`newSignupToken` in SignupRequestService) — always 43 characters.
 */

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIRM_TOKEN = /^sc_[\w-]{43}$/;
const ANY_TOKEN = /^s[ct]_[\w-]{43}$/;

export function isSignupRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID.test(value);
}

/** The emailed confirm token — the only one that can start provisioning. */
export function isConfirmToken(value: unknown): value is string {
  return typeof value === 'string' && CONFIRM_TOKEN.test(value);
}

/** A status or confirm token; either one reads a request's public status. */
export function isSignupToken(value: unknown): value is string {
  return typeof value === 'string' && ANY_TOKEN.test(value);
}
