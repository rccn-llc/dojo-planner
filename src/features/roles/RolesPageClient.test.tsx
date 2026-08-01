import type { Role } from './RolesPageClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { RolesPageClient } from './RolesPageClient';

const mockRefresh = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('@/libs/Orpc', () => ({
  client: {
    roles: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      remove: (...args: unknown[]) => mockRemove(...args),
    },
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      title: 'Roles',
      total_roles_label: 'Total Roles',
      total_permissions_label: 'Total Permissions',
      total_members_label: 'Total Members',
      add_role_button: 'Add Role',
      search_roles_placeholder: 'Search roles...',
      all_permissions_filter: 'All Permissions',
      permissions_by_role_title: 'Permissions by Role',
      no_roles_found: 'No roles found',
      system_role_badge: 'System',
      permissions_label: 'Permissions',
      no_permissions: 'No permissions assigned',
      member_singular: 'Member',
      member_plural: 'Members',
      edit_button_aria_label: 'Edit role',
      delete_button_aria_label: 'Delete role',
      delete_dialog_title: 'Delete Role',
      delete_dialog_description: `Are you sure you want to delete the role "${vars?.roleName ?? ''}"?`,
      delete_cancel_button: 'Cancel',
      delete_confirm_button: 'Delete Role',
      save_error: 'Failed to save role.',
      delete_error: 'Failed to delete role.',
    };
    return translations[key] || key;
  },
}));

