import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { RetryPaymentModal } from './RetryPaymentModal';

// Render keys with their params so assertions can see what was interpolated.
const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}|${Object.values(params).join('|')}` : key;
vi.mock('next-intl', () => ({
  useTranslations: () => translate,
}));

const mockSync = vi.fn();
const mockQuote = vi.fn();
const mockRetry = vi.fn();
vi.mock('@/libs/Orpc', () => ({
  client: {
    member: { syncPaymentMethod: (...a: unknown[]) => mockSync(...a) },
    transactions: {
      retryQuote: (...a: unknown[]) => mockQuote(...a),
      retry: (...a: unknown[]) => mockRetry(...a),
    },
  },
}));

const baseQuote = {
  transactionId: 'tx-1',
  provider: 'square',
  memberName: 'Pat Due',
  planName: 'Gold Monthly',
  failedAt: new Date('2026-10-01T12:00:00Z'),
  failureReason: 'Insufficient funds',
  baseAmount: 100,
  fees: { baseAmount: 100, serviceFeeAmount: 3.75, serviceFeePct: 3.75, taxAmount: 0, amount: 103.75 },
  card: { type: 'card', cardBrand: 'VISA', last4: '4242', expirationDate: '03/29', updatedAt: null, updatedSource: null, updatedAfterFailure: false },
  declineCount: 1,
  autoRetriesRemaining: 0,
  paysInvoice: false,
  doubleChargeRisk: false,
  overdue: false,
  blockedReason: null,
};

function renderModal(onClose = vi.fn()) {
  return {
    onClose,
    view: render(<RetryPaymentModal isOpen transactionId="tx-1" memberId="mem-1" onCloseAction={onClose} />),
  };
}

const chargeButton = () => page.getByRole('button', { name: /charge_button/ });

describe('RetryPaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSync.mockResolvedValue({ changed: false });
    mockQuote.mockResolvedValue(baseQuote);
  });

  describe('loading → confirm', () => {
    it('refreshes the card from the provider BEFORE quoting, then shows the confirm step', async () => {
      let resolveSync: (v: unknown) => void = () => {};
      mockSync.mockReturnValue(new Promise((r) => {
        resolveSync = r;
      }));
      await renderModal().view;

      await expect.element(page.getByTestId('retry-loading')).toBeInTheDocument();
      expect(mockQuote).not.toHaveBeenCalled();

      resolveSync({ changed: false });

      await expect.element(chargeButton()).toBeInTheDocument();
      expect(mockSync).toHaveBeenCalledWith({ memberId: 'mem-1' });
      expect(mockQuote).toHaveBeenCalledWith({ transactionId: 'tx-1' });
    });

    it('shows the breakdown, the card, and the failure reason', async () => {
      await renderModal().view;

      await expect.element(page.getByText('$103.75').first()).toBeInTheDocument();
      await expect.element(page.getByText('$3.75')).toBeInTheDocument();
      await expect.element(page.getByText(/VISA •••• 4242/)).toBeInTheDocument();
      await expect.element(page.getByText('reason|Insufficient funds')).toBeInTheDocument();
      await expect.element(page.getByText('subtitle|Pat Due|Gold Monthly')).toBeInTheDocument();
      await expect.element(page.getByText('card_unchanged_warning')).toBeInTheDocument();
    });

    it('still lets staff retry when the card refresh fails, with a note', async () => {
      mockSync.mockRejectedValue(new Error('provider down'));
      await renderModal().view;

      await expect.element(page.getByText('sync_failed_note')).toBeInTheDocument();
      await expect.element(chargeButton()).toBeEnabled();
    });

    it('treats a sync result carrying an error as a failed refresh', async () => {
      mockSync.mockResolvedValue({ changed: false, error: 'Could not read' });
      await renderModal().view;

      await expect.element(page.getByText('sync_failed_note')).toBeInTheDocument();
    });

    it('shows the "updated by member" badge instead of the unchanged warning', async () => {
      mockQuote.mockResolvedValue({ ...baseQuote, card: { ...baseQuote.card, updatedAfterFailure: true, updatedAt: new Date('2026-10-02'), updatedSource: 'provider_sync' } });
      await renderModal().view;

      await expect.element(page.getByText(/card_updated_badge/)).toBeInTheDocument();
      expect(page.getByText('card_unchanged_warning').elements()).toHaveLength(0);
    });

    it('describes a bank account and a missing local card', async () => {
      mockQuote.mockResolvedValue({ ...baseQuote, card: { ...baseQuote.card, type: 'bank_transfer', cardBrand: null, last4: null, expirationDate: null } });
      await renderModal().view;

      await expect.element(page.getByText('bank_account')).toBeInTheDocument();
    });

    it('handles no card and no fee quote', async () => {
      mockQuote.mockResolvedValue({ ...baseQuote, card: null, fees: null });
      await renderModal().view;

      await expect.element(page.getByText('no_card_local')).toBeInTheDocument();
      await expect.element(page.getByText('charge_button|$100.00')).toBeInTheDocument();
    });

    it('shows the error state when the quote is refused (e.g. already collected)', async () => {
      mockQuote.mockRejectedValue(Object.assign(new Error('This payment has already been collected.'), { status: 409 }));
      await renderModal().view;

      await expect.element(page.getByTestId('retry-error')).toBeInTheDocument();
      await expect.element(page.getByText('This payment has already been collected.')).toBeInTheDocument();
      expect(page.getByRole('button', { name: 'try_again_button' }).elements()).toHaveLength(0);
    });
  });

  describe('IQPro auto-retry warning', () => {
    it('requires the acknowledgement checkbox before charging', async () => {
      mockQuote.mockResolvedValue({ ...baseQuote, provider: 'iqpro', autoRetriesRemaining: 2, doubleChargeRisk: true });
      await renderModal().view;

      await expect.element(page.getByText(/auto_retry_warning\|2/)).toBeInTheDocument();
      await expect.element(chargeButton()).toBeDisabled();

      await userEvent.click(page.getByRole('checkbox'));

      await expect.element(chargeButton()).toBeEnabled();
    });

    it('shows NO warning when the retry pays the IQPro invoice, even with automatic retries left', async () => {
      mockQuote.mockResolvedValue({ ...baseQuote, provider: 'iqpro', autoRetriesRemaining: 2, paysInvoice: true, doubleChargeRisk: false });
      await renderModal().view;

      await expect.element(page.getByTestId('pays-invoice-note')).toHaveTextContent('pays_invoice_note');
      expect(page.getByText(/auto_retry_warning/).elements()).toHaveLength(0);
      expect(page.getByRole('checkbox').elements()).toHaveLength(0);
      await expect.element(chargeButton()).toBeEnabled();
    });

    it('shows the overdue note when IQPro has stopped retrying', async () => {
      mockQuote.mockResolvedValue({ ...baseQuote, provider: 'iqpro', overdue: true, declineCount: 3 });
      await renderModal().view;

      await expect.element(page.getByText('overdue_note')).toBeInTheDocument();
      await expect.element(chargeButton()).toBeEnabled();
    });

    it('disables charging when policy blocks the retry', async () => {
      mockQuote.mockResolvedValue({ ...baseQuote, blockedReason: 'IQPro is still retrying this charge automatically.' });
      await renderModal().view;

      await expect.element(page.getByText('IQPro is still retrying this charge automatically.')).toBeInTheDocument();
      await expect.element(chargeButton()).toBeDisabled();
    });
  });

  describe('processing', () => {
    it('cannot be dismissed while the charge is in flight', async () => {
      let resolveRetry: (v: unknown) => void = () => {};
      mockRetry.mockReturnValue(new Promise((r) => {
        resolveRetry = r;
      }));
      const { onClose, view } = renderModal();
      await view;
      await userEvent.click(chargeButton());

      await expect.element(page.getByRole('button', { name: /processing_button/ })).toBeDisabled();
      await expect.element(page.getByRole('button', { name: 'cancel_button' })).toBeDisabled();
      // No close (X) button while processing.
      expect(page.getByRole('button', { name: 'Close' }).elements()).toHaveLength(0);

      await userEvent.keyboard('{Escape}');

      expect(onClose).not.toHaveBeenCalled();
      await expect.element(page.getByRole('dialog')).toBeInTheDocument();

      resolveRetry({ status: 'approved', retryTransactionId: 'abcdef123456789', amountCharged: 103.75, membershipReactivated: true });

      await expect.element(page.getByTestId('retry-approved')).toBeInTheDocument();
    });
  });

  describe('results', () => {
    it('approved: shows the amount, transaction id and reactivation; Done reports a change', async () => {
      mockRetry.mockResolvedValue({ status: 'approved', retryTransactionId: 'abcdef123456789', amountCharged: 103.75, membershipReactivated: true });
      const { onClose, view } = renderModal();
      await view;
      await userEvent.click(chargeButton());

      await expect.element(page.getByText('approved_title|$103.75')).toBeInTheDocument();
      await expect.element(page.getByText('transaction_ref|ABCDEF123456')).toBeInTheDocument();
      await expect.element(page.getByText('membership_reactivated')).toBeInTheDocument();
      expect(mockRetry).toHaveBeenCalledWith({ transactionId: 'tx-1' });

      await userEvent.click(page.getByRole('button', { name: 'done_button' }));

      expect(onClose).toHaveBeenCalledWith(true);
    });

    it('approved with a warning: shows the invoice warning; falls back to the quote total', async () => {
      mockRetry.mockResolvedValue({ status: 'approved', retryTransactionId: 'r1', membershipReactivated: false, warning: 'Void the invoice in Square.' });
      await renderModal().view;
      await userEvent.click(chargeButton());

      await expect.element(page.getByText('Void the invoice in Square.')).toBeInTheDocument();
      await expect.element(page.getByText('approved_title|$103.75')).toBeInTheDocument();
      expect(page.getByText('membership_reactivated').elements()).toHaveLength(0);
    });

    it('declined: shows the reason and that it was recorded; Try again re-syncs and re-quotes', async () => {
      mockRetry.mockResolvedValue({ status: 'declined', retryTransactionId: 'r2', declineReason: 'Do not honor', membershipReactivated: false });
      const { onClose, view } = renderModal();
      await view;
      await userEvent.click(chargeButton());

      await expect.element(page.getByText('declined_title|Do not honor')).toBeInTheDocument();
      await expect.element(page.getByText('declined_recorded')).toBeInTheDocument();

      await userEvent.click(page.getByRole('button', { name: 'try_again_button' }));

      await expect.element(chargeButton()).toBeInTheDocument();
      expect(mockSync).toHaveBeenCalledTimes(2);
      expect(mockQuote).toHaveBeenCalledTimes(2);

      await userEvent.click(page.getByRole('button', { name: 'cancel_button' }));

      // A charge WAS attempted, so the caller should refresh.
      expect(onClose).toHaveBeenCalledWith(true);
    });

    it('declined without a reason uses the default', async () => {
      mockRetry.mockResolvedValue({ status: 'declined', retryTransactionId: 'r3', membershipReactivated: false });
      await renderModal().view;
      await userEvent.click(chargeButton());

      await expect.element(page.getByText('declined_title|declined_default')).toBeInTheDocument();
    });

    it('error (not 409): shows the server message and offers Try again', async () => {
      mockRetry.mockRejectedValue(Object.assign(new Error('No saved payment method.'), { status: 422 }));
      await renderModal().view;
      await userEvent.click(chargeButton());

      await expect.element(page.getByTestId('retry-error')).toBeInTheDocument();
      await expect.element(page.getByText('No saved payment method.')).toBeInTheDocument();
      await expect.element(page.getByRole('button', { name: 'try_again_button' })).toBeInTheDocument();
    });

    it('error 409 (already in progress): no Try again; Close reports a change', async () => {
      mockRetry.mockRejectedValue(Object.assign(new Error('A retry is already in progress.'), { status: 409 }));
      const { onClose, view } = renderModal();
      await view;
      await userEvent.click(chargeButton());

      await expect.element(page.getByText('A retry is already in progress.')).toBeInTheDocument();
      expect(page.getByRole('button', { name: 'try_again_button' }).elements()).toHaveLength(0);

      await userEvent.click(page.getByRole('button', { name: 'close_button' }));

      expect(onClose).toHaveBeenCalledWith(true);
    });

    it('error without a message falls back to the generic text', async () => {
      mockRetry.mockRejectedValue('boom');
      await renderModal().view;
      await userEvent.click(chargeButton());

      await expect.element(page.getByText('error_generic')).toBeInTheDocument();
    });
  });

  describe('closing', () => {
    it('Cancel before charging reports no change', async () => {
      const { onClose, view } = renderModal();
      await view;

      await expect.element(chargeButton()).toBeInTheDocument();

      await userEvent.click(page.getByRole('button', { name: 'cancel_button' }));

      expect(onClose).toHaveBeenCalledWith(false);
    });

    it('does nothing without a transaction id', async () => {
      await render(<RetryPaymentModal isOpen={false} transactionId={null} memberId={null} onCloseAction={vi.fn()} />);

      expect(mockQuote).not.toHaveBeenCalled();
      expect(mockSync).not.toHaveBeenCalled();
    });

    it('skips the card refresh when no member id is known', async () => {
      await render(<RetryPaymentModal isOpen transactionId="tx-1" memberId={null} onCloseAction={vi.fn()} />);

      await expect.element(chargeButton()).toBeInTheDocument();
      expect(mockSync).not.toHaveBeenCalled();
    });
  });
});
