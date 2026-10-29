/**
 * Failed-recurring-payment state carried by a transaction row, and the rules
 * the UI derives from it. The server computes the flags (TransactionsService
 * `recurringStateColumns`) and re-checks every rule in `retryFailedTransaction`
 * — these helpers only decide what to SHOW.
 */
export type TransactionRecurringFlags = {
  memberMembershipId?: string | null;
  failureReason?: string | null;
  /** 'app' | 'webhook_recurring' | 'retry'. */
  source?: string;
  retryOfTransactionId?: string | null;
  resolved?: boolean;
  superseded?: boolean;
  attemptNumber?: number | null;
  /** The member's active card was updated at the provider after this failure. */
  cardUpdatedAfterFailure?: boolean;
};

/** `failure_reason` marker for a suspected double charge. */
export const POSSIBLE_DUPLICATE = 'possible_duplicate';

const RETRYABLE_TYPES = new Set(['membership_payment', 'hold_fee']);

type RowLike = { status: string; transactionType: string; recurring?: TransactionRecurringFlags };

/** Declined, retryable type, linked to a membership, not since collected, and the latest attempt. */
export function isRetryable(tx: RowLike): boolean {
  const r = tx.recurring;
  return tx.status === 'declined'
    && RETRYABLE_TYPES.has(tx.transactionType)
    && Boolean(r?.memberMembershipId)
    && !r?.resolved
    && !r?.superseded;
}

/** A declined charge nobody has collected yet — what the "Failed payments" filter shows. */
export function isFailedUnresolved(tx: RowLike): boolean {
  return tx.status === 'declined' && !tx.recurring?.resolved;
}

export type RecurringLabel
  = | { key: 'possible_duplicate'; variant: 'warning' }
    | { key: 'resolved'; variant: 'success' }
    | { key: 'source_retry'; variant: 'outline' }
    | { key: 'source_recurring_attempt'; variant: 'outline'; attempt: number }
    | { key: 'source_recurring'; variant: 'outline' };

/** The single most important secondary label for a row, or null. */
export function recurringLabel(tx: RowLike): RecurringLabel | null {
  const r = tx.recurring;
  if (!r) {
    return null;
  }
  if (r.failureReason === POSSIBLE_DUPLICATE) {
    return { key: 'possible_duplicate', variant: 'warning' };
  }
  if (tx.status === 'declined' && r.resolved) {
    return { key: 'resolved', variant: 'success' };
  }
  if (r.source === 'retry') {
    return { key: 'source_retry', variant: 'outline' };
  }
  if (r.source === 'webhook_recurring') {
    return r.attemptNumber
      ? { key: 'source_recurring_attempt', variant: 'outline', attempt: r.attemptNumber }
      : { key: 'source_recurring', variant: 'outline' };
  }
  return null;
}

/** The most recent retryable failure among `rows`, or null. */
export function latestRetryableFailure<T extends RowLike & { createdAt: Date | string }>(rows: T[]): T | null {
  return rows
    .filter(isRetryable)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

/** A failure worth retrying NOW: still retryable, and the card changed since it failed. */
export function isReadyToRetry(tx: RowLike): boolean {
  return isRetryable(tx) && Boolean(tx.recurring?.cardUpdatedAfterFailure);
}
