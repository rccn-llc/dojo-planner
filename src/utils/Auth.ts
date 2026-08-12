/**
 * Authentication utilities for Next.js App Router. These functions use Next.js `redirect()`.
 *
 * Naming Convention: `require*` functions ensure users are in the correct state
 * by redirecting them if authentication/authorization fails.
 *
 * For API/RPC authentication, use AuthGuards.ts (`guard*` functions) instead.
 */
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { controlOrganizationDb } from '@/libs/ControlPlaneReads';
import { enterTenantScope } from '@/libs/TenantContext';
import { organizationSchema } from '@/models/Schema';
import { getAcademyOwner } from '@/services/ClerkRolesService';
import { hasActiveSubscription } from '@/services/SaasSubscriptionService';
import { getDbForOrg } from '@/services/TenantDirectoryService';
import { ORG_ROLE } from '@/types/Auth';
import { isExemptOrg, isSuperAdmin } from '@/utils/SuperAdmins';

/**
 * Request-deduped org-existence check. Both the dashboard layout and
 * `requireActiveSubscription` run in the same RSC render and both need to know
 * whether the org has a DB row; `cache()` collapses the repeated reads to one
 * per request.
 *
 * Reads through the CONTROL plane, not the tenant-scoped `db`: this runs during
 * RSC render where no tenant scope exists, and the subscription gate must work
 * even when an org's own database is unreachable or not yet provisioned.
 */
const orgExists = cache(async (orgId: string): Promise<boolean> => {
  const org = await controlOrganizationDb().query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: { id: true },
  });
  return !!org;
});

/**
 * Request-deduped subscription-active check. Wraps the service call so the gate
 * and the layout's client-UX fallback share a single DB read per request.
 */
const isSubscriptionActiveCached = cache(hasActiveSubscription);

/**
 * Resolve the organization's database and enter its scope, once per request.
 *
 * Deliberately non-fatal: a page that never touches tenant data (or reads only
 * control-plane data, like the subscription gate) must still render for an
 * organization that has no tenant row yet. If such a page DOES reach for `db`,
 * the Proxy throws its own diagnostic error — which is the loud failure we
 * want, rather than a redirect from here that would mask the cause.
 */
const establishTenantScope = cache(async (orgId: string): Promise<void> => {
  try {
    const tenantDb = await getDbForOrg(orgId);
    enterTenantScope({ orgId, db: tenantDb, source: 'rsc' });
  } catch (error) {
    console.error('[Tenancy] Could not establish tenant scope for RSC render', {
      orgId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Ensures the user belongs to an organization, and establishes that
 * organization's tenant database scope for the remainder of this request.
 *
 * Server pages and route handlers reach the database through services that
 * import `db`, which is a tenant-resolving Proxy — without a scope, any such
 * access throws. Unlike the RPC route there is no single wrapper to hook, so
 * scope is established here: every server page that touches the database
 * already calls this first, which makes it the natural seam.
 *
 * Uses `enterTenantScope` (AsyncLocalStorage's `enterWith`) rather than
 * `runWithTenant`, because a page cannot wrap its own remaining execution in a
 * callback. React's `cache()` makes it idempotent per request.
 *
 * @returns Promise containing orgId and has function for role checking
 * @throws Redirects to organization selection if no orgId
 */
export const requireOrganization = async () => {
  const { orgId, has } = await auth();

  if (!orgId) {
    redirect('/onboarding/organization-selection');
  }

  await establishTenantScope(orgId);

  return { orgId, has };
};

// Dashboard segments that remain reachable without an active subscription so
// an admin can re-subscribe. Kept in sync with the client equivalent in
// DashboardLayoutClient.
const SUBSCRIPTION_EXEMPT_SEGMENTS = ['/subscription', '/subscription-expired'];

/**
 * Server-side, owner-aware subscription gate for the dashboard.
 *
 * An organization may access the dashboard only when BOTH:
 *   1. it has an active (or trial) SaaS subscription, AND
 *   2. the subscription is matched to an academy owner who still exists in
 *      Clerk.
 *
 * Otherwise the user is redirected to `/dashboard/subscription-expired`
 * BEFORE any protected content is rendered. Super admins, exempt orgs, fresh
 * Clerk orgs without a DB row, and the exempt subscription pages bypass the
 * check.
 *
 * @param pathname The current request pathname (from the `x-pathname` header).
 */
export const requireActiveSubscription = async (pathname: string): Promise<{ subscriptionActive: boolean }> => {
  // Establish the tenant scope for the whole dashboard subtree.
  //
  // Hooking `requireOrganization` alone is not enough: it only covers pages
  // that call it, and several server components (CustomStaffPage, RolesPage)
  // call Clerk's `auth()` directly and then reach for a service. The dashboard
  // LAYOUT, by contrast, renders before every dashboard page — so scoping here
  // covers all of them regardless of how each page authenticates.
  //
  // Runs before the exempt-segment check below, because even the
  // subscription-expired page renders inside this layout.
  const { orgId: scopeOrgId } = await auth();
  if (scopeOrgId) {
    await establishTenantScope(scopeOrgId);
  }

  // Never block the pages used to view/fix the subscription itself.
  if (SUBSCRIPTION_EXEMPT_SEGMENTS.some(seg => pathname.includes(seg))) {
    return { subscriptionActive: true };
  }

  const { orgId, orgRole, sessionClaims } = await auth();
  if (!orgId) {
    return { subscriptionActive: true }; // org enforcement is handled elsewhere (requireOrganization / proxy)
  }

  const username = (sessionClaims as Record<string, unknown>)?.username as string | undefined;
  if (isSuperAdmin(username) || isExemptOrg(orgId)) {
    return { subscriptionActive: true };
  }

  // Fresh Clerk org without a DB row yet — don't enforce.
  if (!(await orgExists(orgId))) {
    return { subscriptionActive: true };
  }

  const active = await isSubscriptionActiveCached(orgId);
  // The org needs a person responsible for the subscription. That's normally the
  // academy owner, but an org admin also qualifies — an admin managing the org
  // shouldn't be locked out just because the academy_owner role isn't assigned.
  const hasResponsiblePerson
    = orgRole === ORG_ROLE.ADMIN || (active && !!(await getAcademyOwner(orgId)));

  if (!active || !hasResponsiblePerson) {
    const localePrefix = pathname.match(/^(\/[^/]+)\/dashboard/)?.[1] ?? '';
    redirect(`${localePrefix}/dashboard/subscription-expired`);
  }

  // The gate passed — the subscription is active (this value feeds the layout's
  // client-UX fallback, avoiding a duplicate org read + hasActiveSubscription).
  return { subscriptionActive: active };
};
