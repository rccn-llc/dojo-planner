import type { NextFetchEvent, NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { routing } from './libs/I18nRouting';

const handleI18nRouting = createMiddleware(routing);

// Pages that must redirect an unauthenticated visitor to the sign-in page.
const isProtectedPage = createRouteMatcher([
  '/dashboard(.*)',
  '/:locale/dashboard(.*)',
  '/onboarding(.*)',
  '/:locale/onboarding(.*)',
]);

// The RPC API. It still needs Clerk to run so the session is attached (each
// procedure calls `guardAuth()`/`guardRole()` and returns a proper 401/403 JSON
// error when unauthenticated). It must NOT be redirected to `/sign-in`: the ORPC
// client cannot parse an HTML redirect and surfaces it as
// MALFORMED_ORPC_ERROR_RESPONSE. So we run Clerk for it but never `auth.protect()`.
const isRpcRoute = createRouteMatcher([
  '/rpc(.*)',
  '/:locale/rpc(.*)',
]);

// Routes that require the Clerk middleware to run at all.
const isProtectedRoute = (req: NextRequest) => isProtectedPage(req) || isRpcRoute(req);

const isAuthPage = createRouteMatcher([
  '/sign-in(.*)',
  '/:locale/sign-in(.*)',
  '/sign-up(.*)',
  '/:locale/sign-up(.*)',
]);

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  // Stamp the current pathname onto a request header so Server Components
  // (which don't receive the pathname directly) can read it via `headers()`.
  // Used by the dashboard layout's owner-aware subscription gate to know which
  // path is being requested (and skip enforcement on exempt subscription pages).
  request.headers.set('x-pathname', request.nextUrl.pathname);

  // Clerk keyless mode doesn't work with i18n, this is why we need to run the middleware conditionally
  if (
    isAuthPage(request) || isProtectedRoute(request)
  ) {
    return clerkMiddleware(async (auth, req) => {
      // Redirect unauthenticated visitors of protected PAGES to the sign-in page.
      // RPC routes are deliberately excluded — they return a JSON 401 from the
      // handler's guard instead of an unparseable HTML redirect.
      if (isProtectedPage(req)) {
        const locale = req.nextUrl.pathname.match(/(\/.*)\/dashboard/)?.at(1) ?? '';

        const signInUrl = new URL(`${locale}/sign-in`, req.url);

        await auth.protect({
          unauthenticatedUrl: signInUrl.toString(),
        });
      }

      const authObj = await auth();

      // Redirect authenticated users without an organization to the organization selection page
      // This ensures users are properly associated with an organization before accessing the dashboard
      if (
        authObj.userId
        && !authObj.orgId
        && req.nextUrl.pathname.includes('/dashboard')
        && !req.nextUrl.pathname.endsWith('/organization-selection')
      ) {
        const orgSelection = new URL(
          '/onboarding/organization-selection',
          req.url,
        );

        return NextResponse.redirect(orgSelection);
      }

      // The RPC API is not a localized page. Running a locale-less `/rpc` POST
      // through next-intl makes the middleware 307-REDIRECT it to `/{locale}/rpc`
      // whenever a non-default locale is detected (e.g. a member on `/ja/...`).
      // The ORPC client's fetch follows that redirect into an opaque response and
      // reports MALFORMED_ORPC_ERROR_RESPONSE (status 0). We still need the
      // request internally rewritten to the `[locale]/rpc` route, so instead of
      // next-intl we issue a plain rewrite to the default locale — no client
      // round-trip, no locale bias. Clerk has already attached the session above.
      if (isRpcRoute(req)) {
        const { pathname } = req.nextUrl;
        // Only the un-prefixed `/rpc/...` form needs a rewrite; an already
        // locale-prefixed `/{locale}/rpc/...` matches the route directly.
        if (/^\/rpc(?:\/|$)/.test(pathname)) {
          const url = req.nextUrl.clone();
          url.pathname = `/${routing.defaultLocale}${pathname}`;
          return NextResponse.rewrite(url);
        }
        return NextResponse.next();
      }

      return handleI18nRouting(req);
    })(request, event);
  }

  return handleI18nRouting(request);
}

export const config = {
  // Match all pathnames except for
  // - … if they start with `/_next`, `/_vercel` or `monitoring`
  // - … the ones containing a dot (e.g. `favicon.ico`)
  matcher: '/((?!_next|_vercel|monitoring|.*\\..*).*)',
};
