import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { RefundConfirmDialog } from './RefundConfirmDialog';

const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}|${Object.values(params).join('|')}` : key;
vi.mock('next-intl', () => ({ useTranslations: () => translate }));

function renderDialog(overrides: Partial<Parameters<typeof RefundConfirmDialog>[0]> = {}) {
  const props = {
    isOpen: true,
    amountLabel: '$1.04',
    isRefunding: false,
    errorMessage: null,
    onCloseAction: vi.fn(),
    onConfirmAction: vi.fn(),
    ...overrides,
  };
  return { props, result: render(<RefundConfirmDialog {...props} />) };
}

describe('RefundConfirmDialog', () => {
  it('names the amount and warns that it cannot be undone', async () => {
    const { result } = renderDialog();
    await result;

    await expect.element(page.getByText('title|$1.04')).toBeInTheDocument();
    await expect.element(page.getByText('description|$1.04')).toBeInTheDocument();
    await expect.element(page.getByText('cannot_undo')).toBeInTheDocument();
    await expect.element(page.getByTestId('refund-confirm-button')).toHaveTextContent('confirm_button|$1.04');
  });

  it('confirms and cancels through the callbacks', async () => {
    const { props, result } = renderDialog();
    await result;

    await userEvent.click(page.getByTestId('refund-confirm-button'));

    expect(props.onConfirmAction).toHaveBeenCalledTimes(1);

    await userEvent.click(page.getByText('cancel_button'));

    expect(props.onCloseAction).toHaveBeenCalledTimes(1);
  });

  it('cannot be dismissed or confirmed twice while the refund runs', async () => {
    const { props, result } = renderDialog({ isRefunding: true });
    await result;

    await expect.element(page.getByTestId('refund-confirm-button')).toBeDisabled();
    await expect.element(page.getByTestId('refund-confirm-button')).toHaveTextContent('refunding_button');
    await expect.element(page.getByText('cancel_button')).toBeDisabled();

    await userEvent.keyboard('{Escape}');

    expect(props.onCloseAction).not.toHaveBeenCalled();
  });

  it('shows the error from a failed refund', async () => {
    const { result } = renderDialog({ errorMessage: 'IQPro refused the refund' });
    await result;

    await expect.element(page.getByRole('alert')).toHaveTextContent('IQPro refused the refund');
  });

  it('closes on Escape when idle', async () => {
    const { props, result } = renderDialog();
    await result;

    await expect.element(page.getByTestId('refund-confirm-dialog')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(props.onCloseAction).toHaveBeenCalledTimes(1);
  });
});
