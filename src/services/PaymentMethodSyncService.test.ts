import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/libs/DB';
import { memberMembershipSchema, memberSchema, membershipPlanSchema, noteSchema, paymentMethodSchema } from '@/models/Schema';
import { AUDIT_ACTION } from '@/types/Audit';
import { MemberNotFoundError } from './MembersService';
import {
  SYNC_THROTTLE_MS,
  syncByProviderCustomer,
  syncMemberPaymentMethod,
  syncMemberQuietly,
  syncPastDuePaymentMethods,
} from './PaymentMethodSyncService';

vi.mock('@/libs/DB');

const provider = { getSubscriptionPaymentMethod: vi.fn() };
vi.mock('./PaymentProviderService', () => ({ getPaymentProvider: vi.fn(async () => provider) }));

const auditMock = vi.fn();
vi.mock('./AuditService', () => ({ audit: (...a: unknown[]) => auditMock(...a) }));
vi.mock('@/libs/Logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const ORG = 'org_sync_test';
const IQPRO = { provider: 'iqpro' } as never;
const SQUARE = { provider: 'square' } as never;

async function makeMember(opts: {
  subscriptionId?: string | null;
  card?: Partial<typeof paymentMethodSchema.$inferInsert> | null;
  membershipStatus?: string;
} = {}) {
  const memberId = randomUUID();
  const planId = randomUUID();
  const customerId = `cus_${memberId}`;
  await db.insert(memberSchema).values({ id: memberId, organizationId: ORG, firstName: 'C', lastName: 'Ard', email: `${memberId}@example.com`, providerCustomerId: customerId });
  await db.insert(membershipPlanSchema).values({ id: planId, organizationId: ORG, name: 'P', slug: `p-${planId}`, category: 'A', program: 'A', contractLength: 'M', accessLevel: 'U' });
  if (opts.subscriptionId !== null) {
    await db.insert(memberMembershipSchema).values({
      id: randomUUID(),
      memberId,
      membershipPlanId: planId,
      status: opts.membershipStatus ?? 'past_due',
      providerSubscriptionId: opts.subscriptionId ?? `sub_${memberId}`,
    });
  }
  let cardId: string | null = null;
  if (opts.card !== null) {
    cardId = randomUUID();
    await db.insert(paymentMethodSchema).values({
      id: cardId,
      memberId,
      type: 'card',
      providerPaymentMethodId: 'pm_old',
      last4: '1111',
      expirationDate: '01/27',
      isDefault: true,
      ...opts.card,
    });
  }
  return { memberId, cardId, customerId };
}

async function cards(memberId: string) {
  return db.select().from(paymentMethodSchema).where(eq(paymentMethodSchema.memberId, memberId));
}

describe('syncMemberPaymentMethod', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('replaces the card when the provider reports a different payment method — old kept as history', async () => {
    const m = await makeMember();
    provider.getSubscriptionPaymentMethod.mockResolvedValue({ customerId: 'c', paymentMethodId: 'pm_new', paymentMethodName: 'card', last4: '4242', cardBrand: 'VISA', expirationDate: '03/29', firstSix: '424242' });

    const result = await syncMemberPaymentMethod(m.memberId, ORG, IQPRO);

    expect(result).toMatchObject({ changed: true, previousLast4: '1111', paymentMethod: { last4: '4242', cardBrand: 'VISA', expirationDate: '03/29', updatedSource: 'provider_sync' } });

    const rows = await cards(m.memberId);
    const old = rows.find(r => r.id === m.cardId)!;
    const fresh = rows.find(r => r.id !== m.cardId)!;

    expect(old).toMatchObject({ status: 'replaced', isDefault: false });
    expect(fresh).toMatchObject({ status: 'active', isDefault: true, providerPaymentMethodId: 'pm_new', last4: '4242', firstSix: '424242', updatedSource: 'provider_sync', type: 'card' });

    const notes = await db.select().from(noteSchema).where(eq(noteSchema.memberId, m.memberId));

    expect(notes[0]!.content).toBe('Card on file updated at IQPro: •••• 1111 → •••• 4242 (exp 03/29).');
    expect(auditMock).toHaveBeenCalledWith(
      { userId: 'system:payment-webhook', orgId: ORG },
      AUDIT_ACTION.PAYMENT_METHOD_PROVIDER_UPDATE,
      'paymentMethod',
      expect.objectContaining({ changes: { card: { before: '•••• 1111', after: '•••• 4242' }, expiration: { before: '01/27', after: '03/29' } } }),
    );
    // Masked values only — never a token or full number.
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain('pm_new');
  });

  it('updates in place when the provider id is the same but the expiry changed', async () => {
    const m = await makeMember();
    provider.getSubscriptionPaymentMethod.mockResolvedValue({ customerId: 'c', paymentMethodId: 'pm_old', paymentMethodName: 'card', last4: '1111', expirationDate: '09/30' });

    const result = await syncMemberPaymentMethod(m.memberId, ORG, IQPRO, { actor: { userId: 'staff_1', orgId: ORG } });

    expect(result).toMatchObject({ changed: true, previousLast4: '1111', paymentMethod: { expirationDate: '09/30' } });

    const rows = await cards(m.memberId);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'active', expirationDate: '09/30', updatedSource: 'provider_sync' });
    expect(auditMock.mock.calls[0]![0]).toEqual({ userId: 'staff_1', orgId: ORG });
  });

  it('only bumps last_synced_at for an unchanged card, backfilling missing display fields quietly', async () => {
    const m = await makeMember({ card: { cardBrand: null, expirationDate: null, firstSix: null } });
    provider.getSubscriptionPaymentMethod.mockResolvedValue({ customerId: 'c', paymentMethodId: 'pm_old', paymentMethodName: 'card', last4: '1111', cardBrand: 'MASTERCARD', expirationDate: '05/28', firstSix: '555555' });

    const result = await syncMemberPaymentMethod(m.memberId, ORG, IQPRO);

    // A field we never stored is a backfill, not a member update. Sandbox: the
    // first sync of a pre-expiry row reported "•••• 5555 → •••• 5555".
    expect(result).toMatchObject({ changed: false, paymentMethod: { last4: '1111', expirationDate: '05/28', cardBrand: 'MASTERCARD' } });
    expect(auditMock).not.toHaveBeenCalled();

    const [row] = await cards(m.memberId);

    expect(row).toMatchObject({ cardBrand: 'MASTERCARD', firstSix: '555555', expirationDate: '05/28' });
    expect(row!.updatedSource).not.toBe('provider_sync');
    expect(row!.lastSyncedAt).not.toBeNull();
  });

  it('backfills a missing last4 quietly too', async () => {
    const m = await makeMember({ card: { last4: null } });
    provider.getSubscriptionPaymentMethod.mockResolvedValue({ customerId: 'c', paymentMethodId: 'pm_old', paymentMethodName: 'card', last4: '1111', expirationDate: '01/27' });

    const result = await syncMemberPaymentMethod(m.memberId, ORG, IQPRO);

    expect(result).toMatchObject({ changed: false, paymentMethod: { last4: '1111' } });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('treats a brand-only difference as unchanged and fills the brand', async () => {
    const m = await makeMember({ card: { cardBrand: null } });
    provider.getSubscriptionPaymentMethod.mockResolvedValue({ customerId: 'c', paymentMethodId: 'pm_old', paymentMethodName: 'card', last4: '1111', expirationDate: '01/27', cardBrand: 'VISA' });

    const result = await syncMemberPaymentMethod(m.memberId, ORG, IQPRO);

    expect(result).toMatchObject({ changed: false, paymentMethod: { cardBrand: 'VISA' } });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('keeps existing values when the provider omits them on an in-place update', async () => {
    const m = await makeMember({ card: { cardBrand: 'VISA', firstSix: '411111' } });
    provider.getSubscriptionPaymentMethod.mockResolvedValue({ customerId: 'c', paymentMethodId: 'pm_old', paymentMethodName: 'card', last4: '9999' });

    const result = await syncMemberPaymentMethod(m.memberId, ORG, IQPRO);

    expect(result.paymentMethod).toMatchObject({ last4: '9999', expirationDate: '01/27', cardBrand: 'VISA' });
  });

  it('inserts a card when the member had none locally, and maps ACH to bank_transfer', async () => {
    const m = await makeMember({ card: null });
    provider.getSubscriptionPaymentMethod.mockResolvedValue({ customerId: 'c', paymentMethodId: 'pm_ach', paymentMethodName: 'ach', last4: '6789', accountType: 'Checking' });

    const result = await syncMemberPaymentMethod(m.memberId, ORG, SQUARE);

    expect(result).toMatchObject({ changed: true, previousLast4: null });

    const rows = await cards(m.memberId);

    expect(rows[0]).toMatchObject({ type: 'bank_transfer', accountType: 'Checking', last4: '6789', status: 'active' });

    const notes = await db.select().from(noteSchema).where(eq(noteSchema.memberId, m.memberId));

    expect(notes[0]!.content).toBe('Card on file found at Square: •••• 6789.');
  });

  it('never touches local data when the provider read fails', async () => {
    const m = await makeMember();
    provider.getSubscriptionPaymentMethod.mockResolvedValue(null);

    const result = await syncMemberPaymentMethod(m.memberId, ORG, IQPRO);

    expect(result).toMatchObject({ changed: false, error: expect.stringContaining('IQPro'), paymentMethod: { last4: '1111' } });
    expect((await cards(m.memberId))[0]).toMatchObject({ last4: '1111', lastSyncedAt: null });
  });

  it('treats a thrown provider error as a failed read', async () => {
    const m = await makeMember({ card: null });
    provider.getSubscriptionPaymentMethod.mockRejectedValue(new Error('timeout'));

    const result = await syncMemberPaymentMethod(m.memberId, ORG, SQUARE);

    expect(result).toEqual({ changed: false, error: 'Could not read the card on file from Square.' });
  });

  it('handles a non-Error throw from the provider', async () => {
    const m = await makeMember();
    provider.getSubscriptionPaymentMethod.mockRejectedValue('boom');

    await expect(syncMemberPaymentMethod(m.memberId, ORG, IQPRO)).resolves.toMatchObject({ changed: false });
  });

  it('throttles a repeat sync, and force bypasses it', async () => {
    const m = await makeMember({ card: { lastSyncedAt: new Date() } });

    const throttled = await syncMemberPaymentMethod(m.memberId, ORG, IQPRO);

    expect(throttled).toMatchObject({ changed: false, skipped: 'throttled' });
    expect(provider.getSubscriptionPaymentMethod).not.toHaveBeenCalled();

    provider.getSubscriptionPaymentMethod.mockResolvedValue({ customerId: 'c', paymentMethodId: 'pm_old', paymentMethodName: 'card', last4: '1111', expirationDate: '01/27' });
    await syncMemberPaymentMethod(m.memberId, ORG, IQPRO, { force: true });

    expect(provider.getSubscriptionPaymentMethod).toHaveBeenCalled();
  });

  it('syncs again once the throttle window has passed', async () => {
    const m = await makeMember({ card: { lastSyncedAt: new Date(Date.now() - SYNC_THROTTLE_MS - 1000) } });
    provider.getSubscriptionPaymentMethod.mockResolvedValue({ customerId: 'c', paymentMethodId: 'pm_old', paymentMethodName: 'card', last4: '1111', expirationDate: '01/27' });

    await syncMemberPaymentMethod(m.memberId, ORG, IQPRO);

    expect(provider.getSubscriptionPaymentMethod).toHaveBeenCalled();
  });

  it('skips members with no subscription, and seed subscriptions outside production', async () => {
    const none = await makeMember({ subscriptionId: null });

    await expect(syncMemberPaymentMethod(none.memberId, ORG, IQPRO)).resolves.toEqual({ changed: false, skipped: 'no_subscription' });

    const seed = await makeMember({ subscriptionId: `seed_sub_${randomUUID()}` });

    await expect(syncMemberPaymentMethod(seed.memberId, ORG, IQPRO)).resolves.toMatchObject({ changed: false, skipped: 'simulated', paymentMethod: { last4: '1111' } });

    const seedNoCard = await makeMember({ subscriptionId: `seed_sub_${randomUUID()}`, card: null });

    await expect(syncMemberPaymentMethod(seedNoCard.memberId, ORG, IQPRO)).resolves.toEqual({ changed: false, skipped: 'simulated' });
    expect(provider.getSubscriptionPaymentMethod).not.toHaveBeenCalled();
  });

  it('calls the provider for a seed subscription in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const seed = await makeMember({ subscriptionId: `seed_sub_${randomUUID()}` });
    provider.getSubscriptionPaymentMethod.mockResolvedValue(null);

    await syncMemberPaymentMethod(seed.memberId, ORG, IQPRO);

    expect(provider.getSubscriptionPaymentMethod).toHaveBeenCalled();
  });

  it('ignores cancelled memberships when choosing the subscription', async () => {
    const m = await makeMember({ membershipStatus: 'cancelled' });

    await expect(syncMemberPaymentMethod(m.memberId, ORG, IQPRO)).resolves.toEqual({ changed: false, skipped: 'no_subscription' });
  });

  it('reports a missing provider config', async () => {
    const m = await makeMember();

    await expect(syncMemberPaymentMethod(m.memberId, ORG, null)).resolves.toMatchObject({ changed: false, error: expect.stringContaining('No payment provider') });
  });

  it('404s a member from another org', async () => {
    await expect(syncMemberPaymentMethod(randomUUID(), ORG, IQPRO)).rejects.toThrow(MemberNotFoundError);
  });

  it('still succeeds when the note cannot be written', async () => {
    const m = await makeMember();
    provider.getSubscriptionPaymentMethod.mockResolvedValue({ customerId: 'c', paymentMethodId: 'pm_x', paymentMethodName: 'card', last4: '0005' });
    const spy = vi.spyOn(db, 'insert');
    // First insert (the new card, inside the transaction) runs on `tx`; the note uses `db.insert`.
    spy.mockImplementationOnce(() => {
      throw new Error('note table locked');
    });

    await expect(syncMemberPaymentMethod(m.memberId, ORG, IQPRO)).resolves.toMatchObject({ changed: true });

    spy.mockRestore();
  });
});

describe('webhook helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncByProviderCustomer resolves the member and forces a sync', async () => {
    const m = await makeMember({ card: { lastSyncedAt: new Date() } });
    provider.getSubscriptionPaymentMethod.mockResolvedValue({ customerId: 'c', paymentMethodId: 'pm_new2', paymentMethodName: 'card', last4: '7777' });

    await syncByProviderCustomer(m.customerId, ORG, IQPRO);

    const rows = await cards(m.memberId);

    expect(rows.find(r => r.status === 'active')!.last4).toBe('7777');
  });

  it('syncByProviderCustomer is a no-op for an unknown customer and never throws', async () => {
    await expect(syncByProviderCustomer('cus_nobody', ORG, IQPRO)).resolves.toBeUndefined();
    expect(provider.getSubscriptionPaymentMethod).not.toHaveBeenCalled();

    const spy = vi.spyOn(db, 'select').mockImplementationOnce(() => {
      throw new Error('db down');
    });

    await expect(syncByProviderCustomer('cus_x', ORG, IQPRO)).resolves.toBeUndefined();

    spy.mockRestore();
  });

  it('syncMemberQuietly swallows errors', async () => {
    await expect(syncMemberQuietly(randomUUID(), ORG, IQPRO)).resolves.toBeUndefined();
  });
});

