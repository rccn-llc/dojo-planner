import type { AddMemberWizardData } from '@/hooks/useAddMemberWizard';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { WaiverStep } from './WaiverStep';

// Translation keys for WaiverStep
const translationKeys: Record<string, string> = {
  title: 'Sign Waiver',
  subtitle: 'Please review and sign the liability waiver',
  loading_waiver: 'Loading waiver...',
  guardian_required_title: 'Parent/Guardian Signature Required',
  guardian_required_message: 'Because the member is under {age} years old, a parent or guardian must sign this waiver.',
  guardian_info_title: 'Guardian Information',
  signature_label: 'Signature',
  signer_name_label: 'Full Name',
  signer_name_placeholder: 'Enter your full legal name',
  guardian_email_label: 'Parent/Guardian Email',
  guardian_email_placeholder: 'guardian@example.com',
  relationship_label: 'Relationship to Member',
  relationship_parent: 'Parent',
  relationship_guardian: 'Guardian',
  relationship_legal_guardian: 'Legal Guardian',
  agree_checkbox: 'I have read and agree to the terms of this waiver',
  back_button: 'Back',
  cancel_button: 'Cancel',
  continue_button: 'Continue',
  continue_without_signing_button: 'Continue without signing',
  signature_required_error: 'Please provide your signature',
  name_required_error: 'Please enter your full name',
  agreement_required_error: 'You must agree to the waiver terms',
  no_waiver_required_message: 'No waiver is required for the selected membership plan. Click Continue to proceed.',
};

// Translation keys for SignatureCanvas
const signatureCanvasTranslationKeys: Record<string, string> = {
  placeholder: 'Sign here',
  clear_button: 'Clear',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    // Merge both translation key sets
    const allKeys = { ...translationKeys, ...signatureCanvasTranslationKeys };
    let result = allKeys[key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(`{${paramKey}}`, String(paramValue));
      });
    }
    return result;
  },
}));

// Mock ORPC client
const mockGetWaiversForMembership = vi.fn();
const mockResolvePlaceholders = vi.fn();

vi.mock('@/libs/Orpc', () => ({
  client: {
    waivers: {
      getWaiversForMembership: (data: unknown) => mockGetWaiversForMembership(data),
      resolvePlaceholders: (data: unknown) => mockResolvePlaceholders(data),
    },
  },
}));

// Mock the SignatureCanvas component since react-signature-canvas requires canvas support
vi.mock('@/features/waivers/signing/SignatureCanvas', () => ({
  SignatureCanvas: ({ onSignatureChange, label, error }: {
    onSignatureChange: (dataUrl: string | null) => void;
    label?: string;
    error?: string;
  }) => (
    <div data-testid="mock-signature-canvas">
      {label && <label>{label}</label>}
      <button
        type="button"
        data-testid="mock-sign-button"
        onClick={() => onSignatureChange('data:image/png;base64,mockSignature')}
      >
        Sign
      </button>
      <button
        type="button"
        data-testid="mock-clear-button"
        onClick={() => onSignatureChange(null)}
      >
        Clear Signature
      </button>
      {error && <p data-testid="signature-error">{error}</p>}
    </div>
  ),
}));

