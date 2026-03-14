import type { OrgRole } from '@/types/Auth';
import { useOrganization } from '@clerk/nextjs';
import { ORG_ROLE } from '@/types/Auth';

const ROLE_HIERARCHY: OrgRole[] = [
  ORG_ROLE.ADMIN,
  ORG_ROLE.ACADEMY_OWNER,
  ORG_ROLE.FRONT_DESK,
  ORG_ROLE.MEMBER,
  ORG_ROLE.INDIVIDUAL_MEMBER,
];

/**
 * Returns true if the current user's role is at or above the required role level.
 * Uses the same hierarchy as AuthGuards.ts on the server side.
 */
export function useHasRole(requiredRole: OrgRole): boolean {
  const { membership } = useOrganization();
  const userRole = membership?.role as OrgRole | undefined;

  if (!userRole) {
    return false;
  }

  const userIndex = ROLE_HIERARCHY.indexOf(userRole);
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);

  if (userIndex === -1 || requiredIndex === -1) {
    return false;
  }

  // Lower index = higher privilege
  return userIndex <= requiredIndex;
}
