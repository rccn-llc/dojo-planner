'use client';

import type { TransactionStatus } from '@/features/finances/FinancesTable';
import type { TransactionRecurringFlags } from '@/features/finances/recurringPayments';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { RecurringLabel } from '@/features/finances/RecurringLabel';

type TransactionCardProps = {
  id: string;
  date: string;
  amount: string;
  purpose: string;
  method: string;
  transactionId: string;
  memberName: string;
  status: TransactionStatus;
  transactionType?: string;
  recurring?: TransactionRecurringFlags;
  onClickAction?: () => void;
};

const statusVariantMap: Record<TransactionStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'warning'> = {
  paid: 'default',
  pending: 'outline',
  declined: 'destructive',
  refunded: 'warning',
  processing: 'outline',
};

export function TransactionCard({
  date,
  amount,
  purpose,
  method,
  transactionId,
  memberName,
  status,
  transactionType = '',
  recurring,
  onClickAction,
}: TransactionCardProps) {
  const t = useTranslations('TransactionsPage');

  return (
    <Card
      className="cursor-pointer p-4 transition-colors hover:bg-secondary/30"
      onClick={onClickAction}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClickAction?.();
        }
      }}
    >
      <div className="space-y-4">
        {/* Header - Date, Member and Amount */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <div className="font-medium text-foreground">{date}</div>
            <div className="text-sm text-muted-foreground">{memberName}</div>
            <div className="text-xs text-muted-foreground">{transactionId}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-foreground">{amount}</div>
            <div className="text-xs text-muted-foreground">{purpose}</div>
            <Badge variant={statusVariantMap[status]} className="mt-1">
              {t(`status_${status}`)}
            </Badge>
            <RecurringLabel status={status} transactionType={transactionType} recurring={recurring} />
          </div>
        </div>

        {/* Transaction Details */}
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold text-muted-foreground">{t('table_method')}</div>
            <div className="mt-1 text-sm text-foreground">{method}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}
