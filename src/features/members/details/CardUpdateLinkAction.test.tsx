import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { CardUpdateLinkAction } from './CardUpdateLinkAction';

const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}|${Object.values(params).join('|')}` : key;
vi.mock('next-intl', () => ({ useTranslations: () => translate }));

const { statusMock, sendMock } = vi.hoisted(() => ({ statusMock: vi.fn(), sendMock: vi.fn() }));
vi.mock('@/libs/Orpc', () => ({
  client: {
    member: {
      paymentMethodUpdateRequest: (...a: unknown[]) => statusMock(...a),
      sendPaymentMethodUpdateLink: (...a: unknown[]) => sendMock(...a),
    },
  },
}));

const pending = (linkSentAt: Date | null) => ({ id: 'req-1', reason: linkSentAt ? 'staff' : 'decline', linkSentAt, createdAt: new Date('2026-10-01T12:00:00Z') });

describe('CardUpdateLinkAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing where a link cannot be sent (Square, no IQPro customer)', async () => {
    statusMock.mockResolvedValue({ supported: false, request: null });
    await render(<CardUpdateLinkAction memberId="mem-1" />);

    await vi.waitFor(() => expect(statusMock).toHaveBeenCalledWith({ memberId: 'mem-1' }));

    expect(page.getByTestId('card-update-link').elements()).toHaveLength(0);
  });

  it('offers the link when none is open', async () => {
    statusMock.mockResolvedValue({ supported: true, request: null });
    await render(<CardUpdateLinkAction memberId="mem-1" />);

    await expect.element(page.getByTestId('send-card-update-link')).toHaveTextContent('card_update_link_button');
    expect(page.getByText(/card_update_waiting/).elements()).toHaveLength(0);
  });

  it('says it is waiting when a decline opened a request but no link was sent', async () => {
    statusMock.mockResolvedValue({ supported: true, request: pending(null) });
    await render(<CardUpdateLinkAction memberId="mem-1" />);

    await expect.element(page.getByText('card_update_waiting')).toBeInTheDocument();
    await expect.element(page.getByTestId('send-card-update-link')).toHaveTextContent('card_update_link_button');
  });

  it('sends the link, then shows when it went out and offers a resend', async () => {
    statusMock
      .mockResolvedValueOnce({ supported: true, request: null })
      .mockResolvedValueOnce({ supported: true, request: pending(new Date('2026-10-02T09:00:00Z')) });
    sendMock.mockResolvedValue({ requestId: 'req-1', created: true, linkSent: true });
    await render(<CardUpdateLinkAction memberId="mem-1" />);

    await userEvent.click(page.getByTestId('send-card-update-link'));

    expect(sendMock).toHaveBeenCalledWith({ memberId: 'mem-1' });

    await expect.element(page.getByText(/card_update_link_sent/)).toBeInTheDocument();
    await expect.element(page.getByTestId('send-card-update-link')).toHaveTextContent('card_update_link_resend');
  });

  it('shows the error when the link could not be sent', async () => {
    statusMock.mockResolvedValue({ supported: true, request: null });
    sendMock.mockRejectedValueOnce(new Error('IQPro is down')).mockRejectedValueOnce('boom');
    await render(<CardUpdateLinkAction memberId="mem-1" />);

    await userEvent.click(page.getByTestId('send-card-update-link'));

    await expect.element(page.getByRole('alert')).toHaveTextContent('card_update_link_failed|IQPro is down');

    await userEvent.click(page.getByTestId('send-card-update-link'));

    await expect.element(page.getByRole('alert')).toHaveTextContent('card_update_link_failed|');
  });

  it('stays hidden when the status cannot be loaded', async () => {
    statusMock.mockRejectedValue(new Error('offline'));
    await render(<CardUpdateLinkAction memberId="mem-1" />);

    await vi.waitFor(() => expect(statusMock).toHaveBeenCalled());

    expect(page.getByTestId('card-update-link').elements()).toHaveLength(0);
  });
});
