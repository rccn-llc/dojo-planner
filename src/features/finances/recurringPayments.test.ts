import { describe, expect, it } from 'vitest';
import { isFailedUnresolved, isReadyToRetry, isRetryable, latestRetryableFailure, recurringLabel } from './recurringPayments';

const declined = (recurring = {}) => ({ status: 'declined', transactionType: 'membership_payment', recurring: { memberMembershipId: 'mm-1', ...recurring } });

describe('isRetryable', () => {
  it('accepts a latest, unresolved, membership-linked decline', () => {
    expect(isRetryable(declined())).toBe(true);
    expect(isRetryable({ ...declined(), transactionType: 'hold_fee' })).toBe(true);
  });

  it.each([
    ['resolved', declined({ resolved: true })],
    ['superseded', declined({ superseded: true })],
    ['no membership', declined({ memberMembershipId: null })],
    ['paid', { ...declined(), status: 'paid' }],
    ['an event registration', { ...declined(), transactionType: 'event_registration' }],
    ['no recurring flags', { status: 'declined', transactionType: 'membership_payment' }],
  ])('rejects %s', (_label, tx) => {
    expect(isRetryable(tx)).toBe(false);
  });
});

describe('isFailedUnresolved', () => {
  it('is any declined row not yet collected', () => {
    expect(isFailedUnresolved(declined())).toBe(true);
    expect(isFailedUnresolved({ status: 'declined', transactionType: 'event_registration' })).toBe(true);
    expect(isFailedUnresolved(declined({ resolved: true }))).toBe(false);
    expect(isFailedUnresolved({ status: 'paid', transactionType: 'membership_payment' })).toBe(false);
  });
});

describe('recurringLabel', () => {
  it('prioritises possible duplicate, then resolved, then retry, then recurring', () => {
    expect(recurringLabel({ status: 'paid', transactionType: 'membership_payment', recurring: { failureReason: 'possible_duplicate', source: 'webhook_recurring' } }))
      .toEqual({ key: 'possible_duplicate', variant: 'warning' });
    expect(recurringLabel(declined({ resolved: true, source: 'webhook_recurring', attemptNumber: 2 })))
      .toEqual({ key: 'resolved', variant: 'success' });
    expect(recurringLabel({ status: 'paid', transactionType: 'membership_payment', recurring: { source: 'retry' } }))
      .toEqual({ key: 'source_retry', variant: 'outline' });
    expect(recurringLabel(declined({ source: 'webhook_recurring', attemptNumber: 2 })))
      .toEqual({ key: 'source_recurring_attempt', variant: 'outline', attempt: 2 });
    expect(recurringLabel({ status: 'paid', transactionType: 'membership_payment', recurring: { source: 'webhook_recurring', attemptNumber: null } }))
      .toEqual({ key: 'source_recurring', variant: 'outline' });
  });

  it('returns null for ordinary rows', () => {
    expect(recurringLabel({ status: 'paid', transactionType: 'membership_payment', recurring: { source: 'app' } })).toBeNull();
    expect(recurringLabel({ status: 'paid', transactionType: 'membership_payment' })).toBeNull();
  });
});

describe('isReadyToRetry', () => {
  it('needs a retryable failure AND a card updated since', () => {
    expect(isReadyToRetry(declined({ cardUpdatedAfterFailure: true }))).toBe(true);
    expect(isReadyToRetry(declined({ cardUpdatedAfterFailure: false }))).toBe(false);
    expect(isReadyToRetry(declined({ cardUpdatedAfterFailure: true, resolved: true }))).toBe(false);
    expect(isReadyToRetry(declined({ cardUpdatedAfterFailure: true, superseded: true }))).toBe(false);
  });
});

describe('latestRetryableFailure', () => {
  it('returns the newest retryable row', () => {
    const rows = [
      { ...declined(), id: 'a', createdAt: '2026-10-01' },
      { ...declined(), id: 'b', createdAt: new Date('2026-10-03') },
      { ...declined({ resolved: true }), id: 'c', createdAt: '2026-10-05' },
    ];

    expect(latestRetryableFailure(rows)?.id).toBe('b');
    expect(latestRetryableFailure([])).toBeNull();
  });
});
