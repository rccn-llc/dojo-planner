import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { DeleteWaiverAlertDialog } from './DeleteWaiverAlertDialog';

describe('DeleteWaiverAlertDialog', () => {
  const defaultProps = {
    isOpen: true,
    waiverName: 'Standard Adult Waiver',
    onCloseAction: vi.fn(),
    onConfirmAction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title and waiver-name interpolated description', async () => {
    await render(
      <I18nWrapper>
        <DeleteWaiverAlertDialog {...defaultProps} />
      </I18nWrapper>,
    );

    expect(page.getByRole('heading', { name: 'Are you absolutely sure?' })).toBeInTheDocument();
    expect(page.getByText(/Standard Adult Waiver/)).toBeInTheDocument();
  });

  it('does not render when isOpen is false', async () => {
    await render(
      <I18nWrapper>
        <DeleteWaiverAlertDialog {...defaultProps} isOpen={false} />
      </I18nWrapper>,
    );

    expect(page.getByRole('heading', { name: 'Are you absolutely sure?' }).elements().length).toBe(0);
  });

  it('calls onCloseAction when cancel is clicked', async () => {
    const onCloseAction = vi.fn();
    await render(
      <I18nWrapper>
        <DeleteWaiverAlertDialog {...defaultProps} onCloseAction={onCloseAction} />
      </I18nWrapper>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

    expect(onCloseAction).toHaveBeenCalled();
  });

  it('calls onConfirmAction when delete is clicked', async () => {
    const onConfirmAction = vi.fn();
    await render(
      <I18nWrapper>
        <DeleteWaiverAlertDialog {...defaultProps} onConfirmAction={onConfirmAction} />
      </I18nWrapper>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Delete' }));

    expect(onConfirmAction).toHaveBeenCalled();
  });

  it('exposes the alertdialog role', async () => {
    await render(
      <I18nWrapper>
        <DeleteWaiverAlertDialog {...defaultProps} />
      </I18nWrapper>,
    );

    expect(page.getByRole('alertdialog')).toBeInTheDocument();
  });
});
