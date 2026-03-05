import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { Setup2FADialog } from './Setup2FADialog';

const mockCreateTOTP = vi.fn();
const mockVerifyTOTP = vi.fn();

const mockUser = {
  createTOTP: mockCreateTOTP,
  verifyTOTP: mockVerifyTOTP,
  totpEnabled: false,
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
      setup_2fa_title: 'Set Up Two-Factor Authentication',
      scan_qr_instructions: 'Scan this QR code with your authenticator app',
      manual_entry_label: 'Or enter this code manually:',
      verify_code_label: 'Enter the 6-digit code from your authenticator app',
      verify_code_placeholder: '000000',
      verify_button: 'Verify',
      verifying_button: 'Verifying...',
      backup_codes_title: 'Save Your Backup Codes',
      backup_codes_description: 'Store these codes somewhere safe.',
      backup_codes_warning: 'You won\'t be able to see these codes again.',
      copy_all_button: 'Copy All',
      copied_button: 'Copied!',
      done_button: 'Done',
      next_button: 'Next',
      setup_error: 'Failed to set up 2FA.',
      verify_error: 'Invalid code.',
    };
    return translations[key] || key;
  },
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <div data-testid="qr-code">{value}</div>
  ),
}));

describe('Setup2FADialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTOTP.mockResolvedValue({
      uri: 'otpauth://totp/Test?secret=TESTSECRET123',
      secret: 'TESTSECRET123',
      verified: false,
    });
    mockVerifyTOTP.mockResolvedValue({
      verified: true,
      backupCodes: ['code-1', 'code-2', 'code-3', 'code-4'],
    });
  });

  it('should render the dialog title', () => {
    render(<Setup2FADialog {...defaultProps} />);

    expect(page.getByText('Set Up Two-Factor Authentication')).toBeDefined();
  });

  it('should show QR code scan instructions on initial step', () => {
    render(<Setup2FADialog {...defaultProps} />);

    expect(page.getByText('Scan this QR code with your authenticator app')).toBeDefined();
  });

  it('should show Next button on scan step', () => {
    render(<Setup2FADialog {...defaultProps} />);

    expect(page.getByRole('button', { name: /next/i })).toBeDefined();
  });

  it('should navigate to verify step when Next is clicked', async () => {
    render(<Setup2FADialog {...defaultProps} />);

    // Wait for createTOTP to resolve
    await vi.waitFor(() => {
      expect(mockCreateTOTP).toHaveBeenCalled();
    });

    const nextButton = page.getByRole('button', { name: /next/i });
    await userEvent.click(nextButton.element());

    expect(page.getByText('Enter the 6-digit code from your authenticator app')).toBeDefined();
  });

  it('should show Verify button disabled when code is empty', async () => {
    render(<Setup2FADialog {...defaultProps} />);

    await vi.waitFor(() => {
      expect(mockCreateTOTP).toHaveBeenCalled();
    });

    const nextButton = page.getByRole('button', { name: /next/i });
    await userEvent.click(nextButton.element());

    const verifyButton = page.getByRole('button', { name: /verify/i });

    expect(verifyButton.element().hasAttribute('disabled')).toBe(true);
  });

  it('should call verifyTOTP and show backup codes on valid code', async () => {
    render(<Setup2FADialog {...defaultProps} />);

    await vi.waitFor(() => {
      expect(mockCreateTOTP).toHaveBeenCalled();
    });

    const nextButton = page.getByRole('button', { name: /next/i });
    await userEvent.click(nextButton.element());

    const input = page.getByPlaceholder('000000');
    await userEvent.fill(input.element(), '123456');

    const verifyButton = page.getByRole('button', { name: /verify/i });
    await userEvent.click(verifyButton.element());

    await vi.waitFor(() => {
      expect(mockVerifyTOTP).toHaveBeenCalledWith({ code: '123456' });
    });

    expect(page.getByText('code-1')).toBeDefined();
    expect(page.getByText('code-2')).toBeDefined();
  });

  it('should show error on invalid verification code', async () => {
    mockVerifyTOTP.mockRejectedValueOnce(new Error('Invalid code'));
    render(<Setup2FADialog {...defaultProps} />);

    await vi.waitFor(() => {
      expect(mockCreateTOTP).toHaveBeenCalled();
    });

    const nextButton = page.getByRole('button', { name: /next/i });
    await userEvent.click(nextButton.element());

    const input = page.getByPlaceholder('000000');
    await userEvent.fill(input.element(), '000000');

    const verifyButton = page.getByRole('button', { name: /verify/i });
    await userEvent.click(verifyButton.element());

    await vi.waitFor(() => {
      expect(page.getByText('Invalid code.')).toBeDefined();
    });
  });

  it('should call onSuccess and close on Done click', async () => {
    render(<Setup2FADialog {...defaultProps} />);

    await vi.waitFor(() => {
      expect(mockCreateTOTP).toHaveBeenCalled();
    });

    // Navigate to verify step
    await userEvent.click(page.getByRole('button', { name: /next/i }).element());

    // Enter code and verify
    await userEvent.fill(page.getByPlaceholder('000000').element(), '123456');
    await userEvent.click(page.getByRole('button', { name: /verify/i }).element());

    await vi.waitFor(() => {
      expect(page.getByText('code-1')).toBeDefined();
    });

    // Click Done
    await userEvent.click(page.getByRole('button', { name: /done/i }).element());

    expect(defaultProps.onSuccess).toHaveBeenCalled();
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should show setup error when createTOTP fails', async () => {
    mockCreateTOTP.mockRejectedValueOnce(new Error('Failed'));
    render(<Setup2FADialog {...defaultProps} />);

    await vi.waitFor(() => {
      expect(page.getByText('Failed to set up 2FA.')).toBeDefined();
    });
  });

  it('should not render when closed', () => {
    render(<Setup2FADialog {...defaultProps} open={false} />);

    expect(page.getByText('Set Up Two-Factor Authentication').elements().length).toBe(0);
  });
});
