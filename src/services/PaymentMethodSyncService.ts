/**
 * Reconcile a member's saved card with the card the PROVIDER currently has on
 * their subscription.
 *
 * ── Why polling ─────────────────────────────────────────────────────────────
 *
 * After a failed charge, IQPro emails the cardholder a link to update their
 * card. IQPro publishes only Transaction / Settlement / Invoice webhooks — no
 * "customer updated their card" event — so the only reliable signal is to read
 * the subscription's payment method back (`getSubscriptionPaymentMethod`) and
 * compare. Square does publish card/subscription webhooks; those call this
 * same reconcile.
 *
 * Triggers: the payment webhooks (after a charge for the customer), opening the
 * retry modal, loading a past-due member's detail page, the "Refresh from
 * provider" button, and the daily past-due cron.
 *
 * ── What changes ────────────────────────────────────────────────────────────
 *
 * - Same card, same details → only `last_synced_at` moves.
 * - Same provider id, new last 4 / expiry (an in-place update) → row updated.
 * - Different provider id → the old row is kept as `replaced` (history) and a
 *   new `active` default row is inserted. Every charging lookup filters on
 *   `active`, so a replaced card is never charged.
 *
 * A failed provider read NEVER touches local data.
 */
import type { PaymentProviderConfig } from './PaymentProviderConfigService';
import type { SubscriptionPaymentMethod } from './PaymentProviderService';
import type { AuditContext } from '@/types/Audit';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { memberMembershipSchema, memberSchema, noteSchema, paymentMethodSchema } from '@/models/Schema';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE, SYSTEM_ACTOR_USER_ID } from '@/types/Audit';
import { MEMBER_STATUS } from '@/types/MemberStatus';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';
import { audit } from './AuditService';
import { MemberNotFoundError } from './MembersService';
import { applyPendingCardUpdate, membersWithOpenUpdateRequests } from './PaymentMethodUpdateRequestService';
import { getPaymentProvider } from './PaymentProviderService';

/** A repeat sync within this window reuses the last result instead of calling the provider. */
export const SYNC_THROTTLE_MS = 60_000;

export type SyncedPaymentMethod = {
  id: string;
  type: string;
  last4: string | null;
  cardBrand: string | null;
  expirationDate: string | null;
  updatedSource: string | null;
  updatedAt: Date | null;
};

export type SyncPaymentMethodResult = {
  changed: boolean;
  /** Why no provider call was made. */
  skipped?: 'throttled' | 'no_subscription' | 'simulated';
  /** The provider could not be read; local data is unchanged. */
  error?: string;
  paymentMethod?: SyncedPaymentMethod;
  previousLast4?: string | null;
};

function providerLabel(provider: string): string {
  return provider === PAYMENT_PROVIDER.SQUARE ? 'Square' : 'IQPro';
}

function mask(last4: string | null | undefined): string {
  return last4 ? `•••• ${last4}` : 'unknown card';
}

function localType(remote: SubscriptionPaymentMethod): string {
  return remote.paymentMethodName === 'ach' ? 'bank_transfer' : 'card';
}

/** The subscription whose card is authoritative: a past-due one first, else the newest. */
async function findSubscription(memberId: string): Promise<string | null> {
  const [row] = await db
    .select({ subscriptionId: memberMembershipSchema.providerSubscriptionId })
    .from(memberMembershipSchema)
    .where(and(
      eq(memberMembershipSchema.memberId, memberId),
      isNotNull(memberMembershipSchema.providerSubscriptionId),
      ne(memberMembershipSchema.status, 'cancelled'),
    ))
    .orderBy(
      desc(sql`${memberMembershipSchema.status} = ${MEMBER_STATUS.PAST_DUE}`),
      desc(memberMembershipSchema.createdAt),
    )
    .limit(1);
  return row?.subscriptionId ?? null;
}

const SELECT_PM = {
  id: paymentMethodSchema.id,
  type: paymentMethodSchema.type,
  providerPaymentMethodId: paymentMethodSchema.providerPaymentMethodId,
  last4: paymentMethodSchema.last4,
  firstSix: paymentMethodSchema.firstSix,
  cardBrand: paymentMethodSchema.cardBrand,
  expirationDate: paymentMethodSchema.expirationDate,
  updatedSource: paymentMethodSchema.updatedSource,
  updatedAt: paymentMethodSchema.updatedAt,
  lastSyncedAt: paymentMethodSchema.lastSyncedAt,
};

