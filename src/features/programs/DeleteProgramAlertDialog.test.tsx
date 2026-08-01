import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { DeleteProgramAlertDialog } from './DeleteProgramAlertDialog';

describe('DeleteProgramAlertDialog', () => {
  const defaultProps = {
    isOpen: true,
    programName: 'Test Program',
    onCloseAction: vi.fn(),
    onConfirmAction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dialog Content', () => {
    it('renders the dialog title', async () => {
      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Are you absolutely sure?' });

      expect(title).toBeInTheDocument();
    });

    it('renders the dialog description', async () => {
      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const description = page.getByText(/This action cannot be undone/i);

      expect(description).toBeInTheDocument();
    });

    it('renders the full warning message', async () => {
      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const description = page.getByText(
        'This action cannot be undone. This will permanently delete your program and remove the data from the servers.',
      );

      expect(description).toBeInTheDocument();
    });

    it('renders the cancel button', async () => {
      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const cancelButton = page.getByRole('button', { name: 'Cancel' });

      expect(cancelButton).toBeInTheDocument();
    });

    it('renders the delete button', async () => {
      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const deleteButton = page.getByRole('button', { name: 'Delete' });

      expect(deleteButton).toBeInTheDocument();
    });
  });

  describe('Dialog Visibility', () => {
    it('does not render content when isOpen is false', async () => {
      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} isOpen={false} />
        </I18nWrapper>,
      );

      const titles = page.getByRole('heading', { name: 'Are you absolutely sure?' }).elements();

      expect(titles.length).toBe(0);
    });

    it('renders content when isOpen is true', async () => {
      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} isOpen />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Are you absolutely sure?' });

      expect(title).toBeInTheDocument();
    });
  });

  describe('Cancel Action', () => {
    it('calls onCloseAction when cancel button is clicked', async () => {
      const onCloseAction = vi.fn();

      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} onCloseAction={onCloseAction} />
        </I18nWrapper>,
      );

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await userEvent.click(cancelButton);

      expect(onCloseAction).toHaveBeenCalled();
    });
  });

  describe('Confirm Action', () => {
    it('calls onConfirmAction when delete button is clicked', async () => {
      const onConfirmAction = vi.fn();

      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} onConfirmAction={onConfirmAction} />
        </I18nWrapper>,
      );

      const deleteButton = page.getByRole('button', { name: 'Delete' });
      await userEvent.click(deleteButton);

      expect(onConfirmAction).toHaveBeenCalled();
    });

    it('calls both onConfirmAction and onCloseAction when delete button is clicked', async () => {
      const onCloseAction = vi.fn();
      const onConfirmAction = vi.fn();

      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog
            {...defaultProps}
            onCloseAction={onCloseAction}
            onConfirmAction={onConfirmAction}
          />
        </I18nWrapper>,
      );

      const deleteButton = page.getByRole('button', { name: 'Delete' });
      await userEvent.click(deleteButton);

      // Both callbacks are called: onConfirmAction from click handler,
      // onCloseAction from dialog closing (onOpenChange with false)
      expect(onConfirmAction).toHaveBeenCalled();
      expect(onCloseAction).toHaveBeenCalled();
    });
  });

  describe('Button Styles', () => {
    it('delete button has destructive styling', async () => {
      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const deleteButton = page.getByRole('button', { name: 'Delete' });

      expect(deleteButton).toHaveClass('bg-destructive');
    });

    it('cancel button has outline styling', async () => {
      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const cancelButton = page.getByRole('button', { name: 'Cancel' });

      expect(cancelButton).toHaveClass('border');
    });
  });

  describe('Accessibility', () => {
    it('has accessible dialog title', async () => {
      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const alertDialog = page.getByRole('alertdialog');

      expect(alertDialog).toBeInTheDocument();
    });

    it('has accessible dialog description', async () => {
      await render(
        <I18nWrapper>
          <DeleteProgramAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const alertDialog = page.getByRole('alertdialog');

      expect(alertDialog).toHaveAccessibleDescription();
    });
  });
});
