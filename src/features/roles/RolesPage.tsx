import type { Role } from './RolesPageClient';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getTranslations } from 'next-intl/server';
import { getOrganizationPermissions, getOrganizationRoles } from '@/services/ClerkRolesService';
import { ORG_ROLE } from '@/types/Auth';
import { RolesPageClient } from './RolesPageClient';

export async function RolesPage() {
  const t = await getTranslations('Roles');
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return (
      <div className="rounded-lg border border-border bg-background p-8 text-center">
        <h2 className="text-xl font-semibold text-foreground">{t('access_denied_title')}</h2>
        <p className="mt-2 text-muted-foreground">
          {t('access_denied_message')}
        </p>
      </div>
    );
  }

  let roles: Role[] = [];
  let totalPermissions = 0;
  const allAvailablePermissions: Array<{ id: string; key: string; name: string; description: string }> = [];
  let hasError = false;

  try {
    const authClient = await clerkClient();

    // Fetch organization memberships to count members per role
    const membershipsResponse = await authClient.organizations.getOrganizationMembershipList({
      organizationId: orgId,
    });

    // Count members per role (excluding org:individual_member)
    const roleMemberCounts = new Map<string, number>();
    for (const membership of membershipsResponse.data) {
      const roleKey = membership.role;
      // Skip org:individual_member as per requirements
      if (roleKey !== ORG_ROLE.INDIVIDUAL_MEMBER) {
        roleMemberCounts.set(roleKey, (roleMemberCounts.get(roleKey) || 0) + 1);
      }
    }

    // Fetch real roles and permissions from Clerk API
    const [clerkRoles, clerkPermissions] = await Promise.all([
      getOrganizationRoles(),
      getOrganizationPermissions(),
    ]);

    // Determine which roles are visible to the current user
    // Admin can see all roles, other roles can only see roles at or below their level
    const currentUserRole = orgRole || ORG_ROLE.MEMBER;
    const isAdmin = currentUserRole === ORG_ROLE.ADMIN;

    // Filter roles based on visibility
    // Always hide individual_member role, and hide admin role from non-admins
    const visibleRoles = clerkRoles.filter((role) => {
      // Always hide individual_member role from the UI
      if (role.key === ORG_ROLE.INDIVIDUAL_MEMBER) {
        return false;
      }
      if (isAdmin) {
        return true;
      }
      // Non-admins can see all roles except admin
      return role.key !== ORG_ROLE.ADMIN;
    });

    // Map Clerk roles to our Role type
    roles = visibleRoles.map(clerkRole => ({
      id: clerkRole.id,
      key: clerkRole.key,
      name: clerkRole.name,
      description: clerkRole.description,
      permissions: clerkRole.permissions.map(p => ({
        id: p.id,
        key: p.key,
        name: p.name,
        description: p.description,
      })),
      memberCount: roleMemberCounts.get(clerkRole.key) || 0,
      // System roles are Clerk's built-in roles (admin, member)
      isSystemRole: clerkRole.key === ORG_ROLE.ADMIN || clerkRole.key === ORG_ROLE.MEMBER,
    }));

    // Collect permissions for the modal
    // Admins see all permissions; non-admins only see permissions their own role has
    let currentRolePermissions: Set<string> | null = null;
    if (!isAdmin) {
      const currentRole = clerkRoles.find(r => r.key === currentUserRole);
      const permKeys = currentRole?.permissions
        .map(p => p.key) ?? [];
      currentRolePermissions = new Set(permKeys);
    }

    const seenPermissionKeys = new Set<string>();
    for (const perm of clerkPermissions) {
      if (!seenPermissionKeys.has(perm.key)) {
        // If not admin, only include permissions the current user's role has
        if (currentRolePermissions && !currentRolePermissions.has(perm.key)) {
          continue;
        }
        seenPermissionKeys.add(perm.key);
        allAvailablePermissions.push({
          id: perm.id,
          key: perm.key,
          name: perm.name,
          description: perm.description,
        });
      }
    }

    totalPermissions = seenPermissionKeys.size;
  } catch (error) {
    console.warn('RolesPage - Failed to fetch roles:', error);
    hasError = true;
  }

  if (hasError) {
    return (
      <div className="rounded-lg border border-border bg-background p-8 text-center">
        <h2 className="text-xl font-semibold text-foreground">{t('error_title')}</h2>
        <p className="mt-2 text-muted-foreground">
          {t('error_message')}
        </p>
      </div>
    );
  }

  return (
    <RolesPageClient
      roles={roles}
      totalPermissions={totalPermissions}
      availablePermissions={allAvailablePermissions}
      currentUserRole={orgRole || ORG_ROLE.MEMBER}
    />
  );
}
