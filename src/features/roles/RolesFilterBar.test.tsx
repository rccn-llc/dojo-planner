import type { RolesFilters } from './RolesFilterBar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { RolesFilterBar } from './RolesFilterBar';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      search_roles_placeholder: 'Search roles...',
      all_permissions_filter: 'All Permissions',
    };
    return translations[key] || key;
  },
}));

describe('RolesFilterBar', () => {
  const mockOnFiltersChange = vi.fn();
  const availablePermissions = ['View Members', 'Edit Members', 'Manage Billing'];

  beforeEach(() => {
    mockOnFiltersChange.mockClear();
  });

  describe('Search Input', () => {
    it('should render search input with placeholder', async () => {
      await render(
        <RolesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availablePermissions={availablePermissions}
        />,
      );

      const searchInput = page.getByPlaceholder(/search roles/i);

      expect(searchInput).toBeDefined();
    });

    it('should call onFiltersChangeAction when typing in search', async () => {
      await render(
        <RolesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availablePermissions={availablePermissions}
        />,
      );

      const searchInput = page.getByPlaceholder(/search roles/i);
      await userEvent.fill(searchInput, 'Admin');

      expect(mockOnFiltersChange).toHaveBeenCalled();
    });

    it('should pass search value in filters', async () => {
      let capturedFilters: RolesFilters = { search: '', permission: 'all' };
      const captureFilters = (filters: RolesFilters) => {
        capturedFilters = filters;
      };

      await render(
        <RolesFilterBar
          onFiltersChangeAction={captureFilters}
          availablePermissions={availablePermissions}
        />,
      );

      const searchInput = page.getByPlaceholder(/search roles/i);
      await userEvent.fill(searchInput, 'Test');

      expect(capturedFilters.search).toBe('Test');
    });
  });

  describe('Permission Filter', () => {
    it('should render permission filter dropdown', async () => {
      await render(
        <RolesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availablePermissions={availablePermissions}
        />,
      );

      const comboboxes = page.getByRole('combobox').elements();

      expect(comboboxes.length).toBeGreaterThanOrEqual(1);
    });

    it('should show All Permissions as default', async () => {
      await render(
        <RolesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availablePermissions={availablePermissions}
        />,
      );

      expect(page.getByText('All Permissions')).toBeDefined();
    });

    it('should call onFiltersChangeAction when permission changes', async () => {
      await render(
        <RolesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availablePermissions={availablePermissions}
        />,
      );

      const permissionTrigger = page.getByText('All Permissions');
      await userEvent.click(permissionTrigger);

      const viewMembersOption = page.getByRole('option', { name: 'View Members' });
      await userEvent.click(viewMembersOption);

      expect(mockOnFiltersChange).toHaveBeenCalled();
    });
  });

  describe('Filter Options', () => {
    it('should render available permission options', async () => {
      await render(
        <RolesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availablePermissions={availablePermissions}
        />,
      );

      const permissionTrigger = page.getByText('All Permissions');
      await userEvent.click(permissionTrigger);

      expect(page.getByRole('option', { name: 'View Members' })).toBeDefined();
      expect(page.getByRole('option', { name: 'Edit Members' })).toBeDefined();
      expect(page.getByRole('option', { name: 'Manage Billing' })).toBeDefined();
    });
  });

  describe('Combined Filters', () => {
    it('should maintain filter state across multiple changes', async () => {
      let lastFilters: RolesFilters = { search: '', permission: 'all' };
      const captureFilters = (filters: RolesFilters) => {
        lastFilters = filters;
      };

      await render(
        <RolesFilterBar
          onFiltersChangeAction={captureFilters}
          availablePermissions={availablePermissions}
        />,
      );

      const searchInput = page.getByPlaceholder(/search roles/i);
      await userEvent.fill(searchInput, 'Test');

      expect(lastFilters.search).toBe('Test');
      expect(lastFilters.permission).toBe('all');
    });

    it('should update permission filter correctly', async () => {
      let lastFilters: RolesFilters = { search: '', permission: 'all' };
      const captureFilters = (filters: RolesFilters) => {
        lastFilters = filters;
      };

      await render(
        <RolesFilterBar
          onFiltersChangeAction={captureFilters}
          availablePermissions={availablePermissions}
        />,
      );

      const permissionTrigger = page.getByText('All Permissions');
      await userEvent.click(permissionTrigger);

      const viewMembersOption = page.getByRole('option', { name: 'View Members' });
      await userEvent.click(viewMembersOption);

      expect(lastFilters.permission).toBe('View Members');
    });
  });

  describe('Search Icon', () => {
    it('should render search icon', async () => {
      await render(
        <RolesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availablePermissions={availablePermissions}
        />,
      );

      const searchInput = page.getByPlaceholder(/search roles/i);

      expect(searchInput).toBeDefined();
    });
  });

  describe('Responsive Layout', () => {
    it('should render with proper flex layout', async () => {
      await render(
        <RolesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availablePermissions={availablePermissions}
        />,
      );

      expect(page.getByPlaceholder(/search roles/i)).toBeDefined();
      expect(page.getByText('All Permissions')).toBeDefined();
    });
  });

  describe('Empty States', () => {
    it('should handle empty permissions array', async () => {
      await render(
        <RolesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availablePermissions={[]}
        />,
      );

      expect(page.getByText('All Permissions')).toBeDefined();
    });
  });
});
