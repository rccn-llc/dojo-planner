import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

// Capture the props passed to StaffPageClient so we can assert on the merged
// staff list (accepted members + pending invitations).
const staffPageClientSpy = vi.fn();
vi.mock('./StaffPageClient', () => ({
  StaffPageClient: (props: unknown) => {
    staffPageClientSpy(props);
    return null;
  },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

vi.mock('@/services/InstructorsService', () => ({
  getInstructorPhotoOverrides: vi.fn().mockResolvedValue(new Map()),
}));

const getOrganizationMembershipList = vi.fn();
const getOrganizationInvitationList = vi.fn();
const authMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList,
      getOrganizationInvitationList,
    },
  }),
}));

async function renderPage() {
  const { CustomStaffPage } = await import('./CustomStaffPage');
  // Server component returns a Promise<JSX>; resolve it, then render so the
  // mocked StaffPageClient is actually invoked and its props captured.
  const element = await CustomStaffPage();
  await render(element);
  const props = staffPageClientSpy.mock.calls.at(-1)?.[0] as { staffMembers: any[] } | undefined;
  return props?.staffMembers ?? [];
}

describe('CustomStaffPage — staff list assembly (#275 / #277)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ userId: 'user_admin', orgId: 'org_1' });
  });

  it('shows pending invitations as "Invitation sent" with the invited name (#275)', async () => {
    getOrganizationMembershipList.mockResolvedValue({
      data: [
        { role: 'org:academy_owner', publicUserData: { userId: 'user_admin', firstName: 'Ann', lastName: 'Owner', identifier: 'ann@dojo.com' } },
      ],
    });
    getOrganizationInvitationList.mockResolvedValue({
      data: [
        {
          id: 'inv_1',
          emailAddress: 'newcoach@dojo.com',
          role: 'org:instructor',
          status: 'pending',
          publicMetadata: { invitedFirstName: 'New', invitedLastName: 'Coach' },
        },
      ],
    });

    const staff = await renderPage();
    const pending = staff.find(s => s.email === 'newcoach@dojo.com');

    expect(pending).toMatchObject({
      firstName: 'New',
      lastName: 'Coach',
      role: 'org:instructor',
      status: 'Invitation sent',
    });
  });

  it('falls back to invite-time name when an accepted member has no profile name (#277)', async () => {
    getOrganizationMembershipList.mockResolvedValue({
      data: [
        { role: 'org:academy_owner', publicUserData: { userId: 'user_admin', firstName: 'Ann', lastName: 'Owner', identifier: 'ann@dojo.com' } },
        // Accepted member with a blank profile name.
        { role: 'org:front_desk', publicUserData: { userId: 'user_fd', firstName: null, lastName: null, identifier: 'front@dojo.com' } },
      ],
    });
    getOrganizationInvitationList.mockResolvedValue({
      data: [
        { id: 'inv_2', emailAddress: 'front@dojo.com', role: 'org:front_desk', status: 'accepted', publicMetadata: { invitedFirstName: 'Front', invitedLastName: 'Desk' } },
      ],
    });

    const staff = await renderPage();
    const member = staff.find(s => s.email === 'front@dojo.com');

    expect(member).toMatchObject({ firstName: 'Front', lastName: 'Desk', status: 'Active' });
  });

  it('does not duplicate a member who already accepted (pending filtered by email)', async () => {
    getOrganizationMembershipList.mockResolvedValue({
      data: [
        { role: 'org:academy_owner', publicUserData: { userId: 'user_admin', firstName: 'Ann', lastName: 'Owner', identifier: 'ann@dojo.com' } },
        { role: 'org:instructor', publicUserData: { userId: 'user_i', firstName: 'Iggy', lastName: 'Instructor', identifier: 'iggy@dojo.com' } },
      ],
    });
    getOrganizationInvitationList.mockResolvedValue({
      data: [
        { id: 'inv_3', emailAddress: 'iggy@dojo.com', role: 'org:instructor', status: 'pending', publicMetadata: {} },
      ],
    });

    const staff = await renderPage();

    expect(staff.filter(s => s.email === 'iggy@dojo.com')).toHaveLength(1);
  });

  it('still renders members when the invitation fetch fails (best-effort)', async () => {
    getOrganizationMembershipList.mockResolvedValue({
      data: [
        { role: 'org:academy_owner', publicUserData: { userId: 'user_admin', firstName: 'Ann', lastName: 'Owner', identifier: 'ann@dojo.com' } },
      ],
    });
    getOrganizationInvitationList.mockRejectedValue(new Error('clerk down'));

    const staff = await renderPage();

    expect(staff).toHaveLength(1);
    expect(staff[0]).toMatchObject({ email: 'ann@dojo.com' });
  });
});
