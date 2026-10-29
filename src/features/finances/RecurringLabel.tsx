'use client';

import type { TransactionRecurringFlags } from './recurringPayments';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { isReadyToRetry, recurringLabel } from './recurringPayments';

/**
 * Secondary badge beside a transaction's status: "Recurring · attempt 2/3",
 * "Retry", "Resolved", or "Possible duplicate". Renders nothing for ordinary rows.
 */
export function RecurringLabel({ status, transactionType, recurring }: {
  status: string;
  transactionType: string;
  recurring?: TransactionRecurringFlags;
}) {
  const t = useTranslations('TransactionsPage');
  const label = recurringLabel({ status, transactionType, recurring });
  const ready = isReadyToRetry({ status, transactionType, recurring });
  if (!label && !ready) {
    return null;
  }

  const text = label?.key === 'source_recurring_attempt'
    ? t('source_recurring_attempt', { attempt: label.attempt })
    : label ? t(label.key) : null;

  return (
    <>
      {label && (
        <Badge variant={label.variant} className="ml-1" data-testid="recurring-label">
          {text}
        </Badge>
      )}
      {ready && (
        <Badge variant="success" className="ml-1" data-testid="card-updated-label">
          {t('card_updated_ready')}
        </Badge>
      )}
    </>
  );
}
