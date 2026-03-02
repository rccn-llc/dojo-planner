'use client';

import type { Transaction, TransactionStatus } from './FinancesTable';
import type { TransactionDetailData } from '@/services/TransactionsService';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { client } from '@/libs/Orpc';

type TransactionDetailModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  transaction: Transaction | null;
};

const statusVariantMap: Record<TransactionStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'warning'> = {
  paid: 'default',
  pending: 'outline',
  declined: 'destructive',
  refunded: 'warning',
  processing: 'outline',
};

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  membership_payment: 'membership',
  signup_fee: 'signup_fee',
  event_registration: 'event_registration',
  refund: 'refund',
  adjustment: 'adjustment',
  product_purchase: 'product',
};

function formatDate(date: Date | string | null): string {
  if (!date) {
    return 'N/A';
  }
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function isOneTimeMembership(details: TransactionDetailData): boolean {
  return details.membershipBillingType === 'one-time'
    && details.membershipPlanFrequency === 'None';
}

export function TransactionDetailModal({
  isOpen,
  onCloseAction,
  transaction,
}: TransactionDetailModalProps) {
  const t = useTranslations('TransactionDetailModal');
  const [details, setDetails] = useState<TransactionDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const prevTransactionIdRef = useRef<string | null>(null);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onCloseAction();
    }
  }, [onCloseAction]);

  const fetchDetails = useCallback(async (transactionId: string) => {
    setLoading(true);
    setDetails(null);
    try {
      const result = await client.transactions.get({ id: transactionId });
      setDetails(result.transaction);
    } catch {
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !transaction) {
      prevTransactionIdRef.current = null;
      return;
    }

    if (prevTransactionIdRef.current !== transaction.id) {
      prevTransactionIdRef.current = transaction.id;
      fetchDetails(transaction.id);
    }
  }, [isOpen, transaction, fetchDetails]);

  if (!transaction) {
    return null;
  }

  const typeKey = TRANSACTION_TYPE_LABELS[transaction.transactionType] ?? transaction.transactionType;
  const hasMembershipDetails = details?.membershipPlanName
    && (transaction.transactionType === 'membership_payment' || transaction.transactionType === 'signup_fee');
  const hasEventDetails = details?.eventName
    && transaction.transactionType === 'event_registration';

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Transaction Summary */}
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{transaction.memberName}</h3>
                <p className="text-sm text-muted-foreground">{transaction.transactionId}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-foreground">{transaction.amount}</p>
                <Badge variant={statusVariantMap[transaction.status]}>
                  {t(`status_${transaction.status}`)}
                </Badge>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">{t('date_label')}</span>
                <p className="font-medium">{transaction.date}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('method_label')}</span>
                <p className="font-medium">{transaction.method}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('purpose_label')}</span>
                <p className="font-medium">{transaction.purpose}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('type_label')}</span>
                <p className="font-medium">{t(`type_${typeKey}` as Parameters<typeof t>[0])}</p>
              </div>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" />
              <span className="ml-2 text-sm text-muted-foreground">{t('loading_details')}</span>
            </div>
          )}

          {/* Membership Details */}
          {!loading && hasMembershipDetails && details && (
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">{t('membership_details_title')}</h4>
              <div className="rounded-lg border border-border p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('plan_name_label')}</span>
                    <p className="font-medium">{details.membershipPlanName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('frequency_label')}</span>
                    <p className="font-medium">{details.membershipPlanFrequency}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('start_date_label')}</span>
                    <p className="font-medium">{formatDate(details.membershipStartDate)}</p>
                  </div>
                  {!isOneTimeMembership(details) && (
                    <div>
                      <span className="text-muted-foreground">{t('next_payment_label')}</span>
                      <p className="font-medium">{formatDate(details.membershipNextPaymentDate)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Event Details */}
          {!loading && hasEventDetails && details && (
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">{t('event_details_title')}</h4>
              <div className="rounded-lg border border-border p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="col-span-2">
                    <span className="text-muted-foreground">{t('event_name_label')}</span>
                    <p className="font-medium">{details.eventName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('event_type_label')}</span>
                    <p className="font-medium capitalize">{details.eventType}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCloseAction}>
            {t('close_button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
