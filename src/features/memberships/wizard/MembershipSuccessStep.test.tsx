import type { AddMembershipWizardData } from '@/hooks/useAddMembershipWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MembershipSuccessStep } from './MembershipSuccessStep';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Membership Created!',
  description: '"{name}" has been successfully created and added to your membership plans.',
  summary_title: 'Membership Summary',
  summary_name: 'Name',
  summary_status: 'Status',
  summary_type: 'Type',
  summary_monthly_fee: 'Monthly Fee',
  summary_signup_fee: 'Sign-up Fee',
  summary_frequency: 'Payment Frequency',
  summary_contract: 'Contract Length',
  summary_associated_program: 'Associated Program',
  summary_associated_waiver: 'Associated Waiver',
  summary_cancellation_fee: 'Cancellation Fee',
  summary_hold_limit: 'Hold Limit',
  summary_classes_included: 'Classes Included',
  summary_punchcard_price: 'One-Time Price',
  classes_label: 'classes',
  price_free: 'Free',
  status_active: 'Active',
  status_inactive: 'Inactive',
  type_standard: 'Standard',
  type_trial: 'Trial',
  type_punchcard: 'Punchcard',
  frequency_monthly: 'Monthly',
  frequency_weekly: 'Weekly',
  frequency_annually: 'Annually',
  contract_month_to_month: 'Month-to-Month',
  contract_3_months: '3 Months',
  contract_6_months: '6 Months',
  contract_12_months: '12 Months',
  no_program: 'No program assigned',
  no_waiver: 'No waiver assigned',
  per_year: 'per year',
  done_button: 'Done',
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

