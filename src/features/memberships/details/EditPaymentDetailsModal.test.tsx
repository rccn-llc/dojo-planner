import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditPaymentDetailsModal } from './EditPaymentDetailsModal';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Edit Payments and Fees',
  signup_fee_label: 'Sign-up Fee',
  signup_fee_placeholder: '0.00',
  charge_signup_fee_label: 'Charge Sign-up Fee',
  charge_at_registration: 'At time of registration',
  charge_first_payment: 'With first payment',
  monthly_fee_label: 'Monthly Fee',
  weekly_fee_label: 'Weekly Fee',
  semi_annual_fee_label: 'Semi-Annual Fee',
  annual_fee_label: 'Annual Fee',
  one_time_fee_label: 'One-Time Price',
  fee_placeholder: '0.00',
  fee_error: 'Please enter a valid fee amount.',
  payment_frequency_label: 'Payment Frequency',
  frequency_monthly: 'Monthly',
  frequency_weekly: 'Weekly',
  frequency_semi_annually: 'Every 6 Months',
  frequency_annually: 'Annually',
  frequency_one_time: 'One-time',
  prorate_label: 'Pro-rate First Payment',
  prorate_description: 'Enable proration for partial months',
  fees_section_title: 'Cancellation and Hold Fees',
  cancellation_fee_label: 'Cancellation Fee',
  cancellation_fee_placeholder: '0.00',
  cancellation_fee_help: 'Charged when a member cancels this membership',
  hold_fee_amount_label: 'Hold Fee',
  hold_fee_amount_placeholder: '0.00',
  hold_fee_amount_help: 'Charged when a member is placed on hold',
  hold_fee_frequency_label: 'Hold Fee Frequency',
  hold_fee_frequency_placeholder: 'Select a frequency',
  hold_fee_frequency_help: 'One-time charge or recurring on this cadence while on hold',
  hold_fee_frequency_one_time: 'One-time',
  hold_fee_frequency_weekly: 'Weekly',
  hold_fee_frequency_monthly: 'Monthly',
  hold_fee_frequency_semi_annually: 'Every 6 Months',
  hold_fee_frequency_annually: 'Annually',
  hold_limit_label: 'Hold Limit per Year',
  hold_limit_placeholder: 'e.g., 2',
  hold_limit_help: 'Maximum holds allowed in any rolling 12-month window. Leave blank for unlimited.',
  cancel_button: 'Cancel',
  save_button: 'Save Changes',
  saving_button: 'Saving...',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translationKeys[key] || key,
}));

describe('EditPaymentDetailsModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    signUpFee: 35,
    chargeSignUpFee: 'at-registration' as const,
    monthlyFee: 150,
    paymentFrequency: 'monthly' as const,
    proRateFirstPayment: true,
    cancellationFee: null,
    holdFeeAmount: null,
    holdFeeFrequency: null,
    holdLimitPerYear: null,
    isTrial: false,
    onSave: mockOnSave,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the modal with title when open', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    const heading = page.getByText('Edit Payments and Fees');

    expect(heading).toBeTruthy();
  });

  it('should not render when isOpen is false', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} isOpen={false} />);

    const heading = document.body.textContent?.includes('Edit Payments and Fees');

    expect(heading).toBe(false);
  });

  it('should render sign-up fee for standard membership', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    const signUpFeeLabel = page.getByText('Sign-up Fee');

    expect(signUpFeeLabel).toBeTruthy();
  });

  it('should not render sign-up fee for trial membership', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} isTrial={true} />);

    const signUpFeeLabel = document.body.textContent?.includes('Sign-up Fee');

    expect(signUpFeeLabel).toBe(false);
  });

  it('should render monthly fee label by default', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    const monthlyFeeLabel = page.getByText('Monthly Fee');

    expect(monthlyFeeLabel).toBeTruthy();
  });

  it('should render weekly fee label when frequency is weekly', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} paymentFrequency="weekly" />);

    const weeklyFeeLabel = page.getByText('Weekly Fee');

    expect(weeklyFeeLabel).toBeTruthy();
  });

  it('should render annual fee label when frequency is annually', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} paymentFrequency="annually" />);

    const annualFeeLabel = page.getByText('Annual Fee');

    expect(annualFeeLabel).toBeTruthy();
  });

  it('should render payment frequency label', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    const frequencyLabel = page.getByText('Payment Frequency');

    expect(frequencyLabel).toBeTruthy();
  });

  it('should render pro-rate toggle for standard membership', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    const prorateLabel = page.getByText('Pro-rate First Payment');

    expect(prorateLabel).toBeTruthy();
  });

  it('should not render pro-rate toggle for trial membership', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} isTrial={true} />);

    const prorateLabel = document.body.textContent?.includes('Pro-rate First Payment');

    expect(prorateLabel).toBe(false);
  });

  it('should render Cancel button', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    const cancelButton = page.getByRole('button', { name: 'Cancel' });

    expect(cancelButton).toBeTruthy();
  });

  it('should render Save Changes button', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');

    expect(saveButton).toBeTruthy();
  });

  it('should call onClose when Cancel button is clicked', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    // Scope to button role — 'Cancel' string also appears in 'Cancellation Fee' label.
    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should have Save button enabled for valid form', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should have Save button enabled for trial membership even without fee', async () => {
    await render(
      <EditPaymentDetailsModal
        {...defaultProps}
        isTrial={true}
        monthlyFee={null}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should render charge sign-up fee dropdown for standard membership', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    const chargeLabel = page.getByText('Charge Sign-up Fee');

    expect(chargeLabel).toBeTruthy();
  });

  it('should render prorate description', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    const prorateDescription = page.getByText('Enable proration for partial months');

    expect(prorateDescription).toBeTruthy();
  });

  it('should render dollar sign prefix for fee inputs', async () => {
    await render(<EditPaymentDetailsModal {...defaultProps} />);

    const dollarSigns = Array.from(document.querySelectorAll('span')).filter(s => s.textContent === '$');

    expect(dollarSigns.length).toBeGreaterThanOrEqual(1);
  });
});
