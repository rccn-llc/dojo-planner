import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { Disable2FADialog } from './Disable2FADialog';

const mockDisableTOTP = vi.fn();

const mockUser = {
  disableTOTP: mockDisableTOTP,
  totpEnabled: true,
  reload: vi.fn(),
};

vi.mock('@/libs/Logger', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: mockUser, isLoaded: true }),
  useReverification: (fn: () => unknown) => fn,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      disable_2fa_title: 'Remove Two-Factor Authentication',
      disable_2fa_confirm: 'Are you sure you want to remove two-factor authentication?',
      disable_2fa_button: 'Remove 2FA',
      disable_2fa_confirming: 'Removing...',
      cancel_button: 'Cancel',
      disable_error: 'Failed to remove 2FA.',
    };
    return translations[key] || key;
  },
}));

describe('Disable2FADialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDisableTOTP.mockResolvedValue({ object: 'totp', deleted: true });
  });

  it('should render the dialog title', async () => {
    await render(<Disable2FADialog {...defaultProps} />);

    expect(page.getByText('Remove Two-Factor Authentication')).toBeDefined();
  });

  it('should render the confirmation message', async () => {
    await render(<Disable2FADialog {...defaultProps} />);

    expect(page.getByText('Are you sure you want to remove two-factor authentication?')).toBeDefined();
  });

  it('should render Cancel and Remove buttons', async () => {
    await render(<Disable2FADialog {...defaultProps} />);

    expect(page.getByRole('button', { name: /cancel/i })).toBeDefined();
    expect(page.getByRole('button', { name: /remove 2fa/i })).toBeDefined();
  });

  it('should call disableTOTP and onSuccess when confirmed', async () => {
    await render(<Disable2FADialog {...defaultProps} />);

    const removeButton = page.getByRole('button', { name: /remove 2fa/i });
    await userEvent.click(removeButton.element());

    await vi.waitFor(() => {
      expect(mockDisableTOTP).toHaveBeenCalled();
    });

    expect(defaultProps.onSuccess).toHaveBeenCalled();
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should show error when disableTOTP fails', async () => {
    mockDisableTOTP.mockRejectedValueOnce(new Error('Failed'));
    await render(<Disable2FADialog {...defaultProps} />);

    const removeButton = page.getByRole('button', { name: /remove 2fa/i });
    await userEvent.click(removeButton.element());

    await vi.waitFor(() => {
      expect(page.getByText('Failed to remove 2FA.')).toBeDefined();
    });
  });

  it('should not render when closed', async () => {
    await render(<Disable2FADialog {...defaultProps} open={false} />);

    expect(page.getByText('Remove Two-Factor Authentication').elements().length).toBe(0);
  });
});
