import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/libs/DB';
import { memberMembershipSchema, memberSchema, membershipPlanSchema, paymentMethodSchema, paymentMethodUpdateRequestSchema } from '@/models/Schema';
import { AUDIT_ACTION } from '@/types/Audit';
import { MemberNotFoundError } from './MembersService';
import {
  applyPendingCardUpdate,
  getPaymentMethodUpdateStatus,
  MemberEmailMissingError,
  membersWithOpenUpdateRequests,
  NoProviderCustomerError,
  openPaymentMethodUpdateRequest,
  openUpdateRequestAfterDecline,
  PaymentMethodUpdateLinkError,
  PaymentMethodUpdateNotSupportedError,
  UPDATE_REQUEST_TTL_MS,
} from './PaymentMethodUpdateRequestService';

vi.mock('@/libs/DB');

const provider = {
  listCustomerPaymentMethods: vi.fn(),
  sendPaymentMethodUpdateLink: vi.fn(),
  setSubscriptionPaymentMethod: vi.fn(),
};
vi.mock('./PaymentProviderService', () => ({ getPaymentProvider: vi.fn(async () => provider) }));

const auditMock = vi.fn();
vi.mock('./AuditService', () => ({ audit: (...a: unknown[]) => auditMock(...a) }));
const { logger } = vi.hoisted(() => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/libs/Logger', () => ({ logger }));

const ORG = 'org_card_update_test';
const IQPRO = { provider: 'iqpro' } as never;
const SQUARE = { provider: 'square' } as never;
const ACTOR = { userId: 'staff_1', orgId: ORG };

async function makeMember(opts: { email?: string; customerId?: string | null; subscriptions?: Array<string | null>; membershipStatus?: string } = {}) {
  const memberId = randomUUID();
  const planId = randomUUID();
  await db.insert(memberSchema).values({
    id: memberId,
    organizationId: ORG,
    firstName: 'C',
    lastName: 'Ard',
    email: opts.email ?? `${memberId}@example.com`,
    providerCustomerId: opts.customerId === undefined ? `cus_${memberId}` : opts.customerId,
  });
  await db.insert(membershipPlanSchema).values({ id: planId, organizationId: ORG, name: 'P', slug: `p-${planId}`, category: 'A', program: 'A', contractLength: 'M', accessLevel: 'U' });
  for (const sub of opts.subscriptions ?? [`sub_${memberId}`]) {
    await db.insert(memberMembershipSchema).values({
      id: randomUUID(),
      memberId,
      membershipPlanId: planId,
      status: opts.membershipStatus ?? 'past_due',
      providerSubscriptionId: sub,
    });
  }
  await db.insert(paymentMethodSchema).values({ id: randomUUID(), memberId, type: 'card', providerPaymentMethodId: 'pm_local', last4: '1111', isDefault: true });
  return { memberId, customerId: `cus_${memberId}` };
}

async function requests(memberId: string) {
  return db.select().from(paymentMethodUpdateRequestSchema).where(eq(paymentMethodUpdateRequestSchema.memberId, memberId));
}

beforeEach(() => {
  vi.clearAllMocks();
  provider.sendPaymentMethodUpdateLink.mockResolvedValue({ success: true });
  provider.setSubscriptionPaymentMethod.mockResolvedValue({ success: true });
});

describe('openPaymentMethodUpdateRequest', () => {
  it('records the customer\'s current cards at IQPro as the baseline', async () => {
    const m = await makeMember();
    provider.listCustomerPaymentMethods.mockResolvedValue([{ paymentMethodId: 'pm_a', type: 'card' }, { paymentMethodId: 'pm_b', type: 'card' }]);

    const result = await openPaymentMethodUpdateRequest(m.memberId, ORG, IQPRO, { reason: 'decline', sendLink: false });

    expect(result).toMatchObject({ created: true, linkSent: false });

    const [row] = await requests(m.memberId);

    expect(row).toMatchObject({ status: 'pending', reason: 'decline', provider: 'iqpro', providerCustomerId: m.customerId, linkSentAt: null });
    expect(JSON.parse(row!.baselinePaymentMethodIds)).toEqual(['pm_a', 'pm_b']);
    expect(provider.sendPaymentMethodUpdateLink).not.toHaveBeenCalled();
  });

  it('falls back to the cards the app knows when IQPro cannot be read', async () => {
    const m = await makeMember();
    provider.listCustomerPaymentMethods.mockResolvedValue(null);

    await openPaymentMethodUpdateRequest(m.memberId, ORG, IQPRO, { reason: 'decline', sendLink: false });

    const [row] = await requests(m.memberId);

    expect(JSON.parse(row!.baselinePaymentMethodIds)).toEqual(['pm_local']);
  });

  it('emails the link to the member and audits it', async () => {
    const m = await makeMember({ email: 'member@example.com' });
    provider.listCustomerPaymentMethods.mockResolvedValue([]);

    const result = await openPaymentMethodUpdateRequest(m.memberId, ORG, IQPRO, { reason: 'staff', sendLink: true, actor: ACTOR });

    expect(result).toMatchObject({ created: true, linkSent: true });
    expect(provider.sendPaymentMethodUpdateLink).toHaveBeenCalledWith(IQPRO, { providerCustomerId: m.customerId, email: 'member@example.com' });

    const [row] = await requests(m.memberId);

    expect(row!.linkSentAt).not.toBeNull();
    expect(auditMock).toHaveBeenCalledWith(ACTOR, AUDIT_ACTION.PAYMENT_METHOD_UPDATE_REQUEST, 'member', expect.objectContaining({ entityId: m.memberId, status: 'success' }));
  });

  it('reuses the open request rather than opening a second one, and keeps its baseline', async () => {
    const m = await makeMember();
    provider.listCustomerPaymentMethods.mockResolvedValueOnce([{ paymentMethodId: 'pm_a', type: 'card' }]);
    await openPaymentMethodUpdateRequest(m.memberId, ORG, IQPRO, { reason: 'decline', sendLink: false });

    const again = await openPaymentMethodUpdateRequest(m.memberId, ORG, IQPRO, { reason: 'staff', sendLink: true, actor: ACTOR });

    expect(again).toMatchObject({ created: false, linkSent: true });

    const rows = await requests(m.memberId);

    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.baselinePaymentMethodIds)).toEqual(['pm_a']);
    expect(provider.listCustomerPaymentMethods).toHaveBeenCalledTimes(1);
  });

  it('refuses Square, a member without an IQPro customer, and a link with no email', async () => {
    const square = await makeMember();
    const noCustomer = await makeMember({ customerId: null });
    const seed = await makeMember({ customerId: 'seed_cus_1' });
    const noEmail = await makeMember({ email: '' });

    await expect(openPaymentMethodUpdateRequest(square.memberId, ORG, SQUARE, { reason: 'staff', sendLink: true })).rejects.toBeInstanceOf(PaymentMethodUpdateNotSupportedError);
    await expect(openPaymentMethodUpdateRequest(square.memberId, ORG, null, { reason: 'staff', sendLink: true })).rejects.toBeInstanceOf(PaymentMethodUpdateNotSupportedError);
    await expect(openPaymentMethodUpdateRequest(noCustomer.memberId, ORG, IQPRO, { reason: 'staff', sendLink: true })).rejects.toBeInstanceOf(NoProviderCustomerError);
    await expect(openPaymentMethodUpdateRequest(seed.memberId, ORG, IQPRO, { reason: 'staff', sendLink: true })).rejects.toBeInstanceOf(NoProviderCustomerError);
    await expect(openPaymentMethodUpdateRequest(noEmail.memberId, ORG, IQPRO, { reason: 'staff', sendLink: true })).rejects.toBeInstanceOf(MemberEmailMissingError);
  });

  it('404s a member from another org', async () => {
    const m = await makeMember();

    await expect(openPaymentMethodUpdateRequest(m.memberId, 'org_other', IQPRO, { reason: 'staff', sendLink: true })).rejects.toBeInstanceOf(MemberNotFoundError);
  });

  it('surfaces a link IQPro refused, leaving the request open but unsent', async () => {
    const m = await makeMember();
    provider.listCustomerPaymentMethods.mockResolvedValue([]);
    provider.sendPaymentMethodUpdateLink.mockResolvedValue({ success: false, error: 'IQPro is down' });

    await expect(openPaymentMethodUpdateRequest(m.memberId, ORG, IQPRO, { reason: 'staff', sendLink: true })).rejects.toThrow(PaymentMethodUpdateLinkError);

    const [row] = await requests(m.memberId);

    expect(row).toMatchObject({ status: 'pending', linkSentAt: null });
  });

  it('uses a generic message when IQPro gives no reason', async () => {
    const m = await makeMember();
    provider.listCustomerPaymentMethods.mockResolvedValue([]);
    provider.sendPaymentMethodUpdateLink.mockResolvedValue({ success: false });

    await expect(openPaymentMethodUpdateRequest(m.memberId, ORG, IQPRO, { reason: 'staff', sendLink: true })).rejects.toThrow('could not send the link');
  });
});

