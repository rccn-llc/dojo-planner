import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/libs/DB';
import {
  memberMembershipSchema,
  memberSchema,
  membershipPlanSchema,
  paymentMethodSchema,
  transactionSchema,
} from '@/models/Schema';
import { TransactionNotFoundError } from './MemberPaymentService';
import {
  autoRetriesRemaining,
  getRetryQuote,
  paysInvoice,
  retryBaseAmount,
  retryFailedTransaction,
  RetryProviderUnavailableError,
  SIMULATED_SLOW_RETRY_MS,
  TransactionNotRetryableError,
  TransactionRetryFailedError,
  TransactionRetryInProgressError,
} from './PaymentRetryService';

// Real PGlite: the FOR UPDATE lock, pending-child guard and "resolved"
// queries are SQL behaviour.
vi.mock('@/libs/DB');

vi.mock('@/libs/IQPro', async () => {
  const actual = await vi.importActual<typeof import('@/libs/IQPro')>('@/libs/IQPro');
  return { roundCents: actual.roundCents, getServiceFeePct: () => 3.75 };
});

const provider = {
  chargeOneTimeFee: vi.fn(),
  closeFailedInvoice: vi.fn(),
  computeFees: vi.fn(),
};
vi.mock('./PaymentProviderService', () => ({
  getPaymentProvider: vi.fn(async () => provider),
}));

const sendReceipt = vi.fn().mockResolvedValue(true);
vi.mock('./EmailService', () => ({ sendPaymentReceiptEmail: (...a: unknown[]) => sendReceipt(...a) }));

const recordExternalRef = vi.fn();
vi.mock('./TenantExternalRefService', () => ({
  REF_TYPE: { PROVIDER_TRANSACTION: 'provider_transaction' },
  recordExternalRef: (...a: unknown[]) => recordExternalRef(...a),
}));

