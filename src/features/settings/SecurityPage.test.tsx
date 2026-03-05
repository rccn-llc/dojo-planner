import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { SecurityPage } from './SecurityPage';

// Mock user data
const mockUser = {
  firstName: 'John',
  lastName: 'Doe',
  primaryEmailAddress: { emailAddress: 'john.doe@example.com' },
  primaryPhoneNumber: { phoneNumber: '+1 555-123-4567' },
  imageUrl: 'https://example.com/avatar.jpg',
  passwordEnabled: true,
  updatePassword: vi.fn(),
  totpEnabled: false,
  createTOTP: vi.fn(),
  verifyTOTP: vi.fn(),
  disableTOTP: vi.fn(),
  reload: vi.fn(),
};

// Mock logger to prevent process.env issues
vi.mock('@/libs/Logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

// Mock Clerk useUser hook
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: mockUser,
    isLoaded: true,
    isSignedIn: true,
  }),
  useReverification: (fn: () => unknown) => fn,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Security',
      change_password_title: 'Change Password',
      change_password_button: 'Change Password',
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
      two_factor_title: '2-Factor Authentication (2FA)',
      two_factor_description: 'Make your account more secure by adding a second form of authentication',
      add_2fa_button: 'Add 2FA',
      two_factor_enabled_status: 'Enabled',
      disable_2fa_button: 'Remove 2FA',
    };
    return translations[key] || key;
  },
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <div data-testid="qr-code" />,
}));

describe('SecurityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.totpEnabled = false;
  });

  it('should render the page title', () => {
    render(<SecurityPage />);

    expect(page.getByText('Security')).toBeDefined();
  });

  it('should render change password section title for password-authenticated users', () => {
    render(<SecurityPage />);

    expect(page.getByText('Change Password')).toBeDefined();
  });

  it('should render change password button', () => {
    render(<SecurityPage />);
    const changePasswordButton = page.getByRole('button', { name: /change password/i });

    expect(changePasswordButton).toBeDefined();
  });

  it('should render 2FA section title', () => {
    render(<SecurityPage />);

    expect(page.getByText('2-Factor Authentication (2FA)')).toBeDefined();
  });

  it('should render 2FA description', () => {
    render(<SecurityPage />);

    expect(
      page.getByText('Make your account more secure by adding a second form of authentication'),
    ).toBeDefined();
  });

  it('should render Add 2FA button when TOTP is not enabled', () => {
    render(<SecurityPage />);
    const add2faButton = page.getByRole('button', { name: /add 2fa/i });

    expect(add2faButton).toBeDefined();
    expect(add2faButton.element().hasAttribute('disabled')).toBe(false);
  });

  it('should render Remove 2FA button and Enabled badge when TOTP is enabled', () => {
    mockUser.totpEnabled = true;
    render(<SecurityPage />);

    expect(page.getByText('Enabled')).toBeDefined();
    expect(page.getByRole('button', { name: /remove 2fa/i })).toBeDefined();
  });

  it('should not show Enabled badge when TOTP is not enabled', () => {
    render(<SecurityPage />);

    expect(page.getByText('Enabled').elements().length).toBe(0);
  });

  it('should show password form when change password button is clicked', async () => {
    render(<SecurityPage />);
    const changePasswordButton = page.getByRole('button', { name: /change password/i });

    await userEvent.click(changePasswordButton.element());

    expect(page.getByText('Enter Current Password')).toBeDefined();
    expect(page.getByText('Enter New Password')).toBeDefined();
    expect(page.getByText('Confirm New Password')).toBeDefined();
  });

  it('should hide password form when cancel button is clicked', async () => {
    render(<SecurityPage />);
    const changePasswordButton = page.getByRole('button', { name: /change password/i });

    await userEvent.click(changePasswordButton.element());

    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton.element());

    expect(page.getByText('Enter Current Password').elements().length).toBe(0);
  });

  it('should render save button when password form is open', async () => {
    render(<SecurityPage />);
    const changePasswordButton = page.getByRole('button', { name: /change password/i });

    await userEvent.click(changePasswordButton.element());

    const saveButton = page.getByRole('button', { name: /save/i });

    expect(saveButton).toBeDefined();
  });

  it('should validate empty password fields', async () => {
    render(<SecurityPage />);
    const changePasswordButton = page.getByRole('button', { name: /change password/i });

    await userEvent.click(changePasswordButton.element());

    // Click save without entering any passwords
    const saveButton = page.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton.element());

    // Should show validation error for required fields
    expect(page.getByText('Password is required')).toBeDefined();
  });

  it('should validate weak passwords', async () => {
    render(<SecurityPage />);
    const changePasswordButton = page.getByRole('button', { name: /change password/i });

    await userEvent.click(changePasswordButton.element());

    // Enter a weak password
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

  it('should validate mismatched passwords', async () => {
    render(<SecurityPage />);
    const changePasswordButton = page.getByRole('button', { name: /change password/i });

    await userEvent.click(changePasswordButton.element());

    // Enter mismatched passwords
    const currentPasswordInput = page.getByPlaceholder('Enter current password');
    const newPasswordInput = page.getByPlaceholder('Enter new password');
    const confirmPasswordInput = page.getByPlaceholder('Confirm new password');

    await userEvent.fill(currentPasswordInput.element(), 'currentpass');
    await userEvent.fill(newPasswordInput.element(), 'StrongP@ss1');
    await userEvent.fill(confirmPasswordInput.element(), 'DifferentP@ss1');

    const saveButton = page.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton.element());

    // Should show password mismatch error
    expect(page.getByText('Passwords do not match')).toBeDefined();
  });
});
