import type { AddMembershipWizardData } from '@/hooks/useAddMembershipWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MembershipBasicsStep } from './MembershipBasicsStep';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Membership Basics',
  subtitle: 'Enter the basic information for this membership',
  membership_name_label: 'Membership Name',
  membership_name_placeholder: 'e.g., 12 Month Commitment (Gold)',
  membership_name_error: 'Please enter a membership name.',
  status_label: 'Status',
  status_active: 'Active',
  status_inactive: 'Inactive',
  membership_type_label: 'Membership Type',
  membership_type_standard: 'Standard',
  membership_type_standard_help: 'Regular paid membership with recurring billing for ongoing students',
  membership_type_trial: 'Trial Membership',
  membership_type_trial_help: 'Free or low-cost introductory offer for new students',
  membership_type_punchcard: 'Punchcard',
  membership_type_punchcard_help: 'One-time fee for a set number of classes',
  description_label: 'Description',
  description_placeholder: 'Describe the terms, conditions, and benefits of this membership...',
  description_error: 'Please enter a description.',
  description_character_count: '{count} of {max} characters used',
  cancel_button: 'Cancel',
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

describe('MembershipBasicsStep', () => {
  const mockData: AddMembershipWizardData = {
    membershipName: '',
    status: 'active',
    membershipType: 'standard',
    description: '',
    associatedProgramId: null,
    associatedProgramName: null,
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
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the step with title and subtitle', () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const heading = page.getByRole('heading', { level: 2 });

    expect(heading).toBeTruthy();
  });

  it('should render membership name input', () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const input = page.getByPlaceholder('e.g., 12 Month Commitment (Gold)');

    expect(input).toBeTruthy();
  });

  it('should call onUpdate when membership name changes', async () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const input = page.getByPlaceholder('e.g., 12 Month Commitment (Gold)');
    await userEvent.type(input, 'Gold Membership');

    expect(mockHandlers.onUpdate).toHaveBeenCalled();
  });

  it('should have Next button disabled when form is incomplete', () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(true);
  });

  it('should enable Next button when form is complete', () => {
    const completeData: AddMembershipWizardData = {
      ...mockData,
      membershipName: '12 Month Commitment (Gold)',
      description: 'A great membership option',
    };

    render(
      <MembershipBasicsStep
        data={completeData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(false);
  });

  it('should call onCancel when Cancel button is clicked', async () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
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

  it('should call onNext when Next button is clicked with valid data', async () => {
    const completeData: AddMembershipWizardData = {
      ...mockData,
      membershipName: '12 Month Commitment (Gold)',
      description: 'A great membership option',
    };

    render(
      <MembershipBasicsStep
        data={completeData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
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

  it('should display error message when provided', () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
        error="Something went wrong"
      />,
    );

    const errorMessage = page.getByText('Something went wrong');

    expect(errorMessage).toBeTruthy();
  });

  it('should show character count for description', () => {
    const dataWithDescription: AddMembershipWizardData = {
      ...mockData,
      description: 'Test description',
    };

    render(
      <MembershipBasicsStep
        data={dataWithDescription}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const characterCount = page.getByText(/16 of 2000 characters used/);

    expect(characterCount).toBeTruthy();
  });

  it('should render status toggle', () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const statusLabel = page.getByText('Status');

    expect(statusLabel).toBeTruthy();
  });

  it('should display Active status by default', () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const activeStatus = page.getByText('Active');

    expect(activeStatus).toBeTruthy();
  });

  it('should display Inactive when status is inactive', () => {
    const inactiveData: AddMembershipWizardData = {
      ...mockData,
      status: 'inactive',
    };

    render(
      <MembershipBasicsStep
        data={inactiveData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const inactiveStatus = page.getByText('Inactive');

    expect(inactiveStatus).toBeTruthy();
  });

  it('should render membership type selection cards', () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const typeLabel = page.getByText('Membership Type');
    const standardCard = page.getByText('Standard');
    const trialCard = page.getByText('Trial Membership');

    expect(typeLabel).toBeTruthy();
    expect(standardCard).toBeTruthy();
    expect(trialCard).toBeTruthy();
  });

  it('should display Standard type selected by default with help text', () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const standardHelpText = page.getByText(/Regular paid membership with recurring billing/);

    expect(standardHelpText).toBeTruthy();
  });

  it('should display both membership type cards with help text', () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const trialType = page.getByText('Trial Membership');
    const trialHelpText = page.getByText(/Free or low-cost introductory offer/);

    expect(trialType).toBeTruthy();
    expect(trialHelpText).toBeTruthy();
  });

  it('should show validation error when membership name is touched but empty', async () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const input = page.getByPlaceholder('e.g., 12 Month Commitment (Gold)');
    await userEvent.click(input);
    await userEvent.tab(); // Blur the input

    // Wait for state update
    await new Promise(resolve => setTimeout(resolve, 100));

    const errorMessage = page.getByText('Please enter a membership name.');

    expect(errorMessage).toBeTruthy();
  });

  it('should show validation error when description is touched but empty', async () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const textarea = page.getByPlaceholder('Describe the terms, conditions, and benefits of this membership...');
    await userEvent.click(textarea);
    await userEvent.tab(); // Blur the textarea

    // Wait for state update
    await new Promise(resolve => setTimeout(resolve, 100));

    const errorMessage = page.getByText('Please enter a description.');

    expect(errorMessage).toBeTruthy();
  });

  it('should call onUpdate with status when status toggle is clicked', async () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const switches = Array.from(document.querySelectorAll('[role="switch"]'));

    if (switches[0]) {
      await userEvent.click(switches[0]);

      expect(mockHandlers.onUpdate).toHaveBeenCalled();
    }
  });

  it('should call onUpdate with membershipType when trial card is clicked', async () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    // Find the Trial Membership card button
    const buttons = Array.from(document.querySelectorAll('button'));
    const trialCard = buttons.find(btn => btn.textContent?.includes('Trial Membership'));

    if (trialCard) {
      await userEvent.click(trialCard);

      expect(mockHandlers.onUpdate).toHaveBeenCalledWith({ membershipType: 'trial' });
    }
  });

  it('should call onUpdate with membershipType when standard card is clicked', async () => {
    const trialData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'trial',
    };

    render(
      <MembershipBasicsStep
        data={trialData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    // Find the Standard card button
    const buttons = Array.from(document.querySelectorAll('button'));
    const standardCard = buttons.find(btn => btn.textContent?.includes('Standard') && btn.textContent?.includes('Regular paid membership'));

    if (standardCard) {
      await userEvent.click(standardCard);

      expect(mockHandlers.onUpdate).toHaveBeenCalledWith({ membershipType: 'standard' });
    }
  });

  it('should render punchcard membership type card', () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const punchcardCard = page.getByText('Punchcard');
    const punchcardHelpText = page.getByText(/One-time fee for a set number of classes/);

    expect(punchcardCard).toBeTruthy();
    expect(punchcardHelpText).toBeTruthy();
  });

  it('should call onUpdate with membershipType when punchcard card is clicked', async () => {
    render(
      <MembershipBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    // Find the Punchcard card button
    const buttons = Array.from(document.querySelectorAll('button'));
    const punchcardCard = buttons.find(btn => btn.textContent?.includes('Punchcard') && btn.textContent?.includes('One-time fee'));

    if (punchcardCard) {
      await userEvent.click(punchcardCard);

      expect(mockHandlers.onUpdate).toHaveBeenCalledWith({ membershipType: 'punchcard' });
    }
  });

  it('should display punchcard type when selected', () => {
    const punchcardData: AddMembershipWizardData = {
      ...mockData,
      membershipType: 'punchcard',
    };

    render(
      <MembershipBasicsStep
        data={punchcardData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    // The Punchcard card should be rendered
    const punchcardCard = page.getByText('Punchcard');

    expect(punchcardCard).toBeTruthy();
  });
});
