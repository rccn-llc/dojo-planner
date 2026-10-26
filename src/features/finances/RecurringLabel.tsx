'use client';

import type { TransactionRecurringFlags } from './recurringPayments';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { recurringLabel } from './recurringPayments';

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
  if (!label) {
    return null;
  }

  const text = label.key === 'source_recurring_attempt'
    ? t('source_recurring_attempt', { attempt: label.attempt })
    : t(label.key);

  return (
    <Badge variant={label.variant} className="ml-1" data-testid="recurring-label">
      {text}
    </Badge>
  );
}