vi.mock('@/libs/Logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const ORG = 'org_retry_test';
const IQPRO = { provider: 'iqpro' } as never;
const SQUARE = { provider: 'square' } as never;

type Fixture = { memberId: string; membershipId: string; declinedId: string; subscriptionId: string };

async function makeFailure(opts: {
  subscriptionId?: string | null;
  holdSubscriptionId?: string;
  declineCount?: number;
  source?: string;
  amount?: number;
  transactionType?: string;
  status?: string;
  providerInvoiceId?: string | null;
  memberStatus?: string;
  membershipStatus?: string;
  org?: string;
  email?: string;
  createdAt?: Date;
} = {}): Promise<Fixture> {
  const memberId = randomUUID();
  const planId = randomUUID();
  const membershipId = randomUUID();
  const declinedId = randomUUID();
  const subscriptionId = opts.subscriptionId === undefined ? `sub_${randomUUID()}` : opts.subscriptionId;
  const org = opts.org ?? ORG;

  await db.insert(memberSchema).values({
    id: memberId,
    organizationId: org,
    firstName: 'Pat',
    lastName: 'Due',
    email: opts.email ?? `${memberId}@example.com`,
    status: opts.memberStatus ?? 'past_due',
    providerCustomerId: `cus_${memberId}`,
  });
  await db.insert(membershipPlanSchema).values({
    id: planId,
    organizationId: org,
    name: 'Gold Monthly',
    slug: `gold-${planId}`,
    category: 'Adult',
    program: 'Adult',
    price: 100,
    contractLength: 'M',
    accessLevel: 'U',
  });
  await db.insert(memberMembershipSchema).values({
    id: membershipId,
    memberId,
    membershipPlanId: planId,
    status: opts.membershipStatus ?? 'past_due',
    providerSubscriptionId: subscriptionId,
    providerHoldFeeSubscriptionId: opts.holdSubscriptionId ?? null,
    declineCount: opts.declineCount ?? 1,
  });
  await db.insert(transactionSchema).values({
    id: declinedId,
    organizationId: org,
    memberId,
    memberMembershipId: membershipId,
    transactionType: opts.transactionType ?? 'membership_payment',
    amount: opts.amount ?? 103.75,
    status: opts.status ?? 'declined',
    source: opts.source ?? 'webhook_recurring',
    failureReason: 'Insufficient funds',
    providerInvoiceId: opts.providerInvoiceId ?? null,
    createdAt: opts.createdAt ?? new Date(Date.now() - 60_000),
  });

  return { memberId, membershipId, declinedId, subscriptionId: subscriptionId ?? '' };
}

async function txRow(id: string) {
  const [row] = await db.select().from(transactionSchema).where(eq(transactionSchema.id, id));
  return row;
}

describe('pure helpers', () => {
  it('backs the service fee out of a webhook-recorded total, keeps an app row as-is', () => {
    expect(retryBaseAmount({ amount: 103.75, source: 'webhook_recurring' }, 3.75)).toBe(100);
    expect(retryBaseAmount({ amount: 100, source: 'app' }, 3.75)).toBe(100);
    expect(retryBaseAmount({ amount: 100, source: 'retry' }, 3.75)).toBe(100);
  });

  it('pays the invoice only for IQPro, and only with an invoice id', () => {
    expect(paysInvoice('iqpro', 'inv-1')).toBe(true);
    expect(paysInvoice('iqpro', null)).toBe(false);
    expect(paysInvoice('square', 'inv-1')).toBe(false);
    expect(paysInvoice(null, 'inv-1')).toBe(false);
  });

  it('counts IQPro automatic attempts left; Square never auto-retries', () => {
    expect(autoRetriesRemaining('iqpro', 1)).toBe(2);
    expect(autoRetriesRemaining('iqpro', 3)).toBe(0);
    expect(autoRetriesRemaining('iqpro', 5)).toBe(0);
    expect(autoRetriesRemaining('square', 1)).toBe(0);
  });
});

describe('retryFailedTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    provider.closeFailedInvoice.mockResolvedValue({ success: true });
  });

  describe('approved', () => {
    it('records a paid retry row linked to the failure, reactivates, records the ref and sends a receipt', async () => {
      const f = await makeFailure();
      provider.chargeOneTimeFee.mockResolvedValue({ success: true, amountCharged: 103.75, transactionId: 'ptx_ok', paymentMethodName: 'card' });

      const result = await retryFailedTransaction(f.declinedId, ORG, IQPRO);

      expect(result).toMatchObject({ status: 'approved', amountCharged: 103.75, membershipReactivated: true });
      expect(result.warning).toBeUndefined();

      // The charge re-sends the BASE (fee backed out), not the stored total.
      expect(provider.chargeOneTimeFee).toHaveBeenCalledWith(IQPRO, expect.objectContaining({
        providerSubscriptionId: f.subscriptionId,
        providerCustomerId: `cus_${f.memberId}`,
        amount: 100,
      }));

      const retry = await txRow(result.retryTransactionId);

      expect(retry).toMatchObject({
        status: 'paid',
        source: 'retry',
        retryOfTransactionId: f.declinedId,
        providerTransactionId: 'ptx_ok',
        amount: 103.75,
        memberMembershipId: f.membershipId,
      });
      expect(retry!.processedAt).not.toBeNull();

      const [m] = await db.select().from(memberMembershipSchema).where(eq(memberMembershipSchema.id, f.membershipId));

      expect(m).toMatchObject({ status: 'active', declineCount: 0, lastDeclineReason: null });

      const [member] = await db.select().from(memberSchema).where(eq(memberSchema.id, f.memberId));

      expect(member!.status).toBe('active');
      expect(recordExternalRef).toHaveBeenCalledWith('provider_transaction', 'ptx_ok', ORG);
      expect(sendReceipt).toHaveBeenCalledWith(expect.objectContaining({ total: 103.75, subtotal: 100, serviceFeeAmount: 3.75, transactionId: 'ptx_ok' }));
    });

    it('uses the provider fee breakdown for the receipt when given', async () => {
      const f = await makeFailure();
      provider.chargeOneTimeFee.mockResolvedValue({
        success: true,
        amountCharged: 104,
        transactionId: 'ptx_fb',
        feeBreakdown: { baseAmount: 100, taxAmount: 0, taxPct: 0, serviceFeeAmount: 4, serviceFeePct: 4, amount: 104 },
      });

      await retryFailedTransaction(f.declinedId, ORG, IQPRO);

      expect(sendReceipt).toHaveBeenCalledWith(expect.objectContaining({ serviceFeeAmount: 4, serviceFeePct: 4 }));
    });

    it('IQPro: pays the failed charge\'s invoice (ends IQPro\'s own retries)', async () => {
      const f = await makeFailure({ providerInvoiceId: 'iq-inv-1' });
      provider.chargeOneTimeFee.mockResolvedValue({ success: true, amountCharged: 103.75, transactionId: 'ptx_inv' });

      await retryFailedTransaction(f.declinedId, ORG, IQPRO);

      expect(provider.chargeOneTimeFee).toHaveBeenCalledWith(IQPRO, expect.objectContaining({ invoiceId: 'iq-inv-1' }));
    });

    it('IQPro without an invoice id: a standalone charge (no invoiceId sent)', async () => {
      const f = await makeFailure();
      provider.chargeOneTimeFee.mockResolvedValue({ success: true, amountCharged: 103.75, transactionId: 'ptx_noinv' });

      await retryFailedTransaction(f.declinedId, ORG, IQPRO);

      expect(provider.chargeOneTimeFee.mock.calls[0]![1]).not.toHaveProperty('invoiceId');
    });

    it('Square: never sends the invoice id to the charge (its API cannot pay invoices)', async () => {
      const f = await makeFailure({ providerInvoiceId: 'sq-inv-1' });
      provider.chargeOneTimeFee.mockResolvedValue({ success: true, amountCharged: 103.75, transactionId: 'pay_x' });

      await retryFailedTransaction(f.declinedId, ORG, SQUARE);

      expect(provider.chargeOneTimeFee.mock.calls[0]![1]).not.toHaveProperty('invoiceId');
      expect(provider.closeFailedInvoice).toHaveBeenCalledWith(SQUARE, 'sq-inv-1');
    });

    it('cancels the provider invoice after a successful Square retry', async () => {
      const f = await makeFailure({ providerInvoiceId: 'inv_1' });
      provider.chargeOneTimeFee.mockResolvedValue({ success: true, amountCharged: 103.75, transactionId: 'pay_1' });

      const result = await retryFailedTransaction(f.declinedId, ORG, SQUARE);

      expect(provider.closeFailedInvoice).toHaveBeenCalledWith(SQUARE, 'inv_1');
      expect(result.warning).toBeUndefined();
    });

    it('returns a warning (not an error) when the invoice cannot be cancelled', async () => {
      const f = await makeFailure({ providerInvoiceId: 'inv_2' });
      provider.chargeOneTimeFee.mockResolvedValue({ success: true, amountCharged: 103.75, transactionId: 'pay_2' });
      provider.closeFailedInvoice.mockResolvedValue({ success: false, error: 'nope' });

      const result = await retryFailedTransaction(f.declinedId, ORG, SQUARE);

      expect(result.status).toBe('approved');
      expect(result.warning).toContain('invoice could not be cancelled');
    });

    it('charges the hold-fee subscription for a hold_fee row and does NOT move the member out of hold', async () => {
      const f = await makeFailure({ transactionType: 'hold_fee', holdSubscriptionId: 'hold_sub_1', memberStatus: 'hold', membershipStatus: 'hold', source: 'app', amount: 10 });
      provider.chargeOneTimeFee.mockResolvedValue({ success: true, amountCharged: 10.38, transactionId: 'h1' });

      const result = await retryFailedTransaction(f.declinedId, ORG, IQPRO);

      expect(provider.chargeOneTimeFee).toHaveBeenCalledWith(IQPRO, expect.objectContaining({ providerSubscriptionId: 'hold_sub_1', amount: 10 }));
      expect(result.membershipReactivated).toBe(false);

      const [member] = await db.select().from(memberSchema).where(eq(memberSchema.id, f.memberId));

      expect(member!.status).toBe('hold');
    });

    it('keeps the member past_due while another membership is still past_due', async () => {
      const f = await makeFailure();
      const planId = randomUUID();
      await db.insert(membershipPlanSchema).values({ id: planId, organizationId: ORG, name: 'Other', slug: `o-${planId}`, category: 'A', program: 'A', contractLength: 'M', accessLevel: 'U' });
      await db.insert(memberMembershipSchema).values({ id: randomUUID(), memberId: f.memberId, membershipPlanId: planId, status: 'past_due' });
      provider.chargeOneTimeFee.mockResolvedValue({ success: true, amountCharged: 103.75, transactionId: 'x' });

      const result = await retryFailedTransaction(f.declinedId, ORG, IQPRO);

      expect(result.membershipReactivated).toBe(true);

      const [member] = await db.select().from(memberSchema).where(eq(memberSchema.id, f.memberId));

      expect(member!.status).toBe('past_due');
    });

    it('reports reactivation from the member flip when the membership was already active', async () => {
      const f = await makeFailure({ membershipStatus: 'active' });
      provider.chargeOneTimeFee.mockResolvedValue({ success: true, amountCharged: 103.75, transactionId: 'y' });

      const result = await retryFailedTransaction(f.declinedId, ORG, IQPRO);

      expect(result.membershipReactivated).toBe(true);
    });

    it('skips the receipt when the member has no email', async () => {
      const f = await makeFailure({ email: '' });
      provider.chargeOneTimeFee.mockResolvedValue({ success: true, transactionId: 'z' });

      const result = await retryFailedTransaction(f.declinedId, ORG, IQPRO);

      expect(result.amountCharged).toBe(100);
      expect(sendReceipt).not.toHaveBeenCalled();
    });

    it('swallows a receipt-email failure', async () => {
      const f = await makeFailure();
      provider.chargeOneTimeFee.mockResolvedValue({ success: true, amountCharged: 103.75, transactionId: 'r' });
      sendReceipt.mockRejectedValueOnce(new Error('resend down'));

      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).resolves.toMatchObject({ status: 'approved' });
    });
  });

  describe('declined', () => {
    it('records a declined retry row with the reason and leaves statuses alone', async () => {
      const f = await makeFailure();
      provider.chargeOneTimeFee.mockResolvedValue({ success: false, declined: true, error: 'Do not honor', transactionId: 'ptx_no', paymentMethodName: 'card' });

      const result = await retryFailedTransaction(f.declinedId, ORG, IQPRO);

      expect(result).toEqual({ status: 'declined', retryTransactionId: expect.any(String), declineReason: 'Do not honor', membershipReactivated: false });
      expect(await txRow(result.retryTransactionId)).toMatchObject({ status: 'declined', failureReason: 'Do not honor', providerTransactionId: 'ptx_no', source: 'retry' });

      const [m] = await db.select().from(memberMembershipSchema).where(eq(memberMembershipSchema.id, f.membershipId));

      // A manual decline does not count toward the provider's attempt sequence.
      expect(m).toMatchObject({ status: 'past_due', declineCount: 1 });
      expect(sendReceipt).not.toHaveBeenCalled();
    });

    it('defaults the reason and method when the provider omits them', async () => {
      const f = await makeFailure();
      provider.chargeOneTimeFee.mockResolvedValue({ success: false, declined: true });

      const result = await retryFailedTransaction(f.declinedId, ORG, IQPRO);

      expect(result.declineReason).toBe('Declined');
      expect(await txRow(result.retryTransactionId)).toMatchObject({ paymentMethod: 'card', providerTransactionId: null });
    });

    it('lets the declined retry itself be retried (chain)', async () => {
      const f = await makeFailure();
      provider.chargeOneTimeFee.mockResolvedValueOnce({ success: false, declined: true, error: 'Declined' });
      const first = await retryFailedTransaction(f.declinedId, ORG, IQPRO);
      provider.chargeOneTimeFee.mockResolvedValueOnce({ success: true, amountCharged: 103.75, transactionId: 'second' });

      // The ORIGINAL is now superseded by the newer declined attempt…
      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).rejects.toThrow(TransactionNotRetryableError);

      // …and the declined retry is the one to retry.
      await expect(retryFailedTransaction(first.retryTransactionId, ORG, IQPRO)).resolves.toMatchObject({ status: 'approved' });
    });
  });

  describe('could not attempt', () => {
    it('refuses a failure with no recorded amount rather than "collecting" $0', async () => {
      const f = await makeFailure();
      await db.update(transactionSchema).set({ amount: 0 }).where(eq(transactionSchema.id, f.declinedId));
      const { TransactionNotRetryableError } = await import('./PaymentRetryService');

      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).rejects.toBeInstanceOf(TransactionNotRetryableError);
      expect(provider.chargeOneTimeFee).not.toHaveBeenCalled();

      // The placeholder is removed, so a later (fixed-amount) retry is not blocked.
      const rows = await db.select().from(transactionSchema).where(eq(transactionSchema.retryOfTransactionId, f.declinedId));

      expect(rows).toHaveLength(0);
    });

    it('removes the placeholder and throws when the charge errors (not a decline)', async () => {
      const f = await makeFailure();
      provider.chargeOneTimeFee.mockResolvedValue({ success: false, error: 'No saved payment method on the existing subscription.' });

      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).rejects.toThrow(TransactionRetryFailedError);

      const rows = await db.select().from(transactionSchema).where(eq(transactionSchema.retryOfTransactionId, f.declinedId));

      expect(rows).toHaveLength(0);
    });

    it('treats a thrown provider error the same way, with a default message', async () => {
      const f = await makeFailure();
      provider.chargeOneTimeFee.mockRejectedValueOnce('boom');

      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).rejects.toThrow('The payment could not be attempted.');
    });

    it('uses a default message when the provider reports none', async () => {
      const f = await makeFailure();
      provider.chargeOneTimeFee.mockResolvedValue({ success: false });

      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).rejects.toThrow('The payment could not be attempted.');
    });

    it('throws when no provider is configured', async () => {
      await expect(retryFailedTransaction(randomUUID(), ORG, null)).rejects.toThrow(RetryProviderUnavailableError);
    });
  });

  describe('guards', () => {
    it('404s an unknown id and a row from another org', async () => {
      const f = await makeFailure({ org: 'org_other_retry' });

      await expect(retryFailedTransaction(randomUUID(), ORG, IQPRO)).rejects.toThrow(TransactionNotFoundError);
      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).rejects.toThrow(TransactionNotFoundError);
    });

    it.each([
      ['a paid row', { status: 'paid' }, 'Only declined'],
      ['an event registration', { transactionType: 'event_registration' }, 'Only membership'],
      ['a subscription with no card on file', { subscriptionId: null }, 'no card on file'],
    ])('refuses %s', async (_label, opts, message) => {
      const f = await makeFailure(opts as never);

      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).rejects.toThrow(message);
    });

    it('refuses a row not linked to a membership', async () => {
      const id = randomUUID();
      await db.insert(transactionSchema).values({ id, organizationId: ORG, transactionType: 'membership_payment', amount: 10, status: 'declined' });

      await expect(retryFailedTransaction(id, ORG, IQPRO)).rejects.toThrow('not linked to a membership');
    });

    it('refuses a row whose membership belongs to a member of another org', async () => {
      const f = await makeFailure({ org: 'org_cross' });
      const id = randomUUID();
      await db.insert(transactionSchema).values({ id, organizationId: ORG, memberId: f.memberId, memberMembershipId: f.membershipId, transactionType: 'membership_payment', amount: 10, status: 'declined' });

      await expect(retryFailedTransaction(id, ORG, IQPRO)).rejects.toThrow('not linked to a membership');
    });

    it('refuses a payment already collected after the failure', async () => {
      const f = await makeFailure();
      await db.insert(transactionSchema).values({ id: randomUUID(), organizationId: ORG, memberId: f.memberId, memberMembershipId: f.membershipId, transactionType: 'membership_payment', amount: 103.75, status: 'paid', source: 'webhook_recurring', createdAt: new Date() });

      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).rejects.toThrow('already been collected');
    });

    it('refuses while another retry is pending', async () => {
      const f = await makeFailure();
      await db.insert(transactionSchema).values({ id: randomUUID(), organizationId: ORG, memberId: f.memberId, memberMembershipId: f.membershipId, transactionType: 'membership_payment', amount: 103.75, status: 'pending', source: 'retry', retryOfTransactionId: f.declinedId });

      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).rejects.toThrow(TransactionRetryInProgressError);
      expect(provider.chargeOneTimeFee).not.toHaveBeenCalled();
    });

    it('two concurrent retries charge once', async () => {
      const f = await makeFailure();
      provider.chargeOneTimeFee.mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 20));
        return { success: true, amountCharged: 103.75, transactionId: `c_${randomUUID()}` };
      });

      const results = await Promise.allSettled([
        retryFailedTransaction(f.declinedId, ORG, IQPRO),
        retryFailedTransaction(f.declinedId, ORG, IQPRO),
      ]);

      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(provider.chargeOneTimeFee).toHaveBeenCalledTimes(1);
    });
  });

  describe('seed simulation (non-production)', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it('approves a seed_ subscription without calling the provider', async () => {
      const f = await makeFailure({ subscriptionId: `seed_sub_${randomUUID()}`, providerInvoiceId: 'seed_inv' });

      const result = await retryFailedTransaction(f.declinedId, ORG, IQPRO);

      expect(result).toMatchObject({ status: 'approved', amountCharged: 103.75 });
      expect(provider.chargeOneTimeFee).not.toHaveBeenCalled();
      expect(provider.closeFailedInvoice).not.toHaveBeenCalled();
      expect((await txRow(result.retryTransactionId))!.providerTransactionId).toMatch(/^seed_retry_/);
    });

    it('declines a seed_decline_ subscription', async () => {
      const f = await makeFailure({ subscriptionId: `seed_decline_${randomUUID()}` });

      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).resolves.toMatchObject({ status: 'declined', declineReason: expect.stringContaining('simulated') });
    });

    it('delays a seed_slow_ subscription so the processing state is visible', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      const f = await makeFailure({ subscriptionId: `seed_slow_${randomUUID()}` });

      const pending = retryFailedTransaction(f.declinedId, ORG, IQPRO);
      await vi.advanceTimersByTimeAsync(SIMULATED_SLOW_RETRY_MS);

      await expect(pending).resolves.toMatchObject({ status: 'approved' });
    });

    it('does NOT simulate in production — the provider is called', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const f = await makeFailure({ subscriptionId: `seed_sub_${randomUUID()}` });
      provider.chargeOneTimeFee.mockResolvedValue({ success: false, error: 'IQPro 404' });

      await expect(retryFailedTransaction(f.declinedId, ORG, IQPRO)).rejects.toThrow('IQPro 404');
      expect(provider.chargeOneTimeFee).toHaveBeenCalled();
    });
  });
});

