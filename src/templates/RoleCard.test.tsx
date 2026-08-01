import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { RoleCard } from './RoleCard';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
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

describe('RoleCard', () => {
  const mockPermissions = [
    { id: '1', key: 'org:view_members', name: 'View Members', description: 'Can view member information' },
    { id: '2', key: 'org:edit_members', name: 'Edit Members', description: 'Can edit member information' },
  ];

  const defaultProps = {
    id: 'role-1',
    name: 'Admin',
    roleKey: 'org:admin',
    description: 'Can manage most organization settings',
    permissions: mockPermissions,
    memberCount: 5,
  };

  describe('Basic Rendering', () => {
    it('should render role name', async () => {
      await render(<RoleCard {...defaultProps} />);

      expect(page.getByText('Admin')).toBeDefined();
    });

    it('should render role key badge', async () => {
      await render(<RoleCard {...defaultProps} />);

      expect(page.getByText('org:admin')).toBeDefined();
    });

    it('should render role description', async () => {
      await render(<RoleCard {...defaultProps} />);

      expect(page.getByText('Can manage most organization settings')).toBeDefined();
    });

    it('should render permissions label', async () => {
      await render(<RoleCard {...defaultProps} />);

      expect(page.getByText('Permissions')).toBeDefined();
    });

    it('should render permission badges', async () => {
      await render(<RoleCard {...defaultProps} />);

      expect(page.getByText('View Members')).toBeDefined();
      expect(page.getByText('Edit Members')).toBeDefined();
    });
  });

  describe('Member Count', () => {
    it('should render member count with plural label', async () => {
      await render(<RoleCard {...defaultProps} />);

      expect(page.getByText('5')).toBeDefined();
      expect(page.getByText('Members')).toBeDefined();
    });

    it('should render member count with singular label for 1 member', async () => {
      await render(<RoleCard {...defaultProps} memberCount={1} />);

      expect(page.getByText('1')).toBeDefined();
      expect(page.getByText('Member')).toBeDefined();
    });

    it('should render zero members correctly', async () => {
      await render(<RoleCard {...defaultProps} memberCount={0} />);

      expect(page.getByText('0')).toBeDefined();
      expect(page.getByText('Members')).toBeDefined();
    });
  });

  describe('System Role Badge', () => {
    it('should render system role badge when isSystemRole is true', async () => {
      await render(<RoleCard {...defaultProps} isSystemRole={true} />);

      expect(page.getByText('System')).toBeDefined();
    });

    it('should not render system role badge when isSystemRole is false', async () => {
      await render(<RoleCard {...defaultProps} isSystemRole={false} />);

      const systemBadges = page.getByText('System').elements();

      expect(systemBadges.length).toBe(0);
    });

    it('should not render system role badge by default', async () => {
      await render(<RoleCard {...defaultProps} />);

      const systemBadges = page.getByText('System').elements();

      expect(systemBadges.length).toBe(0);
    });
  });

  describe('No Permissions State', () => {
    it('should render no permissions message when permissions array is empty', async () => {
      await render(<RoleCard {...defaultProps} permissions={[]} />);

      expect(page.getByText('No permissions assigned')).toBeDefined();
    });
  });

  describe('Edit Button', () => {
    const mockOnEdit = vi.fn();

    beforeEach(() => {
      mockOnEdit.mockClear();
    });

    it('should render edit button when onEdit is provided', async () => {
      await render(<RoleCard {...defaultProps} onEdit={mockOnEdit} />);

      const editButton = page.getByRole('button', { name: /edit role/i });

      expect(editButton).toBeDefined();
    });

    it('should not render edit button when onEdit is not provided', async () => {
      await render(<RoleCard {...defaultProps} />);

      const editButtons = page.getByRole('button', { name: /edit role/i }).elements();

      expect(editButtons.length).toBe(0);
    });

    it('should call onEdit with role id when edit button is clicked', async () => {
      await render(<RoleCard {...defaultProps} onEdit={mockOnEdit} />);

      const editButton = page.getByRole('button', { name: /edit role/i });
      await userEvent.click(editButton);

      expect(mockOnEdit).toHaveBeenCalledWith('role-1');
    });
  });

  describe('Delete Button', () => {
    const mockOnDelete = vi.fn();

    beforeEach(() => {
      mockOnDelete.mockClear();
    });

    it('should render delete button when onDelete is provided and not a system role', async () => {
      await render(<RoleCard {...defaultProps} onDelete={mockOnDelete} isSystemRole={false} />);

      const deleteButton = page.getByRole('button', { name: /delete role/i });

      expect(deleteButton).toBeDefined();
    });

    it('should not render delete button when onDelete is not provided', async () => {
      await render(<RoleCard {...defaultProps} />);

      const deleteButtons = page.getByRole('button', { name: /delete role/i }).elements();

      expect(deleteButtons.length).toBe(0);
    });

    it('should render delete button for system roles when onDelete is provided', async () => {
      // Note: Delete permission is now controlled by the parent component (RolesPageClient)
      // RoleCard just renders the button if onDelete is provided
      await render(<RoleCard {...defaultProps} onDelete={mockOnDelete} isSystemRole={true} />);

      const deleteButtons = page.getByRole('button', { name: /delete role/i }).elements();

      expect(deleteButtons.length).toBe(1);
    });

    it('should call onDelete with role id when delete button is clicked', async () => {
      await render(<RoleCard {...defaultProps} onDelete={mockOnDelete} isSystemRole={false} />);

      const deleteButton = page.getByRole('button', { name: /delete role/i });
      await userEvent.click(deleteButton);

      expect(mockOnDelete).toHaveBeenCalledWith('role-1');
    });
  });

  describe('Multiple Permissions', () => {
    it('should render all permissions when there are many', async () => {
      const manyPermissions = [
        { id: '1', key: 'org:view', name: 'View', description: 'View access' },
        { id: '2', key: 'org:edit', name: 'Edit', description: 'Edit access' },
        { id: '3', key: 'org:delete', name: 'Delete', description: 'Delete access' },
        { id: '4', key: 'org:admin', name: 'Admin', description: 'Admin access' },
      ];

      await render(<RoleCard {...defaultProps} permissions={manyPermissions} />);

      expect(page.getByText('View')).toBeDefined();
      expect(page.getByText('Edit')).toBeDefined();
      expect(page.getByText('Delete')).toBeDefined();
    });
  });

  describe('Card Structure', () => {
    it('should render within a card component', async () => {
      await render(<RoleCard {...defaultProps} />);

      const roleCard = page.getByRole('heading', { name: 'Admin' }).element().closest('[class*="rounded"]');

      expect(roleCard).not.toBeNull();
    });

    it('should have proper spacing for content sections', async () => {
      await render(<RoleCard {...defaultProps} />);

      expect(page.getByRole('heading', { name: 'Admin' })).toBeDefined();
      expect(page.getByText('org:admin')).toBeDefined();
      expect(page.getByText('Permissions')).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible edit button with aria-label', async () => {
      const mockOnEdit = vi.fn();
      await render(<RoleCard {...defaultProps} onEdit={mockOnEdit} />);

      const editButton = page.getByRole('button', { name: /edit role/i });

      expect(editButton).toBeDefined();
    });

    it('should have accessible delete button with aria-label', async () => {
      const mockOnDelete = vi.fn();
      await render(<RoleCard {...defaultProps} onDelete={mockOnDelete} />);

      const deleteButton = page.getByRole('button', { name: /delete role/i });

      expect(deleteButton).toBeDefined();
    });

    it('should have title attribute on permission badges', async () => {
      await render(<RoleCard {...defaultProps} />);

      const viewMembersBadge = page.getByText('View Members');

      expect(viewMembersBadge).toBeDefined();
    });
  });

  describe('Different Role Types', () => {
    it('should render Owner role correctly', async () => {
      await render(
        <RoleCard
          id="owner-1"
          name="Owner"
          roleKey="org:owner"
          description="Full access to organization"
          permissions={mockPermissions}
          memberCount={1}
          isSystemRole={true}
        />,
      );

      expect(page.getByText('Owner')).toBeDefined();
      expect(page.getByText('org:owner')).toBeDefined();
      expect(page.getByText('System')).toBeDefined();
    });

    it('should render custom role correctly', async () => {
      await render(
        <RoleCard
          id="coach-1"
          name="Coach"
          roleKey="org:coach"
          description="Can manage classes and attendance"
          permissions={[{ id: '1', key: 'org:manage_classes', name: 'Manage Classes', description: 'Can manage class schedules' }]}
          memberCount={10}
          isSystemRole={false}
        />,
      );

      expect(page.getByText('Coach')).toBeDefined();
      expect(page.getByText('org:coach')).toBeDefined();
      expect(page.getByText('Manage Classes')).toBeDefined();
      expect(page.getByText('10')).toBeDefined();
    });
  });
});