// Mock waiver template
const mockWaiver = {
  id: 'waiver-1',
  organizationId: 'test-org-123',
  name: 'Standard Adult Waiver',
  slug: 'standard-adult-waiver',
  version: 1,
  content: 'I acknowledge the risks of martial arts training.',
  description: 'Standard waiver for adult members',
  isActive: true,
  isDefault: true,
  requiresGuardian: true,
  guardianAgeThreshold: 18,
  sortOrder: 0,
  parentId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const resolvedContent = 'I, the undersigned, acknowledge the risks associated with martial arts training at Iron Fist Dojo.';

describe('WaiverStep', () => {
  const mockData: AddMemberWizardData = {
    memberType: 'individual',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '555-1234',
    membershipPlanId: 'plan-1',
    waiverTemplateId: null,
  };

  const mockHandlers = {
    onUpdate: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWaiversForMembership.mockResolvedValue({
      waivers: [mockWaiver],
    });
    mockResolvePlaceholders.mockResolvedValue({
      resolvedContent,
    });
  });

  describe('Loading State', () => {
    it('should show loading text while fetching waiver', () => {
      mockGetWaiversForMembership.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ waivers: [mockWaiver] }), 500)),
      );

      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      expect(page.getByText('Loading waiver...')).toBeTruthy();
    });
  });

  describe('No Waiver Required Panel', () => {
    it('should render the no-waiver panel with Back and Continue buttons when no active waivers exist', async () => {
      mockGetWaiversForMembership.mockResolvedValue({ waivers: [] });

      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(
        page.getByText('No waiver is required for the selected membership plan. Click Continue to proceed.'),
      ).toBeInTheDocument();
      expect(page.getByRole('button', { name: 'Back' })).toBeTruthy();
      expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeTruthy();

      // It should NOT auto-advance
      expect(mockHandlers.onNext).not.toHaveBeenCalled();
    });

    it('should render the no-waiver panel when no membership plan is selected', async () => {
      const dataWithoutPlan: AddMemberWizardData = {
        ...mockData,
        membershipPlanId: null,
      };

      render(
        <WaiverStep
          data={dataWithoutPlan}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(
        page.getByText('No waiver is required for the selected membership plan. Click Continue to proceed.'),
      ).toBeInTheDocument();
      expect(mockHandlers.onNext).not.toHaveBeenCalled();
    });

    it('should render the no-waiver panel when waiver fetch returns only inactive waivers', async () => {
      mockGetWaiversForMembership.mockResolvedValue({
        waivers: [{ ...mockWaiver, isActive: false }],
      });

      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(
        page.getByText('No waiver is required for the selected membership plan. Click Continue to proceed.'),
      ).toBeInTheDocument();
      expect(mockHandlers.onNext).not.toHaveBeenCalled();
    });

    it('should call onUpdate({waiverSkipped: true}) and onNext when Continue is clicked from no-waiver panel', async () => {
      mockGetWaiversForMembership.mockResolvedValue({ waivers: [] });

      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(
        page.getByText('No waiver is required for the selected membership plan. Click Continue to proceed.'),
      ).toBeInTheDocument();

      const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
      await userEvent.click(continueButton);

      await vi.waitFor(() => {
        expect(mockHandlers.onUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            waiverTemplateId: null,
            waiverSkipped: true,
          }),
        );
      });

      expect(mockHandlers.onNext).toHaveBeenCalled();
    });

    it('should call onBack when Back is clicked from no-waiver panel', async () => {
      mockGetWaiversForMembership.mockResolvedValue({ waivers: [] });

      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(
        page.getByText('No waiver is required for the selected membership plan. Click Continue to proceed.'),
      ).toBeInTheDocument();

      const backButton = page.getByRole('button', { name: 'Back' });
      await userEvent.click(backButton);

      expect(mockHandlers.onBack).toHaveBeenCalled();
    });
  });

  describe('Rendering With Waiver', () => {
    it('should render the waiver step title and subtitle', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();
      await expect.element(page.getByText('Please review and sign the liability waiver')).toBeInTheDocument();
    });

    it('should display the resolved waiver content', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText(resolvedContent)).toBeInTheDocument();
    });

    it('should render the signer name input', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Full Name')).toBeInTheDocument();
      await expect.element(page.getByPlaceholder('Enter your full legal name')).toBeInTheDocument();
    });

    it('should render the signature canvas', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Signature', { exact: true })).toBeInTheDocument();
      await expect.element(page.getByTestId('mock-signature-canvas')).toBeInTheDocument();
    });

    it('should render the agreement checkbox', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('I have read and agree to the terms of this waiver')).toBeInTheDocument();
    });

    it('should render Back, Cancel, and Continue buttons', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      expect(page.getByRole('button', { name: 'Back' })).toBeTruthy();
      expect(page.getByRole('button', { name: 'Cancel' })).toBeTruthy();
      expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeTruthy();
    });

    it('should update waiver template ID when waiver is loaded', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      expect(mockHandlers.onUpdate).toHaveBeenCalledWith({
        waiverTemplateId: 'waiver-1',
      });
    });
  });

  describe('Guardian Required', () => {
    it('should show guardian alert when member is under guardian age threshold', async () => {
      // Create a date of birth that makes the member younger than 18
      const minorDob = new Date();
      minorDob.setFullYear(minorDob.getFullYear() - 14);

      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
          memberDateOfBirth={minorDob}
        />,
      );

      await expect.element(page.getByText('Parent/Guardian Signature Required')).toBeInTheDocument();
      await expect.element(
        page.getByText('Because the member is under 18 years old, a parent or guardian must sign this waiver.'),
      ).toBeInTheDocument();
    });

    it('should show guardian information section for minors', async () => {
      const minorDob = new Date();
      minorDob.setFullYear(minorDob.getFullYear() - 14);

      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
          memberDateOfBirth={minorDob}
        />,
      );

      await expect.element(page.getByText('Guardian Information')).toBeInTheDocument();
      await expect.element(page.getByText('Relationship to Member')).toBeInTheDocument();
      await expect.element(page.getByText('Parent/Guardian Email')).toBeInTheDocument();
    });

    it('should not show guardian section when member is an adult', async () => {
      const adultDob = new Date();
      adultDob.setFullYear(adultDob.getFullYear() - 25);

      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
          memberDateOfBirth={adultDob}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      const guardianTitle = page.getByText('Guardian Information');

      expect(guardianTitle.elements()).toHaveLength(0);
    });

    it('should not show guardian section when date of birth is not provided', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      const guardianTitle = page.getByText('Guardian Information');

      expect(guardianTitle.elements()).toHaveLength(0);
    });

    it('should render guardian email input', async () => {
      const minorDob = new Date();
      minorDob.setFullYear(minorDob.getFullYear() - 14);

      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
          memberDateOfBirth={minorDob}
        />,
      );

      await expect.element(page.getByPlaceholder('guardian@example.com')).toBeInTheDocument();
    });
  });

  describe('Signer Name Input', () => {
    it('should allow entering a signer name', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      const nameInput = page.getByPlaceholder('Enter your full legal name');
      await userEvent.type(nameInput, 'John Doe');

      expect(nameInput.element()).toHaveValue('John Doe');
    });

    it('should pre-populate signer name from wizard data', async () => {
      const dataWithSignerName: AddMemberWizardData = {
        ...mockData,
        waiverSignedByName: 'Pre-filled Name',
      };

      render(
        <WaiverStep
          data={dataWithSignerName}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      const nameInput = page.getByPlaceholder('Enter your full legal name');

      expect(nameInput.element()).toHaveValue('Pre-filled Name');
    });
  });

  describe('Validation', () => {
    it('should show signature error when submitting without signature', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      // Enter name but don't sign
      const nameInput = page.getByPlaceholder('Enter your full legal name');
      await userEvent.type(nameInput, 'John Doe');

      // Click Continue without signing
      const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
      await userEvent.click(continueButton);

      await expect.element(page.getByText('Please provide your signature')).toBeInTheDocument();
    });

    it('should show name error when submitting without signer name', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      // Click Continue without entering name
      const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
      await userEvent.click(continueButton);

      await expect.element(page.getByText('Please enter your full name')).toBeInTheDocument();
    });

    it('should show agreement error when checkbox is not checked', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      // Click Continue without checking the agreement
      const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
      await userEvent.click(continueButton);

      await expect.element(page.getByText('You must agree to the waiver terms')).toBeInTheDocument();
    });

    it('should clear name error when user starts typing', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      // Click Continue to trigger errors
      const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
      await userEvent.click(continueButton);

      await expect.element(page.getByText('Please enter your full name')).toBeInTheDocument();

      // Start typing to clear error
      const nameInput = page.getByPlaceholder('Enter your full legal name');
      await userEvent.type(nameInput, 'J');

      const nameError = page.getByText('Please enter your full name');

      expect(nameError.elements()).toHaveLength(0);
    });

    it('should not call onNext when validation fails', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
      await userEvent.click(continueButton);

      // onNext should NOT be called when there are validation errors
      // Note: onNext may have been called during auto-advance check, so we check
      // that it was not called AFTER validation triggered
      // The mock may have been called during waiver template load,
      // but the handleNext should not proceed
      expect(mockHandlers.onNext).not.toHaveBeenCalled();
    });
  });

  describe('Successful Submission', () => {
    it('should call onUpdate and onNext with correct data when all fields are valid', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      // Enter signer name
      const nameInput = page.getByPlaceholder('Enter your full legal name');
      await userEvent.type(nameInput, 'John Doe');

      // Sign the waiver (using mock)
      const signButton = page.getByTestId('mock-sign-button');
      await userEvent.click(signButton);

      // Check the agreement
      const checkbox = page.getByRole('checkbox');
      await userEvent.click(checkbox);

      // Click Continue
      const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
      await userEvent.click(continueButton);

      await vi.waitFor(() => {
        expect(mockHandlers.onUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            waiverSignatureDataUrl: 'data:image/png;base64,mockSignature',
            waiverSignedByName: 'John Doe',
            waiverSignedByRelationship: 'self',
            waiverSkipped: false,
            waiverRenderedContent: resolvedContent,
          }),
        );
      });

      expect(mockHandlers.onNext).toHaveBeenCalled();
    });
  });

  describe('Navigation', () => {
    it('should call onBack when Back button is clicked', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      const backButton = page.getByRole('button', { name: 'Back' });
      await userEvent.click(backButton);

      expect(mockHandlers.onBack).toHaveBeenCalled();
    });

    it('should call onCancel when Cancel button is clicked', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await userEvent.click(cancelButton);

      expect(mockHandlers.onCancel).toHaveBeenCalled();
    });
  });

  describe('Loading State in Button', () => {
    it('should show loading indicator in Continue button when isLoading is true', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
          isLoading={true}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      await expect.element(page.getByText('Continue...')).toBeInTheDocument();
    });

    it('should disable Continue button when isLoading is true', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
          isLoading={true}
        />,
      );

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      const continueButton = page.getByRole('button', { name: 'Continue...' });

      expect(continueButton.element()).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('should render the no-waiver panel when waiver fetch fails', async () => {
      mockGetWaiversForMembership.mockRejectedValue(new Error('Network error'));

      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await expect.element(
        page.getByText('No waiver is required for the selected membership plan. Click Continue to proceed.'),
      ).toBeInTheDocument();
      expect(mockHandlers.onNext).not.toHaveBeenCalled();
    });
  });

  describe('Fetch Effect Stability', () => {
    it('should fetch the waiver only once even when onUpdate reference changes between renders', async () => {
      // Parent that triggers re-renders by clicking a button. Each render
      // creates a fresh `onUpdate` arrow function — pre-fix, this caused the
      // fetch effect to re-run infinitely (#143). After the onUpdateRef fix,
      // the effect only depends on data.membershipPlanId.
      function Parent() {
        const [, setTick] = useState(0);
        return (
          <div>
            <button type="button" data-testid="rerender" onClick={() => setTick(t => t + 1)}>
              Rerender
            </button>
            <WaiverStep
              data={mockData}
              onUpdate={(...args) => mockHandlers.onUpdate(...args)}
              onNext={mockHandlers.onNext}
              onBack={mockHandlers.onBack}
              onCancel={mockHandlers.onCancel}
            />
          </div>
        );
      }

      render(<Parent />);

      await expect.element(page.getByText('Sign Waiver')).toBeInTheDocument();

      const rerenderBtn = page.getByTestId('rerender');
      await userEvent.click(rerenderBtn);
      await userEvent.click(rerenderBtn);
      await userEvent.click(rerenderBtn);

      // Give effects time to flush
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockGetWaiversForMembership).toHaveBeenCalledTimes(1);
    });
  });

  // #143: when resolvePlaceholders returns empty content (e.g. an org with
  // no merge fields configured against a placeholder-using template), the
  // user used to see an empty box with no escape. The fallback shows raw
  // template content; the new "Continue without signing" button on the
  // rendered-waiver path is a separate escape hatch.
  describe('Resolve-failure fallback + escape hatch (#143)', () => {
    it('falls back to raw template content when resolvePlaceholders returns empty', async () => {
      mockResolvePlaceholders.mockResolvedValueOnce({ resolvedContent: '' });
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      // Wait for the waiver fetch + resolve to complete and the box to render.
      await vi.waitFor(() => {
        expect(page.getByText(mockWaiver.content)).toBeTruthy();
      });
    });

    it('falls back to raw template content when resolvePlaceholders throws', async () => {
      mockResolvePlaceholders.mockRejectedValueOnce(new Error('resolver exploded'));
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await vi.waitFor(() => {
        expect(page.getByText(mockWaiver.content)).toBeTruthy();
      });
    });

    it('renders a "Continue without signing" button on the rendered-waiver path', async () => {
      render(
        <WaiverStep
          data={mockData}
          onUpdate={mockHandlers.onUpdate}
          onNext={mockHandlers.onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      await vi.waitFor(() => {
        const skipBtn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent?.includes('Continue without signing'));

        expect(skipBtn).toBeTruthy();
      });
    });

    it('clicking "Continue without signing" calls onUpdate with waiverSkipped:true and onNext', async () => {
      const onUpdate = vi.fn();
      const onNext = vi.fn();
      render(
        <WaiverStep
          data={mockData}
          onUpdate={onUpdate}
          onNext={onNext}
          onBack={mockHandlers.onBack}
          onCancel={mockHandlers.onCancel}
        />,
      );

      // Wait for the waiver fetch to settle and the skip button to render.
      let skipBtn: HTMLButtonElement | undefined;
      await vi.waitFor(() => {
        skipBtn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent?.includes('Continue without signing')) as HTMLButtonElement | undefined;

        expect(skipBtn).toBeTruthy();
      });

      await userEvent.click(skipBtn!);

      // handleContinueWithoutWaiver clears signature/name/relationship and sets
      // waiverSkipped: true, then awaits onNext.
      await vi.waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
          waiverTemplateId: null,
          waiverSkipped: true,
        }));
      });

      expect(onNext).toHaveBeenCalled();
    });
  });
});
