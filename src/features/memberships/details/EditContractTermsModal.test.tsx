import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditContractTermsModal } from './EditContractTermsModal';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Edit Contract Terms',
  contract_length_label: 'Contract Length',
  contract_month_to_month: 'Month-to-Month',
  contract_3_months: '3 Months',
  contract_6_months: '6 Months',
  contract_12_months: '12 Months',
  auto_renewal_label: 'Auto-Renewal',
  renewal_none: 'No auto-renewal',
  renewal_month_to_month: 'Month-to-Month after contract',
  renewal_same_term: 'Same term renewal',
  cancel_button: 'Cancel',
  save_button: 'Save Changes',
  saving_button: 'Saving...',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translationKeys[key] || key,
}));

describe('EditContractTermsModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    contractLength: '12-months' as const,
    autoRenewal: 'month-to-month' as const,
    onSave: mockOnSave,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the modal with title when open', () => {
    render(<EditContractTermsModal {...defaultProps} />);

    const heading = page.getByText('Edit Contract Terms');

    expect(heading).toBeTruthy();
  });

  it('should not render when isOpen is false', () => {
    render(<EditContractTermsModal {...defaultProps} isOpen={false} />);

    const heading = document.body.textContent?.includes('Edit Contract Terms');

    expect(heading).toBe(false);
  });

  it('should render contract length label', () => {
    render(<EditContractTermsModal {...defaultProps} />);

    const contractLengthLabel = page.getByText('Contract Length');

    expect(contractLengthLabel).toBeTruthy();
  });

  it('should render auto-renewal label', () => {
    render(<EditContractTermsModal {...defaultProps} />);

    const autoRenewalLabel = page.getByText('Auto-Renewal');

    expect(autoRenewalLabel).toBeTruthy();
  });

  it('should NOT render Cancellation Fee (moved to Edit Payments and Fees)', () => {
    render(<EditContractTermsModal {...defaultProps} />);

    const cancellationFeeLabels = Array.from(document.querySelectorAll('label')).filter(
      el => el.textContent === 'Cancellation Fee',
    );

    expect(cancellationFeeLabels.length).toBe(0);
  });

  it('should NOT render Hold Limit per Year (moved to Edit Payments and Fees)', () => {
    render(<EditContractTermsModal {...defaultProps} />);

    const holdLimitLabels = Array.from(document.querySelectorAll('label')).filter(
      el => el.textContent === 'Hold Limit per Year',
    );

    expect(holdLimitLabels.length).toBe(0);
  });

  it('should render Cancel button', () => {
    render(<EditContractTermsModal {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');

    expect(cancelButton).toBeTruthy();
  });

  it('should render Save Changes button', () => {
    render(<EditContractTermsModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');

    expect(saveButton).toBeTruthy();
  });

  it('should call onClose when Cancel button is clicked', async () => {
    render(<EditContractTermsModal {...defaultProps} />);

    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should have Save button enabled', () => {
    render(<EditContractTermsModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should NOT render any dollar-sign fee inputs (all moved to Edit Payments and Fees)', () => {
    render(<EditContractTermsModal {...defaultProps} />);

    const dollarSigns = Array.from(document.querySelectorAll('span')).filter(s => s.textContent === '$');

    expect(dollarSigns.length).toBe(0);
  });
});
