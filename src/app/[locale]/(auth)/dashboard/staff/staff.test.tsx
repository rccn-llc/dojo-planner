import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { StaffTable } from '@/features/staff/StaffTable';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// StaffTable uses useRouter for post-photo-upload refresh
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// The instructor photo modal pulls in the ORPC client; stub it out — it only
// renders when a photo edit is opened, which these tests don't exercise.
vi.mock('@/features/staff/EditInstructorPhotoModal', () => ({
  EditInstructorPhotoModal: () => null,
}));

const mockStaffMembers = [
  {
    id: 'user_1',
    firstName: 'Charlie',
    lastName: 'Baptista',
    email: 'charlie@dojo.com',
    photoUrl: null,
    emailAddress: 'charlie@dojo.com',
    role: 'org:admin',
    status: 'Active' as const,
  },
  {
    id: 'user_2',
    firstName: 'Professor',
    lastName: 'Jessica',
    email: 'jessica@dojo.com',
    photoUrl: null,
    emailAddress: 'jessica@dojo.com',
    role: 'org:admin',
    status: 'Invitation sent' as const,
  },
];

const mockMixedRoleStaff = [
  {
    id: 'user_1',
    firstName: 'Charlie',
    lastName: 'Baptista',
    email: 'charlie@dojo.com',
    photoUrl: null,
    emailAddress: 'charlie@dojo.com',
    role: 'org:admin',
    status: 'Active' as const,
  },
  {
    id: 'user_2',
    firstName: 'Sarah',
    lastName: 'Owner',
    email: 'sarah@dojo.com',
    photoUrl: null,
    emailAddress: 'sarah@dojo.com',
    role: 'org:academy_owner',
    status: 'Active' as const,
  },
];

describe('Staff Page', () => {
  const mockOnEditStaff = vi.fn();
  const mockOnRemoveStaff = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders staff table', async () => {
    await render(
      <StaffTable
        staffMembers={mockStaffMembers}
        onEditStaff={mockOnEditStaff}
        onRemoveStaff={mockOnRemoveStaff}
        headerActions={<div>Actions</div>}
      />,
    );

    const table = page.getByRole('table');

    await expect.element(table).toBeVisible();
  });

  it('displays staff member names', async () => {
    await render(
      <StaffTable
        staffMembers={mockStaffMembers}
        onEditStaff={mockOnEditStaff}
        onRemoveStaff={mockOnRemoveStaff}
        headerActions={<div>Actions</div>}
      />,
    );

    // Use table to scope to desktop view only
    const table = page.getByRole('table');

    await expect.element(table.getByText('Charlie Baptista')).toBeVisible();
    await expect.element(table.getByText('Professor Jessica')).toBeVisible();
  });

  it('displays staff member emails', async () => {
    await render(
      <StaffTable
        staffMembers={mockStaffMembers}
        onEditStaff={mockOnEditStaff}
        onRemoveStaff={mockOnRemoveStaff}
        headerActions={<div>Actions</div>}
      />,
    );

    // Use table to scope to desktop view only
    const table = page.getByRole('table');

    await expect.element(table.getByText('charlie@dojo.com')).toBeVisible();
  });

  it('displays staff status badges', async () => {
    await render(
      <StaffTable
        staffMembers={mockStaffMembers}
        onEditStaff={mockOnEditStaff}
        onRemoveStaff={mockOnRemoveStaff}
        headerActions={<div>Actions</div>}
      />,
    );

    // Use first() since there are desktop and mobile views
    await expect.element(page.getByText('Active').first()).toBeVisible();
    await expect.element(page.getByText('Invitation sent').first()).toBeVisible();
  });

  it('displays action buttons for each staff member', async () => {
    await render(
      <StaffTable
        staffMembers={mockStaffMembers}
        currentUserRole="org:admin"
        currentUserId="other_user"
        onEditStaff={mockOnEditStaff}
        onRemoveStaff={mockOnRemoveStaff}
        headerActions={<div>Actions</div>}
      />,
    );

    // Use first() to get only the desktop view button
    const editCharlieButton = page.getByRole('button', { name: /Edit Charlie Baptista/i }).first();

    await expect.element(editCharlieButton).toBeVisible();

    const removeCharlieButton = page.getByRole('button', { name: /Remove Charlie Baptista/i }).first();

    await expect.element(removeCharlieButton).toBeVisible();
  });

  it('admin can edit and remove all staff members', async () => {
    await render(
      <StaffTable
        staffMembers={mockMixedRoleStaff}
        currentUserRole="org:admin"
        currentUserId="other_user"
        onEditStaff={mockOnEditStaff}
        onRemoveStaff={mockOnRemoveStaff}
        headerActions={<div>Actions</div>}
      />,
    );

    const table = page.getByRole('table');

    await expect.element(table.getByRole('button', { name: /Edit Charlie Baptista/i })).toBeVisible();

    await expect.element(table.getByRole('button', { name: /Remove Charlie Baptista/i })).toBeVisible();

    await expect.element(table.getByRole('button', { name: /Edit Sarah Owner/i })).toBeVisible();

    await expect.element(table.getByRole('button', { name: /Remove Sarah Owner/i })).toBeVisible();
  });

  it('academy owner cannot edit or remove admin staff', async () => {
    await render(
      <StaffTable
        staffMembers={mockMixedRoleStaff}
        currentUserRole="org:academy_owner"
        currentUserId="other_user"
        onEditStaff={mockOnEditStaff}
        onRemoveStaff={mockOnRemoveStaff}
        headerActions={<div>Actions</div>}
      />,
    );

    const table = page.getByRole('table');

    await expect.element(table.getByRole('button', { name: /Edit Charlie Baptista/i })).not.toBeInTheDocument();

    await expect.element(table.getByRole('button', { name: /Remove Charlie Baptista/i })).not.toBeInTheDocument();
  });

  it('academy owner can edit and remove non-admin staff', async () => {
    await render(
      <StaffTable
        staffMembers={mockMixedRoleStaff}
        currentUserRole="org:academy_owner"
        currentUserId="other_user"
        onEditStaff={mockOnEditStaff}
        onRemoveStaff={mockOnRemoveStaff}
        headerActions={<div>Actions</div>}
      />,
    );

    const table = page.getByRole('table');

    await expect.element(table.getByRole('button', { name: /Edit Sarah Owner/i })).toBeVisible();

    await expect.element(table.getByRole('button', { name: /Remove Sarah Owner/i })).toBeVisible();
  });

  it('user cannot edit or remove themselves', async () => {
    await render(
      <StaffTable
        staffMembers={mockMixedRoleStaff}
        currentUserRole="org:admin"
        currentUserId="user_1"
        onEditStaff={mockOnEditStaff}
        onRemoveStaff={mockOnRemoveStaff}
        headerActions={<div>Actions</div>}
      />,
    );

    const table = page.getByRole('table');

    // Charlie (user_1) is the current user — no edit/remove buttons
    await expect.element(table.getByRole('button', { name: /Edit Charlie Baptista/i })).not.toBeInTheDocument();

    await expect.element(table.getByRole('button', { name: /Remove Charlie Baptista/i })).not.toBeInTheDocument();

    // Sarah (user_2) is a different user — edit/remove buttons visible
    await expect.element(table.getByRole('button', { name: /Edit Sarah Owner/i })).toBeVisible();

    await expect.element(table.getByRole('button', { name: /Remove Sarah Owner/i })).toBeVisible();
  });
});