describe('RolesPageClient', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockRemove.mockReset();
    mockCreate.mockResolvedValue({ role: { id: 'role-new' } });
    mockUpdate.mockResolvedValue({ role: { id: 'role-1' } });
    mockRemove.mockResolvedValue({ success: true });
  });

  const mockPermissions = [
    { id: 'perm-1', key: 'org:manage_members', name: 'Manage Members', description: 'Can manage member data' },
    { id: 'perm-2', key: 'org:manage_billing', name: 'Manage Billing', description: 'Can manage billing' },
    { id: 'perm-3', key: 'org:view_members', name: 'View Members', description: 'Can view member data' },
  ];

  const mockRoles: Role[] = [
    {
      id: 'role-1',
      key: 'org:admin',
      name: 'Admin',
      description: 'Full administrative access',
      permissions: [
        { id: 'perm-1', key: 'org:manage_members', name: 'Manage Members', description: 'Can manage member data' },
        { id: 'perm-2', key: 'org:manage_billing', name: 'Manage Billing', description: 'Can manage billing' },
      ],
      memberCount: 3,
      isSystemRole: true,
    },
    {
      id: 'role-2',
      key: 'org:coach',
      name: 'Coach',
      description: 'Can manage classes and attendance',
      permissions: [
        { id: 'perm-3', key: 'org:view_members', name: 'View Members', description: 'Can view member data' },
      ],
      memberCount: 8,
      isSystemRole: false,
    },
    {
      id: 'role-3',
      key: 'org:member',
      name: 'Member',
      description: 'Basic member access',
      permissions: [],
      memberCount: 25,
      isSystemRole: false,
    },
  ];

  // Default props - non-admin user
  const defaultProps = {
    roles: mockRoles,
    totalPermissions: 3,
    availablePermissions: mockPermissions,
    currentUserRole: 'org:coach',
  };

  // Admin user props
  const adminProps = {
    ...defaultProps,
    currentUserRole: 'org:admin',
  };

  describe('Page Header', () => {
    it('should render the page title', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Roles')).toBeDefined();
    });

    it('should render the permissions by role section title', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Permissions by Role')).toBeDefined();
    });
  });

  describe('Summary Stats', () => {
    it('should render total roles stat card', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Total Roles')).toBeDefined();
    });

    it('should render total permissions stat card', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Total Permissions')).toBeDefined();
    });

    it('should render total members stat card', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Total Members')).toBeDefined();
    });

    it('should display correct roles count', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const threeElements = page.getByText('3', { exact: true }).elements();

      expect(threeElements.length).toBeGreaterThan(0);
    });

    it('should display correct total members count', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // 3 + 8 + 25 = 36 total members
      const membersElement = page.getByText('36', { exact: true }).elements();

      expect(membersElement.length).toBeGreaterThan(0);
    });
  });

  describe('Filter Bar', () => {
    it('should render search input', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const searchInput = page.getByPlaceholder(/search roles/i);

      expect(searchInput).toBeDefined();
    });

    it('should render permission filter dropdown', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('All Permissions')).toBeDefined();
    });

    it('should render add role button', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const addRoleButton = page.getByRole('button', { name: /add role/i });

      expect(addRoleButton).toBeDefined();
    });
  });

  describe('Role Cards', () => {
    it('should render all role cards', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Admin')).toBeDefined();
      expect(page.getByText('Coach')).toBeDefined();
      expect(page.getByText('Member')).toBeDefined();
    });

    it('should render role descriptions', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Full administrative access')).toBeDefined();
      expect(page.getByText('Can manage classes and attendance')).toBeDefined();
      expect(page.getByText('Basic member access')).toBeDefined();
    });

    it('should render role key badges', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('org:admin')).toBeDefined();
      expect(page.getByText('org:coach')).toBeDefined();
      expect(page.getByText('org:member')).toBeDefined();
    });

    it('should render permission badges on role cards', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Manage Members')).toBeDefined();
      expect(page.getByText('Manage Billing')).toBeDefined();
      expect(page.getByText('View Members')).toBeDefined();
    });

    it('should render system role badge for system roles', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const systemBadges = page.getByText('System').elements();

      expect(systemBadges.length).toBeGreaterThan(0);
    });

    it('should render member counts on role cards', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // Member counts are displayed as "X Members" text
      expect(page.getByText(/8\s*Members/)).toBeDefined();
      expect(page.getByText(/25\s*Members/)).toBeDefined();
    });
  });

  describe('Filtering', () => {
    it('should filter roles by search term matching name', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const searchInput = page.getByPlaceholder(/search roles/i);
      await userEvent.fill(searchInput, 'Admin');

      expect(page.getByText('Admin')).toBeDefined();

      const coachElements = page.getByText('Coach').elements();

      expect(coachElements.length).toBe(0);
    });

    it('should filter roles by search term matching description', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const searchInput = page.getByPlaceholder(/search roles/i);
      await userEvent.fill(searchInput, 'classes');

      expect(page.getByText('Coach')).toBeDefined();

      const adminElements = page.getByText('Full administrative access').elements();

      expect(adminElements.length).toBe(0);
    });

    it('should filter roles by search term matching role key', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const searchInput = page.getByPlaceholder(/search roles/i);
      await userEvent.fill(searchInput, 'org:coach');

      expect(page.getByText('Coach')).toBeDefined();
    });

    it('should filter roles by search term matching permission name', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const searchInput = page.getByPlaceholder(/search roles/i);
      await userEvent.fill(searchInput, 'Billing');

      expect(page.getByText('Admin')).toBeDefined();
    });

    it('should show no roles found message when no matches', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const searchInput = page.getByPlaceholder(/search roles/i);
      await userEvent.fill(searchInput, 'NonexistentRole');

      expect(page.getByText('No roles found')).toBeDefined();
    });
  });

  describe('Empty State', () => {
    it('should render no roles found when roles array is empty', async () => {
      await render(<RolesPageClient {...defaultProps} roles={[]} totalPermissions={0} />);

      expect(page.getByText('No roles found')).toBeDefined();
    });

    it('should still render stats cards when no roles', async () => {
      await render(<RolesPageClient {...defaultProps} roles={[]} totalPermissions={0} />);

      expect(page.getByText('Total Roles')).toBeDefined();
      expect(page.getByText('Total Permissions')).toBeDefined();
      expect(page.getByText('Total Members')).toBeDefined();
    });

    it('should show zero for counts when no roles', async () => {
      await render(<RolesPageClient {...defaultProps} roles={[]} totalPermissions={0} />);

      const zeroElements = page.getByText('0', { exact: true }).elements();

      expect(zeroElements.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Action Buttons on Cards', () => {
    it('should render edit buttons on role cards', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const editButtons = page.getByRole('button', { name: /edit role/i }).elements();

      expect(editButtons.length).toBe(3);
    });

    it('should render delete buttons only on non-system roles for non-admin users', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const deleteButtons = page.getByRole('button', { name: /delete role/i }).elements();

      // Only 2 non-system roles (Coach and Member), non-admin cannot delete system roles
      expect(deleteButtons.length).toBe(2);
    });

    it('should render delete buttons on non-admin roles for admin users', async () => {
      await render(<RolesPageClient {...adminProps} />);

      const deleteButtons = page.getByRole('button', { name: /delete role/i }).elements();

      // Admin can delete Coach and Member (2 buttons), but not Admin role itself
      expect(deleteButtons.length).toBe(2);
    });
  });

  describe('Responsive Grid', () => {
    it('should render role cards in a grid layout', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // All three roles should be visible
      expect(page.getByText('Admin')).toBeDefined();
      expect(page.getByText('Coach')).toBeDefined();
      expect(page.getByText('Member')).toBeDefined();
    });
  });

  describe('Permission Filter Dropdown', () => {
    it('should populate available permissions from roles', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const permissionTrigger = page.getByText('All Permissions');
      await userEvent.click(permissionTrigger);

      expect(page.getByRole('option', { name: 'Manage Members' })).toBeDefined();
      expect(page.getByRole('option', { name: 'Manage Billing' })).toBeDefined();
      expect(page.getByRole('option', { name: 'View Members' })).toBeDefined();
    });

    it('should filter by selected permission', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const permissionTrigger = page.getByText('All Permissions');
      await userEvent.click(permissionTrigger);

      const viewMembersOption = page.getByRole('option', { name: 'View Members' });
      await userEvent.click(viewMembersOption);

      // Coach has View Members permission
      expect(page.getByText('Coach')).toBeDefined();

      // Admin should not appear as it doesn't have View Members
      const adminDescElements = page.getByText('Full administrative access').elements();

      expect(adminDescElements.length).toBe(0);
    });
  });

  describe('Single Role', () => {
    it('should render correctly with single role', async () => {
      const singleRole: Role[] = [mockRoles[0]!];
      await render(<RolesPageClient {...defaultProps} roles={singleRole} totalPermissions={2} />);

      expect(page.getByText('Admin')).toBeDefined();
      expect(page.getByText('1', { exact: true })).toBeDefined();
    });
  });

  describe('Role with No Permissions', () => {
    it('should show no permissions message for role without permissions', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // Member role has no permissions
      expect(page.getByText('No permissions assigned')).toBeDefined();
    });
  });

  describe('Add/Edit Role Modal Integration', () => {
    it('should open add role modal when Add Role button is clicked', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const addButton = page.getByTestId('add-role-button');
      await userEvent.click(addButton);

      const modalTitle = page.getByRole('heading', { name: 'Add Role' });

      expect(modalTitle).toBeDefined();
    });

    it('should open edit role modal when edit button is clicked', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const editButtons = page.getByRole('button', { name: /edit role/i }).elements();
      await userEvent.click(editButtons[0]!);

      const modalTitle = page.getByRole('heading', { name: 'Edit Role' });

      expect(modalTitle).toBeDefined();
    });

    it('should populate form with role data when editing', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const editButtons = page.getByRole('button', { name: /edit role/i }).elements();
      await userEvent.click(editButtons[0]!);

      const nameInput = page.getByTestId('role-name-input');

      expect(nameInput).toHaveValue('Admin');
    });

    it('should close modal when cancel is clicked', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const addButton = page.getByTestId('add-role-button');
      await userEvent.click(addButton);

      // Fill in some data first
      const nameInput = page.getByTestId('role-name-input');
      await userEvent.type(nameInput, 'Test');

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await userEvent.click(cancelButton);

      // Modal should be closed - title should not be present
      const modalTitles = page.getByRole('heading', { name: 'Add Role' }).elements();

      expect(modalTitles.length).toBe(0);
    });
  });

  describe('Delete Role', () => {
    it('opens the confirmation dialog with the role name when delete is clicked', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const deleteButtons = page.getByRole('button', { name: /delete role/i }).elements();
      await userEvent.click(deleteButtons[0]!);

      // First non-system role visible to non-admin is Coach
      expect(page.getByRole('alertdialog')).toBeDefined();
      expect(page.getByText(/Are you sure you want to delete the role "Coach"/)).toBeDefined();
    });

    it('calls client.roles.remove and refreshes when confirmed', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const deleteButtons = page.getByRole('button', { name: /delete role/i }).elements();
      await userEvent.click(deleteButtons[0]!);

      const confirmButton = page.getByTestId('role-delete-confirm');
      await userEvent.click(confirmButton);

      expect(mockRemove).toHaveBeenCalledWith({ id: 'role-2' });
      expect(mockRefresh).toHaveBeenCalled();
    });

    it('surfaces the error message when remove rejects', async () => {
      mockRemove.mockRejectedValueOnce(new Error('Clerk API error: 422 - role assigned to members'));
      await render(<RolesPageClient {...defaultProps} />);

      const deleteButtons = page.getByRole('button', { name: /delete role/i }).elements();
      await userEvent.click(deleteButtons[0]!);

      const confirmButton = page.getByTestId('role-delete-confirm');
      await userEvent.click(confirmButton);

      const errorBanner = page.getByTestId('role-delete-error');

      expect(errorBanner).toBeDefined();
      expect(mockRefresh).not.toHaveBeenCalled();
    });
  });

  describe('Save Role (Create / Update)', () => {
    it('calls client.roles.create with permission keys and refreshes', async () => {
      await render(<RolesPageClient {...adminProps} />);

      await userEvent.click(page.getByTestId('add-role-button'));
      await userEvent.fill(page.getByTestId('role-name-input'), 'Front Desk');
      await userEvent.fill(page.getByTestId('role-description-input'), 'Day-to-day');

      // Submit: form generates the key from the name in AddEditRoleModal.
      const saveButton = page.getByTestId('role-save-button');
      await userEvent.click(saveButton);

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Front Desk',
        key: 'org:front_desk',
        description: 'Day-to-day',
        permissions: [],
      }));
      expect(mockRefresh).toHaveBeenCalled();
    });

    it('calls client.roles.update with id + present fields when editing', async () => {
      await render(<RolesPageClient {...adminProps} />);

      // Edit Coach (the first non-system, non-admin role visible to admin).
      const editButtons = page.getByRole('button', { name: /edit role/i }).elements();
      // For admin, role 0 is Admin (system, but edit is gated on canEditSystemRoles).
      // To avoid relying on system-role edit, click index 1 (Coach).
      await userEvent.click(editButtons[1]!);

      const saveButton = page.getByTestId('role-save-button');
      await userEvent.click(saveButton);

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        id: 'role-2',
        name: 'Coach',
      }));
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
