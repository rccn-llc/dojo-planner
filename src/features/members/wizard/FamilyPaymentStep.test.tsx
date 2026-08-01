import type { AddMemberWizardData } from '@/hooks/useAddMemberWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { FamilyPaymentStep } from './FamilyPaymentStep';

// Cover both the FamilyPaymentStep and PaymentStep namespaces — keys are looked
// up under both via two `useTranslations` instances.
const translationKeys: Record<string, string> = {
  // FamilyPaymentStep
  title: 'Confirm Family Member Billing',
  subtitle_with_card: 'Pay with HOH card on file',
  subtitle_no_card: 'Enter payment details',
  summary_label: 'Billing Summary',
  member_label: 'Member',
  plan_label: 'Plan',
  amount_label: 'Amount',
  hoh_label: 'Head of Household',
  payment_method_label: 'Payment Method',
  payment_method_value: '{type} ending in {last4}',
  billing_notice: 'HOH will be billed.',
  no_card_notice: 'No card on file. Enter card.',
  back_button: 'Back',
  cancel_button: 'Cancel',
  confirm_button: 'Confirm & Add Member',
  processing_button: 'Processing...',
  // PaymentStep namespace (read via tPayment)
  membership_label: 'Membership',
  signup_fee_label: 'Sign-up fee',
  total_due_today_label: 'Total due today',
  card_tab_label: 'Debit / Credit Card',
  ach_tab_label: 'ACH Bank Account',
  cardholder_name_label: 'Name on card',
  cardholder_name_placeholder: 'Full name',
  card_number_label: 'Card number',
  card_number_placeholder: '1234 5678 9012 3456',
  card_expiry_label: 'Expiration MM/YY',
  card_expiry_placeholder: 'MM/YY',
  card_cvc_label: 'CVC/CVV',
  card_cvc_placeholder: '123',
  ach_account_holder_label: 'Account holder name',
  ach_account_holder_placeholder: 'Full name',
  ach_account_type_label: 'Account type',
  ach_account_type_placeholder: 'Select account type',
  ach_account_type_checking: 'Checking',
  ach_account_type_savings: 'Savings',
  ach_routing_number_label: 'Routing number',
  ach_routing_number_placeholder: '021000021',
  ach_account_number_label: 'Account number',
  ach_account_number_placeholder: '123456789',
  card_number_iframe_loading: 'Loading…',
  card_number_iframe_error: 'Failed to load.',
  payment_declined_title: 'Payment Declined',
  payment_declined_continue_message: 'You can still continue.',
  decline_reason_card_declined: 'The card was declined.',
  decline_reason_generic: 'Payment failed.',
  continue_without_payment_button: 'Add Member Anyway',
  try_again_button: 'Try Again',
  trial_title: 'Free Trial — No Payment Today',
  trial_disclaimer: 'No payment will be collected today. Your trial period is {duration}. Your academy will follow up before any charges.',
  continue_button: 'Continue',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    let result = translationKeys[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(`{${k}}`, String(v));
      });
    }
    return result;
  },
}));

