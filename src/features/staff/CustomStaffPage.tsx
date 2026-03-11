import { auth, clerkClient } from '@clerk/nextjs/server';
import { getTranslations } from 'next-intl/server';
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
  phone?: string | null;
};

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

    // Filter and map org:admin and org:academy_owner members with status
    const staffMembers: ClerkStaffMember[] = memberships.data
      .filter(membership => membership.role === 'org:admin' || membership.role === 'org:academy_owner')
      .map((membership) => {
        // Determine status based on whether user has fully set up their account
        const status: 'Active' | 'Invitation sent' | 'Inactive' = membership.publicUserData
          ? 'Active'
          : 'Invitation sent';

        return {
          id: membership.publicUserData?.userId || membership.id,
          firstName: membership.publicUserData?.firstName || null,
          lastName: membership.publicUserData?.lastName || null,
          email: membership.publicUserData?.identifier || '',
          photoUrl: membership.publicUserData?.imageUrl || null,
          emailAddress: membership.publicUserData?.identifier || '',
          role: membership.role,
          status,
          phone: null,
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