describe('openUpdateRequestAfterDecline', () => {
  it('opens a request without emailing (IQPro sends its own post-decline email)', async () => {
    const m = await makeMember();
    provider.listCustomerPaymentMethods.mockResolvedValue([{ paymentMethodId: 'pm_a', type: 'card' }]);

    await openUpdateRequestAfterDecline(m.memberId, ORG, IQPRO);

    expect(await requests(m.memberId)).toHaveLength(1);
    expect(provider.sendPaymentMethodUpdateLink).not.toHaveBeenCalled();
  });

  it('quietly skips Square and members without an IQPro customer, and never throws', async () => {
    const m = await makeMember();
    const noCustomer = await makeMember({ customerId: null });

    await expect(openUpdateRequestAfterDecline(m.memberId, ORG, SQUARE)).resolves.toBeUndefined();
    await expect(openUpdateRequestAfterDecline(noCustomer.memberId, ORG, IQPRO)).resolves.toBeUndefined();
    await expect(openUpdateRequestAfterDecline(randomUUID(), ORG, IQPRO)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('logs a non-Error failure', async () => {
    const m = await makeMember();
    provider.listCustomerPaymentMethods.mockRejectedValue('boom');

    await openUpdateRequestAfterDecline(m.memberId, ORG, IQPRO);

    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: 'boom' }));
  });
});

