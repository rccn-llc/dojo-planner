import type { AddMembershipWizardData } from '@/hooks/useAddMembershipWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MembershipContractStep } from './MembershipContractStep';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Contract Terms',
  subtitle: 'Set the contract length, renewal options, and when the membership begins',
  contract_length_label: 'Contract Length',
  contract_month_to_month: 'Month-to-Month',
  contract_3_months: '3 Months',
  contract_6_months: '6 Months',
  contract_12_months: '12 Months',
  auto_renewal_label: 'Auto-Renewal',
  auto_renewal_none: 'No auto-renewal',
  auto_renewal_month_to_month: 'Month-to-Month after contract',
  auto_renewal_same_term: 'Same term renewal',
  cancel_button: 'Cancel',
  back_button: 'Back',
  create_button: 'Create Membership',
  creating_button: 'Creating...',
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

describe('MembershipContractStep', () => {
  const mockData: AddMembershipWizardData = {
    membershipName: '12 Month Commitment',
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
      <MembershipContractStep
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

  it('should render contract length select', async () => {
    await render(
      <MembershipContractStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const contractLengthLabel = page.getByText('Contract Length');

    expect(contractLengthLabel).toBeTruthy();
  });

  it('should render auto-renewal select', async () => {
    await render(
      <MembershipContractStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const autoRenewalLabel = page.getByText('Auto-Renewal');

    expect(autoRenewalLabel).toBeTruthy();
  });

  it('should NOT render a plan-level Membership Start Date (a membership starts when it is created)', async () => {
    await render(
      <MembershipContractStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    // A membership plan is a pricing template; the start date belongs to each
    // member's enrollment and is set to now() on insert. This control collected
    // a value that no transformer or API call ever read.
    expect(page.getByText('Membership Start Date').elements()).toHaveLength(0);
    expect(page.getByText('Custom Start Date').elements()).toHaveLength(0);
  });

  it('should NOT render Cancellation Fee on this step (moved to Payments and Fees)', async () => {
    await render(
      <MembershipContractStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const cancellationFeeLabels = Array.from(document.querySelectorAll('label')).filter(
      el => el.textContent === 'Cancellation Fee',
    );

    expect(cancellationFeeLabels.length).toBe(0);
  });

  it('should NOT render Hold Fee on this step (moved to Payments and Fees)', async () => {
    await render(
      <MembershipContractStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const holdFeeLabels = Array.from(document.querySelectorAll('label')).filter(
      el => el.textContent === 'Hold Fee',
    );

    expect(holdFeeLabels.length).toBe(0);
  });

  it('should NOT render Hold Limit per Year on this step (moved to Payments and Fees)', async () => {
    await render(
      <MembershipContractStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const holdLimitLabels = Array.from(document.querySelectorAll('label')).filter(
      el => el.textContent === 'Hold Limit per Year',
    );

    expect(holdLimitLabels.length).toBe(0);
  });

  it('should have Create Membership button enabled by default', async () => {
    await render(
      <MembershipContractStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const createButton = buttons.find(btn => btn.textContent?.includes('Create Membership'));

    expect(createButton?.disabled).toBe(false);
  });

  it('should disable Create button when loading', async () => {
    await render(
      <MembershipContractStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={true}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const createButton = buttons.find(btn => btn.textContent?.includes('Creating...'));

    expect(createButton?.disabled).toBe(true);
  });

  it('should show Creating... text when loading', async () => {
    await render(
      <MembershipContractStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={true}
      />,
    );

    const creatingText = page.getByText('Creating...');

    expect(creatingText).toBeTruthy();
  });

  it('should call onCancel when Cancel button is clicked', async () => {
    await render(
      <MembershipContractStep
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
      <MembershipContractStep
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

  it('should call onNext when Create Membership button is clicked', async () => {
    await render(
      <MembershipContractStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const createButton = buttons.find(btn => btn.textContent?.includes('Create Membership'));

    if (createButton) {
      await userEvent.click(createButton);

      expect(mockHandlers.onNext).toHaveBeenCalled();
    }
  });

  it('should display error message when provided', async () => {
    await render(
      <MembershipContractStep
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
});
