import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { ChangePasswordForm } from './ChangePasswordForm';

// Mock user with updatePassword function
const mockUpdatePassword = vi.fn();

const mockUser = {
  firstName: 'John',
  lastName: 'Doe',
  primaryEmailAddress: { emailAddress: 'john.doe@example.com' },
  passwordEnabled: true,
  updatePassword: mockUpdatePassword,
};

// Mock Clerk useUser hook
vi.mock('@clerk/nextjs', () => ({
  useUser: vi.fn(() => ({
    user: mockUser,
    isLoaded: true,
    isSignedIn: true,
  })),
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      current_password_label: 'Enter Current Password',
      current_password_placeholder: 'Enter current password',
      new_password_label: 'Enter New Password',
      new_password_placeholder: 'Enter new password',
      confirm_password_label: 'Confirm New Password',
      confirm_password_placeholder: 'Confirm new password',
      save_button: 'Save',
      cancel_button: 'Cancel',
      saving_button: 'Saving...',
      password_changed_success: 'Password changed successfully',
      password_change_error: 'Failed to change password. Please try again.',
      current_password_incorrect: 'Current password is incorrect',
      passwords_do_not_match: 'Passwords do not match',
      password_too_weak: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
      password_required: 'Password is required',
    };
    return translations[key] || key;
  },
}));

