import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { DeleteClassAlertDialog } from './DeleteClassAlertDialog';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Are you absolutely sure?',
  cancel_button: 'Cancel',
  delete_button: 'Delete',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (key === 'description' && params?.className) {
      return `This action cannot be undone. This will permanently delete the "${params.className}" class and remove the data from the servers.`;
    }
    return translationKeys[key] || key;
  },
}));

describe('DeleteClassAlertDialog', () => {
  const mockOnCloseAction = vi.fn();
  const mockOnConfirmAction = vi.fn();

  const defaultProps = {
    isOpen: true,
    classDisplayName: 'BJJ Fundamentals I',
    onCloseAction: mockOnCloseAction,
    onConfirmAction: mockOnConfirmAction,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the dialog with title when open', async () => {
    await render(<DeleteClassAlertDialog {...defaultProps} />);

    const heading = page.getByText('Are you absolutely sure?');

    expect(heading).toBeTruthy();
  });

  it('should not render when isOpen is false', async () => {
    await render(<DeleteClassAlertDialog {...defaultProps} isOpen={false} />);

    const heading = document.body.textContent?.includes('Are you absolutely sure?');

    expect(heading).toBe(false);
  });

  it('should render description with class name', async () => {
    await render(<DeleteClassAlertDialog {...defaultProps} />);

    const description = page.getByText(/This action cannot be undone. This will permanently delete the "BJJ Fundamentals I" class/);

    expect(description).toBeTruthy();
  });

  it('should render Cancel button', async () => {
    await render(<DeleteClassAlertDialog {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');

    expect(cancelButton).toBeTruthy();
  });

  it('should render Delete button', async () => {
    await render(<DeleteClassAlertDialog {...defaultProps} />);

    const deleteButton = page.getByText('Delete');

    expect(deleteButton).toBeTruthy();
  });

  it('should call onCloseAction when Cancel button is clicked', async () => {
    await render(<DeleteClassAlertDialog {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');
    await userEvent.click(cancelButton);

    expect(mockOnCloseAction).toHaveBeenCalledTimes(1);
  });

  it('should call onConfirmAction when Delete button is clicked', async () => {
    await render(<DeleteClassAlertDialog {...defaultProps} />);

    const deleteButton = page.getByRole('button', { name: 'Delete' });
    await userEvent.click(deleteButton);

    expect(mockOnConfirmAction).toHaveBeenCalledTimes(1);
  });

  it('should display different class names', async () => {
    await render(<DeleteClassAlertDialog {...defaultProps} classDisplayName="Advanced Sparring" />);

    const description = page.getByText(/This action cannot be undone. This will permanently delete the "Advanced Sparring" class/);

    expect(description).toBeTruthy();
  });
});
