'use client';

import { AlertTriangle, CheckCircle2, CreditCard, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { client } from '@/libs/Orpc';

type Quote = Awaited<ReturnType<typeof client.transactions.retryQuote>>;
type RetryResult = Awaited<ReturnType<typeof client.transactions.retry>>;

type Phase
  = | { kind: 'loading' }
    | { kind: 'confirm'; quote: Quote; syncFailed: boolean }
    | { kind: 'processing'; quote: Quote }
    | { kind: 'approved'; result: RetryResult; quote: Quote }
    | { kind: 'declined'; result: RetryResult; quote: Quote }
    | { kind: 'error'; message: string; canTryAgain: boolean };

export type RetryPaymentModalProps = {
  isOpen: boolean;
  /** The declined transaction to retry. */
  transactionId: string | null;
  /** Its member, whose card on file is refreshed from the provider first. */
  memberId: string | null;
  /** Called on close; `changed` when a charge was attempted (refresh the data). */
  onCloseAction: (changed: boolean) => void;
};

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** HTTP status on an ORPC error, when present. */
function errorStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Retry a declined recurring payment.
 *
 * `loading` refreshes the card on file from the provider (the member may have
 * updated it through the provider's email) and fetches a quote → `confirm`
 * shows exactly what will be charged → `processing` cannot be dismissed, so
 * staff never close mid-charge and assume it failed → one of three explicit
 * results: approved, declined (a normal outcome, recorded), or error (the
 * charge could not be attempted).
 */
export function RetryPaymentModal({ isOpen, transactionId, memberId, onCloseAction }: RetryPaymentModalProps) {
  const t = useTranslations('RetryPaymentModal');
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [acknowledged, setAcknowledged] = useState(false);
  const attempted = useRef(false);

  const load = useCallback(async () => {
    if (!transactionId) {
      return;
    }
    setPhase({ kind: 'loading' });
    setAcknowledged(false);

    // Refresh the card first so the quote shows the card that will actually
    // be charged. A failed refresh does not block the retry: the charge itself
    // always uses the subscription's live card at the provider.
    let syncFailed = false;
    if (memberId) {
      try {
        const sync = await client.member.syncPaymentMethod({ memberId });
        syncFailed = Boolean(sync.error);
      } catch {
        syncFailed = true;
      }
    }

    try {
      const quote = await client.transactions.retryQuote({ transactionId });
      setPhase({ kind: 'confirm', quote, syncFailed });
    } catch (err) {
      setPhase({ kind: 'error', message: errorMessage(err, t('error_generic')), canTryAgain: false });
    }
  }, [transactionId, memberId, t]);

  // Load once per open / transaction. The ref (read only inside the effect)
  // keeps a new `load` identity — e.g. a fresh `t` — from re-fetching.
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen || !transactionId) {
      openedFor.current = null;
      return;
    }
    if (openedFor.current !== transactionId) {
      openedFor.current = transactionId;
      attempted.current = false;
      void load();
    }
  }, [isOpen, transactionId, load]);

  const processing = phase.kind === 'processing';

  const close = useCallback(() => {
    if (!processing) {
      onCloseAction(attempted.current);
    }
  }, [processing, onCloseAction]);

  const handleCharge = useCallback(async () => {
    if (phase.kind !== 'confirm' || !transactionId) {
      return;
    }
    const { quote } = phase;
    setPhase({ kind: 'processing', quote });
    try {
      const result = await client.transactions.retry({ transactionId });
      attempted.current = true;
      setPhase(result.status === 'approved'
        ? { kind: 'approved', result, quote }
        : { kind: 'declined', result, quote });
    } catch (err) {
      // 409 = already collected / already in progress: trying again cannot help.
      const status = errorStatus(err);
      attempted.current = true;
      setPhase({ kind: 'error', message: errorMessage(err, t('error_generic')), canTryAgain: status !== 409 });
    }
  }, [phase, transactionId, t]);

  const quote = 'quote' in phase ? phase.quote : null;
  const needsAck = phase.kind === 'confirm' && phase.quote.autoRetriesRemaining > 0;
  const blocked = phase.kind === 'confirm' && Boolean(phase.quote.blockedReason);
  const chargeDisabled = phase.kind !== 'confirm' || blocked || (needsAck && !acknowledged);
  const total = quote?.fees?.amount ?? quote?.baseAmount ?? 0;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && close()}>
      <DialogContent
        className="max-w-md"
        showCloseButton={!processing}
        onEscapeKeyDown={e => processing && e.preventDefault()}
        onInteractOutside={e => processing && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          {quote && (
            <DialogDescription>
              {t('subtitle', { member: quote.memberName, plan: quote.planName })}
            </DialogDescription>
          )}
        </DialogHeader>

        {phase.kind === 'loading' && (
          <div className="space-y-3" data-testid="retry-loading">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" />
              {t('loading')}
            </p>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {(phase.kind === 'confirm' || phase.kind === 'processing') && quote && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
              <p className="text-muted-foreground">
                {t('failed_on', { date: new Date(quote.failedAt).toLocaleDateString() })}
              </p>
              {quote.failureReason && (
                <p className="font-medium text-destructive">{t('reason', { reason: quote.failureReason })}</p>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('amount_label')}</dt>
              <dd className="text-right">{money(quote.fees?.baseAmount ?? quote.baseAmount)}</dd>
              {quote.fees && quote.fees.serviceFeeAmount > 0 && (
                <>
                  <dt className="text-muted-foreground">{t('service_fee_label', { pct: quote.fees.serviceFeePct })}</dt>
                  <dd className="text-right">{money(quote.fees.serviceFeeAmount)}</dd>
                </>
              )}
              <dt className="font-semibold">{t('total_label')}</dt>
              <dd className="text-right font-semibold">{money(total)}</dd>
            </dl>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-sm">
                <CreditCard className="size-4 text-muted-foreground" />
                {quote.card
                  ? (
                      <span>
                        {quote.card.cardBrand ?? (quote.card.type === 'bank_transfer' ? t('bank_account') : t('card'))}
                        {quote.card.last4 ? ` •••• ${quote.card.last4}` : ''}
                        {quote.card.expirationDate ? ` · ${t('expires', { date: quote.card.expirationDate })}` : ''}
                      </span>
                    )
                  : <span className="text-muted-foreground">{t('no_card_local')}</span>}
              </div>
              {quote.card?.updatedAfterFailure && quote.card.updatedAt && (
                <Badge variant="success">{t('card_updated_badge', { date: new Date(quote.card.updatedAt).toLocaleDateString() })}</Badge>
              )}
            </div>

            {phase.kind === 'confirm' && phase.syncFailed && (
              <p className="text-xs text-muted-foreground">{t('sync_failed_note')}</p>
            )}
            {quote.card && !quote.card.updatedAfterFailure && (
              <p className="text-xs text-muted-foreground">{t('card_unchanged_warning')}</p>
            )}

            {quote.overdue && <Alert variant="info">{t('overdue_note')}</Alert>}

            {quote.autoRetriesRemaining > 0 && (
              <div className="space-y-2 rounded-lg border border-yellow-600 bg-yellow-50 p-3 text-sm text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200">
                <p className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {t('auto_retry_warning', { count: quote.autoRetriesRemaining })}
                </p>
                <label className="flex items-center gap-2 font-medium" htmlFor="retry-ack">
                  <Checkbox
                    id="retry-ack"
                    checked={acknowledged}
                    disabled={processing}
                    onCheckedChange={v => setAcknowledged(v === true)}
                  />
                  {t('auto_retry_ack')}
                </label>
              </div>
            )}

            {quote.blockedReason && <Alert variant="warning">{quote.blockedReason}</Alert>}
          </div>
        )}

        {phase.kind === 'approved' && (
          <div className="space-y-3" role="status" data-testid="retry-approved">
            <div className="flex gap-3 rounded-lg border border-green-600 bg-green-50 p-4 text-green-900 dark:bg-green-900/20 dark:text-green-200">
              <CheckCircle2 className="size-5 shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{t('approved_title', { amount: money(phase.result.amountCharged ?? total) })}</p>
                <p>{t('transaction_ref', { id: phase.result.retryTransactionId.slice(0, 12).toUpperCase() })}</p>
                {phase.result.membershipReactivated && <p>{t('membership_reactivated')}</p>}
              </div>
            </div>
            {phase.result.warning && <Alert variant="warning">{phase.result.warning}</Alert>}
          </div>
        )}

        {phase.kind === 'declined' && (
          <div className="flex gap-3 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive" role="status" data-testid="retry-declined">
            <XCircle className="size-5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">{t('declined_title', { reason: phase.result.declineReason ?? t('declined_default') })}</p>
              <p>{t('declined_recorded')}</p>
            </div>
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="flex gap-3 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive" role="alert" data-testid="retry-error">
            <AlertTriangle className="size-5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">{t('error_title')}</p>
              <p>{phase.message}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {(phase.kind === 'confirm' || phase.kind === 'processing' || phase.kind === 'loading') && (
            <>
              <Button variant="outline" onClick={close} disabled={processing}>
                {t('cancel_button')}
              </Button>
              <Button onClick={handleCharge} disabled={chargeDisabled}>
                {processing
                  ? (
                      <>
                        <Spinner size="sm" />
                        {t('processing_button')}
                      </>
                    )
                  : t('charge_button', { amount: money(total) })}
              </Button>
            </>
          )}
          {(phase.kind === 'declined' || (phase.kind === 'error' && phase.canTryAgain)) && (
            <Button variant="outline" onClick={() => void load()}>
              {t('try_again_button')}
            </Button>
          )}
          {(phase.kind === 'approved' || phase.kind === 'declined' || phase.kind === 'error') && (
            <Button onClick={close}>{phase.kind === 'approved' ? t('done_button') : t('close_button')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
