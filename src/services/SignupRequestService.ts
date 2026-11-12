import type { OrgSignupRequest, SignupStatus } from '@/models/ControlSchema';
import type { SignupInput } from '@/validations/SignupValidation';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, count, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { controlDb } from '@/libs/ControlDb';
import { OPEN_SIGNUP_STATUSES, orgSignupRequestSchema, SIGNUP_STATUS } from '@/models/ControlSchema';
import { SIGNUP_LIMITS } from '@/utils/SignupConfig';

/**
 * Reads and writes `org_signup_request` (control plane) for the public sign-up
 * endpoints. The CLI side of the same table is `scripts/onboarding/signupRequests.ts`.
 *
 * Every status change is a guarded UPDATE (`WHERE status = <expected>`), so two
 * requests racing on the same row cannot both move it.
 */

const t = orgSignupRequestSchema;

/** sha256 hex. Only hashes of the emailed and polling tokens are stored. */
export function hashSignupToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSignupToken(kind: 'confirm' | 'status'): string {
  return `${kind === 'confirm' ? 'sc' : 'st'}_${randomBytes(32).toString('base64url')}`;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? (value as { code: unknown }).code : undefined;
  return code(error) === '23505' || code((error as { cause?: unknown } | null)?.cause) === '23505';
}

// ── Limits ───────────────────────────────────────────────────────────────────

export type SignupLimitResult = { ok: true } | { ok: false; reason: 'ip' | 'email' | 'daily'; retryAfterSeconds: number };

/**
 * Counted from stored requests, so no rate-limit service is needed and a
 * submission rejected by validation never uses up a visitor's allowance.
 */
export async function checkSignupLimits(params: { ip: string | null; email: string; now?: Date }): Promise<SignupLimitResult> {
  const now = params.now ?? new Date();
  const since = (windowMs: number) => new Date(now.getTime() - windowMs);

  const [daily] = await controlDb
    .select({ n: count() })
    .from(t)
    .where(gte(t.createdAt, since(SIGNUP_LIMITS.perDayWindowMs)));
  if ((daily?.n ?? 0) >= SIGNUP_LIMITS.perDay) {
    return { ok: false, reason: 'daily', retryAfterSeconds: 60 * 60 };
  }

  if (params.ip) {
    const [byIp] = await controlDb
      .select({ n: count() })
      .from(t)
      .where(and(eq(t.submitIp, params.ip), gte(t.createdAt, since(SIGNUP_LIMITS.perIpWindowMs))));
    if ((byIp?.n ?? 0) >= SIGNUP_LIMITS.perIp) {
      return { ok: false, reason: 'ip', retryAfterSeconds: Math.ceil(SIGNUP_LIMITS.perIpWindowMs / 1000) };
    }
  }

  const [byEmail] = await controlDb
    .select({ n: count() })
    .from(t)
    .where(and(
      eq(t.ownerEmail, params.email.toLowerCase()),
      gte(t.createdAt, since(SIGNUP_LIMITS.perEmailWindowMs)),
    ));
  if ((byEmail?.n ?? 0) >= SIGNUP_LIMITS.perEmail) {
    return { ok: false, reason: 'email', retryAfterSeconds: Math.ceil(SIGNUP_LIMITS.perEmailWindowMs / 1000) };
  }

  return { ok: true };
}

// ── Submit ───────────────────────────────────────────────────────────────────

export type SubmitSignupResult
  /** A confirmation email should be sent with `confirmToken`. */
  = | { kind: 'created' | 'refreshed'; request: OrgSignupRequest; confirmToken: string; statusToken: string }
  /** This email already has a request past confirmation. Say nothing. */
    | { kind: 'in_progress' }
  /** This request has had its full allowance of confirmation emails. */
    | { kind: 'email_limit' };

type SubmitMeta = { ip: string | null; userAgent: string | null; now?: Date };

