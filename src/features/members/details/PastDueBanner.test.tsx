import type { PastDueBannerRow } from './PastDueBanner';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { latestRetryableFailure } from '@/features/finances/recurringPayments';
import { PastDueBanner } from './PastDueBanner';

const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}|${Object.values(params).join('|')}` : key;
vi.mock('next-intl', () => ({ useTranslations: () => translate }));

const row = (overrides: Partial<PastDueBannerRow> = {}): PastDueBannerRow => ({
  id: 'tx-1',
  memberId: 'mem-1',
  memberName: 'Pat Due',
  amount: 103.75,
  createdAt: new Date('2026-10-01T12:00:00Z'),
  status: 'declined',
  transactionType: 'membership_payment',
  recurring: { memberMembershipId: 'mm-1', failureReason: 'Insufficient funds', source: 'webhook_recurring', attemptNumber: 1, resolved: false, superseded: false },
  ...overrides,
});

describe('latestRetryableFailure', () => {
  it('returns the newest retryable failure, ignoring resolved and paid rows', () => {
    const older = row({ id: 'old', createdAt: new Date('2026-09-01') });
    const newer = row({ id: 'new', createdAt: new Date('2026-10-05') });
    const resolved = row({ id: 'res', createdAt: new Date('2026-10-10'), recurring: { memberMembershipId: 'mm', resolved: true } });
    const paid = row({ id: 'paid', status: 'paid', createdAt: new Date('2026-10-11') });

    expect(latestRetryableFailure([older, resolved, newer, paid])?.id).toBe('new');
    expect(latestRetryableFailure([paid, resolved])).toBeNull();
  });
});

describe('PastDueBanner', () => {
  it('renders nothing without a retryable failure', async () => {
    await render(<PastDueBanner rows={[row({ status: 'paid' })]} canRetry onRetryAction={vi.fn()} />);

    expect(page.getByTestId('past-due-banner').elements()).toHaveLength(0);
  });

  it('shows the failure, the IQPro attempt, and a Retry button that passes the row', async () => {
    const onRetry = vi.fn();
    await render(<PastDueBanner rows={[row({ recurring: { ...row().recurring, attemptNumber: 2 } })]} canRetry onRetryAction={onRetry} />);

    await expect.element(page.getByTestId('past-due-banner')).toHaveAttribute('data-overdue', 'false');
    await expect.element(page.getByText('past_due_banner_title')).toBeInTheDocument();
    await expect.element(page.getByText(/past_due_banner_detail\|\$103\.75\|.*\|Insufficient funds/)).toBeInTheDocument();
    await expect.element(page.getByText('past_due_banner_attempt|2')).toBeInTheDocument();

    await userEvent.click(page.getByTestId('past-due-retry-button'));

    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1', memberId: 'mem-1' }));
  });

  it('switches to the overdue variant at the 3rd attempt and hides the attempt line', async () => {
    await render(<PastDueBanner rows={[row({ recurring: { ...row().recurring, attemptNumber: 3 } })]} canRetry onRetryAction={vi.fn()} />);

    await expect.element(page.getByTestId('past-due-banner')).toHaveAttribute('data-overdue', 'true');
    await expect.element(page.getByText('past_due_banner_overdue_title')).toBeInTheDocument();
    expect(page.getByText(/past_due_banner_attempt/).elements()).toHaveLength(0);
  });

  it('omits the attempt line for a Square failure (no attempt number) and a missing reason', async () => {
    await render(<PastDueBanner rows={[row({ memberName: '', recurring: { memberMembershipId: 'mm', source: 'webhook_recurring', attemptNumber: null, failureReason: null } })]} canRetry onRetryAction={vi.fn()} />);

    await expect.element(page.getByText(/past_due_banner_detail.*\|—$/)).toBeInTheDocument();
    expect(page.getByText(/past_due_banner_attempt/).elements()).toHaveLength(0);
  });

  it('tells staff the member updated their card after the failure', async () => {
    await render(<PastDueBanner rows={[row()]} activeCard={{ updatedSource: 'provider_sync', updatedAt: new Date('2026-10-02T09:00:00Z') }} canRetry onRetryAction={vi.fn()} />);

    await expect.element(page.getByText(/past_due_banner_card_updated/)).toBeInTheDocument();
  });

  it('does not claim an update made before the failure, or by staff in the app', async () => {
    await render(<PastDueBanner rows={[row()]} activeCard={{ updatedSource: 'provider_sync', updatedAt: new Date('2026-09-01') }} canRetry onRetryAction={vi.fn()} />);

    expect(page.getByText(/past_due_banner_card_updated/).elements()).toHaveLength(0);
  });

  it('hides Retry without the role', async () => {
    await render(<PastDueBanner rows={[row()]} activeCard={{ updatedSource: 'app', updatedAt: new Date() }} canRetry={false} onRetryAction={vi.fn()} />);

    await expect.element(page.getByTestId('past-due-banner')).toBeInTheDocument();
    expect(page.getByTestId('past-due-retry-button').elements()).toHaveLength(0);
  });

  it('shows the card-update action while the card has not been updated since the failure', async () => {
    await render(<PastDueBanner rows={[row()]} canRetry onRetryAction={vi.fn()} cardUpdateAction={<span data-testid="slot">action</span>} />);

    await expect.element(page.getByTestId('slot')).toBeInTheDocument();
  });

  it('hides the card-update action once the member updated their card', async () => {
    await render(<PastDueBanner rows={[row()]} activeCard={{ updatedSource: 'provider_sync', updatedAt: new Date('2026-10-02T09:00:00Z') }} canRetry onRetryAction={vi.fn()} cardUpdateAction={<span data-testid="slot">action</span>} />);

    expect(page.getByTestId('slot').elements()).toHaveLength(0);
  });
});