function toSynced(row: { id: string; type: string; last4: string | null; cardBrand: string | null; expirationDate: string | null; updatedSource: string | null; updatedAt: Date | null }): SyncedPaymentMethod {
  return {
    id: row.id,
    type: row.type,
    last4: row.last4,
    cardBrand: row.cardBrand,
    expirationDate: row.expirationDate,
    updatedSource: row.updatedSource,
    updatedAt: row.updatedAt,
  };
}

export async function syncMemberPaymentMethod(
  memberId: string,
  organizationId: string,
  config: PaymentProviderConfig | null,
  opts: {
    force?: boolean;
    actor?: AuditContext;
    /**
     * A change found now already happened before this moment. The sync that
     * follows a decline can only find the card that was CHARGED, so a
     * difference it discovers predates the failure — dating it "now" would
     * claim the member updated their card after the failure ("ready to
     * retry") when it is the card that just declined. Sandbox, 2026-10.
     */
    changedBefore?: Date;
  } = {},
): Promise<SyncPaymentMethodResult> {
  const [member] = await db
    .select({ id: memberSchema.id })
    .from(memberSchema)
    .where(and(eq(memberSchema.id, memberId), eq(memberSchema.organizationId, organizationId)))
    .limit(1);
  if (!member) {
    throw new MemberNotFoundError();
  }

  if (!config) {
    return { changed: false, error: 'No payment provider is configured for this organization.' };
  }

  const subscriptionId = await findSubscription(memberId);
  if (!subscriptionId) {
    return { changed: false, skipped: 'no_subscription' };
  }

  const [local] = await db
    .select(SELECT_PM)
    .from(paymentMethodSchema)
    .where(and(eq(paymentMethodSchema.memberId, memberId), eq(paymentMethodSchema.status, 'active')))
    .orderBy(desc(paymentMethodSchema.isDefault), desc(paymentMethodSchema.updatedAt))
    .limit(1);

  if (!opts.force && local?.lastSyncedAt && Date.now() - local.lastSyncedAt.getTime() < SYNC_THROTTLE_MS) {
    return { changed: false, skipped: 'throttled', paymentMethod: toSynced(local) };
  }

  if (subscriptionId.startsWith('seed_') && process.env.NODE_ENV !== 'production') {
    return { changed: false, skipped: 'simulated', ...(local ? { paymentMethod: toSynced(local) } : {}) };
  }

  // A card the member ADDED at IQPro is not on the subscription until we put
  // it there; do that first so the read below sees it.
  if (config.provider === PAYMENT_PROVIDER.IQPRO) {
    try {
      await applyPendingCardUpdate(memberId, organizationId, config);
    } catch (error) {
      logger.warn('[PaymentMethodSync] Applying a pending card update failed', {
        memberId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let remote: SubscriptionPaymentMethod | null = null;
  try {
    const provider = await getPaymentProvider(config);
    remote = await provider.getSubscriptionPaymentMethod(config, subscriptionId);
  } catch (error) {
    logger.warn('[PaymentMethodSync] Provider read failed', {
      memberId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!remote) {
    return {
      changed: false,
      error: `Could not read the card on file from ${providerLabel(config.provider)}.`,
      ...(local ? { paymentMethod: toSynced(local) } : {}),
    };
  }

  const now = new Date();
  // When the card changed (see opts.changedBefore); last_synced_at stays `now`.
  const changedAt = opts.changedBefore && opts.changedBefore.getTime() <= now.getTime()
    ? new Date(opts.changedBefore.getTime() - 1)
    : now;
  const remoteFields = {
    type: localType(remote),
    providerPaymentMethodId: remote.paymentMethodId,
    last4: remote.last4 ?? null,
    firstSix: remote.firstSix ?? null,
    cardBrand: remote.cardBrand ?? null,
    expirationDate: remote.expirationDate ?? null,
    accountType: remote.accountType ?? null,
  };

  // ── Same provider id ──
  if (local && local.providerPaymentMethodId === remote.paymentMethodId) {
    // A change means a value we HAD differs. A value we never stored (rows
    // saved before expiry was recorded) is a backfill, not a member update —
    // the sandbox's first sync reported "•••• 5555 → •••• 5555" as one.
    const differs = (remoteValue: string | undefined, localValue: string | null) =>
      !!remoteValue && !!localValue && remoteValue !== localValue;
    const detailsChanged = differs(remote.last4, local.last4) || differs(remote.expirationDate, local.expirationDate);

    if (!detailsChanged) {
      // Backfill display fields an older row lacks, without calling it a change.
      await db
        .update(paymentMethodSchema)
        .set({
          lastSyncedAt: now,
          ...(!local.last4 && remote.last4 ? { last4: remote.last4 } : {}),
          ...(!local.cardBrand && remote.cardBrand ? { cardBrand: remote.cardBrand } : {}),
          ...(!local.expirationDate && remote.expirationDate ? { expirationDate: remote.expirationDate } : {}),
          ...(!local.firstSix && remote.firstSix ? { firstSix: remote.firstSix } : {}),
        })
        .where(eq(paymentMethodSchema.id, local.id));
      return {
        changed: false,
        paymentMethod: toSynced({
          ...local,
          last4: local.last4 ?? remote.last4 ?? null,
          cardBrand: local.cardBrand ?? remote.cardBrand ?? null,
          expirationDate: local.expirationDate ?? remote.expirationDate ?? null,
        }),
      };
    }

    await db
      .update(paymentMethodSchema)
      .set({
        last4: remoteFields.last4 ?? local.last4,
        expirationDate: remoteFields.expirationDate ?? local.expirationDate,
        cardBrand: remoteFields.cardBrand ?? local.cardBrand,
        firstSix: remoteFields.firstSix ?? local.firstSix,
        updatedSource: 'provider_sync',
        updatedAt: changedAt,
        lastSyncedAt: now,
      })
      .where(eq(paymentMethodSchema.id, local.id));

    const updated = toSynced({
      id: local.id,
      type: local.type,
      last4: remoteFields.last4 ?? local.last4,
      cardBrand: remoteFields.cardBrand ?? local.cardBrand,
      expirationDate: remoteFields.expirationDate ?? local.expirationDate,
      updatedSource: 'provider_sync',
      updatedAt: changedAt,
    });
    await recordChange({ memberId, organizationId, config, actor: opts.actor, previous: local, next: updated });
    return { changed: true, paymentMethod: updated, previousLast4: local.last4 };
  }

  // ── A different card: replace ──
  // Serialised per member: two syncs (page load + modal + webhook follow-up)
  // can both read the same active card above. Lock the member row, then decide
  // from the state AFTER the lock — otherwise each retires the old card and
  // inserts its own active default, leaving several active cards and making
  // every "charge the saved card" lookup nondeterministic.
  const newId = randomUUID();
  const outcome = await db.transaction(async (tx) => {
    await tx
      .select({ id: memberSchema.id })
      .from(memberSchema)
      .where(eq(memberSchema.id, memberId))
      .for('update');

    const active = await tx
      .select({ id: paymentMethodSchema.id, providerPaymentMethodId: paymentMethodSchema.providerPaymentMethodId })
      .from(paymentMethodSchema)
      .where(and(eq(paymentMethodSchema.memberId, memberId), eq(paymentMethodSchema.status, 'active')));

    // A concurrent sync already recorded this card.
    if (active.some(row => row.providerPaymentMethodId === remote.paymentMethodId)) {
      return 'already_recorded' as const;
    }

    // Retire EVERY active card, not just the one read before the lock.
    if (active.length > 0) {
      await tx
        .update(paymentMethodSchema)
        .set({ status: 'replaced', isDefault: false, updatedAt: changedAt })
        .where(and(eq(paymentMethodSchema.memberId, memberId), eq(paymentMethodSchema.status, 'active')));
    }
    await tx.insert(paymentMethodSchema).values({
      id: newId,
      memberId,
      ...remoteFields,
      isDefault: true,
      status: 'active',
      updatedSource: 'provider_sync',
      createdAt: now,
      updatedAt: changedAt,
      lastSyncedAt: now,
    });
    return 'replaced' as const;
  });

  if (outcome === 'already_recorded') {
    const [current] = await db
      .select(SELECT_PM)
      .from(paymentMethodSchema)
      .where(and(
        eq(paymentMethodSchema.memberId, memberId),
        eq(paymentMethodSchema.status, 'active'),
        eq(paymentMethodSchema.providerPaymentMethodId, remote.paymentMethodId),
      ))
      .limit(1);
    return { changed: false, ...(current ? { paymentMethod: toSynced(current) } : {}) };
  }

  const next = toSynced({ id: newId, type: remoteFields.type, last4: remoteFields.last4, cardBrand: remoteFields.cardBrand, expirationDate: remoteFields.expirationDate, updatedSource: 'provider_sync', updatedAt: changedAt });
  await recordChange({ memberId, organizationId, config, actor: opts.actor, previous: local ?? null, next });
  return { changed: true, paymentMethod: next, previousLast4: local?.last4 ?? null };
}

/** Audit + member note for a card the provider reports as changed. Masked values only. */
async function recordChange(args: {
  memberId: string;
  organizationId: string;
  config: PaymentProviderConfig;
  actor?: AuditContext;
  previous: { last4: string | null; expirationDate: string | null } | null;
  next: SyncedPaymentMethod;
}): Promise<void> {
  const { memberId, organizationId, config, previous, next } = args;
  const label = providerLabel(config.provider);
  const actor = args.actor ?? { userId: SYSTEM_ACTOR_USER_ID, orgId: organizationId };

  await audit(actor, AUDIT_ACTION.PAYMENT_METHOD_PROVIDER_UPDATE, AUDIT_ENTITY_TYPE.PAYMENT_METHOD, {
    entityId: next.id,
    status: 'success',
    changes: {
      card: { before: mask(previous?.last4), after: mask(next.last4) },
      expiration: { before: previous?.expirationDate ?? null, after: next.expirationDate },
    },
  });

  try {
    const expiry = next.expirationDate ? ` (exp ${next.expirationDate})` : '';
    await db.insert(noteSchema).values({
      id: randomUUID(),
      memberId,
      content: previous
        ? `Card on file updated at ${label}: ${mask(previous.last4)} → ${mask(next.last4)}${expiry}.`
        : `Card on file found at ${label}: ${mask(next.last4)}${expiry}.`,
      createdByUserId: SYSTEM_ACTOR_USER_ID,
      createdByName: label,
    });
  } catch (error) {
    // The card change is already recorded; a missing note is cosmetic.
    logger.warn('[PaymentMethodSync] Could not write the member note', {
      memberId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Sync the member a provider customer id belongs to — for webhooks, which
 * know the customer, not the member. Best-effort: never throws.
 */
export async function syncByProviderCustomer(
  providerCustomerId: string,
  organizationId: string,
  config: PaymentProviderConfig,
): Promise<void> {
  try {
    const [member] = await db
      .select({ id: memberSchema.id })
      .from(memberSchema)
      .where(and(eq(memberSchema.providerCustomerId, providerCustomerId), eq(memberSchema.organizationId, organizationId)))
      .limit(1);
    if (member) {
      await syncMemberPaymentMethod(member.id, organizationId, config, { force: true });
    }
  } catch (error) {
    logger.warn('[PaymentMethodSync] Webhook-triggered sync failed', {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Sync by member id from a webhook (we resolved the member already). Best-effort. */
export async function syncMemberQuietly(
  memberId: string,
  organizationId: string,
  config: PaymentProviderConfig,
  opts: { changedBefore?: Date } = {},
): Promise<void> {
  try {
    await syncMemberPaymentMethod(memberId, organizationId, config, { force: true, ...opts });
  } catch (error) {
    logger.warn('[PaymentMethodSync] Background sync failed', {
      memberId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Upper bound per org per cron run, so one large org cannot exhaust the function's time. */
export const CRON_SYNC_LIMIT_PER_ORG = 200;

/**
 * Reconcile every member of one org who has a past-due membership or an open
 * card-update request. Runs from the daily cron to catch card updates that no
 * webhook or page view surfaced. Must run inside the org's tenant scope.
 * Respects the per-member throttle.
 */
export async function syncPastDuePaymentMethods(
  organizationId: string,
  config: PaymentProviderConfig,
): Promise<{ checked: number; changed: number; failed: number }> {
  const rows = await db
    .selectDistinct({ memberId: memberMembershipSchema.memberId })
    .from(memberMembershipSchema)
    .innerJoin(memberSchema, eq(memberSchema.id, memberMembershipSchema.memberId))
    .where(and(
      eq(memberSchema.organizationId, organizationId),
      eq(memberMembershipSchema.status, MEMBER_STATUS.PAST_DUE),
      isNotNull(memberMembershipSchema.providerSubscriptionId),
    ))
    .limit(CRON_SYNC_LIMIT_PER_ORG);
  const pending = await membersWithOpenUpdateRequests(organizationId, CRON_SYNC_LIMIT_PER_ORG);
  const memberIds = [...new Set([...rows.map(r => r.memberId), ...pending])].slice(0, CRON_SYNC_LIMIT_PER_ORG);

  let changed = 0;
  let failed = 0;
  for (const memberId of memberIds) {
    try {
      const result = await syncMemberPaymentMethod(memberId, organizationId, config);
      if (result.changed) {
        changed++;
      }
      if (result.error) {
        failed++;
      }
    } catch (error) {
      failed++;
      logger.warn('[PaymentMethodSync] Cron sync failed for a member', {
        memberId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { checked: memberIds.length, changed, failed };
}