async function findOpenByEmail(email: string): Promise<OrgSignupRequest | undefined> {
  const [row] = await controlDb
    .select()
    .from(t)
    .where(and(
      eq(t.ownerEmail, email.toLowerCase()),
      inArray(t.status, [...OPEN_SIGNUP_STATUSES]),
    ))
    .limit(1);
  return row;
}

/**
 * Record a sign-up, or refresh the owner's still-unconfirmed one.
 *
 * A refresh replaces both tokens — the hashes are all that is stored, so the
 * earlier link cannot be re-sent — and takes the newest details, on the basis
 * that a second submission most likely corrects the first.
 */
export async function submitSignupRequest(input: SignupInput, meta: SubmitMeta, attempt = 0): Promise<SubmitSignupResult> {
  const now = meta.now ?? new Date();
  const confirmToken = newSignupToken('confirm');
  const statusToken = newSignupToken('status');
  const confirmExpiresAt = new Date(now.getTime() + SIGNUP_LIMITS.confirmTtlMs);

  const existing = await findOpenByEmail(input.ownerEmail);
  if (existing) {
    if (existing.status !== SIGNUP_STATUS.AWAITING_CONFIRMATION) {
      return { kind: 'in_progress' };
    }
    if (existing.confirmEmailsSent >= SIGNUP_LIMITS.perEmail) {
      return { kind: 'email_limit' };
    }
    const [refreshed] = await controlDb
      .update(t)
      .set({
        academyName: input.academyName,
        ownerName: input.ownerName,
        ownerPhone: input.ownerPhone,
        confirmTokenHash: hashSignupToken(confirmToken),
        statusTokenHash: hashSignupToken(statusToken),
        confirmExpiresAt,
        confirmEmailsSent: sql`${t.confirmEmailsSent} + 1`,
        submitIp: meta.ip,
        userAgent: meta.userAgent,
      })
      .where(and(
        eq(t.id, existing.id),
        eq(t.status, SIGNUP_STATUS.AWAITING_CONFIRMATION),
        lt(t.confirmEmailsSent, SIGNUP_LIMITS.perEmail),
      ))
      .returning();
    return refreshed
      ? { kind: 'refreshed', request: refreshed, confirmToken, statusToken }
      : { kind: 'in_progress' };
  }

  try {
    const [created] = await controlDb
      .insert(t)
      .values({
        id: randomUUID(),
        status: SIGNUP_STATUS.AWAITING_CONFIRMATION,
        academyName: input.academyName,
        ownerName: input.ownerName,
        // Lowercased here as well as by validation: the open-email unique
        // index depends on it.
        ownerEmail: input.ownerEmail.toLowerCase(),
        ownerPhone: input.ownerPhone,
        confirmTokenHash: hashSignupToken(confirmToken),
        confirmExpiresAt,
        confirmEmailsSent: 1,
        statusTokenHash: hashSignupToken(statusToken),
        submitIp: meta.ip,
        userAgent: meta.userAgent,
        // Set here, not by `DEFAULT now()`: on a database whose session time
        // zone is not UTC (local pglite) now() would store local wall time,
        // while every comparison below is made in UTC.
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { kind: 'created', request: created!, confirmToken, statusToken };
  } catch (error) {
    // Two submissions for the same email raced past `findOpenByEmail`; the
    // open-email index let one through. Take the refresh path once.
    if (isUniqueViolation(error) && attempt === 0) {
      return submitSignupRequest(input, meta, 1);
    }
    throw error;
  }
}

/** The confirmation email could not be sent: nobody can ever use this request. */
export async function expireSignupAfterEmailFailure(id: string): Promise<void> {
  await controlDb
    .update(t)
    .set({ status: SIGNUP_STATUS.EXPIRED, lastError: 'Confirmation email could not be sent' })
    .where(and(eq(t.id, id), eq(t.status, SIGNUP_STATUS.AWAITING_CONFIRMATION)));
}

// ── Status ───────────────────────────────────────────────────────────────────

/**
 * A request by id plus EITHER of its tokens. The status token is what the www
 * form holds; the confirmation token is what the confirm page holds. The
 * confirmation token is the stronger credential, so it may read status too.
 */
export async function findSignupByIdAndToken(id: string, token: string): Promise<OrgSignupRequest | undefined> {
  const hash = hashSignupToken(token);
  const [row] = await controlDb
    .select()
    .from(t)
    .where(and(eq(t.id, id), or(eq(t.statusTokenHash, hash), eq(t.confirmTokenHash, hash))))
    .limit(1);
  return row;
}

const IN_FLIGHT_STATUSES: SignupStatus[] = [
  SIGNUP_STATUS.CONFIRMED,
  SIGNUP_STATUS.DISPATCHED,
  SIGNUP_STATUS.PROVISIONING,
];

/**
 * Apply the two time-based transitions a status read can observe:
 * an unused confirmation link expires, and an in-flight request with no
 * heartbeat for `stuckAfterMs` is failed. Returns the row as it now stands,
 * and whether THIS call made it fail (so the caller alerts).
 */
export async function settleSignupTimeouts(
  row: OrgSignupRequest,
  now = new Date(),
): Promise<{ row: OrgSignupRequest; becameFailed: boolean }> {
  if (row.status === SIGNUP_STATUS.AWAITING_CONFIRMATION && row.confirmExpiresAt.getTime() <= now.getTime()) {
    const [expired] = await controlDb
      .update(t)
      .set({ status: SIGNUP_STATUS.EXPIRED })
      .where(and(eq(t.id, row.id), eq(t.status, SIGNUP_STATUS.AWAITING_CONFIRMATION)))
      .returning();
    return { row: expired ?? row, becameFailed: false };
  }

  if (IN_FLIGHT_STATUSES.includes(row.status as SignupStatus)) {
    const lastSign = row.heartbeatAt ?? row.updatedAt;
    const cutoff = new Date(now.getTime() - SIGNUP_LIMITS.stuckAfterMs);
    if (lastSign.getTime() < cutoff.getTime()) {
      const [failed] = await controlDb
        .update(t)
        .set({
          status: SIGNUP_STATUS.FAILED,
          lastError: `No progress for ${Math.round(SIGNUP_LIMITS.stuckAfterMs / 60_000)} minutes while ${row.status} — the GitHub job may have died or never started`,
        })
        .where(and(
          eq(t.id, row.id),
          eq(t.status, row.status),
          sql`coalesce(${t.heartbeatAt}, ${t.updatedAt}) < ${cutoff.toISOString()}`,
        ))
        .returning();
      if (failed) {
        return { row: failed, becameFailed: true };
      }
    }
  }

  return { row, becameFailed: false };
}

/** In-flight requests that have gone quiet, for the alert sweep. */
export async function listStuckSignups(now = new Date()): Promise<OrgSignupRequest[]> {
  const cutoff = new Date(now.getTime() - SIGNUP_LIMITS.stuckAfterMs);
  return controlDb
    .select()
    .from(t)
    .where(and(
      inArray(t.status, IN_FLIGHT_STATUSES),
      // ISO string, not a Date: a raw Date parameter is serialized in the
      // process's local zone, which would skew a UTC comparison.
      sql`coalesce(${t.heartbeatAt}, ${t.updatedAt}) < ${cutoff.toISOString()}`,
    ));
}

// ── Confirm ──────────────────────────────────────────────────────────────────

export type ConfirmSignupResult
  = | { kind: 'confirmed'; request: OrgSignupRequest }
  /** Already past confirmation — show its status rather than an error. */
    | { kind: 'already_confirmed'; request: OrgSignupRequest }
    | { kind: 'expired' }
    | { kind: 'not_found' };

export async function confirmSignup(token: string, now = new Date()): Promise<ConfirmSignupResult> {
  const hash = hashSignupToken(token);
  const [confirmed] = await controlDb
    .update(t)
    .set({ status: SIGNUP_STATUS.CONFIRMED, confirmedAt: now })
    .where(and(
      eq(t.confirmTokenHash, hash),
      eq(t.status, SIGNUP_STATUS.AWAITING_CONFIRMATION),
      gt(t.confirmExpiresAt, now),
    ))
    .returning();
  if (confirmed) {
    return { kind: 'confirmed', request: confirmed };
  }

  const [row] = await controlDb.select().from(t).where(eq(t.confirmTokenHash, hash)).limit(1);
  if (!row) {
    return { kind: 'not_found' };
  }
  if (row.status === SIGNUP_STATUS.AWAITING_CONFIRMATION || row.status === SIGNUP_STATUS.EXPIRED) {
    await settleSignupTimeouts(row, now);
    return { kind: 'expired' };
  }
  return { kind: 'already_confirmed', request: row };
}

/** Is `slug` held by a different, non-expired request? */
export async function isSlugReservedByAnotherRequest(slug: string, requestId: string): Promise<boolean> {
  const [row] = await controlDb
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.slug, slug), ne(t.status, SIGNUP_STATUS.EXPIRED), ne(t.id, requestId)))
    .limit(1);
  return Boolean(row);
}

