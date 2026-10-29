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
import { useHasRole } from '@/hooks/useHasRole';
import { invalidateTransactionsCache } from '@/hooks/useTransactionsCache';
import { client } from '@/libs/Orpc';
import { ORG_ROLE } from '@/types/Auth';
import { isRetryable, POSSIBLE_DUPLICATE } from './recurringPayments';
import { RetryPaymentModal } from './RetryPaymentModal';

type TransactionDetailModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  transaction: Transaction | null;
};

// Transaction types that represent a real charge and can therefore be refunded.
const REFUNDABLE_TYPES = new Set(['membership_payment', 'signup_fee', 'event_registration', 'product_purchase', 'adjustment']);

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
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [retryOpen, setRetryOpen] = useState(false);
  const prevTransactionIdRef = useRef<string | null>(null);

  // Refunds are ADMIN-only (mirrors the transactions.refund guard). Only a
  // paid charge (not an already-refunded/declined one) can be refunded (#273).
  const canRefund = useHasRole(ORG_ROLE.ADMIN);
  // Retrying a declined recurring charge is FRONT_DESK+ (transactions.retry).
  const canRetry = useHasRole(ORG_ROLE.FRONT_DESK);

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

  const handleRefund = useCallback(async () => {
    if (!transaction) {
      return;
    }
    setRefunding(true);
    setRefundError(null);
    try {
      await client.transactions.refund({ transactionId: transaction.id });
      // Refresh the modal's own view + the finances list so the reversed
      // transaction and its 'refunded' status show up immediately.
      await fetchDetails(transaction.id);
      await invalidateTransactionsCache();
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : t('refund_error'));
    } finally {
      setRefunding(false);
    }
  }, [transaction, fetchDetails, t]);

  const handleRetryClosed = useCallback(async (changed: boolean) => {
    setRetryOpen(false);
    if (changed && transaction) {
      await fetchDetails(transaction.id);
      await invalidateTransactionsCache();
    }
  }, [transaction, fetchDetails]);

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

  const isRefundable = canRefund
    && transaction.status === 'paid'
    && REFUNDABLE_TYPES.has(transaction.transactionType);

  // Prefer the freshly-fetched detail (it reflects a retry just made in this
  // modal) over the list row the modal was opened from.
  const recurring = details
    ? {
        memberMembershipId: details.memberMembershipId,
        failureReason: details.failureReason,
        source: details.source,
        retryOfTransactionId: details.retryOfTransactionId,
        resolved: details.resolved,
        superseded: details.superseded,
        attemptNumber: details.attemptNumber,
        cardUpdatedAfterFailure: details.cardUpdatedAfterFailure,
      }
    : transaction.recurring;
  const currentStatus = (details?.status ?? transaction.status) as TransactionStatus;
  const showRetry = canRetry && isRetryable({ status: currentStatus, transactionType: transaction.transactionType, recurring });

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
                <Badge variant={statusVariantMap[currentStatus]}>
                  {t(`status_${currentStatus}`)}
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

          {/* Failed recurring payment */}
          {currentStatus === 'declined' && recurring?.failureReason && recurring.failureReason !== POSSIBLE_DUPLICATE && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" data-testid="failure-reason">
              <span className="text-muted-foreground">{t('failure_reason_label')}</span>
              <p className="font-medium text-destructive">{recurring.failureReason}</p>
              {recurring.attemptNumber && (
                <p className="text-muted-foreground">{t('attempt_label', { attempt: recurring.attemptNumber })}</p>
              )}
            </div>
          )}
          {currentStatus === 'declined' && recurring?.resolved && (
            <p className="text-sm text-muted-foreground">{t('resolved_note')}</p>
          )}
          {currentStatus === 'declined' && !recurring?.resolved && recurring?.superseded && (
            <p className="text-sm text-muted-foreground">{t('superseded_note')}</p>
          )}
          {recurring?.failureReason === POSSIBLE_DUPLICATE && (
            <p className="rounded-lg border border-yellow-600 bg-yellow-50 p-3 text-sm text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200">
              {t('possible_duplicate_note')}
            </p>
          )}
          {recurring?.retryOfTransactionId && (
            <p className="text-sm text-muted-foreground">
              {t('retry_of_label')}
              {' '}
              <span className="font-mono">{`TXN${recurring.retryOfTransactionId.slice(0, 12).toUpperCase()}`}</span>
            </p>
          )}

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

        {refundError && (
          <p className="text-sm text-destructive">{refundError}</p>
        )}

        <DialogFooter>
          {showRetry && (
            <Button onClick={() => setRetryOpen(true)} data-testid="retry-payment-button">
              {t('retry_button')}
            </Button>
          )}
          {isRefundable && (
            <Button variant="destructive" disabled={refunding} onClick={handleRefund}>
              {refunding ? t('refunding_button') : t('refund_button')}
            </Button>
          )}
          <Button variant="outline" onClick={onCloseAction}>
            {t('close_button')}
          </Button>
        </DialogFooter>

        {/* Nested inside the parent's content so Radix stacks focus and
            outside-click dismissal correctly. */}
        <RetryPaymentModal
          isOpen={retryOpen}
          transactionId={retryOpen ? transaction.id : null}
          memberId={transaction.memberId}
          onCloseAction={changed => void handleRetryClosed(changed)}
        />
      </DialogContent>
    </Dialog>
  );
}
