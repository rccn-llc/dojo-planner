/**
 * Staff Server Actions
 *
 * This file uses Next.js Server Actions pattern for server-side mutations.
 * Server Actions are the recommended pattern for new features in this codebase.
 *
 * Pattern Guidelines:
 * - Use 'use server' directive at the top of the file
 * - Export async functions that can be called directly from Client Components
 * - Always authenticate with auth() before performing operations
 * - Return typed result objects with { success, data?, error? } pattern
 * - Handle errors gracefully and return user-friendly messages
 *
 * When to use Server Actions (src/actions/):
 * - Form submissions and data mutations
 * - Operations that need server-side authentication
 * - Clerk API interactions (invitations, user updates, etc.)
 *
 * When to use Services (src/services/):
 * - Shared business logic used by multiple Server Actions
 * - Third-party API integrations (Clerk, Stripe, etc.)
 * - Data fetching utilities and helpers
 *
 * @see https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations
 */
'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { audit } from '@/services/AuditService';
import { getOrganizationRoles } from '@/services/ClerkRolesService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

export type StaffRole = {
  id: string;
  key: string;
  name: string;
  description: string;
};

type InviteStaffResult = {
  success: boolean;
  error?: string;
  invitationId?: string;
};

type UpdateStaffResult = {
  success: boolean;
  error?: string;
};

type RemoveStaffResult = {
  success: boolean;
  error?: string;
};

type FetchRolesResult = {
  success: boolean;
  roles?: StaffRole[];
  error?: string;
};

/**
 * Fetches available roles from Clerk for staff invitations.
 * Filters roles based on the current user's permissions.
 */
export async function fetchStaffRoles(): Promise<FetchRolesResult> {
  try {
    const { userId, orgId, orgRole } = await auth();

    if (!userId || !orgId) {
      return {
        success: false,
        error: 'User is not authenticated or not part of an organization',
      };
    }

    // Fetch roles from Clerk
    const clerkRoles = await getOrganizationRoles();

    // Filter roles based on current user's permissions
    // - Always hide individual_member role
    // - Non-admins cannot invite admins
    const isAdmin = orgRole === ORG_ROLE.ADMIN;
    const filteredRoles = clerkRoles
      .filter((role) => {
        // Always hide individual_member role from the UI
        if (role.key === ORG_ROLE.INDIVIDUAL_MEMBER) {
          return false;
        }
        // Non-admins cannot see/assign admin role
        if (!isAdmin && role.key === ORG_ROLE.ADMIN) {
          return false;
        }
        return true;
      })
      .map(role => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
      }));

    return {
      success: true,
      roles: filteredRoles,
    };
  } catch (error) {
    console.error('[fetchStaffRoles] Failed to fetch roles:', error);
    return {
      success: false,
      error: 'Failed to fetch roles. Please try again.',
    };
  }
}

/**
 * Sends an invitation to a staff member via Clerk.
 * The invitation email contains a working link for the invitee to accept.
 */
export async function inviteStaffMember(params: {
  emailAddress: string;
  roleKey: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}): Promise<InviteStaffResult> {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return {
        success: false,
        error: 'User is not authenticated or not part of an organization',
      };
    }

    const authClient = await clerkClient();

    // Create the organization invitation via Clerk
    // Clerk will automatically send an invitation email with a working activation link
    const invitation = await authClient.organizations.createOrganizationInvitation({
      organizationId: orgId,
      inviterUserId: userId,
      emailAddress: params.emailAddress,
      role: params.roleKey,
      // Store additional data in public metadata for use when the user accepts
      publicMetadata: {
        invitedFirstName: params.firstName,
        invitedLastName: params.lastName,
        invitedPhone: params.phone,
      },
    });

    console.info('[inviteStaffMember] Invitation sent successfully:', {
      invitationId: invitation.id,
      emailAddress: params.emailAddress,
      role: params.roleKey,
    });

    await audit({ userId, orgId }, AUDIT_ACTION.STAFF_INVITE, AUDIT_ENTITY_TYPE.STAFF, {
      entityId: invitation.id,
      status: 'success',
    });

    revalidatePath('/dashboard/staff');

    return {
      success: true,
      invitationId: invitation.id,
    };
  } catch (error) {
    console.error('[inviteStaffMember] Failed to send invitation:', error);

    // Handle specific Clerk errors
    if (error instanceof Error) {
      // Check for common error patterns
      if (error.message.includes('already a member')) {
        return {
          success: false,
          error: 'This email address is already a member of this organization.',
        };
      }
      if (error.message.includes('already invited')) {
        return {
          success: false,
          error: 'An invitation has already been sent to this email address.',
        };
      }
    }

    return {
      success: false,
      error: 'Failed to send invitation. Please try again.',
    };
  }
}

