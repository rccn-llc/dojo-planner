import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MembershipPaymentDetailsCard } from './MembershipPaymentDetailsCard';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Payments and Fees',
  edit_button: 'Edit',
  signup_fee_label: 'Sign-up Fee',
  charge_signup_fee_label: 'Charge Sign-up Fee',
  charge_at_registration: 'At time of registration',
  charge_first_payment: 'With first payment',
  monthly_fee_label: 'Monthly Fee',
  weekly_fee_label: 'Weekly Fee',
  semi_annual_fee_label: 'Semi-Annual Fee',
  annual_fee_label: 'Annual Fee',
  one_time_fee_label: 'One-Time Price',
  payment_frequency_label: 'Payment Frequency',
  frequency_monthly: 'Monthly',
  frequency_weekly: 'Weekly',
  frequency_semi_annually: 'Every 6 Months',
  frequency_annually: 'Annually',
  frequency_one_time: 'One-time',
  prorate_label: 'Pro-rate First Payment',
  prorate_yes: 'Yes',
  prorate_no: 'No',
  free: 'Free',
  no_fee: 'No fee',
  fees_section_title: 'Cancellation and Hold Fees',
  cancellation_fee_label: 'Cancellation Fee',
  hold_fee_label: 'Hold Fee',
  no_hold_fee: 'No hold fee',
  hold_fee_frequency_one_time: 'One-time',
  hold_fee_frequency_weekly: 'Weekly',
  hold_fee_frequency_monthly: 'Monthly',
  hold_fee_frequency_semi_annually: 'Every 6 Months',
  hold_fee_frequency_annually: 'Annually',
  hold_limit_label: 'Hold Limit',
  hold_limit_value: '{count} holds per year',
  no_holds: 'No limit',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    let result = translationKeys[key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(`{${paramKey}}`, String(paramValue));
      });
    }
    return result;
  },
}));

describe('MembershipPaymentDetailsCard', () => {
  const mockOnEdit = vi.fn();

  const defaultProps = {
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
    onEdit: mockOnEdit,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the card with title', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} />);

    const heading = page.getByText('Payments and Fees');

    expect(heading).toBeTruthy();
  });

  it('should render the Cancellation and Hold Fees section', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} cancellationFee={50} holdFeeAmount={25} holdFeeFrequency="monthly" holdLimitPerYear={2} />);

    expect(page.getByText('Cancellation and Hold Fees')).toBeTruthy();
    expect(page.getByText('Cancellation Fee')).toBeTruthy();
    expect(page.getByText('Hold Fee')).toBeTruthy();
    expect(page.getByText('Hold Limit')).toBeTruthy();
  });

  it('should NOT render fees section for punchcards', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} isPunchcard={true} />);

    const sectionLabels = Array.from(document.querySelectorAll('h3')).filter(
      el => el.textContent === 'Cancellation and Hold Fees',
    );

    expect(sectionLabels.length).toBe(0);
  });

  it('should render Edit button', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} />);

    const editButton = page.getByRole('button');

    expect(editButton).toBeTruthy();
  });

  it('should call onEdit when Edit button is clicked', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} />);

    const editButton = page.getByRole('button');
    await userEvent.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledTimes(1);
  });

  it('should render sign-up fee for standard membership', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} />);

    const signUpFeeLabel = page.getByText('Sign-up Fee');
    const signUpFeeValue = page.getByText('$35.00');

    expect(signUpFeeLabel).toBeTruthy();
    expect(signUpFeeValue).toBeTruthy();
  });

  it('should not render sign-up fee for trial membership', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} isTrial={true} />);

    const signUpFeeLabel = document.body.textContent?.includes('Sign-up Fee');

    expect(signUpFeeLabel).toBe(false);
  });

  it('should render monthly fee with Monthly Fee label', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} />);

    const monthlyFeeLabel = page.getByText('Monthly Fee');
    const monthlyFeeValue = page.getByText('$150.00');

    expect(monthlyFeeLabel).toBeTruthy();
    expect(monthlyFeeValue).toBeTruthy();
  });

  it('should render Weekly Fee label for weekly frequency', async () => {
    await render(
      <MembershipPaymentDetailsCard
        {...defaultProps}
        paymentFrequency="weekly"
      />,
    );

    const weeklyFeeLabel = page.getByText('Weekly Fee');

    expect(weeklyFeeLabel).toBeTruthy();
  });

  it('should render Annual Fee label for annual frequency', async () => {
    await render(
      <MembershipPaymentDetailsCard
        {...defaultProps}
        paymentFrequency="annually"
      />,
    );

    const annualFeeLabel = page.getByText('Annual Fee');

    expect(annualFeeLabel).toBeTruthy();
  });

  it('should render payment frequency', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} />);

    const frequencyLabel = page.getByText('Payment Frequency');
    const frequencyValue = page.getByText('Monthly');

    expect(frequencyLabel).toBeTruthy();
    expect(frequencyValue).toBeTruthy();
  });

  it('should render pro-rate first payment as Yes when enabled', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} />);

    const prorateLabel = page.getByText('Pro-rate First Payment');
    const prorateValue = page.getByText('Yes');

    expect(prorateLabel).toBeTruthy();
    expect(prorateValue).toBeTruthy();
  });

  it('should render pro-rate first payment as No when disabled', async () => {
    await render(
      <MembershipPaymentDetailsCard
        {...defaultProps}
        proRateFirstPayment={false}
      />,
    );

    const prorateValue = page.getByText('No');

    expect(prorateValue).toBeTruthy();
  });

  it('should not render pro-rate for trial membership', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} isTrial={true} />);

    const prorateLabel = document.body.textContent?.includes('Pro-rate First Payment');

    expect(prorateLabel).toBe(false);
  });

  it('should render Free for null monthly fee', async () => {
    await render(
      <MembershipPaymentDetailsCard
        {...defaultProps}
        monthlyFee={null}
      />,
    );

    const freeValue = page.getByText('Free');

    expect(freeValue).toBeTruthy();
  });

  it('should render Free for zero monthly fee', async () => {
    await render(
      <MembershipPaymentDetailsCard
        {...defaultProps}
        monthlyFee={0}
      />,
    );

    const freeValue = page.getByText('Free');

    expect(freeValue).toBeTruthy();
  });

  it('should render charge at registration label when applicable', async () => {
    await render(<MembershipPaymentDetailsCard {...defaultProps} />);

    const chargeLabel = page.getByText('Charge Sign-up Fee');
    const chargeValue = page.getByText('At time of registration');

    expect(chargeLabel).toBeTruthy();
    expect(chargeValue).toBeTruthy();
  });

  it('should render with first payment option', async () => {
    await render(
      <MembershipPaymentDetailsCard
        {...defaultProps}
        chargeSignUpFee="first-payment"
      />,
    );

    const chargeValue = page.getByText('With first payment');

    expect(chargeValue).toBeTruthy();
  });
});
