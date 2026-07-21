/**
 * Derives the ORPC prefix from the request pathname.
 *
 * This route is mounted under the `[locale]` segment, so an incoming request may
 * arrive either as `/rpc/...` (default locale, no prefix) or as
 * `/{locale}/rpc/...` (non-default locale, e.g. `/ja/rpc/...`). ORPC strips a
 * single static prefix; if we hardcode `/rpc`, a locale-prefixed request never
 * matches a procedure and falls through to a plain-text 404 — which the ORPC
 * client cannot parse, surfacing as MALFORMED_ORPC_ERROR_RESPONSE.
 *
 * Kept in a separate module (not `route.ts`) because Next.js App Router route
 * files may only export HTTP handlers / route config — exporting a helper from
 * `route.ts` fails `next build` with "not a valid Route export field".
 */
export function deriveRpcPrefix(pathname: string): `/${string}` {
  const localePrefix = pathname.match(/^(\/[^/]+)?\/rpc/)?.[1];
  // The capture group, when present, always begins with `/` (e.g. `/ja`), so the
  // composed prefix is always `/${string}` at runtime.
  return (localePrefix ? `${localePrefix}/rpc` : '/rpc') as `/${string}`;
}
