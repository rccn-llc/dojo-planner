/**
 * Authentication guards for ORPC API routes
 *
 * Naming Convention: `guard*` functions guard API access by throwing
 * ORPCError with proper HTTP status codes when authentication/authorization fails.
 *
 * For App Router authentication with redirects, use Auth.ts (`require*` functions) instead.
 *
 * SOC2 Compliance: Guards return userId for audit logging purposes.
 * All mutations should use the returned context for audit trail creation.
 */
import type { AuditContext } from '@/types/Audit';
import type { OrgRole } from '@/types/Auth';
import { auth } from '@clerk/nextjs/server';
import { ORPCError } from '@orpc/server';
import { getTenantScope } from '@/libs/TenantContext';
import { ORG_ROLE } from '@/types/Auth';

/**
 * Role hierarchy from highest to lowest privilege.
 * Higher roles inherit all permissions of lower roles.
 */
const ROLE_HIERARCHY: OrgRole[] = [
  ORG_ROLE.ADMIN,
  ORG_ROLE.ACADEMY_OWNER,
  ORG_ROLE.FRONT_DESK,
  ORG_ROLE.INSTRUCTOR,
  ORG_ROLE.MEMBER,
  ORG_ROLE.INDIVIDUAL_MEMBER,
];

/**
 * Checks if a user has at least the required role level.
 * Admin and Academy Owner have all permissions.
 * Front Desk has Member permissions, etc.
 */
const hasRoleOrHigher = (
  has: (params: { role: OrgRole }) => boolean,
  requiredRole: OrgRole,
): boolean => {
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);
  if (requiredIndex === -1) {
    return has({ role: requiredRole });
  }

  // Check if user has the required role or any higher role
  for (let i = 0; i <= requiredIndex; i++) {
    const role = ROLE_HIERARCHY[i];
    if (role && has({ role })) {
      return true;
    }
  }
  return false;
};

/**
 * Guards ORPC procedures requiring authentication.
 * Returns user context for audit logging.
 *
 * @returns Promise containing userId, orgId, and has function for role checking
 * @throws ORPCError with 401 status if userId or orgId is missing
 */
export const guardAuth = async (): Promise<{
  userId: string;
  orgId: string;
  has: (params: { role: OrgRole }) => boolean;
}> => {
  const { userId, orgId, has } = await auth();

  if (!userId || !orgId) {
    throw new ORPCError('Unauthorized', { status: 401 });
  }

  // Fail-closed tenancy check. The RPC entry point selects the tenant database
  // from its own `auth()` call; this guard re-derives the session org for
  // authorization. Those two must agree — if they ever diverge, the request is
  // about to read or write the wrong organization's database, so refuse rather
  // than proceed. Authorization and connection-selection stay separate
  // concerns; this assertion is the seam between them.
  const scope = getTenantScope();
  if (scope && scope.orgId !== orgId) {
    throw new ORPCError('Forbidden', { status: 403 });
  }

  return { userId, orgId, has };
};

/**
 * Guards ORPC procedures requiring specific role permissions.
 * Implements role hierarchy: admin > academy_owner > front_desk > member > individual_member
 * Returns audit context including the verified role.
 *
 * @param role - The minimum required organization role
 * @returns Promise containing audit context (userId, orgId, role)
 * @throws ORPCError with 401 status if not authenticated, 403 if insufficient permissions
 */
export const guardRole = async (role: OrgRole): Promise<AuditContext> => {
  const { userId, orgId, has } = await guardAuth();

  if (!hasRoleOrHigher(has, role)) {
    throw new ORPCError('Forbidden', { status: 403 });
  }

  return { userId, orgId, role };
};
