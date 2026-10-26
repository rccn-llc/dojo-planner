import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/libs/DB';
import {
  memberMembershipSchema,
  memberSchema,
  membershipPlanSchema,
  paymentMethodSchema,
  paymentWebhookEventSchema,
  transactionSchema,
} from '@/models/Schema';
import { AUDIT_ACTION } from '@/types/Audit';
import {
  DUPLICATE_WINDOW_MS,
  IQPRO_MAX_ATTEMPTS,
  POSSIBLE_DUPLICATE_REASON,
  recordRecurringCharge,
} from './RecurringChargeWebhookService';

// Real PGlite with the baseline applied (src/libs/__mocks__/DB.ts): the
// decline-count increment, notInArray guards and dedup unique index are SQL
// behaviour, which a chain mock would only restate.
vi.mock('@/libs/DB');

const auditMock = vi.fn();
vi.mock('@/services/AuditService', () => ({
  audit: (...args: unknown[]) => auditMock(...args),
}));

const recordExternalRefMock = vi.fn();
vi.mock('./TenantExternalRefService', () => ({
  REF_TYPE: { PROVIDER_TRANSACTION: 'provider_transaction' },
  recordExternalRef: (...args: unknown[]) => recordExternalRefMock(...args),
}));

vi.mock('@/libs/Logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const ORG = 'org_test_recurring';

type Fixture = { memberId: string; membershipId: string; subscriptionId: string };

async function makeMember(opts: {
  memberStatus?: string;
  membershipStatus?: string;
  declineCount?: number;
  holdFeeSubscriptionId?: string;
  org?: string;
} = {}): Promise<Fixture> {
  const memberId = randomUUID();
  const planId = randomUUID();
  const membershipId = randomUUID();
  const subscriptionId = `sub_${randomUUID()}`;

  await db.insert(memberSchema).values({
    id: memberId,
    organizationId: opts.org ?? ORG,
    firstName: 'Test',
    lastName: 'Member',
    email: `${memberId}@example.com`,
    status: opts.memberStatus ?? 'active',
  });
  await db.insert(membershipPlanSchema).values({
    id: planId,
    organizationId: opts.org ?? ORG,
    name: 'Monthly',
    slug: `monthly-${planId}`,
    category: 'Adult',
    program: 'Adult',
    price: 100,
    contractLength: 'Month-to-Month',
    accessLevel: 'Unlimited',
  });
  await db.insert(memberMembershipSchema).values({
    id: membershipId,
    memberId,
    membershipPlanId: planId,
    status: opts.membershipStatus ?? 'active',
    providerSubscriptionId: subscriptionId,
    providerHoldFeeSubscriptionId: opts.holdFeeSubscriptionId ?? null,
    declineCount: opts.declineCount ?? 0,
  });
  await db.insert(paymentMethodSchema).values({
    id: randomUUID(),
    memberId,
    type: 'card',
    last4: '4242',
    isDefault: true,
  });

  return { memberId, membershipId, subscriptionId };
}

function declined(f: Fixture, attempt: number, overrides: Partial<Parameters<typeof recordRecurringCharge>[0]> = {}) {
  const txId = `tx_${f.subscriptionId}_${attempt}`;
  return recordRecurringCharge({
    provider: 'iqpro',
    eventKey: `${txId}:DECLINED`,
    organizationId: ORG,
    providerSubscriptionId: f.subscriptionId,
    providerTransactionId: txId,
    amount: 103.75,
    outcome: 'declined',
    failureReason: 'Insufficient funds',
    ...overrides,
  });
}

function paid(f: Fixture, key: string, overrides: Partial<Parameters<typeof recordRecurringCharge>[0]> = {}) {
  return recordRecurringCharge({
    provider: 'iqpro',
    eventKey: `${key}:PENDINGSETTLEMENT`,
    organizationId: ORG,
    providerSubscriptionId: f.subscriptionId,
    providerTransactionId: key,
    amount: 103.75,
    outcome: 'paid',
    ...overrides,
  });
}

async function membershipRow(id: string) {
  const [row] = await db.select().from(memberMembershipSchema).where(eq(memberMembershipSchema.id, id));
  return row!;
}

async function memberRow(id: string) {
  const [row] = await db.select().from(memberSchema).where(eq(memberSchema.id, id));
  return row!;
}

async function rowsFor(membershipId: string) {
  return db.select().from(transactionSchema).where(eq(transactionSchema.memberMembershipId, membershipId));
}

describe('recordRecurringCharge', () => {
  beforeEach(() => {
    auditMock.mockReset();
    recordExternalRefMock.mockReset();
  });

  describe('declines', () => {
    it('records a declined row and marks membership + member past_due', async () => {
      const f = await makeMember();

      const result = await declined(f, 1);

      expect(result).toMatchObject({ status: 'recorded', declineCount: 1, overdue: false, possibleDuplicate: false });

      const rows = await rowsFor(f.membershipId);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: 'declined',
        source: 'webhook_recurring',
        transactionType: 'membership_payment',
        failureReason: 'Insufficient funds',
        amount: 103.75,
        paymentMethod: 'card',
        processedAt: null,
      });
      expect((await membershipRow(f.membershipId))).toMatchObject({ status: 'past_due', declineCount: 1, lastDeclineReason: 'Insufficient funds' });
      expect((await memberRow(f.memberId)).status).toBe('past_due');
      expect(recordExternalRefMock).toHaveBeenCalledWith('provider_transaction', `tx_${f.subscriptionId}_1`, ORG);
    });

    it('counts IQPro attempts 1 → 2 → 3, one row each, and audits overdue on the 3rd', async () => {
      const f = await makeMember();

      await declined(f, 1);
      await declined(f, 2);
      const third = await declined(f, 3);

      expect(third).toMatchObject({ status: 'recorded', declineCount: IQPRO_MAX_ATTEMPTS, overdue: true });
      expect(await rowsFor(f.membershipId)).toHaveLength(3);
      expect(auditMock).toHaveBeenCalledTimes(1);
      expect(auditMock.mock.calls[0]![1]).toBe(AUDIT_ACTION.MEMBERSHIP_OVERDUE);
      expect(auditMock.mock.calls[0]![0]).toMatchObject({ userId: 'system:payment-webhook', orgId: ORG });
    });

    it('does not report Square declines as overdue', async () => {
      const f = await makeMember({ declineCount: 2 });

      const result = await declined(f, 1, { provider: 'square', eventKey: `evt_${randomUUID()}` });

      expect(result).toMatchObject({ declineCount: 3, overdue: false });
      expect(auditMock).not.toHaveBeenCalled();
    });

    it('counts a redelivered webhook once', async () => {
      const f = await makeMember();

      await declined(f, 1);
      const again = await declined(f, 1);

      expect(again).toEqual({ status: 'duplicate' });
      expect(await rowsFor(f.membershipId)).toHaveLength(1);
      expect((await membershipRow(f.membershipId)).declineCount).toBe(1);
    });

    it.each(['hold', 'cancelled', 'archived'])('leaves a %s member\'s status alone', async (memberStatus) => {
      const f = await makeMember({ memberStatus });

      await declined(f, 1);

      expect((await memberRow(f.memberId)).status).toBe(memberStatus);
    });

    it('records but does not change a membership that is not being collected on', async () => {
      const f = await makeMember({ membershipStatus: 'cancelled' });

      const result = await declined(f, 1);

      expect(result).toMatchObject({ status: 'recorded', declineCount: 0 });
      expect((await membershipRow(f.membershipId)).status).toBe('cancelled');
      expect(await rowsFor(f.membershipId)).toHaveLength(1);
    });

    it('records a hold-fee decline as hold_fee without moving the member out of hold', async () => {
      const holdSub = `hold_${randomUUID()}`;
      const f = await makeMember({ memberStatus: 'hold', membershipStatus: 'hold', holdFeeSubscriptionId: holdSub });

      await declined(f, 1, { providerSubscriptionId: holdSub });

      const rows = await rowsFor(f.membershipId);

      expect(rows[0]!.transactionType).toBe('hold_fee');
      expect((await membershipRow(f.membershipId)).status).toBe('hold');
      expect((await memberRow(f.memberId)).status).toBe('hold');
    });

    it('dedupes a Square invoice that arrives under two event ids', async () => {
      const f = await makeMember();
      const base = { provider: 'square' as const, providerTransactionId: null, providerInvoiceId: `inv_${randomUUID()}` };

      await declined(f, 1, { ...base, eventKey: 'evt_a' });
      const second = await declined(f, 1, { ...base, eventKey: 'evt_b' });

      expect(second).toEqual({ status: 'duplicate' });
      expect(await rowsFor(f.membershipId)).toHaveLength(1);
    });
  });

  describe('successes', () => {
    it('after declines: records paid, resets the count and reactivates', async () => {
      const f = await makeMember();
      await declined(f, 1);
      await declined(f, 2);

      const result = await paid(f, `ok_${randomUUID()}`, { nextPaymentDate: new Date('2030-01-01') });

      expect(result).toMatchObject({ status: 'recorded', declineCount: 0, possibleDuplicate: false });

      const m = await membershipRow(f.membershipId);

      expect(m).toMatchObject({ status: 'active', declineCount: 0, lastDeclineAt: null, lastDeclineReason: null });
      expect(m.nextPaymentDate).toEqual(new Date('2030-01-01'));
      expect((await memberRow(f.memberId)).status).toBe('active');
    });

    it('an on-time success with no declines records the renewal and changes no status', async () => {
      const f = await makeMember();

      const result = await paid(f, `ok_${randomUUID()}`);

      expect(result).toMatchObject({ status: 'recorded' });
      expect((await memberRow(f.memberId)).status).toBe('active');

      const rows = await rowsFor(f.membershipId);

      expect(rows[0]).toMatchObject({ status: 'paid', source: 'webhook_recurring', failureReason: null });
      expect(rows[0]!.processedAt).not.toBeNull();
    });

    it('keeps the member past_due while another membership is still past_due', async () => {
      const f = await makeMember({ memberStatus: 'past_due' });
      const planId = randomUUID();
      await db.insert(membershipPlanSchema).values({
        id: planId,
        organizationId: ORG,
        name: 'Second',
        slug: `second-${planId}`,
        category: 'Adult',
        program: 'Adult',
        contractLength: 'Month-to-Month',
        accessLevel: 'Unlimited',
      });
      await db.insert(memberMembershipSchema).values({
        id: randomUUID(),
        memberId: f.memberId,
        membershipPlanId: planId,
        status: 'past_due',
      });
      await declined(f, 1);

      await paid(f, `ok_${randomUUID()}`);

      expect((await membershipRow(f.membershipId)).status).toBe('active');
      expect((await memberRow(f.memberId)).status).toBe('past_due');
    });

    it('skips the first invoice of a subscription the app already charged at signup', async () => {
      const f = await makeMember();
      await db.insert(transactionSchema).values({
        id: randomUUID(),
        organizationId: ORG,
        memberId: f.memberId,
        memberMembershipId: f.membershipId,
        transactionType: 'membership_payment',
        amount: 100,
        status: 'paid',
        source: 'app',
      });

      const result = await paid(f, `ok_${randomUUID()}`, { provider: 'square' });

      expect(result).toEqual({ status: 'skipped_first_charge' });
      expect(await rowsFor(f.membershipId)).toHaveLength(1);
    });

    it('flags a paid auto-charge for a cycle a manual retry already collected', async () => {
      const f = await makeMember();
      await declined(f, 1);
      await db.insert(transactionSchema).values({
        id: randomUUID(),
        organizationId: ORG,
        memberId: f.memberId,
        memberMembershipId: f.membershipId,
        transactionType: 'membership_payment',
        amount: 100,
        status: 'paid',
        source: 'retry',
        createdAt: new Date(Date.now() + 1000),
      });

      const result = await paid(f, `ok_${randomUUID()}`, { occurredAt: new Date(Date.now() + 2000) });

      expect(result).toMatchObject({ status: 'recorded', possibleDuplicate: true });

      const flagged = (await rowsFor(f.membershipId)).find(r => r.source === 'webhook_recurring' && r.status === 'paid');

      expect(flagged!.failureReason).toBe(POSSIBLE_DUPLICATE_REASON);
      expect(auditMock.mock.calls.map(c => c[1])).toContain(AUDIT_ACTION.TRANSACTION_POSSIBLE_DUPLICATE);
    });

    it('does not flag the next legitimate renewal after a retry outside the window', async () => {
      const f = await makeMember();
      await declined(f, 1);
      await db.insert(transactionSchema).values({
        id: randomUUID(),
        organizationId: ORG,
        memberId: f.memberId,
        memberMembershipId: f.membershipId,
        transactionType: 'membership_payment',
        amount: 100,
        status: 'paid',
        source: 'retry',
        createdAt: new Date(Date.now() + 1000),
      });

      const result = await paid(f, `ok_${randomUUID()}`, { occurredAt: new Date(Date.now() + DUPLICATE_WINDOW_MS + 60_000) });

      expect(result).toMatchObject({ possibleDuplicate: false });
    });
  });

  describe('existing rows and routing misses', () => {
    it('updates an existing row with the same provider transaction id instead of inserting', async () => {
      const f = await makeMember();
      const existingId = randomUUID();
      await db.insert(transactionSchema).values({
        id: existingId,
        organizationId: ORG,
        memberId: f.memberId,
        memberMembershipId: f.membershipId,
        providerTransactionId: 'retry_tx_1',
        transactionType: 'membership_payment',
        amount: 100,
        status: 'pending',
        source: 'retry',
      });

      const result = await paid(f, 'retry_tx_1');

      expect(result).toEqual({ status: 'updated_existing', transactionId: existingId });

      const rows = await rowsFor(f.membershipId);

      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('paid');
    });

    it('records the decline reason when updating an existing row to declined', async () => {
      const f = await makeMember();
      await db.insert(transactionSchema).values({
        id: randomUUID(),
        organizationId: ORG,
        memberId: f.memberId,
        memberMembershipId: f.membershipId,
        providerTransactionId: 'retry_tx_2',
        transactionType: 'membership_payment',
        amount: 100,
        status: 'pending',
      });

      await declined(f, 0, { providerTransactionId: 'retry_tx_2', eventKey: 'retry_tx_2:DECLINED' });

      const [row] = await rowsFor(f.membershipId);

      expect(row).toMatchObject({ status: 'declined', failureReason: 'Insufficient funds' });
    });

    it('never resurrects a refunded row', async () => {
      const f = await makeMember();
      await db.insert(transactionSchema).values({
        id: randomUUID(),
        organizationId: ORG,
        memberId: f.memberId,
        providerTransactionId: 'refunded_tx',
        transactionType: 'membership_payment',
        amount: 100,
        status: 'refunded',
      });

      await paid(f, 'refunded_tx');

      const [row] = await db.select().from(transactionSchema).where(eq(transactionSchema.providerTransactionId, 'refunded_tx'));

      expect(row!.status).toBe('refunded');
    });

    it('returns unmatched for a subscription with no local membership', async () => {
      const result = await recordRecurringCharge({
        provider: 'iqpro',
        eventKey: `unknown_${randomUUID()}:DECLINED`,
        organizationId: ORG,
        providerSubscriptionId: 'sub_nobody',
        amount: 10,
        outcome: 'declined',
      });

      expect(result).toEqual({ status: 'unmatched' });
    });

    it('does not match a membership belonging to another org', async () => {
      const f = await makeMember({ org: 'org_someone_else' });

      const result = await declined(f, 1);

      expect(result).toEqual({ status: 'unmatched' });
      expect(await rowsFor(f.membershipId)).toHaveLength(0);
    });

    it('claims the event key in payment_webhook_event', async () => {
      const f = await makeMember();
      await declined(f, 1);

      const claimed = await db.select().from(paymentWebhookEventSchema).where(eq(paymentWebhookEventSchema.eventKey, `tx_${f.subscriptionId}_1:DECLINED`));

      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({ provider: 'iqpro', organizationId: ORG });
    });
  });
});

describe('recordRecurringCharge — failure after claiming', () => {
  it('releases the event claim so the provider\'s redelivery is processed', async () => {
    const f = await makeMember();
    const transactionSpy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('db down'));

    await expect(declined(f, 1)).rejects.toThrow('db down');

    transactionSpy.mockRestore();

    const retried = await declined(f, 1);

    expect(retried).toMatchObject({ status: 'recorded', declineCount: 1 });
    expect(await rowsFor(f.membershipId)).toHaveLength(1);
  });

  it('still rethrows the original error when releasing the claim also fails', async () => {
    const f = await makeMember();
    const transactionSpy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('db down'));
    const deleteSpy = vi.spyOn(db, 'delete').mockImplementationOnce(() => {
      throw new Error('delete failed');
    });

    await expect(declined(f, 1)).rejects.toThrow('db down');

    transactionSpy.mockRestore();
    deleteSpy.mockRestore();
  });
});
