import { auth, clerkClient } from '@clerk/nextjs/server';
import { getTranslations } from 'next-intl/server';
import { getInstructorPhotoOverrides } from '@/services/InstructorsService';
import { ORG_ROLE } from '@/types/Auth';
import { StaffPageClient } from './StaffPageClient';

type ClerkStaffMember = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  photoUrl: string | null;
  emailAddress: string;
  role: string;
  status: 'Active' | 'Invitation sent' | 'Inactive';
};

// Roles that count as "staff" for the staff page. Everyone except plain members
// is a staff member (admins, academy owners, front desk, instructors). Filtering
// to a hardcoded subset previously hid front-desk staff entirely — e.g. an
// academy owner switched to front desk vanished from the list.
const STAFF_ROLES = new Set<string>([
  ORG_ROLE.ADMIN,
  ORG_ROLE.ACADEMY_OWNER,
  ORG_ROLE.FRONT_DESK,
  ORG_ROLE.INSTRUCTOR,
]);

export async function CustomStaffPage() {
  const t = await getTranslations('Staff');
  const { userId, orgId } = await auth();

  // Check authentication and authorization
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

  try {
    const authClient = await clerkClient();

    // Get all organization members
    const memberships = await authClient.organizations.getOrganizationMembershipList({
      organizationId: orgId,
    });

    // Check if current user is an admin or academy owner
    const userRole = memberships.data.find(
      m => m.publicUserData?.userId === userId,
    )?.role;

    if (userRole !== 'org:admin' && userRole !== 'org:academy_owner') {
      return (
        <div className="rounded-lg border border-border bg-background p-8 text-center">
          <h2 className="text-xl font-semibold text-foreground">{t('access_denied_title')}</h2>
          <p className="mt-2 text-muted-foreground">
            {t('access_denied_message')}
          </p>
        </div>
      );
    }

    // In-app instructor photo overrides take precedence over the Clerk avatar.
    const photoOverrides = await getInstructorPhotoOverrides(orgId);

    // Keep only staff-role memberships (admins, academy owners, front desk,
    // instructors). Pending invitations are intentionally NOT shown here —
    // only accepted org memberships appear.
    const staffMembers: ClerkStaffMember[] = memberships.data
      .filter(membership => membership.role != null && STAFF_ROLES.has(membership.role))
      .map((membership) => {
        // Determine status based on whether user has fully set up their account
        const status: 'Active' | 'Invitation sent' | 'Inactive' = membership.publicUserData
          ? 'Active'
          : 'Invitation sent';

        const userId = membership.publicUserData?.userId;
        const overridePhoto = userId ? photoOverrides.get(userId) : undefined;

        return {
          id: userId || membership.id,
          firstName: membership.publicUserData?.firstName ?? null,
          lastName: membership.publicUserData?.lastName ?? null,
          email: membership.publicUserData?.identifier || '',
          photoUrl: overridePhoto ?? membership.publicUserData?.imageUrl ?? null,
          emailAddress: membership.publicUserData?.identifier || '',
          role: membership.role,
          status,
        };
      });

    // Render the staff table with client-side modal management
    return (
      <StaffPageClient staffMembers={staffMembers} currentUserRole={userRole} currentUserId={userId} />
    );
  } catch (error) {
    console.warn('CustomStaffPage - Failed to fetch staff members:', error);
    return (
      <div className="rounded-lg border border-border bg-background p-8 text-center">
        <h2 className="text-xl font-semibold text-foreground">{t('access_denied_title')}</h2>
        <p className="mt-2 text-muted-foreground">
          {t('access_denied_message')}
        </p>
      </div>
    );
  }
}
