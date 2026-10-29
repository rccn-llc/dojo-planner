import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/libs/DB';
import { tenantExternalRefSchema } from '@/models/ControlSchema';
import { memberMembershipSchema, memberSchema, membershipPlanSchema, transactionSchema } from '@/models/Schema';
import { collectRefs, parseArgs, writeRefs } from './backfillExternalRefs';

// Real PGlite: the baseline creates `tenant_external_ref` in every database,
// so the same handle stands in for both planes here.
vi.mock('@/libs/DB');

async function seedOrg(orgId: string) {
  const memberId = randomUUID();
  const planId = randomUUID();
  await db.insert(memberSchema).values({
    id: memberId,
    organizationId: orgId,
    firstName: 'K',
    lastName: 'Iosk',
    email: `${memberId}@example.com`,
    providerCustomerId: `cus_${orgId}`,
  });
  await db.insert(membershipPlanSchema).values({
    id: planId,
    organizationId: orgId,
    name: 'P',
    slug: `p-${planId}`,
    category: 'Adult',
    program: 'Adult',
    contractLength: 'M',
    accessLevel: 'U',
  });
  await db.insert(memberMembershipSchema).values({
    id: randomUUID(),
    memberId,
    membershipPlanId: planId,
    providerSubscriptionId: `sub_${orgId}`,
    providerHoldFeeSubscriptionId: `hold_${orgId}`,
  });
  for (const providerTransactionId of [`tx_${orgId}`, `tx_${orgId}`, `seed_tx_${orgId}`, null]) {
    await db.insert(transactionSchema).values({
      id: randomUUID(),
      organizationId: orgId,
      memberId,
      providerTransactionId,
      transactionType: 'membership_payment',
      amount: 10,
      status: 'paid',
    });
  }
  // A seed member: synthetic ids must never become routing refs.
  await db.insert(memberSchema).values({
    id: randomUUID(),
    organizationId: orgId,
    firstName: 'S',
    lastName: 'Eed',
    email: `${randomUUID()}@example.com`,
    providerCustomerId: `seed_cus_${orgId}`,
  });
}

describe('backfillExternalRefs', () => {
  it('collects customer, subscription, hold-fee subscription and transaction ids, de-duplicated, without seed ids', async () => {
    await seedOrg('org_bf_a');
    await seedOrg('org_bf_other');

    const refs = await collectRefs(db as never, 'org_bf_a');

    expect(refs).toEqual(expect.arrayContaining([
      { refType: 'provider_customer', refId: 'cus_org_bf_a', orgId: 'org_bf_a' },
      { refType: 'provider_subscription', refId: 'sub_org_bf_a', orgId: 'org_bf_a' },
      { refType: 'provider_subscription', refId: 'hold_org_bf_a', orgId: 'org_bf_a' },
      { refType: 'provider_transaction', refId: 'tx_org_bf_a', orgId: 'org_bf_a' },
    ]));
    expect(refs).toHaveLength(4);
    expect(JSON.stringify(refs)).not.toContain('seed_');
    expect(JSON.stringify(refs)).not.toContain('org_bf_other');
  });

  it('writes refs once — a second run inserts nothing', async () => {
    await seedOrg('org_bf_b');
    const refs = await collectRefs(db as never, 'org_bf_b');

    expect(await writeRefs(db as never, refs)).toBe(4);
    expect(await writeRefs(db as never, refs)).toBe(0);

    const stored = await db.select().from(tenantExternalRefSchema).where(eq(tenantExternalRefSchema.orgId, 'org_bf_b'));

    expect(stored).toHaveLength(4);
  });

  it('parses --confirm and --orgId; dry run is the default', () => {
    expect(parseArgs([])).toEqual({ confirm: false });
    expect(parseArgs(['--confirm', '--orgId=org_x'])).toEqual({ confirm: true, orgId: 'org_x' });
  });
});
