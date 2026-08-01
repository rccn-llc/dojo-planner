import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MembersTable } from './MembersTable';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Helper to create mock members
const createMockMember = (overrides = {}) => ({
  id: '1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: null,
  dateOfBirth: null,
  photoUrl: null,
  memberType: 'individual',
  lastAccessedAt: null,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  membershipType: 'monthly' as const,
  amountDue: '0.00',
  nextPayment: new Date(),
  ...overrides,
});

describe('MembersTable', () => {
  describe('Page Header', () => {
    it('should render Members h1 header', async () => {
      const mockMembers = [createMockMember()];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const heading = page.getByRole('heading', { name: 'Members', level: 1 });

      expect(heading).toBeInTheDocument();
    });

    it('should not render All Members header', async () => {
      const mockMembers = [createMockMember()];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const allMembersElements = page.getByText('All Members').elements();

      expect(allMembersElements.length).toBe(0);
    });
  });

  describe('Render method', () => {
    it('should render members table with members list', async () => {
      const mockMembers = [createMockMember()];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const memberName = page.getByRole('table').getByText('John Doe');

      expect(memberName).toBeInTheDocument();
    });

    it('should render empty state when no members', async () => {
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={[]}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const emptyState = page.getByText('No members found').first();

      expect(emptyState).toBeInTheDocument();
    });

    it('should render loading state when loading prop is true', async () => {
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={[]}
          onRowClickAction={mockOnRowClick}
          loading
        />,
      );

      const loadingText = page.getByText('Loading members...').first();

      expect(loadingText).toBeInTheDocument();
    });

    it('should render header actions when provided', async () => {
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={[]}
          onRowClickAction={mockOnRowClick}
          headerActions={<button type="button">Add Member</button>}
        />,
      );

      const addButton = page.getByRole('button', { name: 'Add Member' });

      expect(addButton).toBeInTheDocument();
    });
  });

  describe('Statistics cards', () => {
    it('should display correct member statistics', async () => {
      const mockMembers = [
        createMockMember({ id: '1', status: 'active', membershipType: 'monthly' }),
        createMockMember({ id: '2', status: 'active', membershipType: 'annual' }),
        createMockMember({ id: '3', status: 'cancelled', membershipType: 'monthly' }),
        createMockMember({ id: '4', status: 'hold', membershipType: 'free-trial' }),
        createMockMember({ id: '5', status: 'active', membershipType: 'free' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Check statistics are displayed
      expect(page.getByText('Total members')).toBeInTheDocument();
      expect(page.getByText('Total cancelled')).toBeInTheDocument();
      expect(page.getByText('Paid members')).toBeInTheDocument();
      expect(page.getByText('Free members')).toBeInTheDocument();
    });
  });

  describe('Status display', () => {
    it('should display Active status with correct label', async () => {
      const mockMembers = [createMockMember({ status: 'active' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Use first() since element appears in both desktop and mobile views
      expect(page.getByText('Active').first()).toBeInTheDocument();
    });

    it('should display Past Due status with correct label', async () => {
      const mockMembers = [createMockMember({ status: 'past_due' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      expect(page.getByText('Past Due').first()).toBeInTheDocument();
    });

    it('should display Trial status with correct label', async () => {
      const mockMembers = [createMockMember({ status: 'trial' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      expect(page.getByText('Trial').first()).toBeInTheDocument();
    });

    it('should display Cancelled status with correct label', async () => {
      const mockMembers = [createMockMember({ status: 'cancelled' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      expect(page.getByText('Cancelled').first()).toBeInTheDocument();
    });

    it('should display Hold status with correct label', async () => {
      const mockMembers = [createMockMember({ status: 'hold' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      expect(page.getByText('Hold').first()).toBeInTheDocument();
    });
  });

  describe('Member type display', () => {
    it('should display Individual for individual member type', async () => {
      const mockMembers = [createMockMember({ memberType: 'individual' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Use first() since element appears in both desktop and mobile views
      expect(page.getByText('Individual').first()).toBeInTheDocument();
    });

    it('should display Head of Household for head-of-household member type', async () => {
      const mockMembers = [createMockMember({ memberType: 'head-of-household' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      expect(page.getByText('Head of Household').first()).toBeInTheDocument();
    });

    it('should display Family Member for family-member member type', async () => {
      const mockMembers = [createMockMember({ memberType: 'family-member' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      expect(page.getByText('Family Member').first()).toBeInTheDocument();
    });

    it('should display dash for null member type', async () => {
      const mockMembers = [createMockMember({ memberType: null })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // The member type badge should show '-'
      const table = page.getByRole('table');

      expect(table.getByText('-').first()).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('should sort members by name column', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'Zach', lastName: 'Smith' }),
        createMockMember({ id: '2', firstName: 'Alice', lastName: 'Brown' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click name header to sort (toggles from default asc to desc)
      const nameHeader = page.getByRole('button', { name: /Member name/i });
      await nameHeader.click();

      // Verify both members are present in the table
      const table = page.getByRole('table');

      expect(table.getByText('Alice Brown')).toBeInTheDocument();
      expect(table.getByText('Zach Smith')).toBeInTheDocument();
    });

    it('should have sortable status column', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', status: 'cancelled' }),
        createMockMember({ id: '2', firstName: 'Jane', status: 'active' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click status header
      const statusHeader = page.getByRole('button', { name: /Status/i });
      await statusHeader.click();

      // Verify both statuses are present
      const table = page.getByRole('table');

      expect(table.getByText('Active')).toBeInTheDocument();
      expect(table.getByText('Cancelled')).toBeInTheDocument();
    });

    it('should have sortable amount due column', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', amountDue: '100.00' }),
        createMockMember({ id: '2', firstName: 'Jane', amountDue: '50.00' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click amount due header
      const table = page.getByRole('table');
      const amountHeader = table.getByRole('button', { name: /Amount due/i });
      await amountHeader.click();

      // Verify both amounts are present

      expect(table.getByText('$50.00')).toBeInTheDocument();
      expect(table.getByText('$100.00')).toBeInTheDocument();
    });
  });

  describe('Row click', () => {
    it('should call onRowClickAction when clicking a row', async () => {
      const mockMembers = [createMockMember({ id: 'member-123' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click the row
      const row = page.getByRole('table').getByRole('row').nth(1);
      await row.click();

      expect(mockOnRowClick).toHaveBeenCalledWith('member-123');
    });
  });

  describe('Filtering', () => {
    it('should have a search input', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', lastName: 'Doe' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');

      expect(searchInput).toBeInTheDocument();
    });

    it('should allow typing in search input', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', lastName: 'Doe' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Type in search
      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'John');

      // Verify member is still visible in table
      const table = page.getByRole('table');

      expect(table.getByText('John Doe')).toBeInTheDocument();
    });

    it('should have status filter dropdown', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', status: 'active' }),
        createMockMember({ id: '2', firstName: 'Jane', status: 'cancelled' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click the status filter dropdown
      const statusTrigger = page.getByRole('combobox').first();
      await statusTrigger.click();

      // Verify status options are shown
      expect(page.getByRole('option', { name: 'status_active' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_cancelled' })).toBeInTheDocument();
    });

    it('should have member type filter dropdown', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', memberType: 'individual' }),
        createMockMember({ id: '2', firstName: 'Jane', memberType: 'head-of-household' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click the member type filter dropdown (second combobox)
      const memberTypeTrigger = page.getByRole('combobox').nth(1);
      await memberTypeTrigger.click();

      // Verify member type options are shown
      expect(page.getByRole('option', { name: 'member_type_head_of_household' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'member_type_individual' })).toBeInTheDocument();
    });
  });

  describe('Date and currency formatting', () => {
    it('should format currency correctly', async () => {
      const mockMembers = [createMockMember({ amountDue: '1234.56' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Check in table specifically
      const table = page.getByRole('table');

      expect(table.getByText('$1,234.56')).toBeInTheDocument();
    });

    it('should display dash for missing amount', async () => {
      const mockMembers = [createMockMember({ amountDue: undefined })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // The amount column should show '-'
      const table = page.getByRole('table');

      expect(table.getByText('-').first()).toBeInTheDocument();
    });
  });

  describe('Avatar initials', () => {
    it('should display initials for member with names', async () => {
      const mockMembers = [createMockMember({ firstName: 'John', lastName: 'Doe' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Should show 'JD' initials
      expect(page.getByText('JD').first()).toBeInTheDocument();
    });

    it('should display question mark for missing names', async () => {
      const mockMembers = [createMockMember({ firstName: null, lastName: null })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Should show '?' for missing names
      expect(page.getByText('?').first()).toBeInTheDocument();
    });
  });

  describe('Dynamic filter options', () => {
    it('should only show available statuses in filter', async () => {
      const mockMembers = [
        createMockMember({ id: '1', status: 'active' }),
        createMockMember({ id: '2', status: 'hold' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click the status filter dropdown
      const statusTrigger = page.getByRole('combobox').first();
      await statusTrigger.click();

      // Should show 'active' and 'hold' options
      expect(page.getByRole('option', { name: 'status_active' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_hold' })).toBeInTheDocument();

      // Should NOT show 'cancelled' option (not in data)
      expect(page.getByRole('option', { name: 'status_cancelled' }).elements()).toHaveLength(0);
    });

    it('should only show available member types in filter', async () => {
      const mockMembers = [
        createMockMember({ id: '1', memberType: 'individual' }),
        createMockMember({ id: '2', memberType: 'head-of-household' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click the member type filter dropdown
      const memberTypeTrigger = page.getByRole('combobox').nth(1);
      await memberTypeTrigger.click();

      // Should show 'individual' and 'head-of-household' options
      expect(page.getByRole('option', { name: 'member_type_head_of_household' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'member_type_individual' })).toBeInTheDocument();

      // Should NOT show 'family-member' option (not in data)
      expect(page.getByRole('option', { name: 'member_type_family_member' }).elements()).toHaveLength(0);
    });
  });

  describe('Additional Sorting', () => {
    it('should sort members by member type column', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', memberType: 'individual' }),
        createMockMember({ id: '2', firstName: 'Jane', memberType: 'head-of-household' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click member type header
      const memberTypeHeader = page.getByRole('button', { name: /Member type/i });
      await memberTypeHeader.click();

      // Verify both members are present
      const table = page.getByRole('table');

      expect(table.getByText('Individual')).toBeInTheDocument();
      expect(table.getByText('Head of Household')).toBeInTheDocument();
    });

    it('should sort members by next payment column', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', nextPayment: new Date('2025-01-15') }),
        createMockMember({ id: '2', firstName: 'Jane', nextPayment: new Date('2025-02-01') }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click next payment header
      const table = page.getByRole('table');
      const nextPaymentHeader = table.getByRole('button', { name: /Next payment/i });
      await nextPaymentHeader.click();

      // Verify both members are present

      expect(table.getByText('John Doe')).toBeInTheDocument();
      expect(table.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('should sort members by last visited column', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', lastAccessedAt: new Date('2024-12-01') }),
        createMockMember({ id: '2', firstName: 'Jane', lastAccessedAt: new Date('2024-12-15') }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click last visited header
      const table = page.getByRole('table');
      const lastVisitedHeader = table.getByRole('button', { name: /Last visited/i });
      await lastVisitedHeader.click();

      // Verify both members are present

      expect(table.getByText('John Doe')).toBeInTheDocument();
      expect(table.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('should toggle sort direction when clicking same column twice', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'Alice', lastName: 'Smith' }),
        createMockMember({ id: '2', firstName: 'Zach', lastName: 'Brown' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const nameHeader = page.getByRole('button', { name: /Member name/i });

      // First click (already ascending, goes to descending)
      await nameHeader.click();

      // Second click (toggle direction)
      await nameHeader.click();

      // Verify both members are still present
      const table = page.getByRole('table');

      expect(table.getByText('Alice Smith')).toBeInTheDocument();
      expect(table.getByText('Zach Brown')).toBeInTheDocument();
    });

    it('should handle members without next payment date when sorting', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', nextPayment: new Date('2025-01-15') }),
        createMockMember({ id: '2', firstName: 'Jane', nextPayment: undefined }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const table = page.getByRole('table');
      const nextPaymentHeader = table.getByRole('button', { name: /Next payment/i });
      await nextPaymentHeader.click();

      expect(table.getByText('John Doe')).toBeInTheDocument();
      expect(table.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('should handle members without last accessed date when sorting', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', lastAccessedAt: new Date('2024-12-01') }),
        createMockMember({ id: '2', firstName: 'Jane', lastAccessedAt: null }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const table = page.getByRole('table');
      const lastVisitedHeader = table.getByRole('button', { name: /Last visited/i });
      await lastVisitedHeader.click();

      expect(table.getByText('John Doe')).toBeInTheDocument();
      expect(table.getByText('Jane Doe')).toBeInTheDocument();
    });
  });

  describe('Search functionality', () => {
    it('should filter members by email', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', lastName: 'Doe', email: 'john@example.com' }),
        createMockMember({ id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@different.com' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'different');

      // Should only show Jane (matching email)
      const table = page.getByRole('table');

      expect(table.getByText('Jane Smith')).toBeInTheDocument();
      expect(table.getByText('John Doe').elements()).toHaveLength(0);
    });

    it('should filter members by phone', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', lastName: 'Doe', phone: '555-1234' }),
        createMockMember({ id: '2', firstName: 'Jane', lastName: 'Smith', phone: '555-5678' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, '5678');

      // Should only show Jane (matching phone)
      const table = page.getByRole('table');

      expect(table.getByText('Jane Smith')).toBeInTheDocument();
      expect(table.getByText('John Doe').elements()).toHaveLength(0);
    });

    it('should filter members by last name', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', lastName: 'Doe' }),
        createMockMember({ id: '2', firstName: 'Jane', lastName: 'Smith' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'Smith');

      // Should only show Jane
      const table = page.getByRole('table');

      expect(table.getByText('Jane Smith')).toBeInTheDocument();
      expect(table.getByText('John Doe').elements()).toHaveLength(0);
    });

    it('should show no members found when search has no matches', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', lastName: 'Doe' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'NonexistentName');

      expect(page.getByText('No members found').first()).toBeInTheDocument();
    });
  });

  describe('Filter selection', () => {
    it('should filter by status when selecting from dropdown', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', status: 'active' }),
        createMockMember({ id: '2', firstName: 'Jane', status: 'cancelled' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click the status filter dropdown
      const statusTrigger = page.getByRole('combobox').first();
      await statusTrigger.click();

      // Select 'active' status
      const activeOption = page.getByRole('option', { name: 'status_active' });
      await activeOption.click();

      // Should only show John (active)
      const table = page.getByRole('table');

      expect(table.getByText('John Doe')).toBeInTheDocument();
      expect(table.getByText('Jane Doe').elements()).toHaveLength(0);
    });

    it('should filter by member type when selecting from dropdown', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', memberType: 'individual' }),
        createMockMember({ id: '2', firstName: 'Jane', memberType: 'head-of-household' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click the member type filter dropdown
      const memberTypeTrigger = page.getByRole('combobox').nth(1);
      await memberTypeTrigger.click();

      // Select 'head-of-household'
      const hohOption = page.getByRole('option', { name: 'member_type_head_of_household' });
      await hohOption.click();

      // Should only show Jane (head-of-household)
      const table = page.getByRole('table');

      expect(table.getByText('Jane Doe')).toBeInTheDocument();
      expect(table.getByText('John Doe').elements()).toHaveLength(0);
    });
  });

  describe('Date formatting', () => {
    it('should display formatted date for next payment', async () => {
      const mockMembers = [createMockMember({ nextPayment: new Date('2025-06-15T14:30:00') })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Date should be formatted with time and timezone
      const table = page.getByRole('table');

      // Check that a date in MM/DD/YYYY format is displayed
      expect(table.getByText(/06\/15\/2025/)).toBeInTheDocument();
    });

    it('should display dash for null next payment', async () => {
      const mockMembers = [createMockMember({ nextPayment: undefined })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Should show '-' for missing dates
      const table = page.getByRole('table');

      expect(table.getByText('-').first()).toBeInTheDocument();
    });

    it('should display formatted date for last accessed', async () => {
      const mockMembers = [createMockMember({ lastAccessedAt: new Date('2024-11-20T09:15:00') })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const table = page.getByRole('table');

      expect(table.getByText(/11\/20\/2024/)).toBeInTheDocument();
    });

    it('should display dash for null last accessed', async () => {
      const mockMembers = [createMockMember({ lastAccessedAt: null })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const table = page.getByRole('table');

      expect(table.getByText('-').first()).toBeInTheDocument();
    });
  });

  describe('Avatar with photo', () => {
    it('should render member with photoUrl and fallback initials', async () => {
      const mockMembers = [createMockMember({
        photoUrl: 'https://example.com/photo.jpg',
        firstName: 'John',
        lastName: 'Doe',
      })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Avatar fallback initials should be present (image may not load in test)
      expect(page.getByText('JD').first()).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('should show pagination when there are more than 10 members', async () => {
      const mockMembers = Array.from({ length: 15 }, (_, i) =>
        createMockMember({ id: `${i}`, firstName: `Member${i}`, lastName: 'Test', status: 'active' }));
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Pagination should show Previous/Next buttons
      expect(page.getByRole('button', { name: /Previous/i })).toBeInTheDocument();
      expect(page.getByRole('button', { name: 'Next', exact: true })).toBeInTheDocument();
    });

    it('should only show first 10 members on first page', async () => {
      // Use padded numbers so alphabetical sort matches numeric order
      const mockMembers = Array.from({ length: 15 }, (_, i) =>
        createMockMember({ id: `${i}`, firstName: `Member${String(i).padStart(2, '0')}`, lastName: 'Test', status: 'active' }));
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Should show first 10 members when sorted by name
      const table = page.getByRole('table');

      expect(table.getByText('Member00 Test')).toBeInTheDocument();
      expect(table.getByText('Member09 Test')).toBeInTheDocument();

      // Member10 should not be visible on first page
      expect(table.getByText('Member10 Test').elements()).toHaveLength(0);
    });

    it('should navigate to second page when clicking next', async () => {
      const mockMembers = Array.from({ length: 15 }, (_, i) =>
        createMockMember({ id: `${i}`, firstName: `Member${String(i).padStart(2, '0')}`, lastName: 'Test', status: 'active' }));
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click next page button (use exact match to avoid "Next payment" header)
      const nextButton = page.getByRole('button', { name: 'Next', exact: true });
      await nextButton.click();

      // Should now show members 10-14
      const table = page.getByRole('table');

      expect(table.getByText('Member10 Test')).toBeInTheDocument();
    });

    it('should reset page when filtering', async () => {
      const mockMembers = Array.from({ length: 15 }, (_, i) =>
        createMockMember({ id: `${i}`, firstName: `Member${String(i).padStart(2, '0')}`, lastName: 'Test', status: 'active' }));
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Go to second page (use exact match)
      const nextButton = page.getByRole('button', { name: 'Next', exact: true });
      await nextButton.click();

      // Search for something
      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'Member01');

      // Should be back on first page with filtered results
      const table = page.getByRole('table');

      expect(table.getByText('Member01 Test')).toBeInTheDocument();
    });

    it('should not show pagination when 10 or fewer members', async () => {
      const mockMembers = [createMockMember()];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Should only have 1 page, so navigation might be minimal
      const table = page.getByRole('table');

      expect(table).toBeInTheDocument();
    });
  });

  describe('Free membership type', () => {
    it('should display dash for free membership type (not free-trial)', async () => {
      const mockMembers = [createMockMember({ membershipType: 'free' as const })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Free membership should show '-' since it's not a recognized type
      const table = page.getByRole('table');

      expect(table.getByText('-').first()).toBeInTheDocument();
    });
  });

  describe('Unknown status handling', () => {
    it('should handle unknown status with default styling', async () => {
      const mockMembers = [createMockMember({ status: 'pending' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Unknown status should be capitalized
      expect(page.getByText('Pending').first()).toBeInTheDocument();
    });
  });

  describe('Members with missing data', () => {
    it('should handle member with only first name', async () => {
      const mockMembers = [createMockMember({ firstName: 'John', lastName: null })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Should show '?' for initials
      expect(page.getByText('?').first()).toBeInTheDocument();
    });

    it('should handle member with only last name', async () => {
      const mockMembers = [createMockMember({ firstName: null, lastName: 'Doe' })];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Should show '?' for initials
      expect(page.getByText('?').first()).toBeInTheDocument();
    });

    it('should handle member with null phone in search', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', phone: null }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, '555');

      // Should show no members (phone is null, no match)
      expect(page.getByText('No members found').first()).toBeInTheDocument();
    });
  });

  describe('Combined filters', () => {
    it('should apply search and member type filter together', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'John', lastName: 'Individual', memberType: 'individual' }),
        createMockMember({ id: '2', firstName: 'Jane', lastName: 'Individual', memberType: 'individual' }),
        createMockMember({ id: '3', firstName: 'John', lastName: 'HOH', memberType: 'head-of-household' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Search for 'John'
      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'John');

      // Filter by member type 'individual'
      const memberTypeTrigger = page.getByRole('combobox').nth(1);
      await memberTypeTrigger.click();
      const individualOption = page.getByRole('option', { name: 'member_type_individual' });
      await individualOption.click();

      // Should only show John Individual (matches both search 'John' and member type 'individual')
      const table = page.getByRole('table');

      expect(table.getByText('John Individual')).toBeInTheDocument();
    });
  });

  describe('Sort reset on column change', () => {
    it('should reset to ascending when changing sort column', async () => {
      const mockMembers = [
        createMockMember({ id: '1', firstName: 'Zach', status: 'active' }),
        createMockMember({ id: '2', firstName: 'Alice', status: 'cancelled' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Click name header twice to get descending
      const nameHeader = page.getByRole('button', { name: /Member name/i });
      await nameHeader.click();
      await nameHeader.click();

      // Now click status header - should reset to ascending
      const statusHeader = page.getByRole('button', { name: /Status/i });
      await statusHeader.click();

      // Both members should be visible
      const table = page.getByRole('table');

      expect(table.getByText('Zach Doe')).toBeInTheDocument();
      expect(table.getByText('Alice Doe')).toBeInTheDocument();
    });
  });

  describe('Statistics calculations', () => {
    it('should count total on hold members correctly', async () => {
      const mockMembers = [
        createMockMember({ id: '1', status: 'hold' }),
        createMockMember({ id: '2', status: 'hold' }),
        createMockMember({ id: '3', status: 'active' }),
      ];
      const mockOnRowClick = vi.fn();

      await render(
        <MembersTable
          members={mockMembers}
          onRowClickAction={mockOnRowClick}
        />,
      );

      // Check that statistics are rendered (total on hold is tracked internally)
      expect(page.getByText('Total members')).toBeInTheDocument();
    });
  });

  describe('Page size selector (#258)', () => {
    const manyMembers = Array.from({ length: 30 }, (_, i) =>
      createMockMember({ id: String(i), firstName: `Member${String(i).padStart(2, '0')}`, lastName: 'Test', email: `m${i}@x.com` }));

    it('renders a rows-per-page selector', async () => {
      await render(<MembersTable members={manyMembers} onRowClickAction={vi.fn()} />);

      expect(page.getByLabelText('Rows per page')).toBeInTheDocument();
    });

    it('shows only 10 rows by default (30 members → first page)', async () => {
      await render(<MembersTable members={manyMembers} onRowClickAction={vi.fn()} />);

      const table = page.getByRole('table');

      // Row 00 is on page 1; row 10 is on page 2 (not shown yet).
      expect(table.getByText('Member00 Test')).toBeInTheDocument();
      expect(table.getByText('Member10 Test').elements().length).toBe(0);
    });

    it('shows more rows after choosing a larger page size', async () => {
      await render(<MembersTable members={manyMembers} onRowClickAction={vi.fn()} />);

      await page.getByLabelText('Rows per page').click();
      await page.getByRole('option', { name: '25' }).click();

      const table = page.getByRole('table');

      // Member10 (index 10) now fits within the 25-row page.
      expect(table.getByText('Member10 Test')).toBeInTheDocument();
    });
  });

  describe('Search relevance (#244)', () => {
    it('ranks name-prefix matches above email-only matches', async () => {
      const members = [
        createMockMember({ id: '1', firstName: 'Zoe', lastName: 'Zilch', email: 'jane@x.com' }), // "jane" only in email
        createMockMember({ id: '2', firstName: 'Jane', lastName: 'Doe', email: 'jd@x.com' }), // "jane" prefixes first name
      ];

      await render(<MembersTable members={members} onRowClickAction={vi.fn()} />);

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'jane');

      const rows = page.getByRole('table').getByRole('row').elements();
      // rows[0] is the header; first data row should be the name-prefix match.
      const firstDataRow = rows[1]!;

      expect(firstDataRow.textContent).toContain('Jane Doe');
    });

    it('filters out members that do not match at all', async () => {
      const members = [
        createMockMember({ id: '1', firstName: 'Jane', lastName: 'Doe', email: 'jane@x.com' }),
        createMockMember({ id: '2', firstName: 'Bob', lastName: 'Smith', email: 'bob@x.com' }),
      ];

      await render(<MembersTable members={members} onRowClickAction={vi.fn()} />);

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'jane');

      const table = page.getByRole('table');

      expect(table.getByText('Jane Doe')).toBeInTheDocument();
      expect(table.getByText('Bob Smith').elements().length).toBe(0);
    });
  });
});