describe('ChangePasswordForm', () => {
  const mockOnCancel = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdatePassword.mockReset();
  });

  it('should render all form fields', async () => {
    await render(<ChangePasswordForm onCancel={mockOnCancel} />);

    expect(page.getByText('Enter Current Password')).toBeDefined();
    expect(page.getByText('Enter New Password')).toBeDefined();
    expect(page.getByText('Confirm New Password')).toBeDefined();
  });

  it('should render save and cancel buttons', async () => {
    await render(<ChangePasswordForm onCancel={mockOnCancel} />);

    expect(page.getByRole('button', { name: /save/i })).toBeDefined();
    expect(page.getByRole('button', { name: /cancel/i })).toBeDefined();
  });

  it('should call onCancel when cancel button is clicked', async () => {
    await render(<ChangePasswordForm onCancel={mockOnCancel} />);

    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton.element());

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should validate required fields', async () => {
    await render(<ChangePasswordForm onCancel={mockOnCancel} />);

    const saveButton = page.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton.element());

    // Should show validation errors for empty fields
    expect(page.getByText('Password is required')).toBeDefined();
  });

  it('should validate weak passwords', async () => {
    await render(<ChangePasswordForm onCancel={mockOnCancel} />);

    const currentPasswordInput = page.getByPlaceholder('Enter current password');
    const newPasswordInput = page.getByPlaceholder('Enter new password');
    const confirmPasswordInput = page.getByPlaceholder('Confirm new password');

    await userEvent.fill(currentPasswordInput.element(), 'currentpass');
    await userEvent.fill(newPasswordInput.element(), 'weak');
    await userEvent.fill(confirmPasswordInput.element(), 'weak');

    const saveButton = page.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton.element());

    // Should show weak password error
    expect(page.getByText('Password must be at least 8 characters and include uppercase, lowercase, number, and special character')).toBeDefined();
  });

  it('should validate password mismatch', async () => {
    await render(<ChangePasswordForm onCancel={mockOnCancel} />);

    const currentPasswordInput = page.getByPlaceholder('Enter current password');
    const newPasswordInput = page.getByPlaceholder('Enter new password');
    const confirmPasswordInput = page.getByPlaceholder('Confirm new password');

    await userEvent.fill(currentPasswordInput.element(), 'currentpass');
    await userEvent.fill(newPasswordInput.element(), 'StrongP@ss1'); // ggignore
    await userEvent.fill(confirmPasswordInput.element(), 'DifferentP@ss1'); // ggignore

    const saveButton = page.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton.element());

    expect(page.getByText('Passwords do not match')).toBeDefined();
  });

  it('should call updatePassword on valid submission', async () => {
    mockUpdatePassword.mockResolvedValue({});

    await render(<ChangePasswordForm onCancel={mockOnCancel} onSuccess={mockOnSuccess} />);

    const currentPasswordInput = page.getByPlaceholder('Enter current password');
    const newPasswordInput = page.getByPlaceholder('Enter new password');
    const confirmPasswordInput = page.getByPlaceholder('Confirm new password');

    await userEvent.fill(currentPasswordInput.element(), 'currentpass');
    await userEvent.fill(newPasswordInput.element(), 'StrongP@ss1!'); // ggignore
    await userEvent.fill(confirmPasswordInput.element(), 'StrongP@ss1!'); // ggignore

    const saveButton = page.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton.element());

    expect(mockUpdatePassword).toHaveBeenCalledWith({
      currentPassword: 'currentpass',
      newPassword: 'StrongP@ss1!', // ggignore
    });
  });

  it('should show success message on successful password change', async () => {
    mockUpdatePassword.mockResolvedValue({});

    await render(<ChangePasswordForm onCancel={mockOnCancel} onSuccess={mockOnSuccess} />);

    const currentPasswordInput = page.getByPlaceholder('Enter current password');
    const newPasswordInput = page.getByPlaceholder('Enter new password');
    const confirmPasswordInput = page.getByPlaceholder('Confirm new password');

    await userEvent.fill(currentPasswordInput.element(), 'currentpass');
    await userEvent.fill(newPasswordInput.element(), 'StrongP@ss1!'); // ggignore
    await userEvent.fill(confirmPasswordInput.element(), 'StrongP@ss1!'); // ggignore

    const saveButton = page.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton.element());

    // Wait for the async operation to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(page.getByText('Password changed successfully')).toBeDefined();
  });

  it('should show error when current password is incorrect', async () => {
    mockUpdatePassword.mockRejectedValue({
      errors: [{ code: 'form_password_incorrect', message: 'Incorrect password' }],
    });

    await render(<ChangePasswordForm onCancel={mockOnCancel} />);

    const currentPasswordInput = page.getByPlaceholder('Enter current password');
    const newPasswordInput = page.getByPlaceholder('Enter new password');
    const confirmPasswordInput = page.getByPlaceholder('Confirm new password');

    await userEvent.fill(currentPasswordInput.element(), 'wrongpassword');
    await userEvent.fill(newPasswordInput.element(), 'StrongP@ss1!'); // ggignore
    await userEvent.fill(confirmPasswordInput.element(), 'StrongP@ss1!'); // ggignore

    const saveButton = page.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton.element());

    // Wait for the async operation to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(page.getByText('Current password is incorrect')).toBeDefined();
  });

  it('should have autocomplete off for password fields', async () => {
    await render(<ChangePasswordForm onCancel={mockOnCancel} />);

    const currentPasswordInput = page.getByPlaceholder('Enter current password');
    const newPasswordInput = page.getByPlaceholder('Enter new password');
    const confirmPasswordInput = page.getByPlaceholder('Confirm new password');

    expect(currentPasswordInput.element().getAttribute('autocomplete')).toBe('off');
    expect(newPasswordInput.element().getAttribute('autocomplete')).toBe('new-password');
    expect(confirmPasswordInput.element().getAttribute('autocomplete')).toBe('new-password');
  });

  it('should show alert banner for generic API errors', async () => {
    mockUpdatePassword.mockRejectedValue({
      errors: [{ code: 'unknown_error', message: 'Something went wrong' }],
    });

    await render(<ChangePasswordForm onCancel={mockOnCancel} />);

    const currentPasswordInput = page.getByPlaceholder('Enter current password');
    const newPasswordInput = page.getByPlaceholder('Enter new password');
    const confirmPasswordInput = page.getByPlaceholder('Confirm new password');

    await userEvent.fill(currentPasswordInput.element(), 'currentpass');
    await userEvent.fill(newPasswordInput.element(), 'StrongP@ss1!'); // ggignore
    await userEvent.fill(confirmPasswordInput.element(), 'StrongP@ss1!'); // ggignore

    const saveButton = page.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton.element());

    // Wait for the async operation to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should show alert banner with generic error message
    const alert = page.getByRole('alert');

    expect(alert).toBeDefined();
    expect(page.getByText('Failed to change password. Please try again.')).toBeDefined();
  });

  it('should show alert banner when API throws unexpected error', async () => {
    mockUpdatePassword.mockRejectedValue(new Error('Network error'));

    await render(<ChangePasswordForm onCancel={mockOnCancel} />);

    const currentPasswordInput = page.getByPlaceholder('Enter current password');
    const newPasswordInput = page.getByPlaceholder('Enter new password');
    const confirmPasswordInput = page.getByPlaceholder('Confirm new password');

    await userEvent.fill(currentPasswordInput.element(), 'currentpass');
    await userEvent.fill(newPasswordInput.element(), 'StrongP@ss1!'); // ggignore
    await userEvent.fill(confirmPasswordInput.element(), 'StrongP@ss1!'); // ggignore

    const saveButton = page.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton.element());

    // Wait for the async operation to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should show alert banner with generic error message
    const alert = page.getByRole('alert');

    expect(alert).toBeDefined();
    expect(page.getByText('Failed to change password. Please try again.')).toBeDefined();
  });
});
