import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { RolesPageClient } from './RolesPageClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/libs/Orpc', () => ({
  client: {
    roles: {
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
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
      access_denied_title: 'Access Denied',
      access_denied_message: 'You do not have permission to view the roles list.',
      error_title: 'Error Loading Roles',
      error_message: 'Failed to load roles and permissions.',
      system_role_badge: 'System',
      permissions_label: 'Permissions',
      no_permissions: 'No permissions assigned',
      member_singular: 'Member',
      member_plural: 'Members',
      edit_button_aria_label: 'Edit role',
      delete_button_aria_label: 'Delete role',
    };
    return translations[key] || key;
  },
}));

const mockPermissions = [
  { id: 'perm-1', key: 'org:manage_all', name: 'Full Access', description: 'Complete access to all features' },
  { id: 'perm-2', key: 'org:manage_billing', name: 'Manage Billing', description: 'Can manage billing and subscriptions' },
  { id: 'perm-3', key: 'org:manage_roles', name: 'Manage Roles', description: 'Can manage all roles and permissions' },
  { id: 'perm-4', key: 'org:manage_members', name: 'Manage Members', description: 'Can add, edit, and remove members' },
  { id: 'perm-5', key: 'org:manage_classes', name: 'Manage Classes', description: 'Can create and manage class schedules' },
  { id: 'perm-6', key: 'org:view_members', name: 'View Members', description: 'Can view member information' },
  { id: 'perm-7', key: 'org:check_in', name: 'Check In Members', description: 'Can check in members for classes' },
];

const mockRoles = [
  {
    id: 'role-admin',
    key: 'org:admin',
    name: 'Admin',
    description: 'Full system access. Can manage all aspects of the organization including billing, subscriptions, and all user management.',
    permissions: [
      { id: 'perm-1', key: 'org:manage_all', name: 'Full Access', description: 'Complete access to all features' },
      { id: 'perm-2', key: 'org:manage_billing', name: 'Manage Billing', description: 'Can manage billing and subscriptions' },
      { id: 'perm-3', key: 'org:manage_roles', name: 'Manage Roles', description: 'Can manage all roles and permissions' },
    ],
    memberCount: 1,
    isSystemRole: true,
  },
  {
    id: 'role-academy-owner',
    key: 'org:academy_owner',
    name: 'Academy Owner',
    description: 'Can manage academy operations including members, classes, staff scheduling, and view reports.',
    permissions: [
      { id: 'perm-4', key: 'org:manage_members', name: 'Manage Members', description: 'Can add, edit, and remove members' },
      { id: 'perm-5', key: 'org:manage_classes', name: 'Manage Classes', description: 'Can create and manage class schedules' },
    ],
    memberCount: 2,
    isSystemRole: true,
  },
  {
    id: 'role-front-desk',
    key: 'org:front_desk',
    name: 'Front Desk',
    description: 'Can check in members, view schedules, and handle basic member inquiries.',
    permissions: [
      { id: 'perm-6', key: 'org:view_members', name: 'View Members', description: 'Can view member information' },
      { id: 'perm-7', key: 'org:check_in', name: 'Check In Members', description: 'Can check in members for classes' },
    ],
    memberCount: 10,
    isSystemRole: false,
  },
];

// Default props for RolesPageClient - non-admin user
const defaultProps = {
  roles: mockRoles,
  totalPermissions: 7,
  availablePermissions: mockPermissions,
  currentUserRole: 'org:academy_owner',
};

// Props for admin user
const adminProps = {
  ...defaultProps,
  currentUserRole: 'org:admin',
};

