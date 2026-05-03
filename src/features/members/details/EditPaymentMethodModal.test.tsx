import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditPaymentMethodModal } from './EditPaymentMethodModal';

// Use the AddMemberWizard.PaymentStep namespace for shared field labels and
// EditPaymentMethodModal for the modal-specific keys. The component reads
// from both namespaces — provide both via the same mock.
const translationKeys: Record<string, string> = {
  // EditPaymentMethodModal namespace
  title: 'Edit payment method',
  save_button: 'Save',
  saving_button: 'Saving...',
  cancel_button: 'Cancel',
  save_error: 'Failed to save payment method.',
  card_iframe_unavailable: 'Tokenization not available.',
  // AddMemberWizard.PaymentStep namespace
  card_tab_label: 'Card',
  ach_tab_label: 'ACH',
  cardholder_name_label: 'Cardholder Name',
  cardholder_name_placeholder: 'Full name',
  card_number_label: 'Card Number',
  card_number_iframe_loading: 'Loading...',
  card_number_iframe_error: 'iframe error',
  card_expiry_label: 'Expiry',
  card_expiry_placeholder: 'MM/YY',
  card_cvc_label: 'CVC',
  ach_account_holder_label: 'Account Holder',
  ach_account_holder_placeholder: 'Full name',
  ach_account_type_label: 'Account Type',
  ach_account_type_checking: 'Checking',
  ach_account_type_savings: 'Savings',
  ach_routing_number_label: 'Routing Number',
  ach_routing_number_placeholder: '021000021',
  ach_account_number_label: 'Account Number',
  ach_account_number_placeholder: '12345',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translationKeys[key] ?? key,
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

const mockTokenize = vi.fn();
const mockIframe = {
  isLoaded: false,
  isValid: false,
  isCvvValid: false,
  error: null as string | null,
  tokenize: mockTokenize,
};

vi.mock('@/hooks/useTokenExIframe', () => ({
  useTokenExIframe: () => mockIframe,
}));

const mockGetTokenizationConfig = vi.fn();
const mockRegisterPaymentMethod = vi.fn();

vi.mock('@/libs/Orpc', () => ({
  client: {
    payment: {
      getTokenizationConfig: (input: unknown) => mockGetTokenizationConfig(input),
      registerPaymentMethod: (input: unknown) => mockRegisterPaymentMethod(input),
    },
  },
}));

const baseProps = {
  isOpen: true,
  onCloseAction: vi.fn(),
  memberId: 'member-1',
  memberEmail: 'jane@example.com',
  memberFirstName: 'Jane',
  memberLastName: 'Doe',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default to no IQPro config so the iframe-fallback branch is exercised
  // (less mock setup needed for typical render tests).
  mockGetTokenizationConfig.mockResolvedValue(null);
  mockRegisterPaymentMethod.mockResolvedValue({ success: true, paymentMethodId: 'pm-1' });
});

describe('EditPaymentMethodModal', () => {
  it('does not render when isOpen is false', () => {
    render(<EditPaymentMethodModal {...baseProps} isOpen={false} />);

    expect(document.body.textContent).not.toContain('Edit payment method');
  });

  it('renders the title and tab buttons when open', () => {
    render(<EditPaymentMethodModal {...baseProps} />);

    expect(page.getByText('Edit payment method')).toBeTruthy();

    const cardButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Card');
    const achButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'ACH');

    expect(cardButton).toBeTruthy();
    expect(achButton).toBeTruthy();
  });

  it('switches to the ACH tab when the ACH button is clicked', async () => {
    render(<EditPaymentMethodModal {...baseProps} />);

    const achButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'ACH') as HTMLButtonElement;
    await userEvent.click(achButton);

    expect(page.getByLabelText(/account holder/i)).toBeTruthy();
    expect(page.getByLabelText(/routing number/i)).toBeTruthy();
  });

  it('disables the Save button while form is incomplete', () => {
    render(<EditPaymentMethodModal {...baseProps} />);

    const saveButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save') as HTMLButtonElement;

    expect(saveButton).toBeTruthy();
    expect(saveButton.disabled).toBe(true);
  });

  it('submits ACH form via client.payment.registerPaymentMethod and calls onSavedAction + onCloseAction', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <EditPaymentMethodModal
        {...baseProps}
        onCloseAction={onClose}
        onSavedAction={onSaved}
      />,
    );

    // Switch to ACH (avoids needing the iframe)
    const achButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'ACH') as HTMLButtonElement;
    await userEvent.click(achButton);

    await userEvent.fill(page.getByLabelText(/account holder/i).element() as HTMLElement, 'Jane Doe');
    await userEvent.fill(page.getByLabelText(/routing number/i).element() as HTMLElement, '021000021');
    await userEvent.fill(page.getByLabelText(/account number/i).element() as HTMLElement, '123456789');

    const saveButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save') as HTMLButtonElement;
    await userEvent.click(saveButton);

    await vi.waitFor(() => {
      expect(mockRegisterPaymentMethod).toHaveBeenCalledTimes(1);
    });

    const payload = mockRegisterPaymentMethod.mock.calls[0]![0] as Record<string, unknown>;

    expect(payload.memberId).toBe('member-1');
    expect(payload.paymentMethod).toBe('ach');
    expect(payload.achAccountHolder).toBe('Jane Doe');
    expect(payload.achRoutingNumber).toBe('021000021');
    expect(payload.achAccountNumber).toBe('123456789');
    expect(payload.achAccountType).toBe('Checking');

    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces the server error message when registerPaymentMethod returns success: false', async () => {
    mockRegisterPaymentMethod.mockResolvedValueOnce({ success: false, error: 'Card declined by issuer' });

    render(<EditPaymentMethodModal {...baseProps} />);

    // Use ACH to skip the iframe path
    const achButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'ACH') as HTMLButtonElement;
    await userEvent.click(achButton);

    await userEvent.fill(page.getByLabelText(/account holder/i).element() as HTMLElement, 'Jane Doe');
    await userEvent.fill(page.getByLabelText(/routing number/i).element() as HTMLElement, '021000021');
    await userEvent.fill(page.getByLabelText(/account number/i).element() as HTMLElement, '123456789');

    const saveButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save') as HTMLButtonElement;
    await userEvent.click(saveButton);

    await vi.waitFor(() => {
      expect(page.getByText('Card declined by issuer')).toBeTruthy();
    });
  });
});