// Mock useTokenExIframe — inactive by default (no iframe).
const mockTokenize = vi.fn();
const mockIframeReturn = {
  isLoaded: false,
  isValid: false,
  isCvvValid: false,
  error: null as string | null,
  tokenize: mockTokenize,
};
vi.mock('@/hooks/useTokenExIframe', () => ({
  useTokenExIframe: () => mockIframeReturn,
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

const baseData: AddMemberWizardData = {
  memberType: 'family-member',
  firstName: 'Family',
  lastName: 'Member',
  email: 'fam@example.com',
  phone: '555-0001',
  membershipPlanId: 'plan-1',
  membershipPlanPrice: 100,
  membershipPlanName: 'Adult Monthly',
  membershipPlanFrequency: 'Monthly',
  hohMemberName: 'Head Honcho',
  hohHasPaymentMethod: true,
  hohPaymentMethodLast4: '4242',
  hohPaymentMethodType: 'card',
  paymentMethod: 'card',
  waiverTemplateId: null,
};

const baseProps = {
  data: baseData,
  onUpdateAction: vi.fn(),
  onNextAction: vi.fn(),
  onBackAction: vi.fn(),
  onCancelAction: vi.fn(),
  isLoading: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIframeReturn.isLoaded = false;
  mockIframeReturn.isValid = false;
  mockIframeReturn.isCvvValid = false;
});

describe('FamilyPaymentStep — Try Again button (#131)', () => {
  function declinedProps(overrides: Partial<typeof baseProps> = {}) {
    return {
      ...baseProps,
      ...overrides,
      data: {
        ...baseData,
        paymentStatus: 'declined' as const,
        paymentDeclineReason: 'card_declined' as const,
        paymentProcessed: true,
        ...overrides.data,
      },
    };
  }

  it('does not render when paymentStatus is undefined', async () => {
    await render(<FamilyPaymentStep {...baseProps} />);

    await expect.element(page.getByTestId('family-payment-try-again-button')).not.toBeInTheDocument();
  });

  it('renders when paymentStatus is declined', async () => {
    await render(<FamilyPaymentStep {...declinedProps()} />);

    await expect.element(page.getByTestId('family-payment-try-again-button')).toBeInTheDocument();
  });

  it('clicking it clears decline state without calling onNextAction', async () => {
    const onUpdateAction = vi.fn();
    const onNextAction = vi.fn();
    await render(<FamilyPaymentStep {...declinedProps({ onUpdateAction, onNextAction })} />);

    await userEvent.click(page.getByTestId('family-payment-try-again-button'));

    expect(onUpdateAction).toHaveBeenCalledWith({
      paymentStatus: undefined,
      paymentDeclineReason: undefined,
      paymentProcessed: false,
    });
    expect(onNextAction).not.toHaveBeenCalled();
  });
});

// Free-trial plans (#129/#135/#139) skip card collection in the family flow
// too — a HOH-with-card path also defers to the trial disclaimer because no
// charge happens today.
describe('FamilyPaymentStep — Free trial mode (#129/#135/#139)', () => {
  const trialData: AddMemberWizardData = {
    ...baseData,
    membershipPlanPrice: 0,
    membershipPlanIsTrial: true,
    membershipPlanContractLength: '7 Days',
    membershipPlanFrequency: 'None',
    hohHasPaymentMethod: false,
  };

  it('renders the trial disclaimer in place of the billing summary', async () => {
    await render(<FamilyPaymentStep {...baseProps} data={trialData} />);

    expect(page.getByText('Free Trial — No Payment Today')).toBeTruthy();
    expect(page.getByText(/Your trial period is 7 Days/)).toBeTruthy();
    expect(document.querySelector('label[for="familyCardholderName"]')).toBeNull();
  });

  it('enables the Continue button with no card data and no HOH card', async () => {
    await render(<FamilyPaymentStep {...baseProps} data={trialData} />);

    const continueButton = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent === 'Continue') as HTMLButtonElement;

    expect(continueButton).toBeTruthy();
    expect(continueButton?.disabled).toBe(false);
  });

  it('renders disclaimer even when HOH has a card on file (no charge today)', async () => {
    const trialWithHohCard = { ...trialData, hohHasPaymentMethod: true };
    await render(<FamilyPaymentStep {...baseProps} data={trialWithHohCard} />);

    expect(page.getByText('Free Trial — No Payment Today')).toBeTruthy();
    // No "HOH will be billed" notice on a trial.
    expect(document.body.textContent).not.toContain('HOH will be billed');
  });

  it('still renders the billing summary when membershipPlanIsTrial is false', async () => {
    await render(<FamilyPaymentStep {...baseProps} />);

    expect(page.getByText('Billing Summary')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Signup-fee breakdown — when `membershipPlanSignupFee > 0` the single
// "Amount" row in the summary is replaced by three rows: Membership,
// Sign-up fee, Total due today.
// ─────────────────────────────────────────────────────────────────────────

describe('FamilyPaymentStep — signup fee breakdown', () => {
  it('itemizes membership and signup fee when signupFee > 0', async () => {
    const dataWithFee: AddMemberWizardData = {
      ...baseData,
      membershipPlanPrice: 149,
      membershipPlanSignupFee: 99,
      membershipPlanName: '12 Month Commitment (Gold)',
    };
    await render(<FamilyPaymentStep {...baseProps} data={dataWithFee} />);

    // Three breakdown rows replace the single "Amount" row
    expect(page.getByText('Membership').first()).toBeTruthy();
    expect(page.getByText('Sign-up fee').first()).toBeTruthy();
    expect(page.getByText('Total due today')).toBeTruthy();
    // The original "Amount" label should NOT be shown when the breakdown is active
    expect(document.body.textContent).not.toContain('Amount');
    // The summary numbers should reflect $149 recurring + $99 fee = $248 total
    expect(document.body.textContent).toContain('$149');
    expect(document.body.textContent).toContain('$99');
    expect(document.body.textContent).toContain('$248');
  });

  it('falls back to the single "Amount" row when signupFee is 0', async () => {
    const dataNoFee: AddMemberWizardData = {
      ...baseData,
      membershipPlanPrice: 149,
      membershipPlanSignupFee: 0,
    };
    await render(<FamilyPaymentStep {...baseProps} data={dataNoFee} />);

    expect(page.getByText('Amount')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Total due today');
  });
});