describe('RolesPage', () => {
  describe('Page Header', () => {
    it('should render the page title', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Roles')).toBeDefined();
    });

    it('should render permissions by role section title', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Permissions by Role')).toBeDefined();
    });
  });

  describe('Summary Stats', () => {
    it('should render summary stat cards', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Total Roles')).toBeDefined();
      expect(page.getByText('Total Permissions')).toBeDefined();
      expect(page.getByText('Total Members')).toBeDefined();
    });

    it('should display correct roles count', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // 3 roles in mock data
      const threeElements = page.getByText('3', { exact: true }).elements();

      expect(threeElements.length).toBeGreaterThan(0);
    });

    it('should display correct permissions count', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // 7 total permissions
      const sevenElements = page.getByText('7', { exact: true }).elements();

      expect(sevenElements.length).toBeGreaterThan(0);
    });

    it('should display correct total members count', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // 1 + 2 + 10 = 13 members
      const thirteenElements = page.getByText('13', { exact: true }).elements();

      expect(thirteenElements.length).toBeGreaterThan(0);
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

      const comboboxes = page.getByRole('combobox').elements();

      expect(comboboxes.length).toBeGreaterThanOrEqual(1);
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
      expect(page.getByText('Academy Owner')).toBeDefined();
      expect(page.getByText('Front Desk')).toBeDefined();
    });

    it('should render role descriptions', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText(/Full system access/)).toBeDefined();
      expect(page.getByText(/Can manage academy operations/)).toBeDefined();
      expect(page.getByText(/Can check in members/)).toBeDefined();
    });

    it('should render permission badges', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      expect(page.getByText('Manage Members')).toBeDefined();
      expect(page.getByText('View Members')).toBeDefined();
      expect(page.getByText('Check In Members')).toBeDefined();
    });

    it('should render system role badges for system roles', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // Admin and Academy Owner are system roles
      const systemBadges = page.getByText('System', { exact: true }).elements();

      expect(systemBadges.length).toBe(2);
    });
  });

  describe('No Users Table', () => {
    it('should not render users table', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const tables = page.getByRole('table').elements();

      expect(tables.length).toBe(0);
    });

    it('should not render user name column', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const userNameColumns = page.getByText('User name').elements();

      expect(userNameColumns.length).toBe(0);
    });
  });

  describe('Action Buttons', () => {
    it('should render edit buttons on role cards', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const editButtons = page.getByRole('button', { name: /edit role/i }).elements();

      expect(editButtons.length).toBe(3);
    });

    it('should render delete button only on non-system roles for non-admin users', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      const deleteButtons = page.getByRole('button', { name: /delete role/i }).elements();

      // Only Front Desk is non-system role (non-admin cannot delete system roles)
      expect(deleteButtons.length).toBe(1);
    });

    it('should render delete buttons on non-admin roles for admin users', async () => {
      await render(<RolesPageClient {...adminProps} />);

      const deleteButtons = page.getByRole('button', { name: /delete role/i }).elements();

      // Admin can delete Academy Owner and Front Desk (2 buttons), but not Admin role
      expect(deleteButtons.length).toBe(2);
    });

    it('should not render delete button on Admin role even for admin users', async () => {
      // Only include Admin role
      const adminOnlyRoles = [mockRoles[0]!];
      await render(<RolesPageClient {...adminProps} roles={adminOnlyRoles} />);

      const deleteButtons = page.getByRole('button', { name: /delete role/i }).elements();

      // Admin role cannot be deleted even by admins
      expect(deleteButtons.length).toBe(0);
    });
  });

  describe('Member Counts on Cards', () => {
    it('should display member counts', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // Member counts are displayed as "X Member(s)" text
      expect(page.getByText(/1\s*Member\b/)).toBeDefined();
      expect(page.getByText(/2\s*Members/)).toBeDefined();
      expect(page.getByText(/10\s*Members/)).toBeDefined();
    });
  });

  describe('Empty State', () => {
    it('should render no roles found when roles is empty', async () => {
      await render(<RolesPageClient {...defaultProps} roles={[]} totalPermissions={0} />);

      expect(page.getByText('No roles found')).toBeDefined();
    });
  });

  describe('Responsive Grid Layout', () => {
    it('should render cards in a grid', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // All roles should be visible
      expect(page.getByText('Admin')).toBeDefined();
      expect(page.getByText('Academy Owner')).toBeDefined();
      expect(page.getByText('Front Desk')).toBeDefined();
    });
  });

  describe('No Pagination', () => {
    it('should not render pagination since we display all roles', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // No pagination expected for role cards
      const paginationElements = page.getByText(/showing/i).elements();

      expect(paginationElements.length).toBe(0);
    });
  });

  describe('Permissions Label', () => {
    it('should render permissions label on each card', async () => {
      await render(<RolesPageClient {...defaultProps} />);

      // Each card should have a "Permissions" label with a count
      // Using regex to match "Permissions (X)" pattern
      const permissionsLabels = page.getByText(/^Permissions\s+\(\d+\)$/).elements();

      // 3 role cards should each have a Permissions label
      expect(permissionsLabels.length).toBe(3);
    });
  });
});
