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
import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { getAcademyOwner } from '@/services/ClerkRolesService';
import { hasActiveSubscription } from '@/services/SaasSubscriptionService';
import { ORG_ROLE } from '@/types/Auth';
import { isExemptOrg, isSuperAdmin } from '@/utils/SuperAdmins';

/**
 * Ensures the user belongs to an organization.
 * Redirects to organization selection if no organization is found.
 *
 * @returns Promise containing orgId and has function for role checking
 * @throws Redirects to organization selection if no orgId
 */
export const requireOrganization = async () => {
  const { orgId, has } = await auth();

  if (!orgId) {
    redirect('/onboarding/organization-selection');
  }

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
export const requireActiveSubscription = async (pathname: string) => {
  // Never block the pages used to view/fix the subscription itself.
  if (SUBSCRIPTION_EXEMPT_SEGMENTS.some(seg => pathname.includes(seg))) {
    return;
  }

  const { orgId, orgRole, sessionClaims } = await auth();
  if (!orgId) {
    return; // org enforcement is handled elsewhere (requireOrganization / proxy)
  }

  const username = (sessionClaims as Record<string, unknown>)?.username as string | undefined;
  if (isSuperAdmin(username) || isExemptOrg(orgId)) {
    return;
  }

  // Fresh Clerk org without a DB row yet — don't enforce.
  const org = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: { id: true },
  });
  if (!org) {
    return;
  }

  const active = await hasActiveSubscription(orgId);
  // The org needs a person responsible for the subscription. That's normally the
  // academy owner, but an org admin also qualifies — an admin managing the org
  // shouldn't be locked out just because the academy_owner role isn't assigned.
  const hasResponsiblePerson
    = orgRole === ORG_ROLE.ADMIN || (active && !!(await getAcademyOwner(orgId)));

  if (!active || !hasResponsiblePerson) {
    const localePrefix = pathname.match(/^(\/[^/]+)\/dashboard/)?.[1] ?? '';
    redirect(`${localePrefix}/dashboard/subscription-expired`);
  }
};