describe('applyPendingCardUpdate', () => {
  async function openWith(memberId: string, baseline: string[]) {
    provider.listCustomerPaymentMethods.mockResolvedValueOnce(baseline.map(id => ({ paymentMethodId: id, type: 'card' })));
    await openPaymentMethodUpdateRequest(memberId, ORG, IQPRO, { reason: 'decline', sendLink: false });
  }

  it('does nothing without an open request, or for Square', async () => {
    const m = await makeMember();

    await expect(applyPendingCardUpdate(m.memberId, ORG, IQPRO)).resolves.toEqual({ switched: false });
    await expect(applyPendingCardUpdate(m.memberId, ORG, SQUARE)).resolves.toEqual({ switched: false });
    expect(provider.listCustomerPaymentMethods).not.toHaveBeenCalled();
  });

  it('waits while the member has not added a card', async () => {
    const m = await makeMember();
    await openWith(m.memberId, ['pm_a']);
    provider.listCustomerPaymentMethods.mockResolvedValue([{ paymentMethodId: 'pm_a', type: 'card' }]);

    await expect(applyPendingCardUpdate(m.memberId, ORG, IQPRO)).resolves.toEqual({ switched: false });
    expect(provider.setSubscriptionPaymentMethod).not.toHaveBeenCalled();
    expect((await requests(m.memberId))[0]!.status).toBe('pending');
  });

  it('switches every live subscription to the added card and completes the request', async () => {
    const m = await makeMember({ subscriptions: ['sub_1', 'sub_2'] });
    await openWith(m.memberId, ['pm_a']);
    provider.listCustomerPaymentMethods.mockResolvedValue([{ paymentMethodId: 'pm_a', type: 'card' }, { paymentMethodId: 'pm_new', type: 'card' }]);

    const result = await applyPendingCardUpdate(m.memberId, ORG, IQPRO);

    expect(result).toEqual({ switched: true, paymentMethodId: 'pm_new' });
    expect(provider.setSubscriptionPaymentMethod).toHaveBeenCalledWith(IQPRO, 'sub_1', 'pm_new');
    expect(provider.setSubscriptionPaymentMethod).toHaveBeenCalledWith(IQPRO, 'sub_2', 'pm_new');

    const [row] = await requests(m.memberId);

    expect(row).toMatchObject({ status: 'completed', newPaymentMethodId: 'pm_new' });
    expect(row!.completedAt).not.toBeNull();
  });

  it('prefers the added card IQPro marks as default', async () => {
    const m = await makeMember();
    await openWith(m.memberId, ['pm_a']);
    provider.listCustomerPaymentMethods.mockResolvedValue([
      { paymentMethodId: 'pm_new_default', type: 'card', isDefault: true },
      { paymentMethodId: 'pm_new_other', type: 'card' },
    ]);

    await expect(applyPendingCardUpdate(m.memberId, ORG, IQPRO)).resolves.toMatchObject({ paymentMethodId: 'pm_new_default' });
  });

  it('skips cancelled memberships and seed subscriptions', async () => {
    const m = await makeMember({ subscriptions: ['sub_live', 'seed_sub_x'] });
    await db.insert(memberMembershipSchema).values({ id: randomUUID(), memberId: m.memberId, membershipPlanId: (await db.select().from(memberMembershipSchema).where(eq(memberMembershipSchema.memberId, m.memberId)))[0]!.membershipPlanId, status: 'cancelled', providerSubscriptionId: 'sub_cancelled' });
    await openWith(m.memberId, []);
    provider.listCustomerPaymentMethods.mockResolvedValue([{ paymentMethodId: 'pm_new', type: 'card' }]);

    await applyPendingCardUpdate(m.memberId, ORG, IQPRO);

    expect(provider.setSubscriptionPaymentMethod).toHaveBeenCalledTimes(1);
    expect(provider.setSubscriptionPaymentMethod).toHaveBeenCalledWith(IQPRO, 'sub_live', 'pm_new');
  });

  it('stays pending when IQPro refuses the switch, so the next poll retries', async () => {
    const m = await makeMember();
    await openWith(m.memberId, []);
    provider.listCustomerPaymentMethods.mockResolvedValue([{ paymentMethodId: 'pm_new', type: 'card' }]);
    provider.setSubscriptionPaymentMethod.mockResolvedValueOnce({ success: false, error: 'IQPro 500' });

    await expect(applyPendingCardUpdate(m.memberId, ORG, IQPRO)).resolves.toEqual({ switched: false, paymentMethodId: 'pm_new', error: 'IQPro 500' });
    expect((await requests(m.memberId))[0]!.status).toBe('pending');

    provider.setSubscriptionPaymentMethod.mockResolvedValueOnce({ success: false });

    await expect(applyPendingCardUpdate(m.memberId, ORG, IQPRO)).resolves.toMatchObject({ error: 'unknown error' });
  });

  it('reports a failed read of the customer\'s cards', async () => {
    const m = await makeMember();
    await openWith(m.memberId, []);
    provider.listCustomerPaymentMethods.mockResolvedValue(null);

    await expect(applyPendingCardUpdate(m.memberId, ORG, IQPRO)).resolves.toMatchObject({ switched: false, error: expect.stringContaining('IQPro') });
  });

  it('expires a request older than the window instead of polling it', async () => {
    const m = await makeMember();
    await openWith(m.memberId, []);
    await db.update(paymentMethodUpdateRequestSchema)
      .set({ createdAt: new Date(Date.now() - UPDATE_REQUEST_TTL_MS - 60_000) })
      .where(eq(paymentMethodUpdateRequestSchema.memberId, m.memberId));

    await expect(applyPendingCardUpdate(m.memberId, ORG, IQPRO)).resolves.toEqual({ switched: false });
    expect((await requests(m.memberId))[0]!.status).toBe('expired');
    expect(await membersWithOpenUpdateRequests(ORG, 10)).not.toContain(m.memberId);
  });

  it('treats an unreadable baseline as empty', async () => {
    const m = await makeMember();
    await openWith(m.memberId, []);
    await db.update(paymentMethodUpdateRequestSchema).set({ baselinePaymentMethodIds: 'not json' }).where(eq(paymentMethodUpdateRequestSchema.memberId, m.memberId));
    provider.listCustomerPaymentMethods.mockResolvedValue([{ paymentMethodId: 'pm_new', type: 'card' }]);

    await expect(applyPendingCardUpdate(m.memberId, ORG, IQPRO)).resolves.toMatchObject({ switched: true });
  });

  it('ignores non-string ids in the baseline', async () => {
    const m = await makeMember();
    await openWith(m.memberId, []);
    await db.update(paymentMethodUpdateRequestSchema).set({ baselinePaymentMethodIds: '{"not":"an array"}' }).where(eq(paymentMethodUpdateRequestSchema.memberId, m.memberId));
    provider.listCustomerPaymentMethods.mockResolvedValue([{ paymentMethodId: 'pm_new', type: 'card' }]);

    await expect(applyPendingCardUpdate(m.memberId, ORG, IQPRO)).resolves.toMatchObject({ switched: true });
  });
});