describe('MembershipSuccessStep', () => {
  const mockData: AddMembershipWizardData = {
    membershipName: '12 Month Commitment (Gold)',
    status: 'active',
    membershipType: 'standard',
    description: 'A great membership',
    associatedProgramId: '1',
    associatedProgramName: 'Adult Brazilian Jiu-jitsu',
    associatedWaiverId: null,
    associatedWaiverName: null,
    signUpFee: 35,
    chargeSignUpFee: 'at-registration',
    monthlyFee: 150,
    paymentFrequency: 'monthly',
    membershipStartDate: 'same-as-registration',
    customStartDate: '',
    proRateFirstPayment: false,
    contractLength: '12-months',
    autoRenewal: 'month-to-month',
    cancellationFee: 300,
    holdLimitPerYear: 2,
    holdFeeAmount: null,
    holdFeeFrequency: null,
    classesIncluded: null,
    punchcardPrice: null,
  };

  const mockOnDone = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render success title', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const title = page.getByRole('heading', { level: 2 });

    expect(title).toBeTruthy();
  });

  it('should display membership name in description', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const description = page.getByText(/"12 Month Commitment \(Gold\)" has been successfully created/);

    expect(description).toBeTruthy();
  });

  it('should display success checkmark icon', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const svg = document.querySelector('svg');

    expect(svg).toBeTruthy();
    expect(svg?.classList.contains('text-green-600')).toBe(true);
  });

  it('should display membership summary section', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const summaryTitle = page.getByText('Membership Summary');

    expect(summaryTitle).toBeTruthy();
  });

  it('should display membership name in summary', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const membershipName = page.getByText('12 Month Commitment (Gold)');

    expect(membershipName).toBeTruthy();
  });

  it('should display status in summary', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const status = page.getByText('Active');

    expect(status).toBeTruthy();
  });

  it('should display type in summary', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const type = page.getByText('Standard');

    expect(type).toBeTruthy();
  });

  it('should display monthly fee in summary', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const fee = page.getByText('$150.00');

    expect(fee).toBeTruthy();
  });

  it('should display signup fee in summary', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const signupFee = page.getByText('$35.00');

    expect(signupFee).toBeTruthy();
  });

  it('should display payment frequency in summary', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const frequency = page.getByText('Monthly');

    expect(frequency).toBeTruthy();
  });

  it('should display contract length in summary', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const contract = page.getByText('12 Months');

    expect(contract).toBeTruthy();
  });

  it('should display associated program in summary', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const program = page.getByText('Adult Brazilian Jiu-jitsu');

    expect(program).toBeTruthy();
  });

  it('should display no program message when no program is associated', () => {
    const noProgramData: AddMembershipWizardData = {
      ...mockData,
      associatedProgramId: null,
      associatedProgramName: null,
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={noProgramData} onDone={mockOnDone} />);

    const noProgram = page.getByText('No program assigned');

    expect(noProgram).toBeTruthy();
  });

  it('should display cancellation fee in summary', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const cancellationFee = page.getByText('$300.00');

    expect(cancellationFee).toBeTruthy();
  });

  it('should display hold limit in summary', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const holdLimit = page.getByText(/2/);

    expect(holdLimit).toBeTruthy();
  });

  it('should display Done button', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const doneButton = page.getByRole('button', { name: 'Done' });

    expect(doneButton).toBeTruthy();
  });

  it('should call onDone when Done button is clicked', async () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const doneButton = page.getByRole('button', { name: 'Done' });
    await userEvent.click(doneButton.element());

    expect(mockOnDone).toHaveBeenCalled();
  });

  it('should display waiver summary row', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const waiverLabel = page.getByText('Associated Waiver');

    expect(waiverLabel).toBeTruthy();
  });

  it('should display no waiver message when waiver is not assigned', () => {
    render(<MembershipSuccessStep data={mockData} onDone={mockOnDone} />);

    const noWaiver = page.getByText('No waiver assigned');

    expect(noWaiver).toBeTruthy();
  });

  it('should display waiver name when waiver is assigned', () => {
    const dataWithWaiver: AddMembershipWizardData = {
      ...mockData,
      associatedWaiverId: 'waiver-1',
      associatedWaiverName: 'Standard Adult Waiver (v1)',
    };

    render(<MembershipSuccessStep data={dataWithWaiver} onDone={mockOnDone} />);

    const waiverName = page.getByText('Standard Adult Waiver (v1)');

    expect(waiverName).toBeTruthy();
  });

  it('should display Free when monthly fee is 0', () => {
    const freeData: AddMembershipWizardData = {
      ...mockData,
      monthlyFee: 0,
      signUpFee: 0,
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={freeData} onDone={mockOnDone} />);

    const free = page.getByText('Free');

    expect(free).toBeTruthy();
  });

  it('should display Free when monthly fee is null', () => {
    const nullFeeData: AddMembershipWizardData = {
      ...mockData,
      monthlyFee: null,
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={nullFeeData} onDone={mockOnDone} />);

    const free = page.getByText('Free');

    expect(free).toBeTruthy();
  });

  it('should display Trial type for trial memberships', () => {
    const trialData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'trial',
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={trialData} onDone={mockOnDone} />);

    const type = page.getByText('Trial');

    expect(type).toBeTruthy();
  });

  it('should display Inactive status when inactive', () => {
    const inactiveData: AddMembershipWizardData = {
      ...mockData,
      status: 'inactive',
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={inactiveData} onDone={mockOnDone} />);

    const status = page.getByText('Inactive');

    expect(status).toBeTruthy();
  });

  it('should not display signup fee when 0', () => {
    const noSignupFeeData: AddMembershipWizardData = {
      ...mockData,
      signUpFee: 0,
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={noSignupFeeData} onDone={mockOnDone} />);

    // Sign-up Fee label should not appear when fee is 0
    const signupFeeLabels = Array.from(document.querySelectorAll('span')).filter(
      s => s.textContent === 'Sign-up Fee',
    );

    expect(signupFeeLabels.length).toBe(0);
  });

  it('should not display cancellation fee when 0', () => {
    const noCancellationFeeData: AddMembershipWizardData = {
      ...mockData,
      cancellationFee: 0,
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={noCancellationFeeData} onDone={mockOnDone} />);

    // Cancellation Fee label should not appear when fee is 0
    const cancellationFeeLabels = Array.from(document.querySelectorAll('span')).filter(
      s => s.textContent === 'Cancellation Fee',
    );

    expect(cancellationFeeLabels.length).toBe(0);
  });

  it('should not display hold limit when 0', () => {
    const noHoldLimitData: AddMembershipWizardData = {
      ...mockData,
      holdLimitPerYear: 0,
      holdFeeAmount: null,
      holdFeeFrequency: null,
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={noHoldLimitData} onDone={mockOnDone} />);

    // Hold Limit label should not appear when limit is 0
    const holdLimitLabels = Array.from(document.querySelectorAll('span')).filter(
      s => s.textContent === 'Hold Limit',
    );

    expect(holdLimitLabels.length).toBe(0);
  });

  it('should display weekly frequency', () => {
    const weeklyData: AddMembershipWizardData = {
      ...mockData,
      paymentFrequency: 'weekly',
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={weeklyData} onDone={mockOnDone} />);

    const frequency = page.getByText('Weekly');

    expect(frequency).toBeTruthy();
  });

  it('should display annually frequency', () => {
    const annuallyData: AddMembershipWizardData = {
      ...mockData,
      paymentFrequency: 'annually',
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={annuallyData} onDone={mockOnDone} />);

    const frequency = page.getByText('Annually');

    expect(frequency).toBeTruthy();
  });

  it('should display Month-to-Month contract', () => {
    const monthToMonthData: AddMembershipWizardData = {
      ...mockData,
      contractLength: 'month-to-month',
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={monthToMonthData} onDone={mockOnDone} />);

    const contract = page.getByText('Month-to-Month');

    expect(contract).toBeTruthy();
  });

  it('should display 3 Months contract', () => {
    const threeMonthsData: AddMembershipWizardData = {
      ...mockData,
      contractLength: '3-months',
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={threeMonthsData} onDone={mockOnDone} />);

    const contract = page.getByText('3 Months');

    expect(contract).toBeTruthy();
  });

  it('should display 6 Months contract', () => {
    const sixMonthsData: AddMembershipWizardData = {
      ...mockData,
      contractLength: '6-months',
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={sixMonthsData} onDone={mockOnDone} />);

    const contract = page.getByText('6 Months');

    expect(contract).toBeTruthy();
  });

  it('should display Punchcard type for punchcard memberships', () => {
    const punchcardData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'punchcard',
      classesIncluded: 10,
      punchcardPrice: 200,
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={punchcardData} onDone={mockOnDone} />);

    const type = page.getByText('Punchcard');

    expect(type).toBeTruthy();
  });

  it('should display classes included for punchcard memberships', () => {
    const punchcardData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'punchcard',
      classesIncluded: 10,
      punchcardPrice: 200,
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={punchcardData} onDone={mockOnDone} />);

    const classesLabel = page.getByText('Classes Included');
    const classesValue = page.getByText(/10/);

    expect(classesLabel).toBeTruthy();
    expect(classesValue).toBeTruthy();
  });

  it('should display punchcard price for punchcard memberships', () => {
    const punchcardData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'punchcard',
      classesIncluded: 10,
      punchcardPrice: 200,
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={punchcardData} onDone={mockOnDone} />);

    const priceLabel = page.getByText('One-Time Price');
    const priceValue = page.getByText('$200.00');

    expect(priceLabel).toBeTruthy();
    expect(priceValue).toBeTruthy();
  });

  it('should not display standard payment fields for punchcard memberships', () => {
    const punchcardData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'punchcard',
      classesIncluded: 10,
      punchcardPrice: 200,
      associatedWaiverId: null,
      associatedWaiverName: null,
    };

    render(<MembershipSuccessStep data={punchcardData} onDone={mockOnDone} />);

    // Monthly Fee and Contract Length should not be present for punchcard
    const monthlyFeeLabels = Array.from(document.querySelectorAll('span')).filter(
      s => s.textContent === 'Monthly Fee',
    );
    const contractLabels = Array.from(document.querySelectorAll('span')).filter(
      s => s.textContent === 'Contract Length',
    );

    expect(monthlyFeeLabels.length).toBe(0);
    expect(contractLabels.length).toBe(0);
  });
});
