import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MemberFilterBar } from './MemberFilterBar';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('MemberFilterBar', () => {
  const defaultProps = {
    onFiltersChangeAction: vi.fn(),
    availableStatuses: ['active', 'hold', 'trial', 'cancelled', 'past_due'],
    availableMembershipTypes: ['individual', 'head-of-household', 'family-member'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Render', () => {
    it('should render search input with placeholder', () => {
      render(<MemberFilterBar {...defaultProps} />);

      const searchInput = page.getByPlaceholder('search_placeholder');

      expect(searchInput).toBeInTheDocument();
    });

    it('should render status filter dropdown', () => {
      render(<MemberFilterBar {...defaultProps} />);

      const comboboxes = page.getByRole('combobox');

      expect(comboboxes.first()).toBeInTheDocument();
    });

    it('should render membership type filter dropdown', () => {
      render(<MemberFilterBar {...defaultProps} />);

      const comboboxes = page.getByRole('combobox');

      // Should have 2 comboboxes (status and membership type)
      expect(comboboxes.nth(1)).toBeInTheDocument();
    });

    it('should render with empty status options', () => {
      render(
        <MemberFilterBar
          {...defaultProps}
          availableStatuses={[]}
        />,
      );

      const comboboxes = page.getByRole('combobox');

      expect(comboboxes.first()).toBeInTheDocument();
    });

    it('should render with empty membership type options', () => {
      render(
        <MemberFilterBar
          {...defaultProps}
          availableMembershipTypes={[]}
        />,
      );

      const comboboxes = page.getByRole('combobox');

      expect(comboboxes.nth(1)).toBeInTheDocument();
    });
  });

  describe('Search functionality', () => {
    it('should call onFiltersChangeAction when search input changes', async () => {
      const mockOnFiltersChange = vi.fn();
      render(
        <MemberFilterBar
          {...defaultProps}
          onFiltersChangeAction={mockOnFiltersChange}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'John');

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        search: 'John',
        status: 'all',
        membershipType: 'all',
      });
    });

    it('should update search value as user types', async () => {
      const mockOnFiltersChange = vi.fn();
      render(
        <MemberFilterBar
          {...defaultProps}
          onFiltersChangeAction={mockOnFiltersChange}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'test@email.com');

      expect(mockOnFiltersChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'test@email.com' }),
      );
    });
  });

  describe('Status filter functionality', () => {
    it('should call onFiltersChangeAction when status filter changes', async () => {
      const mockOnFiltersChange = vi.fn();
      render(
        <MemberFilterBar
          {...defaultProps}
          onFiltersChangeAction={mockOnFiltersChange}
        />,
      );

      // Click the first combobox (status filter)
      const statusTrigger = page.getByRole('combobox').first();
      await statusTrigger.click();

      // Select 'active' option
      const activeOption = page.getByRole('option', { name: 'status_active' });
      await activeOption.click();

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        search: '',
        status: 'active',
        membershipType: 'all',
      });
    });

    it('should display all status options from availableStatuses', async () => {
      render(<MemberFilterBar {...defaultProps} />);

      const statusTrigger = page.getByRole('combobox').first();
      await statusTrigger.click();

      // Check that all status options are rendered
      expect(page.getByRole('option', { name: 'all_statuses_filter' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_active' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_hold' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_trial' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_cancelled' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_past_due' })).toBeInTheDocument();
    });
  });

  describe('Membership type filter functionality', () => {
    it('should call onFiltersChangeAction when membership type filter changes', async () => {
      const mockOnFiltersChange = vi.fn();
      render(
        <MemberFilterBar
          {...defaultProps}
          onFiltersChangeAction={mockOnFiltersChange}
        />,
      );

      // Click the second combobox (membership type filter)
      const membershipTypeTrigger = page.getByRole('combobox').nth(1);
      await membershipTypeTrigger.click();

      // Select 'individual' option
      const individualOption = page.getByRole('option', { name: 'member_type_individual' });
      await individualOption.click();

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        search: '',
        status: 'all',
        membershipType: 'individual',
      });
    });

    it('should display all membership type options from availableMembershipTypes', async () => {
      render(<MemberFilterBar {...defaultProps} />);

      const membershipTypeTrigger = page.getByRole('combobox').nth(1);
      await membershipTypeTrigger.click();

      // Check that all membership type options are rendered
      expect(page.getByRole('option', { name: 'all_membership_types_filter' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'member_type_individual' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'member_type_head_of_household' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'member_type_family_member' })).toBeInTheDocument();
    });
  });

  describe('Label mapping', () => {
    it('should display correct labels for known statuses', async () => {
      render(
        <MemberFilterBar
          {...defaultProps}
          availableStatuses={['active', 'hold', 'trial', 'cancelled', 'past_due']}
        />,
      );

      const statusTrigger = page.getByRole('combobox').first();
      await statusTrigger.click();

      expect(page.getByRole('option', { name: 'status_active' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_hold' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_trial' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_cancelled' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_past_due' })).toBeInTheDocument();
    });

    it('should capitalize unknown status values', async () => {
      render(
        <MemberFilterBar
          {...defaultProps}
          availableStatuses={['unknown_status']}
        />,
      );

      const statusTrigger = page.getByRole('combobox').first();
      await statusTrigger.click();

      // Unknown status should be capitalized with first letter uppercase
      expect(page.getByRole('option', { name: 'Unknown_status' })).toBeInTheDocument();
    });

    it('should format unknown membership types with capitalization', async () => {
      render(
        <MemberFilterBar
          {...defaultProps}
          availableMembershipTypes={['premium-yearly']}
        />,
      );

      const membershipTypeTrigger = page.getByRole('combobox').nth(1);
      await membershipTypeTrigger.click();

      // Unknown membership type should be capitalized and have dashes/underscores replaced with spaces
      expect(page.getByRole('option', { name: 'Premium yearly' })).toBeInTheDocument();
    });
  });

  describe('Combined filters', () => {
    it('should maintain filter state when changing multiple filters', async () => {
      const mockOnFiltersChange = vi.fn();
      render(
        <MemberFilterBar
          {...defaultProps}
          onFiltersChangeAction={mockOnFiltersChange}
        />,
      );

      // First, type in search
      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'John');

      // Then change status filter
      const statusTrigger = page.getByRole('combobox').first();
      await statusTrigger.click();
      const activeOption = page.getByRole('option', { name: 'status_active' });
      await activeOption.click();

      // The last call should have both search and status values
      expect(mockOnFiltersChange).toHaveBeenLastCalledWith({
        search: 'John',
        status: 'active',
        membershipType: 'all',
      });
    });
  });
});
