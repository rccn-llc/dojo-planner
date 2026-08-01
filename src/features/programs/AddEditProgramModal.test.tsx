import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { AddEditProgramModal } from './AddEditProgramModal';

describe('AddEditProgramModal', () => {
  const defaultProps = {
    isOpen: true,
    onCloseAction: vi.fn(),
    onSaveAction: vi.fn(),
    program: null,
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Add Mode', () => {
    it('renders add program title when program is null', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Add Program' });

      expect(title).toBeInTheDocument();
    });

    it('renders empty form fields in add mode', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      const descriptionInput = page.getByPlaceholder(/Enter program description/i);

      expect(nameInput).toHaveValue('');
      expect(descriptionInput).toHaveValue('');
    });

    it('renders add program button in add mode', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const addButton = page.getByRole('button', { name: 'Add Program' });

      expect(addButton).toBeInTheDocument();
    });

    it('renders status switch defaulting to Active', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const activeLabel = page.getByText('Active', { exact: true });

      expect(activeLabel).toBeInTheDocument();
    });
  });

  describe('Edit Mode', () => {
    const editProgram = {
      id: '1',
      name: 'Test Program',
      description: 'Test description',
      status: 'Active' as const,
    };

    it('renders edit program title when program is provided', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} program={editProgram} />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Edit Program' });

      expect(title).toBeInTheDocument();
    });

    it('populates form fields with program data', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} program={editProgram} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      const descriptionInput = page.getByPlaceholder(/Enter program description/i);

      expect(nameInput).toHaveValue('Test Program');
      expect(descriptionInput).toHaveValue('Test description');
    });

    it('renders save changes button in edit mode', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} program={editProgram} />
        </I18nWrapper>,
      );

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      expect(saveButton).toBeInTheDocument();
    });

    it('shows Inactive when program status is Inactive', async () => {
      const inactiveProgram = { ...editProgram, status: 'Inactive' as const };

      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} program={inactiveProgram} />
        </I18nWrapper>,
      );

      const inactiveLabel = page.getByText('Inactive', { exact: true });

      expect(inactiveLabel).toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    it('updates name field when user types', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'New Program');

      expect(nameInput).toHaveValue('New Program');
    });

    it('updates description field when user types', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const descriptionInput = page.getByPlaceholder(/Enter program description/i);
      await userEvent.type(descriptionInput, 'New description');

      expect(descriptionInput).toHaveValue('New description');
    });

    it('toggles status when switch is clicked', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      // First interact with another element (typing stabilizes the dialog)
      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.type(nameInput, 'Test');

      // Verify switch exists and is initially checked (Active)
      const statusSwitch = page.getByRole('switch');

      expect(statusSwitch).toHaveAttribute('data-state', 'checked');

      await userEvent.click(statusSwitch);

      // Should now be unchecked (Inactive)
      expect(statusSwitch).toHaveAttribute('data-state', 'unchecked');
    });
  });

  describe('Form Validation', () => {
    it('disables submit button when name is empty', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const submitButton = page.getByRole('button', { name: 'Add Program' });

      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when description is empty', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.type(nameInput, 'Test Program');

      const submitButton = page.getByRole('button', { name: 'Add Program' });

      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when name has only whitespace', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      const descriptionInput = page.getByPlaceholder(/Enter program description/i);

      await userEvent.type(nameInput, '   ');
      await userEvent.type(descriptionInput, 'Some description');

      const submitButton = page.getByRole('button', { name: 'Add Program' });

      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when description has only whitespace', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      const descriptionInput = page.getByPlaceholder(/Enter program description/i);

      await userEvent.type(nameInput, 'Test Program');
      await userEvent.type(descriptionInput, '   ');

      const submitButton = page.getByRole('button', { name: 'Add Program' });

      expect(submitButton).toBeDisabled();
    });

    it('enables submit button when both name and description have values', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      const descriptionInput = page.getByPlaceholder(/Enter program description/i);

      await userEvent.type(nameInput, 'Test Program');
      await userEvent.type(descriptionInput, 'Test description');

      const submitButton = page.getByRole('button', { name: 'Add Program' });

      expect(submitButton).toBeEnabled();
    });

    it('does not call onSaveAction when button is disabled', async () => {
      const onSaveAction = vi.fn();

      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} onSaveAction={onSaveAction} />
        </I18nWrapper>,
      );

      const submitButton = page.getByRole('button', { name: 'Add Program' });

      // Button should be disabled
      expect(submitButton).toBeDisabled();

      // Force click using the element (disabled buttons can't be clicked normally)
      const buttonElement = submitButton.element() as HTMLButtonElement;
      buttonElement.click();

      expect(onSaveAction).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    it('calls onSaveAction with trimmed data when form is valid', async () => {
      const onSaveAction = vi.fn();

      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} onSaveAction={onSaveAction} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      const descriptionInput = page.getByPlaceholder(/Enter program description/i);

      await userEvent.type(nameInput, '  Test Program  ');
      await userEvent.type(descriptionInput, '  Test description  ');

      const submitButton = page.getByRole('button', { name: 'Add Program' });
      await userEvent.click(submitButton);

      expect(onSaveAction).toHaveBeenCalledWith({
        name: 'Test Program',
        description: 'Test description',
        status: 'Active',
      });
    });

    it('calls onSaveAction with id when editing existing program', async () => {
      const onSaveAction = vi.fn();
      const editProgram = {
        id: '123',
        name: 'Existing Program',
        description: 'Existing description',
        status: 'Active' as const,
      };

      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} program={editProgram} onSaveAction={onSaveAction} />
        </I18nWrapper>,
      );

      const submitButton = page.getByRole('button', { name: 'Save Changes' });
      await userEvent.click(submitButton);

      expect(onSaveAction).toHaveBeenCalledWith({
        id: '123',
        name: 'Existing Program',
        description: 'Existing description',
        status: 'Active',
      });
    });

    it('submits with Inactive status when switch is toggled off', async () => {
      const onSaveAction = vi.fn();

      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} onSaveAction={onSaveAction} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      const descriptionInput = page.getByPlaceholder(/Enter program description/i);

      await userEvent.type(nameInput, 'Test Program');
      await userEvent.type(descriptionInput, 'Test description');

      const statusSwitch = page.getByRole('switch');
      await userEvent.click(statusSwitch);

      const submitButton = page.getByRole('button', { name: 'Add Program' });
      await userEvent.click(submitButton);

      expect(onSaveAction).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'Inactive',
        }),
      );
    });
  });

  describe('Cancel Action', () => {
    it('calls onCloseAction when cancel button is clicked', async () => {
      const onCloseAction = vi.fn();

      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} onCloseAction={onCloseAction} />
        </I18nWrapper>,
      );

      // First interact with another element to stabilize dialog
      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.type(nameInput, 'Test');

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await userEvent.click(cancelButton);

      expect(onCloseAction).toHaveBeenCalled();
    });

    it('calls onCloseAction when dialog close button is clicked', async () => {
      const onCloseAction = vi.fn();

      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} onCloseAction={onCloseAction} />
        </I18nWrapper>,
      );

      // First interact with another element to stabilize dialog
      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.type(nameInput, 'Test');

      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      expect(onCloseAction).toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('shows saving button text when loading', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} isLoading />
        </I18nWrapper>,
      );

      const savingButton = page.getByRole('button', { name: 'Saving...' });

      expect(savingButton).toBeInTheDocument();
    });

    it('disables inputs when loading', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} isLoading />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      const descriptionInput = page.getByPlaceholder(/Enter program description/i);
      const statusSwitch = page.getByRole('switch');

      expect(nameInput).toBeDisabled();
      expect(descriptionInput).toBeDisabled();
      expect(statusSwitch).toBeDisabled();
    });

    it('disables buttons when loading', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} isLoading />
        </I18nWrapper>,
      );

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      const savingButton = page.getByRole('button', { name: 'Saving...' });

      expect(cancelButton).toBeDisabled();
      expect(savingButton).toBeDisabled();
    });
  });

  describe('Modal Visibility', () => {
    it('does not render content when isOpen is false', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} isOpen={false} />
        </I18nWrapper>,
      );

      const titles = page.getByRole('heading', { name: 'Add Program' }).elements();

      expect(titles.length).toBe(0);
    });

    it('renders content when isOpen is true', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} isOpen />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Add Program' });

      expect(title).toBeInTheDocument();
    });
  });

  describe('Form Labels', () => {
    it('renders program name label without required indicator', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameLabel = page.getByText('Program Name');

      expect(nameLabel).toBeInTheDocument();

      // Ensure no asterisk is present
      const asterisks = page.getByText('*').elements();

      expect(asterisks.length).toBe(0);
    });

    it('renders description label', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const descriptionLabel = page.getByText('Description');

      expect(descriptionLabel).toBeInTheDocument();
    });

    it('renders cancel button', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const cancelButton = page.getByRole('button', { name: 'Cancel' });

      expect(cancelButton).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible name input with label', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });

      expect(nameInput).toBeInTheDocument();
    });

    it('has accessible switch with aria-label', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const statusSwitch = page.getByRole('switch', { name: /Program status/i });

      expect(statusSwitch).toBeInTheDocument();
    });
  });

  describe('Input Error States', () => {
    it('does not show error state on name input before blur', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });

      expect(nameInput).not.toHaveAttribute('aria-invalid', 'true');
    });

    it('shows error state and message on name input after blur when empty', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.click(nameInput);
      // Tab to next field to trigger blur
      await userEvent.tab();

      expect(nameInput).toHaveAttribute('aria-invalid', 'true');

      const errorMessage = page.getByText('Please enter a program name.');

      expect(errorMessage).toBeInTheDocument();
    });

    it('shows error state on name input after blur when only whitespace', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.type(nameInput, '   ');
      // Tab to next field to trigger blur
      await userEvent.tab();

      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not show error state on name input after blur when valid', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.type(nameInput, 'Valid Name');
      // Tab to next field to trigger blur
      await userEvent.tab();

      expect(nameInput).not.toHaveAttribute('aria-invalid', 'true');
    });

    it('does not show error state on description input before blur', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const descriptionInput = page.getByPlaceholder(/Enter program description/i);

      expect(descriptionInput).not.toHaveAttribute('aria-invalid', 'true');
    });

    it('shows error state and message on description input after blur when empty', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const descriptionInput = page.getByPlaceholder(/Enter program description/i);
      await userEvent.click(descriptionInput);
      // Tab to next field to trigger blur
      await userEvent.tab();

      expect(descriptionInput).toHaveAttribute('aria-invalid', 'true');

      const errorMessage = page.getByText('Please enter a description.');

      expect(errorMessage).toBeInTheDocument();
    });

    it('shows error state on description input after blur when only whitespace', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const descriptionInput = page.getByPlaceholder(/Enter program description/i);
      await userEvent.type(descriptionInput, '   ');
      // Tab to next field to trigger blur
      await userEvent.tab();

      expect(descriptionInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not show error state on description input after blur when valid', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const descriptionInput = page.getByPlaceholder(/Enter program description/i);
      await userEvent.type(descriptionInput, 'Valid description');
      // Tab to next field to trigger blur
      await userEvent.tab();

      expect(descriptionInput).not.toHaveAttribute('aria-invalid', 'true');
    });

    it('clears error state when user enters valid content', async () => {
      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });

      // Tab while empty to trigger blur and error
      await userEvent.click(nameInput);
      await userEvent.tab();

      expect(nameInput).toHaveAttribute('aria-invalid', 'true');

      // Click back into input and type valid content - error should clear
      await userEvent.click(nameInput);
      await userEvent.type(nameInput, 'Valid Name');

      expect(nameInput).not.toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Edit Mode Button State', () => {
    it('enables save button when edit mode has valid data', async () => {
      const editProgram = {
        id: '1',
        name: 'Test Program',
        description: 'Test description',
        status: 'Active' as const,
      };

      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} program={editProgram} />
        </I18nWrapper>,
      );

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      expect(saveButton).toBeEnabled();
    });

    it('disables save button when name is cleared in edit mode', async () => {
      const editProgram = {
        id: '1',
        name: 'Test Program',
        description: 'Test description',
        status: 'Active' as const,
      };

      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} program={editProgram} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.clear(nameInput);

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      expect(saveButton).toBeDisabled();
    });

    it('disables save button when description is cleared in edit mode', async () => {
      const editProgram = {
        id: '1',
        name: 'Test Program',
        description: 'Test description',
        status: 'Active' as const,
      };

      await render(
        <I18nWrapper>
          <AddEditProgramModal {...defaultProps} program={editProgram} />
        </I18nWrapper>,
      );

      const descriptionInput = page.getByPlaceholder(/Enter program description/i);
      await userEvent.clear(descriptionInput);

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      expect(saveButton).toBeDisabled();
    });
  });
});
