import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { AddWaiverModal } from './AddWaiverModal';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Add Waiver',
  name_label: 'Name',
  name_placeholder: 'Enter waiver name...',
  name_error: 'Name is required',
  description_label: 'Description',
  description_placeholder: 'Enter a short description...',
  content_label: 'Content',
  content_placeholder: 'Enter waiver content...',
  content_error: 'Content must be at least 100 characters',
  content_help: 'Supports plain text formatting',
  status_label: 'Status',
  status_active: 'Active',
  status_inactive: 'Inactive',
  default_label: 'Default',
  default_yes: 'Yes',
  default_no: 'No',
  guardian_label: 'Guardian',
  guardian_yes: 'Required',
  guardian_no: 'Not required',
  guardian_age_label: 'Guardian Age Threshold',
  guardian_age_help: 'Age below which a guardian is required',
  cancel_button: 'Cancel',
  save_button: 'Save',
  saving_button: 'Saving...',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === 'content_character_count' && params) {
      return `${params.count} / ${params.max}`;
    }
    if (key === 'description_character_count' && params) {
      return `${params.count} / ${params.max}`;
    }
    return translationKeys[key] || key;
  },
}));

describe('AddWaiverModal', () => {
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
    await render(<AddWaiverModal {...defaultProps} />);

    const heading = page.getByText('Add Waiver');

    expect(heading).toBeTruthy();
  });

  it('should show name input with placeholder', async () => {
    await render(<AddWaiverModal {...defaultProps} />);

    const nameInput = page.getByPlaceholder('Enter waiver name...');

    expect(nameInput).toBeTruthy();
  });

  it('should show content textarea with placeholder', async () => {
    await render(<AddWaiverModal {...defaultProps} />);

    const contentTextarea = page.getByPlaceholder('Enter waiver content...');

    expect(contentTextarea).toBeTruthy();
  });

  it('should show description textarea', async () => {
    await render(<AddWaiverModal {...defaultProps} />);

    const descriptionTextarea = page.getByPlaceholder('Enter a short description...');

    expect(descriptionTextarea).toBeTruthy();
  });

  it('should show status, default, and guardian toggle switches', async () => {
    await render(<AddWaiverModal {...defaultProps} />);

    const switches = document.querySelectorAll('[role="switch"]');

    expect(switches).toHaveLength(3);
  });

  it('should show guardian age threshold input when requiresGuardian is checked by default', async () => {
    await render(<AddWaiverModal {...defaultProps} />);

    const ageLabel = page.getByText('Guardian Age Threshold');
    const ageInput = document.querySelector('input[type="number"]');

    expect(ageLabel).toBeTruthy();
    expect(ageInput).toBeTruthy();
    expect((ageInput as HTMLInputElement)?.value).toBe('16');
  });

  it('should show name validation error when name is empty and blurred', async () => {
    await render(<AddWaiverModal {...defaultProps} />);

    const nameInput = page.getByPlaceholder('Enter waiver name...');
    await userEvent.click(nameInput);
    await userEvent.tab();

    const error = page.getByText('Name is required');

    expect(error).toBeTruthy();
  });

  it('should show content validation error when content is too short and blurred', async () => {
    await render(<AddWaiverModal {...defaultProps} />);

    const contentTextarea = page.getByPlaceholder('Enter waiver content...');
    await userEvent.click(contentTextarea);
    await userEvent.type(contentTextarea, 'Short content');
    await userEvent.tab();

    const error = page.getByText('Content must be at least 100 characters');

    expect(error).toBeTruthy();
  });

  it('should disable save button when form is invalid', async () => {
    await render(<AddWaiverModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should enable save button when form is valid', async () => {
    await render(<AddWaiverModal {...defaultProps} />);

    const nameInput = page.getByPlaceholder('Enter waiver name...');
    await userEvent.type(nameInput, 'Test Waiver');

    const contentTextarea = page.getByPlaceholder('Enter waiver content...');
    const validContent = 'A'.repeat(100);
    await userEvent.type(contentTextarea, validContent);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should call onSave with correct form data when submitted', async () => {
    await render(<AddWaiverModal {...defaultProps} />);

    const nameInput = page.getByPlaceholder('Enter waiver name...');
    await userEvent.type(nameInput, 'Test Waiver');

    const contentTextarea = page.getByPlaceholder('Enter waiver content...');
    const validContent = 'A'.repeat(100);
    await userEvent.type(contentTextarea, validContent);

    const saveButton = page.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'Test Waiver',
      content: validContent,
      description: null,
      isActive: true,
      isDefault: false,
      requiresGuardian: true,
      guardianAgeThreshold: 16,
    });
  });

  it('should call onClose when Cancel is clicked', async () => {
    await render(<AddWaiverModal {...defaultProps} />);

    // Fill name first to ensure no layout shift from validation on blur
    const nameInput = page.getByPlaceholder('Enter waiver name...');
    await userEvent.click(nameInput);
    await userEvent.fill(nameInput, 'Test');

    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
