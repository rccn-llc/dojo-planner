'use client';

import type { ReactNode } from 'react';
import type { TransactionRecurringFlags } from '@/features/finances/recurringPayments';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { latestRetryableFailure } from '@/features/finances/recurringPayments';

export type PastDueBannerRow = {
  id: string;
  memberId: string | null;
  memberName: string;
  amount: number;
  createdAt: Date;
  status: string;
  transactionType: string;
  recurring?: TransactionRecurringFlags;
};

type PastDueBannerProps = {
  /** Billing rows for this member (and, for a HOH, their family). */
  rows: PastDueBannerRow[];
  /** The member's active card — to tell staff when it was updated after the failure. */
  activeCard?: { updatedSource: string | null; updatedAt: Date | null } | null;
  canRetry: boolean;
  onRetryAction: (row: PastDueBannerRow) => void;
  /** Extra action under the details — the "Send card-update link" control. */
  cardUpdateAction?: ReactNode;
};

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

/**
 * Top-of-page alert on member detail when a recurring payment failed and has
 * not been collected. IQPro failures show the attempt count ("2 of 3 — IQPro
 * will retry"); the third becomes an "Overdue" variant. Tells staff when the
 * member updated their card after the failure, so they know a retry may work.
 */
export function PastDueBanner({ rows, activeCard, canRetry, onRetryAction, cardUpdateAction }: PastDueBannerProps) {
  const t = useTranslations('MemberDetailPage');
  const failure = latestRetryableFailure(rows);
  if (!failure) {
    return null;
  }

  const attempt = failure.recurring?.attemptNumber ?? null;
  const overdue = attempt !== null && attempt >= 3;
  const cardUpdatedAfter = activeCard?.updatedSource === 'provider_sync'
    && activeCard.updatedAt
    && new Date(activeCard.updatedAt).getTime() > new Date(failure.createdAt).getTime();

  return (
    <div
      role="alert"
      data-testid="past-due-banner"
      data-overdue={overdue ? 'true' : 'false'}
      className={overdue
        ? 'flex flex-col gap-3 rounded-lg border border-destructive bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between'
        : 'flex flex-col gap-3 rounded-lg border border-yellow-600 bg-yellow-50 p-4 text-yellow-900 sm:flex-row sm:items-center sm:justify-between dark:bg-yellow-900/20 dark:text-yellow-200'}
    >
      <div className="flex gap-3">
        <AlertTriangle className={overdue ? 'mt-0.5 size-5 shrink-0 text-destructive' : 'mt-0.5 size-5 shrink-0'} />
        <div className="space-y-1 text-sm">
          <p className={overdue ? 'font-semibold text-destructive' : 'font-semibold'}>
            {overdue ? t('past_due_banner_overdue_title') : t('past_due_banner_title')}
          </p>
          <p>
            {t('past_due_banner_detail', {
              amount: money(Math.abs(failure.amount)),
              date: new Date(failure.createdAt).toLocaleDateString(),
              reason: failure.recurring?.failureReason ?? '—',
            })}
            {failure.memberName ? ` · ${failure.memberName}` : ''}
          </p>
          {attempt !== null && !overdue && <p>{t('past_due_banner_attempt', { attempt })}</p>}
          {cardUpdatedAfter && activeCard?.updatedAt && (
            <p className="font-medium">{t('past_due_banner_card_updated', { date: new Date(activeCard.updatedAt).toLocaleDateString() })}</p>
          )}
          {cardUpdateAction}
        </div>
      </div>
      {canRetry && (
        <Button
          size="sm"
          variant={overdue ? 'destructive' : 'default'}
          className="shrink-0"
          onClick={() => onRetryAction(failure)}
          data-testid="past-due-retry-button"
        >
          {t('retry_payment_button')}
        </Button>
      )}
    </div>
  );
}
