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

// Result of loading the staff page's data: either the rows to render, or a
// signal that the viewer may not see them.
type StaffPageData
  = | { kind: 'denied' }
    | { kind: 'ok'; staff: ClerkStaffMember[]; currentUserRole: string };

// Thrown when the viewer lacks an admin/academy-owner role. Signalled as an
// error so the data-loading block has a single exit path, which keeps JSX out
// of the try/catch.
class AccessDeniedError extends Error {}

function AccessDenied({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-8 text-center">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

export async function CustomStaffPage() {
  const t = await getTranslations('Staff');
  const { userId, orgId } = await auth();

  // Check authentication and authorization
  if (!userId || !orgId) {
    return <AccessDenied title={t('access_denied_title')} message={t('access_denied_message')} />;
  }

  // Only the data fetching is wrapped in try/catch; the JSX is rendered after
  // it. React renders lazily, so errors thrown while rendering a component are
  // not caught by a surrounding try/catch — that needs an error boundary.
  let result: StaffPageData;
  try {
    const authClient = await clerkClient();

    // Get all organization members
    const memberships = await authClient.organizations.getOrganizationMembershipList({
      organizationId: orgId,
    });

    // Get pending invitations too, so invited-but-not-yet-accepted staff show up
    // in the list as "Invitation sent" (#275), and so accepted members whose
    // Clerk profile has no name can fall back to the name captured at invite
    // time (#277). Best-effort — a failure here shouldn't blank the whole page.
    let invitations: Awaited<ReturnType<typeof authClient.organizations.getOrganizationInvitationList>>['data'] = [];
    try {
      const invitationList = await authClient.organizations.getOrganizationInvitationList({
        organizationId: orgId,
      });
      invitations = invitationList.data;
    } catch (invErr) {
      console.warn('CustomStaffPage - Failed to fetch invitations:', invErr);
    }

    // Look up invite-time name metadata by email, used as a fallback for
    // accepted members and to populate pending-invitation rows.
    const inviteMetaByEmail = new Map<string, { firstName: string | null; lastName: string | null }>();
    for (const inv of invitations) {
      inviteMetaByEmail.set(inv.emailAddress.toLowerCase(), {
        firstName: (inv.publicMetadata?.invitedFirstName as string | undefined) ?? null,
        lastName: (inv.publicMetadata?.invitedLastName as string | undefined) ?? null,
      });
    }

    // Check if current user is an admin or academy owner
    const userRole = memberships.data.find(
      m => m.publicUserData?.userId === userId,
    )?.role;

    if (userRole !== 'org:admin' && userRole !== 'org:academy_owner') {
      throw new AccessDeniedError();
    }
    const currentUserRole = userRole;

    // In-app instructor photo overrides take precedence over the Clerk avatar.
    const photoOverrides = await getInstructorPhotoOverrides(orgId);

    // Keep only staff-role memberships (admins, academy owners, front desk,
    // instructors).
    const staffMembers: ClerkStaffMember[] = memberships.data
      .filter(membership => membership.role != null && STAFF_ROLES.has(membership.role))
      .map((membership) => {
        // Determine status based on whether user has fully set up their account
        const status: 'Active' | 'Invitation sent' | 'Inactive' = membership.publicUserData
          ? 'Active'
          : 'Invitation sent';

        const userId = membership.publicUserData?.userId;
        const overridePhoto = userId ? photoOverrides.get(userId) : undefined;

        // Accepting an invitation does NOT copy the invite-time name onto the
        // Clerk profile, so a member who never set a profile name would show
        // blank. Fall back to the name captured at invite time (#277).
        const email = membership.publicUserData?.identifier || '';
        const inviteMeta = inviteMetaByEmail.get(email.toLowerCase());

        return {
          id: userId || membership.id,
          firstName: membership.publicUserData?.firstName ?? inviteMeta?.firstName ?? null,
          lastName: membership.publicUserData?.lastName ?? inviteMeta?.lastName ?? null,
          email,
          photoUrl: overridePhoto ?? membership.publicUserData?.imageUrl ?? null,
          emailAddress: email,
          role: membership.role,
          status,
        };
      });

    // Append pending invitations (invited but not yet accepted) so they show as
    // "Invitation sent" (#275). The membership list only contains accepted
    // members, so without this the invitee is invisible until they accept.
    const acceptedEmails = new Set(staffMembers.map(m => m.email.toLowerCase()));
    const pendingStaff: ClerkStaffMember[] = invitations
      .filter(inv => inv.status === 'pending' && inv.role != null && STAFF_ROLES.has(inv.role)
        && !acceptedEmails.has(inv.emailAddress.toLowerCase()))
      .map(inv => ({
        id: inv.id,
        firstName: (inv.publicMetadata?.invitedFirstName as string | undefined) ?? null,
        lastName: (inv.publicMetadata?.invitedLastName as string | undefined) ?? null,
        email: inv.emailAddress,
        photoUrl: null,
        emailAddress: inv.emailAddress,
        role: inv.role!,
        status: 'Invitation sent' as const,
      }));

    result = { kind: 'ok', staff: [...staffMembers, ...pendingStaff], currentUserRole };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) {
      console.warn('CustomStaffPage - Failed to fetch staff members:', error);
    }
    result = { kind: 'denied' };
  }

  if (result.kind === 'denied') {
    return <AccessDenied title={t('access_denied_title')} message={t('access_denied_message')} />;
  }

  // Render the staff table with client-side modal management
  return (
    <StaffPageClient staffMembers={result.staff} currentUserRole={result.currentUserRole} currentUserId={userId} />
  );
}