describe('syncPastDuePaymentMethods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs only past-due members with a subscription, counting changes and failures', async () => {
    const ORG2 = 'org_cron_batch';
    const make = async (status: string, sub: string | null) => {
      const memberId = randomUUID();
      const planId = randomUUID();
      await db.insert(memberSchema).values({ id: memberId, organizationId: ORG2, firstName: 'B', lastName: 'At', email: `${memberId}@example.com` });
      await db.insert(membershipPlanSchema).values({ id: planId, organizationId: ORG2, name: 'P', slug: `p-${planId}`, category: 'A', program: 'A', contractLength: 'M', accessLevel: 'U' });
      await db.insert(memberMembershipSchema).values({ id: randomUUID(), memberId, membershipPlanId: planId, status, providerSubscriptionId: sub });
      return memberId;
    };
    await make('past_due', `sub_${randomUUID()}`); // changes
    await make('past_due', `sub_${randomUUID()}`); // read fails
    await make('active', `sub_${randomUUID()}`); // not past due — skipped
    await make('past_due', null); // no subscription — skipped
    provider.getSubscriptionPaymentMethod
      .mockResolvedValueOnce({ customerId: 'c', paymentMethodId: 'pm_b1', paymentMethodName: 'card', last4: '1234' })
      .mockResolvedValueOnce(null);

    const summary = await syncPastDuePaymentMethods(ORG2, IQPRO);

    expect(summary).toEqual({ checked: 2, changed: 1, failed: 1 });
    expect(provider.getSubscriptionPaymentMethod).toHaveBeenCalledTimes(2);
  });

  it('counts a thrown member sync as a failure and continues', async () => {
    const ORG3 = 'org_cron_throw';
    const memberId = randomUUID();
    const planId = randomUUID();
    await db.insert(memberSchema).values({ id: memberId, organizationId: ORG3, firstName: 'T', lastName: 'Hrow', email: `${memberId}@example.com` });
    await db.insert(membershipPlanSchema).values({ id: planId, organizationId: ORG3, name: 'P', slug: `p-${planId}`, category: 'A', program: 'A', contractLength: 'M', accessLevel: 'U' });
    await db.insert(memberMembershipSchema).values({ id: randomUUID(), memberId, membershipPlanId: planId, status: 'past_due', providerSubscriptionId: `sub_${randomUUID()}` });
    // The batch query uses selectDistinct; the first db.select is the
    // per-member lookup inside syncMemberPaymentMethod — make it throw.
    const spy = vi.spyOn(db, 'select').mockImplementationOnce(() => {
      throw new Error('select failed');
    });

    const summary = await syncPastDuePaymentMethods(ORG3, IQPRO);
    spy.mockRestore();

    expect(summary).toEqual({ checked: 1, changed: 0, failed: 1 });
  });
});