describe('getRetryQuote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('quotes the base + provider fees, the card, and IQPro auto-retries remaining', async () => {
    const f = await makeFailure({ declineCount: 1 });
    await db.insert(paymentMethodSchema).values({ id: randomUUID(), memberId: f.memberId, type: 'card', last4: '4242', cardBrand: 'VISA', expirationDate: '03/29', isDefault: true });
    provider.computeFees.mockResolvedValue({ baseAmount: 100, taxAmount: 0, taxPct: 0, serviceFeeAmount: 3.75, serviceFeePct: 3.75, amount: 103.75, provenance: {} });

    const quote = await getRetryQuote(f.declinedId, ORG, IQPRO);

    expect(quote).toMatchObject({
      provider: 'iqpro',
      memberName: 'Pat Due',
      planName: 'Gold Monthly',
      failureReason: 'Insufficient funds',
      baseAmount: 100,
      fees: { baseAmount: 100, serviceFeeAmount: 3.75, amount: 103.75 },
      card: { type: 'card', last4: '4242', cardBrand: 'VISA', expirationDate: '03/29', updatedAfterFailure: false },
      declineCount: 1,
      autoRetriesRemaining: 2,
      paysInvoice: false,
      // IQPro still retrying + no invoice to pay → both charges could succeed.
      doubleChargeRisk: true,
      overdue: false,
      blockedReason: null,
    });
    expect(provider.computeFees).toHaveBeenCalledWith(IQPRO, expect.objectContaining({ baseAmount: 100, isTaxable: false, paymentMethodType: 'card' }));
  });

  it('names the saved card so IQPro can price it by its BIN', async () => {
    const f = await makeFailure({ declineCount: 1 });
    await db.insert(paymentMethodSchema).values({ id: randomUUID(), memberId: f.memberId, type: 'card', last4: '5555', providerPaymentMethodId: 'pm_amex', isDefault: true });
    provider.computeFees.mockResolvedValue({ baseAmount: 100, taxAmount: 0, taxPct: 0, serviceFeeAmount: 3.75, serviceFeePct: 3.75, amount: 103.75 });

    await getRetryQuote(f.declinedId, ORG, IQPRO);

    expect(provider.computeFees).toHaveBeenCalledWith(IQPRO, expect.objectContaining({ customerId: `cus_${f.memberId}`, paymentMethodId: 'pm_amex' }));
  });

  it('IQPro with an invoice id: pays the invoice, so no double-charge risk even with retries left', async () => {
    const f = await makeFailure({ declineCount: 1, providerInvoiceId: 'iq-inv-2' });
    provider.computeFees.mockResolvedValue({ baseAmount: 100, taxAmount: 0, taxPct: 0, serviceFeeAmount: 3.75, serviceFeePct: 3.75, amount: 103.75 });

    const quote = await getRetryQuote(f.declinedId, ORG, IQPRO);

    expect(quote).toMatchObject({ autoRetriesRemaining: 2, paysInvoice: true, doubleChargeRisk: false });
  });

  it('flags a card the member updated at the provider after the failure', async () => {
    const f = await makeFailure({ createdAt: new Date(Date.now() - 3_600_000) });
    await db.insert(paymentMethodSchema).values({ id: randomUUID(), memberId: f.memberId, type: 'card', last4: '1111', isDefault: true, updatedSource: 'provider_sync', updatedAt: new Date() });
    provider.computeFees.mockResolvedValue({ baseAmount: 100, taxAmount: 0, taxPct: 0, serviceFeeAmount: 3.75, serviceFeePct: 3.75, amount: 103.75 });

    const quote = await getRetryQuote(f.declinedId, ORG, IQPRO);

    expect(quote.card?.updatedAfterFailure).toBe(true);
  });

  it('ignores replaced cards and quotes ACH for a bank account', async () => {
    const f = await makeFailure();
    await db.insert(paymentMethodSchema).values([
      { id: randomUUID(), memberId: f.memberId, type: 'card', last4: '0000', isDefault: true, status: 'replaced' },
      { id: randomUUID(), memberId: f.memberId, type: 'bank_transfer', last4: '6789', isDefault: false },
    ]);
    provider.computeFees.mockResolvedValue({ baseAmount: 100, taxAmount: 0, taxPct: 0, serviceFeeAmount: 3.75, serviceFeePct: 3.75, amount: 103.75 });

    const quote = await getRetryQuote(f.declinedId, ORG, IQPRO);

    expect(quote.card?.last4).toBe('6789');
    expect(provider.computeFees).toHaveBeenCalledWith(IQPRO, expect.objectContaining({ paymentMethodType: 'ach' }));
  });

  it('falls back to a local estimate when the provider cannot quote, and reports overdue at 3 declines', async () => {
    const f = await makeFailure({ declineCount: 3 });
    provider.computeFees.mockRejectedValue(new Error('IQPro down'));

    const quote = await getRetryQuote(f.declinedId, ORG, IQPRO);

    expect(quote.fees).toEqual({ baseAmount: 100, serviceFeeAmount: 3.75, serviceFeePct: 3.75, taxAmount: 0, amount: 103.75 });
    expect(quote).toMatchObject({ overdue: true, autoRetriesRemaining: 0, card: null });
  });

  it('falls back to an estimate on a non-Error throw', async () => {
    const f = await makeFailure();
    provider.computeFees.mockRejectedValue('nope');

    await expect(getRetryQuote(f.declinedId, ORG, IQPRO)).resolves.toMatchObject({ fees: { amount: 103.75 } });
  });

  it('reports Square with no auto-retries, and estimates for a seed subscription without calling the provider', async () => {
    const f = await makeFailure({ subscriptionId: `seed_sub_${randomUUID()}` });

    const quote = await getRetryQuote(f.declinedId, ORG, SQUARE);

    expect(quote).toMatchObject({ provider: 'square', autoRetriesRemaining: 0, overdue: false, fees: { amount: 103.75 } });
    expect(provider.computeFees).not.toHaveBeenCalled();
  });

  it('reports a blocked reason when no provider is configured', async () => {
    const f = await makeFailure();

    const quote = await getRetryQuote(f.declinedId, ORG, null);

    expect(quote).toMatchObject({ provider: null, autoRetriesRemaining: 0, blockedReason: expect.stringContaining('No payment provider') });
  });

  it('propagates the retry guards', async () => {
    const f = await makeFailure({ status: 'paid' });

    await expect(getRetryQuote(f.declinedId, ORG, IQPRO)).rejects.toThrow(TransactionNotRetryableError);
  });
});
