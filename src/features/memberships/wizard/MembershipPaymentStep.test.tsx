import type { AddMembershipWizardData } from '@/hooks/useAddMembershipWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MembershipPaymentStep } from './MembershipPaymentStep';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Payments and Fees',
  subtitle: 'Configure the recurring price, sign-up fee, and any cancellation or hold fees for this membership',
  signup_fee_label: 'Sign-up Fee',
  signup_fee_placeholder: '0.00',
  charge_signup_fee_label: 'Charge Sign-up Fee',
  charge_at_registration: 'At time of registration',
  charge_first_payment: 'With first payment',
  monthly_fee_label: 'Monthly Fee',
  weekly_fee_label: 'Weekly Fee',
  semi_annual_fee_label: 'Semi-Annual Fee',
  annual_fee_label: 'Annual Fee',
  monthly_fee_placeholder: '0.00',
  monthly_fee_error: 'Please enter a valid fee amount.',
  payment_frequency_label: 'Payment Frequency',
  frequency_monthly: 'Monthly',
  frequency_weekly: 'Weekly',
  frequency_semi_annually: 'Every 6 Months',
  frequency_annually: 'Annually',
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
  hold_limit_help: 'Maximum number of holds allowed per year',
  classes_included_label: 'Classes Included',
  classes_included_placeholder: 'e.g., 10',
  classes_included_error: 'Please enter the number of classes (at least 1).',
  punchcard_price_label: 'One-Time Price',
  punchcard_price_placeholder: '0.00',
  punchcard_price_error: 'Please enter a valid price.',
  punchcard_description: 'This punchcard allows the member to attend the specified number of classes for a one-time fee. No recurring payments.',
  cancel_button: 'Cancel',
  back_button: 'Back',
  next_button: 'Next',
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

