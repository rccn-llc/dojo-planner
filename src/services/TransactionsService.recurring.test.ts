import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/libs/DB';
import { familyMemberSchema, memberMembershipSchema, memberSchema, membershipPlanSchema, transactionSchema } from '@/models/Schema';
import { getMemberTransactions } from './MembersService';
import { getOrganizationTransactions, getTransactionById } from './TransactionsService';

// Real PGlite: `resolved`, `superseded` and `attemptNumber` are correlated
// subqueries — only a real database proves them.
vi.mock('@/libs/DB');

const ORG = 'org_tx_recurring';
const t0 = Date.now() - 10 * 24 * 3600 * 1000;
const at = (hours: number) => new Date(t0 + hours * 3600 * 1000);

async function membership() {
  const memberId = randomUUID();
  const planId = randomUUID();
  const membershipId = randomUUID();
  await db.insert(memberSchema).values({ id: memberId, organizationId: ORG, firstName: 'R', lastName: 'Ec', email: `${memberId}@example.com` });
  await db.insert(membershipPlanSchema).values({ id: planId, organizationId: ORG, name: 'P', slug: `p-${planId}`, category: 'A', program: 'A', contractLength: 'M', accessLevel: 'U' });
  await db.insert(memberMembershipSchema).values({ id: membershipId, memberId, membershipPlanId: planId, status: 'past_due', declineCount: 2 });
  return { memberId, membershipId };
}

async function tx(m: { memberId: string; membershipId: string }, status: string, source: string, hours: number, extra: Partial<typeof transactionSchema.$inferInsert> = {}) {
  const id = randomUUID();
  await db.insert(transactionSchema).values({
    id,
    organizationId: ORG,
    memberId: m.memberId,
    memberMembershipId: m.membershipId,
    transactionType: 'membership_payment',
    amount: 103.75,
    status,
    source,
    // IQPro-style: every attempt carries its own provider transaction id.
    providerTransactionId: source === 'webhook_recurring' ? `ptx_${id}` : null,
    createdAt: at(hours),
    ...extra,
  });
  return id;
}

describe('recurring failed-payment state columns', () => {
  it('numbers IQPro attempts per cycle, marks older attempts superseded, and resolves the cycle on payment', async () => {
    const m = await membership();
    const first = await tx(m, 'paid', 'app', 0);
    const a1 = await tx(m, 'declined', 'webhook_recurring', 10, { failureReason: 'Insufficient funds' });
    const a2 = await tx(m, 'declined', 'webhook_recurring', 20);
    const paid = await tx(m, 'paid', 'retry', 30, { retryOfTransactionId: a2 });
    const b1 = await tx(m, 'declined', 'webhook_recurring', 40); // next cycle

    const rows = await getOrganizationTransactions(ORG);
    const byId = new Map(rows.map(r => [r.id, r]));

    expect(byId.get(first)).toMatchObject({ resolved: false, superseded: false, attemptNumber: null, source: 'app' });
    expect(byId.get(a1)).toMatchObject({ attemptNumber: 1, superseded: true, resolved: true, failureReason: 'Insufficient funds', memberMembershipId: m.membershipId });
    expect(byId.get(a2)).toMatchObject({ attemptNumber: 2, superseded: true, resolved: true });
    expect(byId.get(paid)).toMatchObject({ source: 'retry', retryOfTransactionId: a2, resolved: false, attemptNumber: null });
    // The next cycle restarts the count after the paid row.
    expect(byId.get(b1)).toMatchObject({ attemptNumber: 1, superseded: false, resolved: false });
  });

  it('does not number a declined retry row or an app-recorded decline', async () => {
    const m = await membership();
    const d = await tx(m, 'declined', 'webhook_recurring', 0);
    const retryDeclined = await tx(m, 'declined', 'retry', 1, { retryOfTransactionId: d });
    const appDeclined = await tx(m, 'declined', 'app', 2);

    const rows = await getOrganizationTransactions(ORG);
    const byId = new Map(rows.map(r => [r.id, r]));

    expect(byId.get(retryDeclined)!.attemptNumber).toBeNull();
    expect(byId.get(appDeclined)!.attemptNumber).toBeNull();
    // The webhook decline is superseded by the newer declined retry; that one by the app decline.
    expect(byId.get(d)!.superseded).toBe(true);
    expect(byId.get(appDeclined)!.superseded).toBe(false);
  });

  it('does not number a Square invoice decline (no provider transaction id; Square does not auto-retry)', async () => {
    const m = await membership();
    const d = await tx(m, 'declined', 'webhook_recurring', 0, { providerTransactionId: null, providerInvoiceId: 'inv_1' });

    const row = (await getOrganizationTransactions(ORG)).find(r => r.id === d)!;

    expect(row.attemptNumber).toBeNull();
  });

  it('never marks a guest row (no membership) resolved or superseded', async () => {
    const id = randomUUID();
    await db.insert(transactionSchema).values({ id, organizationId: ORG, transactionType: 'product_purchase', amount: 5, status: 'declined' });

    const row = (await getOrganizationTransactions(ORG)).find(r => r.id === id)!;

    expect(row).toMatchObject({ resolved: false, superseded: false, attemptNumber: null, memberId: null });
  });

  it('exposes the same state plus membership decline count on the detail view', async () => {
    const m = await membership();
    const d = await tx(m, 'declined', 'webhook_recurring', 0);

    const detail = await getTransactionById(d, ORG);

    expect(detail).toMatchObject({ attemptNumber: 1, resolved: false, membershipStatus: 'past_due', membershipDeclineCount: 2 });
  });

  it('exposes the state in member billing history (incl. family members)', async () => {
    const hoh = await membership();
    const child = await membership();
    await db.insert(familyMemberSchema).values({ memberId: hoh.memberId, relatedMemberId: child.memberId, relationship: 'child' });
    const d = await tx(child, 'declined', 'webhook_recurring', 0);

    const rows = await getMemberTransactions(hoh.memberId, ORG);

    expect(rows.find(r => r.id === d)).toMatchObject({ attemptNumber: 1, resolved: false, superseded: false });
  });
});
