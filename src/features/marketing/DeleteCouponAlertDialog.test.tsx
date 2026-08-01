import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { DeleteCouponAlertDialog } from './DeleteCouponAlertDialog';

describe('DeleteCouponAlertDialog', () => {
  const defaultProps = {
    isOpen: true,
    couponCode: 'SUMMER25',
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
          <DeleteCouponAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Are you absolutely sure?' });

      expect(title).toBeInTheDocument();
    });

    it('renders the dialog description with coupon code', async () => {
      await render(
        <I18nWrapper>
          <DeleteCouponAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const description = page.getByText(/SUMMER25/);

      expect(description).toBeInTheDocument();
    });

    it('renders the cancel button', async () => {
      await render(
        <I18nWrapper>
          <DeleteCouponAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const cancelButton = page.getByRole('button', { name: 'Cancel' });

      expect(cancelButton).toBeInTheDocument();
    });

    it('renders the delete button', async () => {
      await render(
        <I18nWrapper>
          <DeleteCouponAlertDialog {...defaultProps} />
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
          <DeleteCouponAlertDialog {...defaultProps} isOpen={false} />
        </I18nWrapper>,
      );

      const titles = page.getByRole('heading', { name: 'Are you absolutely sure?' }).elements();

      expect(titles.length).toBe(0);
    });

    it('renders content when isOpen is true', async () => {
      await render(
        <I18nWrapper>
          <DeleteCouponAlertDialog {...defaultProps} isOpen />
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
          <DeleteCouponAlertDialog {...defaultProps} onCloseAction={onCloseAction} />
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
          <DeleteCouponAlertDialog {...defaultProps} onConfirmAction={onConfirmAction} />
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
          <DeleteCouponAlertDialog
            {...defaultProps}
            onCloseAction={onCloseAction}
            onConfirmAction={onConfirmAction}
          />
        </I18nWrapper>,
      );

      const deleteButton = page.getByRole('button', { name: 'Delete' });
      await userEvent.click(deleteButton);

      expect(onConfirmAction).toHaveBeenCalled();
      expect(onCloseAction).toHaveBeenCalled();
    });
  });

  describe('Button Styles', () => {
    it('delete button has destructive styling', async () => {
      await render(
        <I18nWrapper>
          <DeleteCouponAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const deleteButton = page.getByRole('button', { name: 'Delete' });

      expect(deleteButton).toHaveClass('bg-destructive');
    });
  });

  describe('Accessibility', () => {
    it('has accessible dialog role', async () => {
      await render(
        <I18nWrapper>
          <DeleteCouponAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const alertDialog = page.getByRole('alertdialog');

      expect(alertDialog).toBeInTheDocument();
    });

    it('has accessible dialog description', async () => {
      await render(
        <I18nWrapper>
          <DeleteCouponAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const alertDialog = page.getByRole('alertdialog');

      expect(alertDialog).toHaveAccessibleDescription();
    });
  });
});
