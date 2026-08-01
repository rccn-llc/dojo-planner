import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { DeleteCatalogCategoryAlertDialog } from './DeleteCatalogCategoryAlertDialog';

describe('DeleteCatalogCategoryAlertDialog', () => {
  const defaultProps = {
    isOpen: true,
    categoryName: 'Apparel',
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
          <DeleteCatalogCategoryAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Are you absolutely sure?' });

      expect(title).toBeInTheDocument();
    });

    it('renders the description with the category name interpolated', async () => {
      await render(
        <I18nWrapper>
          <DeleteCatalogCategoryAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      const description = page.getByText(/Apparel/);

      expect(description).toBeInTheDocument();
    });

    it('renders the cancel and delete buttons', async () => {
      await render(
        <I18nWrapper>
          <DeleteCatalogCategoryAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      expect(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(page.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });
  });

  describe('Visibility', () => {
    it('does not render when isOpen is false', async () => {
      await render(
        <I18nWrapper>
          <DeleteCatalogCategoryAlertDialog {...defaultProps} isOpen={false} />
        </I18nWrapper>,
      );

      expect(page.getByRole('heading', { name: 'Are you absolutely sure?' }).elements().length).toBe(0);
    });
  });

  describe('Actions', () => {
    it('calls onCloseAction when cancel is clicked', async () => {
      const onCloseAction = vi.fn();

      await render(
        <I18nWrapper>
          <DeleteCatalogCategoryAlertDialog {...defaultProps} onCloseAction={onCloseAction} />
        </I18nWrapper>,
      );

      await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

      expect(onCloseAction).toHaveBeenCalled();
    });

    it('calls onConfirmAction when delete is clicked', async () => {
      const onConfirmAction = vi.fn();

      await render(
        <I18nWrapper>
          <DeleteCatalogCategoryAlertDialog {...defaultProps} onConfirmAction={onConfirmAction} />
        </I18nWrapper>,
      );

      await userEvent.click(page.getByRole('button', { name: 'Delete' }));

      expect(onConfirmAction).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has accessible dialog role', async () => {
      await render(
        <I18nWrapper>
          <DeleteCatalogCategoryAlertDialog {...defaultProps} />
        </I18nWrapper>,
      );

      expect(page.getByRole('alertdialog')).toBeInTheDocument();
    });
  });
});