/**
 * Updates an existing staff member's information via Clerk.
 * Can update the user's role within the organization and their profile metadata.
 */
export async function updateStaffMember(params: {
  userId: string;
  roleKey: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}): Promise<UpdateStaffResult> {
  try {
    const { userId: currentUserId, orgId } = await auth();

    if (!currentUserId || !orgId) {
      return {
        success: false,
        error: 'User is not authenticated or not part of an organization',
      };
    }

    const authClient = await clerkClient();

    // Update the user's organization membership role
    await authClient.organizations.updateOrganizationMembership({
      organizationId: orgId,
      userId: params.userId,
      role: params.roleKey,
    });

    // Update the user's profile metadata (firstName, lastName, phone)
    await authClient.users.updateUser(params.userId, {
      firstName: params.firstName,
      lastName: params.lastName,
      publicMetadata: {
        phone: params.phone,
      },
    });

    console.info('[updateStaffMember] Staff member updated successfully:', {
      userId: params.userId,
      role: params.roleKey,
    });

    await audit({ userId: currentUserId, orgId }, AUDIT_ACTION.STAFF_UPDATE, AUDIT_ENTITY_TYPE.STAFF, {
      entityId: params.userId,
      status: 'success',
    });

    revalidatePath('/dashboard/staff');

    return {
      success: true,
    };
  } catch (error) {
    console.error('[updateStaffMember] Failed to update staff member:', error);

    // Handle specific Clerk errors
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return {
          success: false,
          error: 'Staff member not found.',
        };
      }
      if (error.message.includes('permission')) {
        return {
          success: false,
          error: 'You do not have permission to update this staff member.',
        };
      }
    }

    return {
      success: false,
      error: 'Failed to update staff member. Please try again.',
    };
  }
}

/**
 * Removes a staff member from the organization via Clerk. The user's auth
 * account is preserved — only their organization membership is revoked.
 */
export async function removeStaffMember(params: {
  userId: string;
}): Promise<RemoveStaffResult> {
  try {
    const { userId: currentUserId, orgId } = await auth();

    if (!currentUserId || !orgId) {
      return {
        success: false,
        error: 'User is not authenticated or not part of an organization',
      };
    }

    if (params.userId === currentUserId) {
      return {
        success: false,
        error: 'You cannot remove yourself from the organization.',
      };
    }

    const authClient = await clerkClient();
    await authClient.organizations.deleteOrganizationMembership({
      organizationId: orgId,
      userId: params.userId,
    });

    console.info('[removeStaffMember] Staff member removed successfully:', {
      userId: params.userId,
    });

    await audit({ userId: currentUserId, orgId }, AUDIT_ACTION.STAFF_REMOVE, AUDIT_ENTITY_TYPE.STAFF, {
      entityId: params.userId,
      status: 'success',
    });

    revalidatePath('/dashboard/staff');

    return {
      success: true,
    };
  } catch (error) {
    console.error('[removeStaffMember] Failed to remove staff member:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return {
          success: false,
          error: 'Staff member not found.',
        };
      }
      if (error.message.includes('permission')) {
        return {
          success: false,
          error: 'You do not have permission to remove this staff member.',
        };
      }
    }

    return {
      success: false,
      error: 'Failed to remove staff member. Please try again.',
    };
  }
}
