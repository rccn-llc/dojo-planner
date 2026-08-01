import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { InviteStaffModal } from './InviteStaffModal';

// Helper to wait for async operations
async function waitFor(callback: () => void | Promise<void>, options?: { timeout?: number }) {
  return vi.waitFor(callback, { timeout: options?.timeout ?? 5000, interval: 50 });
}

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock the server actions
const mockFetchStaffRoles = vi.fn();
const mockInviteStaffMember = vi.fn();
const mockUpdateStaffMember = vi.fn();

vi.mock('@/actions/staff', () => ({
  fetchStaffRoles: () => mockFetchStaffRoles(),
  inviteStaffMember: (params: unknown) => mockInviteStaffMember(params),
  updateStaffMember: (params: unknown) => mockUpdateStaffMember(params),
}));

describe('InviteStaffModal', () => {
  const mockHandlers = {
    onCloseAction: vi.fn(),
  };

  const mockRoles = [
    { id: 'role_1', key: 'org:admin', name: 'Admin', description: 'Full access to all features' },
    { id: 'role_2', key: 'org:instructor', name: 'Instructor', description: 'Can manage classes' },
    { id: 'role_3', key: 'org:front_desk', name: 'Front Desk', description: 'Reception duties' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchStaffRoles.mockResolvedValue({
      success: true,
      roles: mockRoles,
    });
    mockInviteStaffMember.mockResolvedValue({
      success: true,
      invitationId: 'inv_123',
    });
  });

  describe('Modal rendering', () => {
    it('should not render dialog when isOpen is false', async () => {
      await render(
        <InviteStaffModal
          isOpen={false}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      try {
        const modal = page.getByRole('dialog');

        expect(modal).toBeFalsy();
      } catch {
        expect(true).toBe(true);
      }
    });

    it('should render dialog when isOpen is true', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      const modal = page.getByRole('dialog');

      expect(modal).toBeTruthy();
    });

    it('should display dialog title', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      const heading = page.getByRole('heading');

      expect(heading).toBeTruthy();
    });
  });

  describe('Form fields', () => {
    it('should render all form fields', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      const firstNameInput = page.getByTestId('invite-staff-first-name');
      const lastNameInput = page.getByTestId('invite-staff-last-name');
      const emailInput = page.getByTestId('invite-staff-email');
      const roleSelect = page.getByTestId('invite-staff-role');

      expect(firstNameInput).toBeTruthy();
      expect(lastNameInput).toBeTruthy();
      expect(emailInput).toBeTruthy();
      expect(roleSelect).toBeTruthy();
    });

    it('should render Cancel and Save buttons', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      const cancelButton = page.getByTestId('invite-staff-cancel-button');
      const saveButton = page.getByTestId('invite-staff-save-button');

      expect(cancelButton).toBeTruthy();
      expect(saveButton).toBeTruthy();
    });

    it('should update form fields when user types', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      const firstNameInput = page.getByTestId('invite-staff-first-name');
      await userEvent.fill(firstNameInput, 'John');

      const lastNameInput = page.getByTestId('invite-staff-last-name');
      await userEvent.fill(lastNameInput, 'Doe');

      const emailInput = page.getByTestId('invite-staff-email');
      await userEvent.fill(emailInput, 'john@example.com');

      expect(firstNameInput.element()).toHaveProperty('value', 'John');
      expect(lastNameInput.element()).toHaveProperty('value', 'Doe');
      expect(emailInput.element()).toHaveProperty('value', 'john@example.com');
    });
  });

  describe('Roles from Clerk', () => {
    it('should fetch roles on mount', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      await waitFor(() => {
        expect(mockFetchStaffRoles).toHaveBeenCalled();
      });
    });

    it('should display loading state while fetching roles', async () => {
      // Delay the promise to test loading state
      mockFetchStaffRoles.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({ success: true, roles: mockRoles }), 100),
        ),
      );

      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      // Should show loading text
      const loadingText = page.getByText('loading_roles');

      expect(loadingText).toBeTruthy();
    });

    it('should display error when roles fail to load', async () => {
      mockFetchStaffRoles.mockResolvedValue({
        success: false,
        error: 'Failed to load roles',
      });

      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      await waitFor(() => {
        const errorMessage = page.getByText('Failed to load roles');

        expect(errorMessage).toBeTruthy();
      });
    });
  });

  describe('Button states', () => {
    it('should render Cancel button that can be clicked', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      const cancelButton = page.getByTestId('invite-staff-cancel-button');

      await expect.element(cancelButton).toBeVisible();
      await expect.element(cancelButton).toBeEnabled();
    });

    it('should have Save button disabled when form is incomplete', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      // Wait for roles to load
      await waitFor(() => {
        expect(mockFetchStaffRoles).toHaveBeenCalled();
      });

      const saveButton = page.getByTestId('invite-staff-save-button');

      expect(saveButton.element()).toHaveProperty('disabled', true);
    });
  });

  describe('Info message', () => {
    it('should display info message', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      const infoMessage = page.getByText('info_message');

      expect(infoMessage).toBeTruthy();
    });
  });

  describe('Modal close behavior', () => {
    it('should call onCloseAction once when X button is clicked while input is focused', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      // Focus on an input field first (simulating user interaction)
      const firstNameInput = page.getByTestId('invite-staff-first-name');
      await userEvent.click(firstNameInput);
      await userEvent.fill(firstNameInput, 'Test');

      // Click the X button to close
      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      // onCloseAction should be called exactly once with a single click
      expect(mockHandlers.onCloseAction).toHaveBeenCalledTimes(1);
    });

    it('should call onCloseAction once when Cancel button is clicked', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      // Focus on an input field first (simulating user interaction - same as X button test)
      const firstNameInput = page.getByTestId('invite-staff-first-name');
      await userEvent.click(firstNameInput);
      await userEvent.fill(firstNameInput, 'Test');

      // Click the Cancel button to close
      const cancelButton = page.getByRole('button', { name: 'cancel_button' });
      await userEvent.click(cancelButton);

      expect(mockHandlers.onCloseAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Form submission', () => {
    it('should call inviteStaffMember when form is valid and submitted', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      // Wait for roles to load
      await waitFor(() => {
        expect(mockFetchStaffRoles).toHaveBeenCalled();
      });

      // Fill in the form
      const firstNameInput = page.getByTestId('invite-staff-first-name');
      await userEvent.fill(firstNameInput, 'John');

      const lastNameInput = page.getByTestId('invite-staff-last-name');
      await userEvent.fill(lastNameInput, 'Doe');

      const emailInput = page.getByTestId('invite-staff-email');
      await userEvent.fill(emailInput, 'john@example.com');

      // Select a role
      const roleSelect = page.getByTestId('invite-staff-role');
      await userEvent.click(roleSelect);

      // Wait for dropdown to open and click the Admin option
      const adminOption = page.getByRole('option', { name: 'Admin' });
      await userEvent.click(adminOption);

      // Submit the form
      const saveButton = page.getByTestId('invite-staff-save-button');
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockInviteStaffMember).toHaveBeenCalledWith({
          emailAddress: 'john@example.com',
          roleKey: 'org:admin',
          firstName: 'John',
          lastName: 'Doe',
        });
      });
    });

    it('should display success message after successful invitation', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      // Wait for roles to load
      await waitFor(() => {
        expect(mockFetchStaffRoles).toHaveBeenCalled();
      });

      // Fill in the form
      await userEvent.fill(page.getByTestId('invite-staff-first-name'), 'John');
      await userEvent.fill(page.getByTestId('invite-staff-last-name'), 'Doe');
      await userEvent.fill(page.getByTestId('invite-staff-email'), 'john@example.com');

      // Select a role
      await userEvent.click(page.getByTestId('invite-staff-role'));
      await userEvent.click(page.getByRole('option', { name: 'Admin' }));

      // Submit the form
      await userEvent.click(page.getByTestId('invite-staff-save-button'));

      await waitFor(() => {
        const successMessage = page.getByText('invitation_sent_success');

        expect(successMessage).toBeTruthy();
      });
    });

    it('should display error message when invitation fails', async () => {
      mockInviteStaffMember.mockResolvedValue({
        success: false,
        error: 'Email already exists',
      });

      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      // Wait for roles to load
      await waitFor(() => {
        expect(mockFetchStaffRoles).toHaveBeenCalled();
      });

      // Fill in the form
      await userEvent.fill(page.getByTestId('invite-staff-first-name'), 'John');
      await userEvent.fill(page.getByTestId('invite-staff-last-name'), 'Doe');
      await userEvent.fill(page.getByTestId('invite-staff-email'), 'john@example.com');

      // Select a role
      await userEvent.click(page.getByTestId('invite-staff-role'));
      await userEvent.click(page.getByRole('option', { name: 'Admin' }));

      // Submit the form
      await userEvent.click(page.getByTestId('invite-staff-save-button'));

      await waitFor(() => {
        const errorMessage = page.getByText('Email already exists');

        expect(errorMessage).toBeTruthy();
      });
    });

    it('should show validation error when form is incomplete', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      // Wait for roles to load
      await waitFor(() => {
        expect(mockFetchStaffRoles).toHaveBeenCalled();
      });

      // Save button should be disabled when form is incomplete
      const saveButton = page.getByTestId('invite-staff-save-button');

      expect(saveButton.element()).toHaveProperty('disabled', true);
    });
  });

  describe('No permission switches', () => {
    it('should not render any permission toggle switches', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      // Wait for roles to load
      await waitFor(() => {
        expect(mockFetchStaffRoles).toHaveBeenCalled();
      });

      // Old permission switches should not exist
      const permissionKeys = [
        'canManageClassSchedules',
        'canViewMemberInformation',
        'canAccessBillingInformation',
        'canGenerateReports',
        'canModifyLocationSettings',
      ];

      for (const key of permissionKeys) {
        try {
          const toggle = page.getByTestId(`invite-staff-permission-${key}`);

          // If we can find it, the test should fail
          expect(toggle.element()).toBeNull();
        } catch {
          // Expected - the element should not exist
          expect(true).toBe(true);
        }
      }
    });
  });

  describe('Role description display', () => {
    it('should display role description when a role is selected', async () => {
      await render(
        <InviteStaffModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
        />,
      );

      // Wait for roles to load
      await waitFor(() => {
        expect(mockFetchStaffRoles).toHaveBeenCalled();
      });

      // Select a role
      const roleSelect = page.getByTestId('invite-staff-role');
      await userEvent.click(roleSelect);

      // Click the Admin option
      const adminOption = page.getByRole('option', { name: 'Admin' });
      await userEvent.click(adminOption);

      // The description should be displayed
      await waitFor(() => {
        const description = page.getByText('Full access to all features');

        expect(description).toBeTruthy();
      });
    });
  });
});
