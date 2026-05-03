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
    render(<FamilyPaymentStep {...baseProps} />);

    await expect.element(page.getByTestId('family-payment-try-again-button')).not.toBeInTheDocument();
  });

  it('renders when paymentStatus is declined', async () => {
    render(<FamilyPaymentStep {...declinedProps()} />);

    await expect.element(page.getByTestId('family-payment-try-again-button')).toBeInTheDocument();
  });

  it('clicking it clears decline state without calling onNextAction', async () => {
    const onUpdateAction = vi.fn();
    const onNextAction = vi.fn();
    render(<FamilyPaymentStep {...declinedProps({ onUpdateAction, onNextAction })} />);

    await userEvent.click(page.getByTestId('family-payment-try-again-button'));

    expect(onUpdateAction).toHaveBeenCalledWith({
      paymentStatus: undefined,
      paymentDeclineReason: undefined,
      paymentProcessed: false,
    });
    expect(onNextAction).not.toHaveBeenCalled();
  });
});
