import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditWaiverContentModal } from './EditWaiverContentModal';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Edit Waiver Content',
  name_label: 'Waiver Name',
  name_placeholder: 'Enter waiver name...',
  name_error: 'Waiver name is required',
  version_warning: 'Editing content will create a new version. Existing signatures remain linked to their original version.',
  content_label: 'Content',
  content_placeholder: 'Enter waiver content...',
  content_error: 'Content must be at least 100 characters',
  content_help: 'Supports plain text formatting',
  cancel_button: 'Cancel',
  save_button: 'Save Changes',
  saving_button: 'Saving...',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === 'content_character_count' && params) {
      return `${params.count} / ${params.max}`;
    }
    return translationKeys[key] || key;
  },
}));

describe('EditWaiverContentModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  const validContent = 'A'.repeat(150);

  const defaultName = 'Standard Adult Waiver';

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    name: defaultName,
    content: validContent,
    onSave: mockOnSave,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render dialog with title when open', async () => {
    await render(<EditWaiverContentModal {...defaultProps} />);

    const heading = page.getByText('Edit Waiver Content');

    expect(heading).toBeTruthy();
  });

  it('should display version warning banner', async () => {
    await render(<EditWaiverContentModal {...defaultProps} />);

    const warning = page.getByText('Editing content will create a new version. Existing signatures remain linked to their original version.');

    expect(warning).toBeTruthy();
  });

  it('should show textarea with initial content', async () => {
    await render(<EditWaiverContentModal {...defaultProps} />);

    const textarea = document.querySelector('textarea');

    expect(textarea).toBeTruthy();
    expect(textarea?.value).toBe(validContent);
  });

  it('should show character count', async () => {
    await render(<EditWaiverContentModal {...defaultProps} />);

    const charCount = page.getByText('150 / 50000');

    expect(charCount).toBeTruthy();
  });

  it('should disable save button when content is too short', async () => {
    const shortContent = 'A'.repeat(50);
    await render(<EditWaiverContentModal {...defaultProps} content={shortContent} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should enable save button when content is valid', async () => {
    await render(<EditWaiverContentModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should show validation error after blur when content is too short', async () => {
    const shortContent = 'A'.repeat(50);
    await render(<EditWaiverContentModal {...defaultProps} content={shortContent} />);

    const textarea = document.querySelector('textarea')!;
    await userEvent.click(textarea);
    await userEvent.tab();

    const error = page.getByText('Content must be at least 100 characters');

    expect(error).toBeTruthy();
  });

  it('should show name input with initial value', async () => {
    await render(<EditWaiverContentModal {...defaultProps} />);

    const nameInput = document.querySelector('input');

    expect(nameInput).toBeTruthy();
    expect(nameInput?.value).toBe(defaultName);
  });

  it('should disable save button when name is empty', async () => {
    await render(<EditWaiverContentModal {...defaultProps} />);

    const nameInput = document.querySelector('input')!;
    await userEvent.clear(nameInput);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should show name validation error after blur when name is empty', async () => {
    await render(<EditWaiverContentModal {...defaultProps} />);

    const nameInput = document.querySelector('input')!;
    await userEvent.clear(nameInput);
    await userEvent.tab();

    const error = page.getByText('Waiver name is required');

    expect(error).toBeTruthy();
  });

  it('should call onSave with name and content data when save is clicked', async () => {
    await render(<EditWaiverContentModal {...defaultProps} />);

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({ name: defaultName, content: validContent });
  });

  it('should call onClose when cancel is clicked', async () => {
    await render(<EditWaiverContentModal {...defaultProps} />);

    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
