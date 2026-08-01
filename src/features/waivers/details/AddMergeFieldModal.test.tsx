import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { AddMergeFieldModal } from './AddMergeFieldModal';

const translationKeys: Record<string, string> = {
  title: 'Add Merge Field',
  key_label: 'Key',
  key_placeholder: 'e.g. member_name',
  key_error: 'Key is required and must start with a letter, using only lowercase letters, numbers, and underscores',
  key_help: 'Lowercase letters, numbers, and underscores only',
  preview_title: 'Preview',
  label_label: 'Label',
  label_placeholder: 'e.g. Member Name',
  label_error: 'Label is required',
  default_value_label: 'Default Value',
  default_value_placeholder: 'e.g. John Doe',
  default_value_error: 'Default value is required',
  description_label: 'Description',
  description_placeholder: 'Optional description...',
  cancel_button: 'Cancel',
  save_button: 'Add Field',
  saving_button: 'Adding...',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    return translationKeys[key] || key;
  },
}));

describe('AddMergeFieldModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn().mockResolvedValue(undefined);

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onSave: mockOnSave,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render dialog with correct title when open', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const heading = page.getByText('Add Merge Field');

    expect(heading).toBeTruthy();
  });

  it('should not render dialog content when closed', async () => {
    await render(<AddMergeFieldModal {...defaultProps} isOpen={false} />);

    const heading = page.getByText('Add Merge Field');

    expect(heading.elements()).toHaveLength(0);
  });

  it('should render key input with placeholder', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');

    expect(keyInput).toBeTruthy();
  });

  it('should render label input with placeholder', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const labelInput = page.getByPlaceholder('e.g. Member Name');

    expect(labelInput).toBeTruthy();
  });

  it('should render default value input with placeholder', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const defaultValueInput = page.getByPlaceholder('e.g. John Doe');

    expect(defaultValueInput).toBeTruthy();
  });

  it('should render description textarea with placeholder', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const descriptionTextarea = page.getByPlaceholder('Optional description...');

    expect(descriptionTextarea).toBeTruthy();
  });

  it('should render all four field labels', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    expect(page.getByText('Key')).toBeTruthy();
    expect(page.getByText('Label')).toBeTruthy();
    expect(page.getByText('Default Value')).toBeTruthy();
    expect(page.getByText('Description')).toBeTruthy();
  });

  it('should show key help text initially', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const helpText = page.getByText('Lowercase letters, numbers, and underscores only');

    expect(helpText).toBeTruthy();
  });

  it('should show key validation error when key is empty and blurred', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.click(keyInput);
    await userEvent.tab();

    const error = page.getByText('Key is required and must start with a letter, using only lowercase letters, numbers, and underscores');

    expect(error).toBeTruthy();
  });

  it('should show label validation error when label is empty and blurred', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const labelInput = page.getByPlaceholder('e.g. Member Name');
    await userEvent.click(labelInput);
    await userEvent.tab();

    const error = page.getByText('Label is required');

    expect(error).toBeTruthy();
  });

  it('should show default value validation error when default value is empty and blurred', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const defaultValueInput = page.getByPlaceholder('e.g. John Doe');
    await userEvent.click(defaultValueInput);
    await userEvent.tab();

    const error = page.getByText('Default value is required');

    expect(error).toBeTruthy();
  });

  it('should format key input to lowercase with underscores', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.type(keyInput, 'Member Name');

    const input = document.querySelector('input[placeholder="e.g. member_name"]') as HTMLInputElement;

    expect(input.value).toBe('member_name');
  });

  it('should strip invalid characters from key input', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.type(keyInput, 'test@key!#');

    const input = document.querySelector('input[placeholder="e.g. member_name"]') as HTMLInputElement;

    expect(input.value).toBe('testkey');
  });

  it('should show key preview when key is valid', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.type(keyInput, 'member_name');

    const preview = page.getByText('Preview');

    expect(preview).toBeTruthy();

    const code = document.querySelector('code');

    expect(code?.textContent).toBe('<member_name>');
  });

  it('should disable save button when form is empty', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Add Field'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should disable save button when only key is filled', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.type(keyInput, 'member_name');

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Add Field'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should enable save button when all required fields are filled', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.type(keyInput, 'member_name');

    const labelInput = page.getByPlaceholder('e.g. Member Name');
    await userEvent.type(labelInput, 'Member Name');

    const defaultValueInput = page.getByPlaceholder('e.g. John Doe');
    await userEvent.type(defaultValueInput, 'John Doe');

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Add Field'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should call onSave with correct data when save is clicked', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.type(keyInput, 'member_name');

    const labelInput = page.getByPlaceholder('e.g. Member Name');
    await userEvent.type(labelInput, 'Member Name');

    const defaultValueInput = page.getByPlaceholder('e.g. John Doe');
    await userEvent.type(defaultValueInput, 'John Doe');

    const saveButton = page.getByRole('button', { name: 'Add Field' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({
      key: 'member_name',
      label: 'Member Name',
      defaultValue: 'John Doe',
      description: undefined,
    });
  });

  it('should include description in onSave data when provided', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.type(keyInput, 'member_name');

    const labelInput = page.getByPlaceholder('e.g. Member Name');
    await userEvent.type(labelInput, 'Member Name');

    const defaultValueInput = page.getByPlaceholder('e.g. John Doe');
    await userEvent.type(defaultValueInput, 'John Doe');

    const descriptionTextarea = page.getByPlaceholder('Optional description...');
    await userEvent.type(descriptionTextarea, 'The full name of the member');

    const saveButton = page.getByRole('button', { name: 'Add Field' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({
      key: 'member_name',
      label: 'Member Name',
      defaultValue: 'John Doe',
      description: 'The full name of the member',
    });
  });

  it('should call onClose when cancel is clicked', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    // Fill key first to avoid layout shift from validation on blur
    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.click(keyInput);
    await userEvent.fill(keyInput, 'test');

    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should show loading text on save button while saving', async () => {
    let resolvePromise: () => void;
    const slowOnSave = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      resolvePromise = resolve;
    }));

    await render(<AddMergeFieldModal {...defaultProps} onSave={slowOnSave} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.type(keyInput, 'member_name');

    const labelInput = page.getByPlaceholder('e.g. Member Name');
    await userEvent.type(labelInput, 'Member Name');

    const defaultValueInput = page.getByPlaceholder('e.g. John Doe');
    await userEvent.type(defaultValueInput, 'John Doe');

    const saveButton = page.getByRole('button', { name: 'Add Field' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 100));

    const savingButton = page.getByText('Adding...');

    expect(savingButton).toBeTruthy();

    resolvePromise!();
  });

  it('should disable cancel button while saving', async () => {
    let resolvePromise: () => void;
    const slowOnSave = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      resolvePromise = resolve;
    }));

    await render(<AddMergeFieldModal {...defaultProps} onSave={slowOnSave} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.type(keyInput, 'member_name');

    const labelInput = page.getByPlaceholder('e.g. Member Name');
    await userEvent.type(labelInput, 'Member Name');

    const defaultValueInput = page.getByPlaceholder('e.g. John Doe');
    await userEvent.type(defaultValueInput, 'John Doe');

    const saveButton = page.getByRole('button', { name: 'Add Field' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 100));

    const buttons = Array.from(document.querySelectorAll('button'));
    const cancelButton = buttons.find(btn => btn.textContent?.includes('Cancel'));

    expect(cancelButton?.disabled).toBe(true);

    resolvePromise!();
  });

  it('should reset form state after successful save', async () => {
    await render(<AddMergeFieldModal {...defaultProps} />);

    const keyInput = page.getByPlaceholder('e.g. member_name');
    await userEvent.type(keyInput, 'member_name');

    const labelInput = page.getByPlaceholder('e.g. Member Name');
    await userEvent.type(labelInput, 'Member Name');

    const defaultValueInput = page.getByPlaceholder('e.g. John Doe');
    await userEvent.type(defaultValueInput, 'John Doe');

    const saveButton = page.getByRole('button', { name: 'Add Field' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    const keyEl = document.querySelector('input[placeholder="e.g. member_name"]') as HTMLInputElement;
    const labelEl = document.querySelector('input[placeholder="e.g. Member Name"]') as HTMLInputElement;
    const defaultEl = document.querySelector('input[placeholder="e.g. John Doe"]') as HTMLInputElement;

    expect(keyEl.value).toBe('');
    expect(labelEl.value).toBe('');
    expect(defaultEl.value).toBe('');
  });
});
