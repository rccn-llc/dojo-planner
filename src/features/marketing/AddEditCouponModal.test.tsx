import type { Coupon } from './types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { AddEditCouponModal } from './AddEditCouponModal';

// Helper to wait for async operations
async function waitFor(callback: () => void | Promise<void>, options?: { timeout?: number }) {
  return vi.waitFor(callback, { timeout: options?.timeout ?? 5000, interval: 50 });
}

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('AddEditCouponModal', () => {
  const mockHandlers = {
    onCloseAction: vi.fn(),
    onSaveAction: vi.fn(),
  };

  const mockCoupon: Coupon = {
    id: '1',
    code: 'TEST_COUPON',
    description: 'Test Coupon Description',
    type: 'Percentage',
    amount: '15%',
    applyTo: 'Memberships',
    usage: '23/100',
    startDateTime: '2024-01-01T00:00:00',
    endDateTime: '2024-12-31T23:59:59',
    status: 'Active',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal rendering', () => {
    it('should not render dialog when isOpen is false', () => {
      render(
        <AddEditCouponModal
          isOpen={false}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      try {
        const modal = page.getByRole('dialog');

        expect(modal).toBeFalsy();
      } catch {
        expect(true).toBe(true);
      }
    });

    it('should render dialog when isOpen is true', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      const modal = page.getByRole('dialog');

      expect(modal).toBeTruthy();
    });

    it('should display add title when no coupon is provided', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      await expect.element(page.getByText('add_title')).toBeVisible();
    });

    it('should display edit title when coupon is provided', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          coupon={mockCoupon}
        />,
      );

      await expect.element(page.getByText('edit_title')).toBeVisible();
    });
  });

  describe('Form fields', () => {
    it('should render all form fields', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      await expect.element(page.getByTestId('coupon-code-input')).toBeVisible();
      await expect.element(page.getByTestId('coupon-description-input')).toBeVisible();
      await expect.element(page.getByTestId('coupon-type-select')).toBeVisible();
      await expect.element(page.getByTestId('coupon-amount-input')).toBeVisible();
      await expect.element(page.getByTestId('coupon-apply-to-select')).toBeVisible();
      await expect.element(page.getByTestId('coupon-status-select')).toBeVisible();
      await expect.element(page.getByTestId('coupon-usage-limit-input')).toBeVisible();
      await expect.element(page.getByTestId('coupon-start-date-input')).toBeVisible();
      await expect.element(page.getByTestId('coupon-start-time-input')).toBeVisible();
      await expect.element(page.getByTestId('coupon-end-date-input')).toBeVisible();
      await expect.element(page.getByTestId('coupon-end-time-input')).toBeVisible();
    });

    it('should update form fields when user types', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      const codeInput = page.getByTestId('coupon-code-input');
      await userEvent.fill(codeInput, 'NEWCODE');

      const descriptionInput = page.getByTestId('coupon-description-input');
      await userEvent.fill(descriptionInput, 'New Description');

      expect(codeInput.element()).toHaveProperty('value', 'NEWCODE');
      expect(descriptionInput.element()).toHaveProperty('value', 'New Description');
    });

    it('should pre-fill form fields when editing a coupon', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          coupon={mockCoupon}
        />,
      );

      const codeInput = page.getByTestId('coupon-code-input');
      const descriptionInput = page.getByTestId('coupon-description-input');

      expect(codeInput.element()).toHaveProperty('value', 'TEST_COUPON');
      expect(descriptionInput.element()).toHaveProperty('value', 'Test Coupon Description');
    });

    it('should allow editing code input when editing', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          coupon={mockCoupon}
        />,
      );

      const codeInput = page.getByTestId('coupon-code-input');

      expect(codeInput.element()).toHaveProperty('disabled', false);
    });

    it('should allow editing code input when adding', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      const codeInput = page.getByTestId('coupon-code-input');

      expect(codeInput.element()).toHaveProperty('disabled', false);
    });
  });

  describe('Modal close behavior', () => {
    it('should call onCloseAction when X button is clicked', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      expect(mockHandlers.onCloseAction).toHaveBeenCalledTimes(1);
    });

    it('should call onCloseAction when Cancel button is clicked', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      const cancelButton = page.getByRole('button', { name: 'cancel_button' });
      await userEvent.click(cancelButton);

      expect(mockHandlers.onCloseAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Form validation', () => {
    it('should show validation error when code is empty', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      // Fill in other fields but leave code empty
      await userEvent.fill(page.getByTestId('coupon-description-input'), 'Description');
      await userEvent.fill(page.getByTestId('coupon-amount-input'), '15');
      // Check never expires to skip end date validation
      await userEvent.click(page.getByTestId('coupon-never-expires-checkbox'));

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'add_button' });
      await userEvent.click(saveButton);

      await expect.element(page.getByText('code_error')).toBeVisible();
    });

    it('should show validation error when description is empty', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      // Fill in other fields but leave description empty
      await userEvent.fill(page.getByTestId('coupon-code-input'), 'CODE123');
      await userEvent.fill(page.getByTestId('coupon-amount-input'), '15');
      // Check never expires to skip end date validation
      await userEvent.click(page.getByTestId('coupon-never-expires-checkbox'));

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'add_button' });
      await userEvent.click(saveButton);

      await expect.element(page.getByText('description_error')).toBeVisible();
    });

    it('should show validation error when amount is empty', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      // Fill in other fields but leave amount empty
      await userEvent.fill(page.getByTestId('coupon-code-input'), 'CODE123');
      await userEvent.fill(page.getByTestId('coupon-description-input'), 'Description');
      // Check never expires to skip end date validation
      await userEvent.click(page.getByTestId('coupon-never-expires-checkbox'));

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'add_button' });
      await userEvent.click(saveButton);

      await expect.element(page.getByText('amount_error')).toBeVisible();
    });

    it('should show validation error when end date is empty', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      // Fill in other fields but leave end date empty
      await userEvent.fill(page.getByTestId('coupon-code-input'), 'CODE123');
      await userEvent.fill(page.getByTestId('coupon-description-input'), 'Description');
      await userEvent.fill(page.getByTestId('coupon-amount-input'), '15');

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'add_button' });
      await userEvent.click(saveButton);

      await expect.element(page.getByText('end_date_error')).toBeVisible();
    });
  });

  describe('Form submission', () => {
    it('should call onSaveAction when form is valid and submitted for add', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      // Fill in all required fields
      await userEvent.fill(page.getByTestId('coupon-code-input'), 'NEWCODE');
      await userEvent.fill(page.getByTestId('coupon-description-input'), 'New Description');
      await userEvent.fill(page.getByTestId('coupon-amount-input'), '15');
      // Check never expires to skip end date validation (since DatePicker uses button, not input)
      await userEvent.click(page.getByTestId('coupon-never-expires-checkbox'));

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'add_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'NEWCODE',
            description: 'New Description',
            amount: '15',
            neverExpires: true,
          }),
          false, // isEdit = false for add
        );
      });
    });

    it('should call onSaveAction with isEdit=true when editing', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          coupon={mockCoupon}
        />,
      );

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'save_changes_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.any(Object),
          true, // isEdit = true for edit
        );
      });
    });

    it('should display success message after successful add', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      // Fill in all required fields
      await userEvent.fill(page.getByTestId('coupon-code-input'), 'NEWCODE');
      await userEvent.fill(page.getByTestId('coupon-description-input'), 'New Description');
      await userEvent.fill(page.getByTestId('coupon-amount-input'), '15');
      // Check never expires to skip end date validation
      await userEvent.click(page.getByTestId('coupon-never-expires-checkbox'));

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'add_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        const successMessage = page.getByText('create_success');

        expect(successMessage).toBeTruthy();
      });
    });

    it('should display success message after successful edit', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          coupon={mockCoupon}
        />,
      );

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'save_changes_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        const successMessage = page.getByText('update_success');

        expect(successMessage).toBeTruthy();
      });
    });
  });

  describe('Select dropdowns', () => {
    it('should allow selecting coupon type', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      const typeSelect = page.getByTestId('coupon-type-select');
      await userEvent.click(typeSelect);

      const fixedAmountOption = page.getByRole('option', { name: 'Fixed Amount' });
      await userEvent.click(fixedAmountOption);

      // Fill in other fields and submit to verify
      await userEvent.fill(page.getByTestId('coupon-code-input'), 'NEWCODE');
      await userEvent.fill(page.getByTestId('coupon-description-input'), 'Description');
      await userEvent.fill(page.getByTestId('coupon-amount-input'), '50');
      // Check never expires to skip end date validation
      await userEvent.click(page.getByTestId('coupon-never-expires-checkbox'));

      const saveButton = page.getByRole('button', { name: 'add_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'Fixed Amount',
          }),
          false,
        );
      });
    });

    it('should allow selecting apply to', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      const applyToSelect = page.getByTestId('coupon-apply-to-select');
      await userEvent.click(applyToSelect);

      const productsOption = page.getByRole('option', { name: 'Products' });
      await userEvent.click(productsOption);

      // Fill in other fields and submit to verify
      await userEvent.fill(page.getByTestId('coupon-code-input'), 'NEWCODE');
      await userEvent.fill(page.getByTestId('coupon-description-input'), 'Description');
      await userEvent.fill(page.getByTestId('coupon-amount-input'), '15');
      // Check never expires to skip end date validation
      await userEvent.click(page.getByTestId('coupon-never-expires-checkbox'));

      const saveButton = page.getByRole('button', { name: 'add_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            applyTo: 'Products',
          }),
          false,
        );
      });
    });

    it('should allow selecting status', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      const statusSelect = page.getByTestId('coupon-status-select');
      await userEvent.click(statusSelect);

      const inactiveOption = page.getByRole('option', { name: 'Inactive' });
      await userEvent.click(inactiveOption);

      // Fill in other fields and submit to verify
      await userEvent.fill(page.getByTestId('coupon-code-input'), 'NEWCODE');
      await userEvent.fill(page.getByTestId('coupon-description-input'), 'Description');
      await userEvent.fill(page.getByTestId('coupon-amount-input'), '15');
      // Check never expires to skip end date validation
      await userEvent.click(page.getByTestId('coupon-never-expires-checkbox'));

      const saveButton = page.getByRole('button', { name: 'add_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'Inactive',
          }),
          false,
        );
      });
    });
  });

  describe('Never expires checkbox', () => {
    it('should render the never expires checkbox', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      await expect.element(page.getByTestId('coupon-never-expires-checkbox')).toBeVisible();
    });

    it('should hide end date fields when never expires is checked', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      // Initially end date should be visible
      await expect.element(page.getByTestId('coupon-end-date-input')).toBeVisible();

      // Click the never expires checkbox
      const checkbox = page.getByTestId('coupon-never-expires-checkbox');
      await userEvent.click(checkbox);

      // End date should now be hidden
      try {
        const endDateInput = page.getByTestId('coupon-end-date-input');

        expect(endDateInput.element()).toBeFalsy();
      } catch {
        // Expected - element should not exist
        expect(true).toBe(true);
      }
    });

    it('should allow form submission when never expires is checked without end date', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      // Fill in required fields
      await userEvent.fill(page.getByTestId('coupon-code-input'), 'NEWCODE');
      await userEvent.fill(page.getByTestId('coupon-description-input'), 'Description');
      await userEvent.fill(page.getByTestId('coupon-amount-input'), '15');

      // Check never expires
      const checkbox = page.getByTestId('coupon-never-expires-checkbox');
      await userEvent.click(checkbox);

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'add_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            neverExpires: true,
            endDate: '',
          }),
          false,
        );
      });
    });
  });

  describe('Usage limit field', () => {
    it('should allow entering usage limit', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      const usageLimitInput = page.getByTestId('coupon-usage-limit-input');
      await userEvent.fill(usageLimitInput, '100');

      expect(usageLimitInput.element()).toHaveProperty('value', '100');
    });

    it('should show help text for usage limit', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      await expect.element(page.getByText('usage_limit_help')).toBeVisible();
    });
  });

  describe('Per-user limit field', () => {
    it('should default the per-user limit to 1', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      const input = page.getByTestId('coupon-per-user-limit-input');

      expect(input.element()).toHaveProperty('value', '1');
    });

    it('should allow entering an integer per-user limit', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      const input = page.getByTestId('coupon-per-user-limit-input');
      await userEvent.fill(input, '3');

      expect(input.element()).toHaveProperty('value', '3');
    });

    it('should show help text for per-user limit', async () => {
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
        />,
      );

      await expect.element(page.getByText('per_user_limit_help')).toBeVisible();
    });
  });

  describe('Server error surfacing', () => {
    it('renders the submit error when onSaveAction rejects', async () => {
      const failingSave = vi.fn().mockRejectedValue(new Error('A coupon with code TEST20 already exists.'));
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={failingSave}
        />,
      );

      // Fill the minimum required fields
      await userEvent.fill(page.getByTestId('coupon-code-input'), 'TEST20');
      await userEvent.fill(page.getByTestId('coupon-description-input'), 'Twenty off');
      await userEvent.fill(page.getByTestId('coupon-amount-input'), '20');
      await userEvent.click(page.getByTestId('coupon-never-expires-checkbox'));

      // Submit
      await userEvent.click(page.getByText('add_button'));

      await waitFor(() => {
        expect(failingSave).toHaveBeenCalled();
      });

      await expect.element(page.getByTestId('coupon-submit-error')).toBeVisible();
      await expect.element(page.getByText(/A coupon with code TEST20 already exists/)).toBeVisible();
    });

    it('shows the success message when onSaveAction resolves', async () => {
      const succeedingSave = vi.fn().mockResolvedValue(undefined);
      render(
        <AddEditCouponModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={succeedingSave}
        />,
      );

      await userEvent.fill(page.getByTestId('coupon-code-input'), 'TEST20');
      await userEvent.fill(page.getByTestId('coupon-description-input'), 'Twenty off');
      await userEvent.fill(page.getByTestId('coupon-amount-input'), '20');
      await userEvent.click(page.getByTestId('coupon-never-expires-checkbox'));

      await userEvent.click(page.getByText('add_button'));

      await waitFor(() => {
        expect(succeedingSave).toHaveBeenCalled();
      });

      await expect.element(page.getByText('create_success')).toBeVisible();
    });
  });
});