/** Reserve a slug for a confirmed request. False when another request won it. */
export async function reserveSignupSlug(requestId: string, slug: string): Promise<boolean> {
  try {
    const [row] = await controlDb
      .update(t)
      .set({ slug })
      .where(and(eq(t.id, requestId), eq(t.status, SIGNUP_STATUS.CONFIRMED)))
      .returning({ id: t.id });
    return Boolean(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return false;
    }
    throw error;
  }
}

export async function markSignupDispatched(requestId: string): Promise<void> {
  await controlDb
    .update(t)
    .set({ status: SIGNUP_STATUS.DISPATCHED, heartbeatAt: new Date() })
    .where(and(eq(t.id, requestId), eq(t.status, SIGNUP_STATUS.CONFIRMED)));
}

/**
 * Fail a request that has not finished. Returns the row when THIS call failed
 * it (the caller then alerts), or undefined when it was already final.
 */
export async function markSignupFailed(requestId: string, lastError: string): Promise<OrgSignupRequest | undefined> {
  const [row] = await controlDb
    .update(t)
    .set({ status: SIGNUP_STATUS.FAILED, lastError })
    .where(and(
      eq(t.id, requestId),
      inArray(t.status, [SIGNUP_STATUS.CONFIRMED, SIGNUP_STATUS.DISPATCHED, SIGNUP_STATUS.PROVISIONING]),
    ))
    .returning();
  return row;
}

// ── Alerts ───────────────────────────────────────────────────────────────────

/**
 * Claim the right to send this request's failure alert. Only one caller ever
 * gets the row back, however many status reads or sweeps race for it.
 */
export async function claimSignupAlert(requestId: string): Promise<OrgSignupRequest | undefined> {
  const [row] = await controlDb
    .update(t)
    .set({ alertSentAt: new Date() })
    .where(and(eq(t.id, requestId), eq(t.status, SIGNUP_STATUS.FAILED), isNull(t.alertSentAt)))
    .returning();
  return row;
}

/** Give an alert claim back when the email could not be sent, so the sweep retries. */
export async function releaseSignupAlert(requestId: string): Promise<void> {
  await controlDb.update(t).set({ alertSentAt: null }).where(eq(t.id, requestId));
}

export async function listUnalertedFailedSignups(limit = 50): Promise<OrgSignupRequest[]> {
  return controlDb
    .select()
    .from(t)
    .where(and(eq(t.status, SIGNUP_STATUS.FAILED), isNull(t.alertSentAt)))
    .limit(limit);
}
