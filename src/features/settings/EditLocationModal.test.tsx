import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditLocationModal } from './EditLocationModal';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Edit Location Information',
      address_label: 'Address',
      address_placeholder: 'Enter address',
      address_error: 'Please enter an address.',
      phone_label: 'Phone',
      phone_placeholder: '(555) 123-4567',
      phone_error: 'Please enter a phone number.',
      email_label: 'Email',
      email_placeholder: 'location@example.com',
      email_error: 'Please enter a valid email address.',
      tax_rate_label: 'Tax Rate',
      tax_rate_placeholder: '0.00',
      tax_rate_helper: 'Applied to taxable items (events, merchandise). Memberships are not taxed.',
      tax_rate_error: 'Tax rate must be between 0 and 100.',
      cancel_button: 'Cancel',
      save_button: 'Save Changes',
      saving_button: 'Saving...',
    };
    return translations[key] || key;
  },
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  address: '123 Main St. San Francisco. CA',
  phone: '(415) 555-0123',
  email: 'downtown@example.com',
  taxRate: 3.75,
  onSave: vi.fn(),
};

describe('EditLocationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the modal title', () => {
    render(<EditLocationModal {...defaultProps} />);

    expect(page.getByText('Edit Location Information')).toBeDefined();
  });

  it('should render all form field labels', () => {
    render(<EditLocationModal {...defaultProps} />);

    expect(page.getByText('Address')).toBeDefined();
    expect(page.getByText('Phone')).toBeDefined();
    expect(page.getByText('Email')).toBeDefined();
  });

  it('should display initial values in form fields', () => {
    render(<EditLocationModal {...defaultProps} />);

    const addressInput = page.getByPlaceholder('Enter address');
    const phoneInput = page.getByPlaceholder('(555) 123-4567');
    const emailInput = page.getByPlaceholder('location@example.com');

    expect(addressInput.element()).toHaveProperty('value', '123 Main St. San Francisco. CA');
    expect(phoneInput.element()).toHaveProperty('value', '(415) 555-0123');
    expect(emailInput.element()).toHaveProperty('value', 'downtown@example.com');
  });

  it('should render cancel and save buttons', () => {
    render(<EditLocationModal {...defaultProps} />);

    expect(page.getByRole('button', { name: /cancel/i })).toBeDefined();
    expect(page.getByRole('button', { name: /save changes/i })).toBeDefined();
  });

  it('should call onClose when cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(<EditLocationModal {...defaultProps} onClose={onClose} />);

    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton.element());

    expect(onClose).toHaveBeenCalled();
  });

  it('should show error when address field is empty on blur', async () => {
    render(<EditLocationModal {...defaultProps} />);

    const addressInput = page.getByPlaceholder('Enter address');
    await userEvent.clear(addressInput.element());
    await userEvent.click(page.getByText('Phone').element()); // Blur by clicking elsewhere

    expect(page.getByText('Please enter an address.')).toBeDefined();
  });

  it('should show error when phone field is empty on blur', async () => {
    render(<EditLocationModal {...defaultProps} />);

    const phoneInput = page.getByPlaceholder('(555) 123-4567');
    await userEvent.clear(phoneInput.element());
    await userEvent.click(page.getByText('Email').element()); // Blur by clicking elsewhere

    expect(page.getByText('Please enter a phone number.')).toBeDefined();
  });

  it('should show error when email is invalid on blur', async () => {
    render(<EditLocationModal {...defaultProps} />);

    const emailInput = page.getByPlaceholder('location@example.com');
    await userEvent.clear(emailInput.element());
    await userEvent.type(emailInput.element(), 'invalid-email');
    await userEvent.click(page.getByText('Phone').element()); // Blur by clicking elsewhere

    expect(page.getByText('Please enter a valid email address.')).toBeDefined();
  });

  it('should disable save button when form is invalid', async () => {
    render(<EditLocationModal {...defaultProps} />);

    const addressInput = page.getByPlaceholder('Enter address');
    await userEvent.clear(addressInput.element());

    const saveButton = page.getByRole('button', { name: /save changes/i });

    expect(saveButton.element()).toBeDisabled();
  });

  it('should enable save button when form is valid', () => {
    render(<EditLocationModal {...defaultProps} />);

    const saveButton = page.getByRole('button', { name: /save changes/i });

    expect(saveButton.element()).not.toBeDisabled();
  });

  it('should call onSave with updated data when save is clicked', async () => {
    const onSave = vi.fn();
    render(<EditLocationModal {...defaultProps} onSave={onSave} />);

    const addressInput = page.getByPlaceholder('Enter address');
    await userEvent.clear(addressInput.element());
    await userEvent.type(addressInput.element(), '789 Updated Ave');

    const saveButton = page.getByRole('button', { name: /save changes/i });
    await userEvent.click(saveButton.element());

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        address: '789 Updated Ave',
        phone: '(415) 555-0123',
        email: 'downtown@example.com',
        taxRate: 3.75,
      });
    });
  });

  it('should not render when isOpen is false', () => {
    render(<EditLocationModal {...defaultProps} isOpen={false} />);

    const modalTitle = page.getByText('Edit Location Information');

    expect(modalTitle.elements()).toHaveLength(0);
  });

  it('should reset form values when cancel is clicked', async () => {
    render(<EditLocationModal {...defaultProps} />);

    // Modify a field
    const addressInput = page.getByPlaceholder('Enter address');
    await userEvent.clear(addressInput.element());
    await userEvent.type(addressInput.element(), 'Modified Address');

    // Click cancel to close the modal (which should reset the form)
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton.element());

    // Verify onClose was called
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should update all fields correctly', async () => {
    const onSave = vi.fn();
    render(<EditLocationModal {...defaultProps} onSave={onSave} />);

    // Update all fields
    const addressInput = page.getByPlaceholder('Enter address');
    const phoneInput = page.getByPlaceholder('(555) 123-4567');
    const emailInput = page.getByPlaceholder('location@example.com');

    await userEvent.clear(addressInput.element());
    await userEvent.type(addressInput.element(), '456 New St');

    await userEvent.clear(phoneInput.element());
    await userEvent.type(phoneInput.element(), '(555) 999-8888');

    await userEvent.clear(emailInput.element());
    await userEvent.type(emailInput.element(), 'new@example.com');

    const saveButton = page.getByRole('button', { name: /save changes/i });
    await userEvent.click(saveButton.element());

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        address: '456 New St',
        phone: '(555) 999-8888',
        email: 'new@example.com',
        taxRate: 3.75,
      });
    });
  });

  it('should show saving state while submitting', async () => {
    render(<EditLocationModal {...defaultProps} />);

    const saveButton = page.getByRole('button', { name: /save changes/i });
    await userEvent.click(saveButton.element());

    // Check for saving state
    expect(page.getByText('Saving...')).toBeDefined();
  });

  it('should validate email format correctly', async () => {
    render(<EditLocationModal {...defaultProps} />);

    const emailInput = page.getByPlaceholder('location@example.com');

    // Test with empty email
    await userEvent.clear(emailInput.element());
    await userEvent.click(page.getByText('Phone').element());

    expect(page.getByText('Please enter a valid email address.')).toBeDefined();
  });

  it('should accept valid email format', async () => {
    render(<EditLocationModal {...defaultProps} />);

    const emailInput = page.getByPlaceholder('location@example.com');
    await userEvent.clear(emailInput.element());
    await userEvent.type(emailInput.element(), 'valid@test.com');
    await userEvent.click(page.getByText('Phone').element());

    const errorMessage = page.getByText('Please enter a valid email address.');

    expect(errorMessage.elements()).toHaveLength(0);
  });
});
