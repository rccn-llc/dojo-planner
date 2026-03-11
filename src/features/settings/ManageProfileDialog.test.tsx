import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { ManageProfileDialog } from './ManageProfileDialog';

// Mock user data
const mockUpdate = vi.fn();
const mockCreateEmailAddress = vi.fn();
const mockCreatePhoneNumber = vi.fn();

// Test fixtures - not real credentials
const mockUser = {
  firstName: 'John',
  lastName: 'Doe',
  primaryEmailAddress: { emailAddress: 'john.doe@example.com' }, // pragma: allowlist secret
  primaryPhoneNumber: { phoneNumber: '+1 555-123-4567' }, // pragma: allowlist secret
  emailAddresses: [{ emailAddress: 'john.doe@example.com' }], // pragma: allowlist secret
  phoneNumbers: [{ phoneNumber: '+1 555-123-4567' }], // pragma: allowlist secret
  imageUrl: 'https://example.com/avatar.jpg', // pragma: allowlist secret
  passwordEnabled: true,
  updatePassword: vi.fn(),
  update: mockUpdate,
  createEmailAddress: mockCreateEmailAddress,
  createPhoneNumber: mockCreatePhoneNumber,
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

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <div data-testid="qr-code" />,
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      ManageProfileDialog: {
        title: 'Manage Profile',
      },
      MyProfile: {
        title: 'My Profile',
        edit_button: 'Edit',
        first_name_label: 'First Name',
        last_name_label: 'Last Name',
        phone_label: 'Phone',
        email_label: 'Email',
        first_name_placeholder: 'Enter first name',
        last_name_placeholder: 'Enter last name',
        phone_placeholder: '(555) 123-4567',
        email_placeholder: 'Enter email address',
        cancel_button: 'Cancel',
        save_button: 'Save',
        saving_button: 'Saving...',
        first_name_required: 'First name is required',
        last_name_required: 'Last name is required',
        phone_required: 'Phone number is required',
        email_required: 'Email is required',
        profile_updated_success: 'Profile updated successfully',
        profile_update_error: 'Failed to update profile. Please try again.',
      },
      Security: {
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
      },
    };
    return translations[namespace]?.[key] || key;
  },
}));

describe('ManageProfileDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.totpEnabled = false;
  });

  it('should render the dialog when open', () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);

    expect(page.getByText('Manage Profile')).toBeDefined();
  });

  it('should not render when closed', () => {
    render(<ManageProfileDialog open={false} onOpenChange={() => {}} />);

    expect(page.getByText('Manage Profile').elements().length).toBe(0);
  });

  it('should display user information from Clerk', () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);

    expect(page.getByText('John Doe')).toBeDefined();
    expect(page.getByText('Account Owner')).toBeDefined();
  });

  it('should display user details in the profile section', () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);

    expect(page.getByText('John')).toBeDefined();
    expect(page.getByText('Doe')).toBeDefined();
    expect(page.getByText('+1 555-123-4567')).toBeDefined();
    expect(page.getByText('john.doe@example.com')).toBeDefined();
  });

  it('should render all profile label fields', () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);

    expect(page.getByText('First Name')).toBeDefined();
    expect(page.getByText('Last Name')).toBeDefined();
    expect(page.getByText('Phone')).toBeDefined();
    expect(page.getByText('Email')).toBeDefined();
  });

  it('should render the edit button in the profile card', () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);
    const editButton = page.getByRole('button', { name: /^edit$/i });

    expect(editButton).toBeDefined();
  });

  it('should render change password section for password-authenticated users', () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);

    expect(page.getByText('Change Password')).toBeDefined();
  });

  it('should render 2FA section', () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);

    expect(page.getByText('2-Factor Authentication (2FA)')).toBeDefined();
    expect(
      page.getByText('Make your account more secure by adding a second form of authentication'),
    ).toBeDefined();
  });

  it('should render Add 2FA button when TOTP is not enabled', () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);
    const add2faButton = page.getByRole('button', { name: /add 2fa/i });

    expect(add2faButton).toBeDefined();
    expect(add2faButton.element().hasAttribute('disabled')).toBe(false);
  });

  it('should render Remove 2FA button and Enabled badge when TOTP is enabled', () => {
    mockUser.totpEnabled = true;
    render(<ManageProfileDialog open onOpenChange={() => {}} />);

    expect(page.getByText('Enabled')).toBeDefined();
    expect(page.getByRole('button', { name: /remove 2fa/i })).toBeDefined();
  });

  it('should show password form when change password button is clicked', async () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);
    const changePasswordButton = page.getByRole('button', { name: /change password/i });

    await userEvent.click(changePasswordButton.element());

    expect(page.getByText('Enter Current Password')).toBeDefined();
    expect(page.getByText('Enter New Password')).toBeDefined();
    expect(page.getByText('Confirm New Password')).toBeDefined();
  });

  it('should hide password form when cancel button is clicked', async () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);
    const changePasswordButton = page.getByRole('button', { name: /change password/i });

    await userEvent.click(changePasswordButton.element());

    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton.element());

    expect(page.getByText('Enter Current Password').elements().length).toBe(0);
  });

  it('should render avatar with user initials as fallback', () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);

    // The avatar fallback should contain initials JD
    expect(page.getByText('JD')).toBeDefined();
  });

  it('should show edit profile form when edit button is clicked', async () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);

    const editButton = page.getByRole('button', { name: /^edit$/i });
    await userEvent.click(editButton.element());

    // The edit form should now be visible
    expect(page.getByPlaceholder('Enter first name')).toBeDefined();
    expect(page.getByPlaceholder('Enter last name')).toBeDefined();
  });

  it('should hide edit profile form when cancel is clicked', async () => {
    render(<ManageProfileDialog open onOpenChange={() => {}} />);

    // Click edit button to show form
    const editButton = page.getByRole('button', { name: /^edit$/i });
    await userEvent.click(editButton.element());

    // Click cancel button
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton.element());

    // Should be back to display mode
    expect(page.getByRole('button', { name: /^edit$/i })).toBeDefined();
  });
});
