import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { StaffTable } from './StaffTable';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// Render a lightweight stand-in for the photo modal so we can assert it opened
// without pulling in the real ORPC / instructors-cache dependencies.
vi.mock('./EditInstructorPhotoModal', () => ({
  EditInstructorPhotoModal: ({ isOpen, clerkUserId }: { isOpen: boolean; clerkUserId: string }) =>
    isOpen ? <div data-testid="edit-instructor-photo-modal">{clerkUserId}</div> : null,
}));

describe('StaffTable', () => {
  const mockOnEditStaff = vi.fn();
  const mockOnRemoveStaff = vi.fn();

  const mockStaffMembers = [
    {
      id: 'user_1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      photoUrl: null,
      emailAddress: 'john@example.com',
      role: 'org:admin',
      status: 'Active' as const,
      phone: '555-123-4567',
    },
    {
      id: 'user_2',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      photoUrl: 'https://example.com/photo.jpg',
      emailAddress: 'jane@example.com',
      role: 'org:instructor',
      status: 'Active' as const,
      phone: '555-987-6543',
    },
    {
      id: 'user_3',
      firstName: 'Bob',
      lastName: 'Wilson',
      email: 'bob@example.com',
      photoUrl: null,
      emailAddress: 'bob@example.com',
      role: 'org:front_desk',
      status: 'Invitation sent' as const,
      phone: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the filter bar and staff members', async () => {
      render(
        <StaffTable
          staffMembers={mockStaffMembers}
          onEditStaff={mockOnEditStaff}
          onRemoveStaff={mockOnRemoveStaff}
        />,
      );

      await expect.element(page.getByTestId('staff-search-input')).toBeVisible();
      await expect.element(page.getByTestId('staff-role-filter')).toBeVisible();

      // Use the table to get specific elements (desktop view)
      const table = page.getByRole('table');

      await expect.element(table.getByText('John Doe')).toBeVisible();
      await expect.element(table.getByText('Jane Smith')).toBeVisible();
      await expect.element(table.getByText('Bob Wilson')).toBeVisible();
    });

    it('should render header actions when provided', async () => {
      render(
        <StaffTable
          staffMembers={mockStaffMembers}
          onEditStaff={mockOnEditStaff}
          onRemoveStaff={mockOnRemoveStaff}
          headerActions={<button type="button" data-testid="invite-button">Invite</button>}
        />,
      );

      await expect.element(page.getByTestId('invite-button')).toBeVisible();
    });

    it('should show empty state when no staff members', async () => {
      render(
        <StaffTable
          staffMembers={[]}
          onEditStaff={mockOnEditStaff}
          onRemoveStaff={mockOnRemoveStaff}
        />,
      );

      // There are two empty states (desktop and mobile), use first()
      await expect.element(page.getByText('no_staff_members').first()).toBeVisible();
    });
  });

  describe('Search filtering', () => {
    it('should filter staff by search input', async () => {
      render(
        <StaffTable
          staffMembers={mockStaffMembers}
          onEditStaff={mockOnEditStaff}
          onRemoveStaff={mockOnRemoveStaff}
        />,
      );

      const searchInput = page.getByTestId('staff-search-input');
      await userEvent.type(searchInput, 'John');

      const table = page.getByRole('table');

      await expect.element(table.getByText('John Doe')).toBeVisible();
      await expect.element(table.getByText('Jane Smith')).not.toBeInTheDocument();
      await expect.element(table.getByText('Bob Wilson')).not.toBeInTheDocument();
    });

    it('should show no results message when search matches nothing', async () => {
      render(
        <StaffTable
          staffMembers={mockStaffMembers}
          onEditStaff={mockOnEditStaff}
          onRemoveStaff={mockOnRemoveStaff}
        />,
      );

      const searchInput = page.getByTestId('staff-search-input');
      await userEvent.type(searchInput, 'nonexistent');

      // Use first() since there are two empty states
      await expect.element(page.getByText('no_results_found').first()).toBeVisible();
    });
  });

  describe('Edit action', () => {
    it('should call onEditStaff when edit button is clicked', async () => {
      render(
        <StaffTable
          staffMembers={mockStaffMembers}
          currentUserRole="org:admin"
          currentUserId="other_user"
          onEditStaff={mockOnEditStaff}
          onRemoveStaff={mockOnRemoveStaff}
        />,
      );

      // Use first() to get only the desktop view button
      const editButton = page.getByRole('button', { name: /Edit John Doe/i }).first();
      await userEvent.click(editButton);

      expect(mockOnEditStaff).toHaveBeenCalledWith({
        id: 'user_1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        roleKey: 'org:admin',
        phone: '555-123-4567',
      });
    });
  });

  describe('Remove action', () => {
    it('should call onRemoveStaff when remove button is clicked', async () => {
      render(
        <StaffTable
          staffMembers={mockStaffMembers}
          currentUserRole="org:admin"
          currentUserId="other_user"
          onEditStaff={mockOnEditStaff}
          onRemoveStaff={mockOnRemoveStaff}
        />,
      );

      // Use first() to get only the desktop view button
      const removeButton = page.getByRole('button', { name: /Remove John Doe/i }).first();
      await userEvent.click(removeButton);

      expect(mockOnRemoveStaff).toHaveBeenCalledWith('user_1');
    });
  });

  describe('Instructor photo action', () => {
    it('shows the photo button for an instructor row and opens the photo modal on click', async () => {
      render(
        <StaffTable
          staffMembers={mockStaffMembers}
          currentUserRole="org:admin"
          currentUserId="other_user"
          onEditStaff={mockOnEditStaff}
          onRemoveStaff={mockOnRemoveStaff}
        />,
      );

      // Jane Smith (user_2) has role org:instructor -> photo button present.
      const photoButton = page.getByRole('button', { name: 'edit_photo_aria' }).first();

      await expect.element(photoButton).toBeVisible();

      await userEvent.click(photoButton);

      const modal = page.getByTestId('edit-instructor-photo-modal').first();

      await expect.element(modal).toBeVisible();
      await expect.element(modal).toHaveTextContent('user_2');
    });

    it('does not show the photo button for an admin row', async () => {
      render(
        <StaffTable
          staffMembers={[mockStaffMembers[0]!]}
          currentUserRole="org:admin"
          currentUserId="other_user"
          onEditStaff={mockOnEditStaff}
          onRemoveStaff={mockOnRemoveStaff}
        />,
      );

      // Only John Doe (org:admin) is rendered — no photo button.
      expect(page.getByRole('button', { name: 'edit_photo_aria' }).elements().length).toBe(0);
    });
  });

  describe('Sorting', () => {
    it('should sort by name when name column header is clicked', async () => {
      render(
        <StaffTable
          staffMembers={mockStaffMembers}
          onEditStaff={mockOnEditStaff}
          onRemoveStaff={mockOnRemoveStaff}
        />,
      );

      const table = page.getByRole('table');

      await expect.element(table).toBeVisible();

      const nameHeader = page.getByRole('button', { name: /Staff member name/i });
      await userEvent.click(nameHeader);
      await userEvent.click(nameHeader);

      await expect.element(table.getByText('John Doe')).toBeVisible();
    });
  });
});
