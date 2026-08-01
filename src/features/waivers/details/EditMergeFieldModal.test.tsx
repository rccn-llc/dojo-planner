import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditMergeFieldModal } from './EditMergeFieldModal';

const translationKeys: Record<string, string> = {
  title: 'Edit Merge Field',
  key_label: 'Key',
  key_readonly_help: 'The key cannot be changed after creation',
  label_label: 'Label',
  label_placeholder: 'e.g. Member Name',
  default_value_label: 'Default Value',
  default_value_placeholder: 'e.g. John Doe',
  description_label: 'Description',
  description_placeholder: 'Optional description...',
  cancel_button: 'Cancel',
  save_button: 'Save Changes',
  saving_button: 'Saving...',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    return translationKeys[key] || key;
  },
}));

describe('EditMergeFieldModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn().mockResolvedValue(undefined);

  const mockField = {
    id: 'field-1',
    key: 'member_name',
    label: 'Member Name',
    defaultValue: 'John Doe',
    description: 'The full name of the member',
  };

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    field: mockField,
    onSave: mockOnSave,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render dialog with correct title when open', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const heading = page.getByText('Edit Merge Field');

    expect(heading).toBeTruthy();
  });

  it('should not render dialog content when closed', async () => {
    await render(<EditMergeFieldModal {...defaultProps} isOpen={false} />);

    const heading = page.getByText('Edit Merge Field');

    expect(heading.elements()).toHaveLength(0);
  });

  it('should show key field as disabled with formatted value', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const inputs = Array.from(document.querySelectorAll('input'));
    const keyInput = inputs.find(input => input.value === '<member_name>');

    expect(keyInput).toBeTruthy();
    expect(keyInput?.disabled).toBe(true);
  });

  it('should show key readonly help text', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const helpText = page.getByText('The key cannot be changed after creation');

    expect(helpText).toBeTruthy();
  });

  it('should show label input with initial value', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const labelInput = document.querySelector('input[placeholder="e.g. Member Name"]') as HTMLInputElement;

    expect(labelInput).toBeTruthy();
    expect(labelInput.value).toBe('Member Name');
  });

  it('should show default value input with initial value', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const defaultValueInput = document.querySelector('input[placeholder="e.g. John Doe"]') as HTMLInputElement;

    expect(defaultValueInput).toBeTruthy();
    expect(defaultValueInput.value).toBe('John Doe');
  });

  it('should show description textarea with initial value', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;

    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('The full name of the member');
  });

  it('should show description textarea empty when field description is null', async () => {
    const fieldWithNullDesc = { ...mockField, description: null };
    await render(<EditMergeFieldModal {...defaultProps} field={fieldWithNullDesc} />);

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;

    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('');
  });

  it('should render all four field labels', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    expect(page.getByText('Key')).toBeTruthy();
    expect(page.getByText('Label')).toBeTruthy();
    expect(page.getByText('Default Value')).toBeTruthy();
    expect(page.getByText('Description')).toBeTruthy();
  });

  it('should show label validation error when label is cleared and blurred', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const labelInput = page.getByPlaceholder('e.g. Member Name');
    await userEvent.clear(labelInput);
    await userEvent.tab();

    const inputs = Array.from(document.querySelectorAll('input[placeholder="e.g. Member Name"]'));
    const input = inputs[0] as HTMLInputElement;

    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('should show default value validation error when default value is cleared and blurred', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const defaultValueInput = page.getByPlaceholder('e.g. John Doe');
    await userEvent.clear(defaultValueInput);
    await userEvent.tab();

    const inputs = Array.from(document.querySelectorAll('input[placeholder="e.g. John Doe"]'));
    const input = inputs[0] as HTMLInputElement;

    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('should enable save button when form has valid data', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should disable save button when label is empty', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const labelInput = page.getByPlaceholder('e.g. Member Name');
    await userEvent.clear(labelInput);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should disable save button when default value is empty', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const defaultValueInput = page.getByPlaceholder('e.g. John Doe');
    await userEvent.clear(defaultValueInput);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should call onSave with correct data when save is clicked', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({
      id: 'field-1',
      label: 'Member Name',
      defaultValue: 'John Doe',
      description: 'The full name of the member',
    });
  });

  it('should call onSave with updated values after editing', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const labelInput = page.getByPlaceholder('e.g. Member Name');
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, 'Full Name');

    const defaultValueInput = page.getByPlaceholder('e.g. John Doe');
    await userEvent.clear(defaultValueInput);
    await userEvent.type(defaultValueInput, 'Jane Smith');

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({
      id: 'field-1',
      label: 'Full Name',
      defaultValue: 'Jane Smith',
      description: 'The full name of the member',
    });
  });

  it('should send null for description when description is cleared', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const textarea = document.querySelector('textarea')!;
    await userEvent.clear(textarea);

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({
      id: 'field-1',
      label: 'Member Name',
      defaultValue: 'John Doe',
      description: null,
    });
  });

  it('should call onClose when cancel is clicked', async () => {
    await render(<EditMergeFieldModal {...defaultProps} />);

    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should show loading text on save button while saving', async () => {
    let resolvePromise: () => void;
    const slowOnSave = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      resolvePromise = resolve;
    }));

    await render(<EditMergeFieldModal {...defaultProps} onSave={slowOnSave} />);

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 100));

    const savingButton = page.getByText('Saving...');

    expect(savingButton).toBeTruthy();

    resolvePromise!();
  });

  it('should disable cancel button while saving', async () => {
    let resolvePromise: () => void;
    const slowOnSave = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      resolvePromise = resolve;
    }));

    await render(<EditMergeFieldModal {...defaultProps} onSave={slowOnSave} />);

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 100));

    const buttons = Array.from(document.querySelectorAll('button'));
    const cancelButton = buttons.find(btn => btn.textContent?.includes('Cancel'));

    expect(cancelButton?.disabled).toBe(true);

    resolvePromise!();
  });

  it('should reset form to original values when cancel is clicked after editing', async () => {
    const renderResult = await render(<EditMergeFieldModal {...defaultProps} />);

    const labelInput = page.getByPlaceholder('e.g. Member Name');
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, 'Changed Label');

    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    await renderResult.unmount();

    // Re-render to simulate reopening the dialog
    await render(<EditMergeFieldModal {...defaultProps} />);

    const resetLabelInput = document.querySelector('input[placeholder="e.g. Member Name"]') as HTMLInputElement;

    expect(resetLabelInput.value).toBe('Member Name');
  });
});