describe('getPaymentMethodUpdateStatus', () => {
  it('reports when a link can be sent, with the open request', async () => {
    const m = await makeMember();
    provider.listCustomerPaymentMethods.mockResolvedValue([]);

    await expect(getPaymentMethodUpdateStatus(m.memberId, ORG, IQPRO)).resolves.toEqual({ supported: true, request: null });

    await openPaymentMethodUpdateRequest(m.memberId, ORG, IQPRO, { reason: 'staff', sendLink: true });
    const status = await getPaymentMethodUpdateStatus(m.memberId, ORG, IQPRO);

    expect(status.request).toMatchObject({ reason: 'staff' });
    expect(status.request!.linkSentAt).not.toBeNull();
  });

  it('is unsupported for Square, no config, no customer, a seed customer or no email', async () => {
    const m = await makeMember();
    const noCustomer = await makeMember({ customerId: null });
    const seed = await makeMember({ customerId: 'seed_cus_2' });
    const noEmail = await makeMember({ email: '' });

    expect((await getPaymentMethodUpdateStatus(m.memberId, ORG, SQUARE)).supported).toBe(false);
    expect((await getPaymentMethodUpdateStatus(m.memberId, ORG, null)).supported).toBe(false);
    expect((await getPaymentMethodUpdateStatus(noCustomer.memberId, ORG, IQPRO)).supported).toBe(false);
    expect((await getPaymentMethodUpdateStatus(seed.memberId, ORG, IQPRO)).supported).toBe(false);
    expect((await getPaymentMethodUpdateStatus(noEmail.memberId, ORG, IQPRO)).supported).toBe(false);
  });

  it('404s a member from another org', async () => {
    const m = await makeMember();

    await expect(getPaymentMethodUpdateStatus(m.memberId, 'org_other', IQPRO)).rejects.toBeInstanceOf(MemberNotFoundError);
  });
});

describe('membersWithOpenUpdateRequests', () => {
  it('lists the org\'s members with a pending request only', async () => {
    const pending = await makeMember();
    const done = await makeMember();
    provider.listCustomerPaymentMethods.mockResolvedValue([]);
    await openPaymentMethodUpdateRequest(pending.memberId, ORG, IQPRO, { reason: 'decline', sendLink: false });
    await openPaymentMethodUpdateRequest(done.memberId, ORG, IQPRO, { reason: 'decline', sendLink: false });
    await db.update(paymentMethodUpdateRequestSchema).set({ status: 'completed' }).where(eq(paymentMethodUpdateRequestSchema.memberId, done.memberId));

    const members = await membersWithOpenUpdateRequests(ORG, 100);

    expect(members).toContain(pending.memberId);
    expect(members).not.toContain(done.memberId);
    expect(await membersWithOpenUpdateRequests('org_other', 100)).toEqual([]);
  });
});