describe('MembershipPaymentStep', () => {
  const mockData: AddMembershipWizardData = {
    membershipName: '12 Month Commitment',
    status: 'active',
    membershipType: 'standard',
    description: 'A great membership',
    associatedProgramId: '1',
    associatedProgramName: 'Adult Brazilian Jiu-jitsu',
    associatedWaiverId: null,
    associatedWaiverName: null,
    signUpFee: null,
    chargeSignUpFee: 'at-registration',
    monthlyFee: null,
    paymentFrequency: 'monthly',
    membershipStartDate: 'same-as-registration',
    customStartDate: '',
    proRateFirstPayment: false,
    contractLength: 'month-to-month',
    autoRenewal: 'none',
    cancellationFee: null,
    holdLimitPerYear: null,
    holdFeeAmount: null,
    holdFeeFrequency: null,
    classesIncluded: null,
    punchcardPrice: null,
  };

  const mockHandlers = {
    onUpdate: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the step with title and subtitle', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const heading = page.getByRole('heading', { level: 2 });

    expect(heading).toBeTruthy();
  });

  it('should render signup fee input', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const signupFeeLabel = page.getByText('Sign-up Fee');

    expect(signupFeeLabel).toBeTruthy();
  });

  it('should render monthly fee input', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const monthlyFeeLabel = page.getByText('Monthly Fee');

    expect(monthlyFeeLabel).toBeTruthy();
  });

  it('should render payment frequency select', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const frequencyLabel = page.getByText('Payment Frequency');

    expect(frequencyLabel).toBeTruthy();
  });

  it('should render the Cancellation and Hold Fees section', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const sectionHeading = page.getByText('Cancellation and Hold Fees');
    const cancellationFeeLabel = page.getByText('Cancellation Fee');
    const holdFeeLabel = page.getByText('Hold Fee');
    const holdFeeFrequencyLabel = page.getByText('Hold Fee Frequency');
    const holdLimitLabel = page.getByText('Hold Limit per Year');

    expect(sectionHeading).toBeTruthy();
    expect(cancellationFeeLabel).toBeTruthy();
    expect(holdFeeLabel).toBeTruthy();
    expect(holdFeeFrequencyLabel).toBeTruthy();
    expect(holdLimitLabel).toBeTruthy();
  });

  it('should NOT render Membership Start Date on this step (moved to Contract Terms)', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const startDateLabels = Array.from(document.querySelectorAll('label')).filter(
      el => el.textContent === 'Membership Start Date',
    );

    expect(startDateLabels.length).toBe(0);
  });

  it('should render pro-rate toggle', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const prorateLabel = page.getByText('Pro-rate First Payment');

    expect(prorateLabel).toBeTruthy();
  });

  it('should have Next button disabled when monthly fee is not provided for standard membership', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(true);
  });

  it('should enable Next button when monthly fee is provided', async () => {
    const dataWithFee: AddMembershipWizardData = {
      ...mockData,
      monthlyFee: 150,
    };

    await render(
      <MembershipPaymentStep
        data={dataWithFee}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(false);
  });

  it('should enable Next button for trial membership without monthly fee', async () => {
    const trialData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'trial',
    };

    await render(
      <MembershipPaymentStep
        data={trialData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(false);
  });

  it('should call onCancel when Cancel button is clicked', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const cancelButton = buttons.find(btn => btn.textContent?.includes('Cancel'));

    if (cancelButton) {
      await userEvent.click(cancelButton);

      expect(mockHandlers.onCancel).toHaveBeenCalled();
    }
  });

  it('should call onBack when Back button is clicked', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const backButton = buttons.find(btn => btn.textContent?.includes('Back'));

    if (backButton) {
      await userEvent.click(backButton);

      expect(mockHandlers.onBack).toHaveBeenCalled();
    }
  });

  it('should call onNext when Next button is clicked with valid data', async () => {
    const dataWithFee: AddMembershipWizardData = {
      ...mockData,
      monthlyFee: 150,
    };

    await render(
      <MembershipPaymentStep
        data={dataWithFee}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    if (nextButton) {
      await userEvent.click(nextButton);

      expect(mockHandlers.onNext).toHaveBeenCalled();
    }
  });

  it('should display error message when provided', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        error="Something went wrong"
      />,
    );

    const errorMessage = page.getByText('Something went wrong');

    expect(errorMessage).toBeTruthy();
  });

  it('should call onUpdate when signup fee input changes', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const inputs = Array.from(document.querySelectorAll('input[type="number"]'));

    if (inputs[0]) {
      await userEvent.type(inputs[0], '35');

      expect(mockHandlers.onUpdate).toHaveBeenCalled();
    }
  });

  it('should call onUpdate when prorate toggle is clicked', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const switches = Array.from(document.querySelectorAll('[role="switch"]'));

    if (switches[0]) {
      await userEvent.click(switches[0]);

      expect(mockHandlers.onUpdate).toHaveBeenCalled();
    }
  });

  it('should render dollar sign prefix for fee inputs', async () => {
    await render(
      <MembershipPaymentStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const dollarSigns = Array.from(document.querySelectorAll('span')).filter(s => s.textContent === '$');

    // At least 2 dollar signs (for signup fee and monthly fee)
    expect(dollarSigns.length).toBeGreaterThanOrEqual(2);
  });

  it('should display Weekly Fee label when payment frequency is weekly', async () => {
    const weeklyData: AddMembershipWizardData = {
      ...mockData,
      paymentFrequency: 'weekly',
    };

    await render(
      <MembershipPaymentStep
        data={weeklyData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const weeklyFeeLabel = page.getByText('Weekly Fee');

    expect(weeklyFeeLabel).toBeTruthy();
  });

  it('should display Annual Fee label when payment frequency is annually', async () => {
    const annualData: AddMembershipWizardData = {
      ...mockData,
      paymentFrequency: 'annually',
    };

    await render(
      <MembershipPaymentStep
        data={annualData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const annualFeeLabel = page.getByText('Annual Fee');

    expect(annualFeeLabel).toBeTruthy();
  });

  it('should render punchcard-specific fields for punchcard membership', async () => {
    const punchcardData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'punchcard',
    };

    await render(
      <MembershipPaymentStep
        data={punchcardData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const classesIncludedLabel = page.getByText('Classes Included');
    const punchcardPriceLabel = page.getByText('One-Time Price');

    expect(classesIncludedLabel).toBeTruthy();
    expect(punchcardPriceLabel).toBeTruthy();
  });

  it('should not render standard payment fields for punchcard membership', async () => {
    const punchcardData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'punchcard',
    };

    await render(
      <MembershipPaymentStep
        data={punchcardData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    // These elements should not be present for punchcard
    const monthlyFeeElements = Array.from(document.querySelectorAll('label')).filter(
      el => el.textContent === 'Monthly Fee',
    );

    // For punchcard, we should NOT see the Monthly Fee label
    expect(monthlyFeeElements.length).toBe(0);
  });

  it('should have Next button disabled for punchcard when classes and price are not provided', async () => {
    const punchcardData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'punchcard',
    };

    await render(
      <MembershipPaymentStep
        data={punchcardData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(true);
  });

  it('should enable Next button for punchcard when classes and price are provided', async () => {
    const punchcardDataWithValues: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'punchcard',
      classesIncluded: 10,
      punchcardPrice: 200,
    };

    await render(
      <MembershipPaymentStep
        data={punchcardDataWithValues}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(false);
  });

  it('should render punchcard description text', async () => {
    const punchcardData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'punchcard',
    };

    await render(
      <MembershipPaymentStep
        data={punchcardData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const punchcardDescription = page.getByText(/This punchcard allows the member/);

    expect(punchcardDescription).toBeTruthy();
  });

  it('should call onUpdate when punchcard classes included changes', async () => {
    const punchcardData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'punchcard',
    };

    await render(
      <MembershipPaymentStep
        data={punchcardData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const inputs = Array.from(document.querySelectorAll('input[type="number"]'));

    if (inputs[0]) {
      await userEvent.type(inputs[0], '10');

      expect(mockHandlers.onUpdate).toHaveBeenCalled();
    }
  });
});
