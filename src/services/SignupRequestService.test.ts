import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { controlDb } from '@/libs/ControlDb';
import { orgSignupRequestSchema, SIGNUP_STATUS } from '@/models/ControlSchema';
import { SIGNUP_LIMITS } from '@/utils/SignupConfig';
import {
  checkSignupLimits,
  claimSignupAlert,
  confirmSignup,
  expireSignupAfterEmailFailure,
  findSignupByIdAndToken,
  hashSignupToken,
  isSlugReservedByAnotherRequest,
  listStuckSignups,
  listUnalertedFailedSignups,
  markSignupDispatched,
  markSignupFailed,
  newSignupToken,
  releaseSignupAlert,
  reserveSignupSlug,
  settleSignupTimeouts,
  submitSignupRequest,
} from './SignupRequestService';

// Real PGlite with the baseline (src/libs/__mocks__/ControlDb.ts): the guarded
// UPDATEs and the partial unique indexes ARE the behaviour under test.
vi.mock('@/libs/ControlDb');

const t = orgSignupRequestSchema;
const META: { ip: string | null; userAgent: string | null } = { ip: '203.0.113.7', userAgent: 'test-agent' };

function input(overrides: Partial<{ academyName: string; ownerName: string; ownerEmail: string; ownerPhone: string }> = {}) {
  return {
    academyName: 'Riverside Jiu-Jitsu',
    ownerName: 'Jordan Rivera',
    ownerEmail: 'jordan@example.com',
    ownerPhone: '+1 555 010 0199',
    ...overrides,
  };
}

async function submitted(overrides: Parameters<typeof input>[0] = {}, meta = META) {
  const result = await submitSignupRequest(input(overrides), meta);
  if (result.kind !== 'created' && result.kind !== 'refreshed') {
    throw new Error(`expected a stored request, got ${result.kind}`);
  }
  return result;
}

async function row(id: string) {
  const [found] = await controlDb.select().from(t).where(eq(t.id, id));
  return found!;
}

describe('SignupRequestService', () => {
  beforeEach(async () => {
    await controlDb.delete(t);
  });

  describe('tokens', () => {
    it('makes distinct, prefixed, url-safe tokens and hashes them to sha256 hex', () => {
      const confirm = newSignupToken('confirm');
      const status = newSignupToken('status');

      expect(confirm).toMatch(/^sc_[\w-]{43}$/);
      expect(status).toMatch(/^st_[\w-]{43}$/);
      expect(hashSignupToken(confirm)).toMatch(/^[0-9a-f]{64}$/);
      expect(hashSignupToken(confirm)).not.toBe(hashSignupToken(status));
    });
  });

  describe('submitSignupRequest', () => {
    it('stores a new request with token HASHES only and one email counted', async () => {
      const { request, confirmToken, statusToken, kind } = await submitted();

      expect(kind).toBe('created');

      const stored = await row(request.id);

      expect(stored.status).toBe(SIGNUP_STATUS.AWAITING_CONFIRMATION);
      expect(stored.confirmTokenHash).toBe(hashSignupToken(confirmToken));
      expect(stored.statusTokenHash).toBe(hashSignupToken(statusToken));
      expect(JSON.stringify(stored)).not.toContain(confirmToken);
      expect(stored.confirmEmailsSent).toBe(1);
      expect(stored.submitIp).toBe(META.ip);
      expect(stored.confirmExpiresAt.getTime() - Date.now()).toBeGreaterThan(SIGNUP_LIMITS.confirmTtlMs - 60_000);
    });

    it('refreshes an unconfirmed request for the same email (any case) instead of adding one', async () => {
      const first = await submitted();
      const second = await submitted({ ownerEmail: 'jordan@example.com', academyName: 'Riverside BJJ' });

      expect(second.kind).toBe('refreshed');
      expect(second.request.id).toBe(first.request.id);
      expect(second.request.academyName).toBe('Riverside BJJ');
      expect(second.request.confirmEmailsSent).toBe(2);
      // The earlier link no longer works; only the newest one does.
      expect(await confirmSignup(first.confirmToken)).toEqual({ kind: 'not_found' });
      expect((await confirmSignup(second.confirmToken)).kind).toBe('confirmed');
    });

    it('stops sending confirmation emails for one request after the per-email allowance', async () => {
      for (let i = 0; i < SIGNUP_LIMITS.perEmail; i++) {
        await submitted();
      }

      expect(await submitSignupRequest(input(), META)).toEqual({ kind: 'email_limit' });
    });

    it('says nothing new for an email whose sign-up is already past confirmation', async () => {
      const { confirmToken } = await submitted();
      await confirmSignup(confirmToken);

      expect(await submitSignupRequest(input(), META)).toEqual({ kind: 'in_progress' });
    });

    it('starts a fresh request once the previous one expired', async () => {
      const first = await submitted();
      await expireSignupAfterEmailFailure(first.request.id);

      const second = await submitted();

      expect(second.kind).toBe('created');
      expect(second.request.id).not.toBe(first.request.id);
    });

    it('lets only one row exist when two submissions for one email race', async () => {
      const results = await Promise.all([submitSignupRequest(input(), META), submitSignupRequest(input(), META)]);

      expect(results.map(r => r.kind).sort()).toEqual(['created', 'refreshed']);
      expect(await controlDb.select().from(t)).toHaveLength(1);
    });
  });

  describe('checkSignupLimits', () => {
    it('allows a first submission', async () => {
      expect(await checkSignupLimits({ ip: META.ip, email: 'new@example.com' })).toEqual({ ok: true });
    });

    it('limits submissions per IP within the window', async () => {
      for (let i = 0; i < SIGNUP_LIMITS.perIp; i++) {
        await submitted({ ownerEmail: `owner${i}@example.com` });
      }

      const result = await checkSignupLimits({ ip: META.ip, email: 'other@example.com' });

      expect(result).toEqual({ ok: false, reason: 'ip', retryAfterSeconds: SIGNUP_LIMITS.perIpWindowMs / 1000 });
      expect(await checkSignupLimits({ ip: '198.51.100.1', email: 'other@example.com' })).toEqual({ ok: true });
    });

    it('limits requests per email across expiries', async () => {
      for (let i = 0; i < SIGNUP_LIMITS.perEmail; i++) {
        const { request } = await submitted({}, { ip: `198.51.100.${i}`, userAgent: null });
        await expireSignupAfterEmailFailure(request.id);
      }

      expect((await checkSignupLimits({ ip: '192.0.2.1', email: 'JORDAN@example.com' }))).toMatchObject({ ok: false, reason: 'email' });
    });

    it('closes sign-ups for the day at the global cap', async () => {
      for (let i = 0; i < SIGNUP_LIMITS.perDay; i++) {
        await submitted({ ownerEmail: `owner${i}@example.com` }, { ip: `198.51.100.${i}`, userAgent: null });
      }

      expect(await checkSignupLimits({ ip: '192.0.2.1', email: 'last@example.com' })).toMatchObject({ ok: false, reason: 'daily' });
    });

    it('skips the per-IP limit when the IP is unknown', async () => {
      for (let i = 0; i < SIGNUP_LIMITS.perIp; i++) {
        await submitted({ ownerEmail: `owner${i}@example.com` }, { ip: null, userAgent: null });
      }

      expect(await checkSignupLimits({ ip: null, email: 'other@example.com' })).toEqual({ ok: true });
    });
  });

  describe('confirmSignup', () => {
    it('confirms once; a replay reports the request as already confirmed', async () => {
      const { confirmToken, request } = await submitted();

      const first = await confirmSignup(confirmToken);

      expect(first.kind).toBe('confirmed');
      expect((await row(request.id)).confirmedAt).toBeInstanceOf(Date);

      const replay = await confirmSignup(confirmToken);

      expect(replay.kind).toBe('already_confirmed');
    });

    it('refuses an expired link and marks the request expired', async () => {
      const { confirmToken, request } = await submitted();
      await controlDb.update(t).set({ confirmExpiresAt: new Date(Date.now() - 1000) }).where(eq(t.id, request.id));

      expect(await confirmSignup(confirmToken)).toEqual({ kind: 'expired' });
      expect((await row(request.id)).status).toBe(SIGNUP_STATUS.EXPIRED);
    });

    it('does not find an unknown token', async () => {
      expect(await confirmSignup('sc_unknown')).toEqual({ kind: 'not_found' });
    });
  });

  describe('status lookup', () => {
    it('finds a request by id with either its status token or its confirmation token', async () => {
      const { request, confirmToken, statusToken } = await submitted();

      expect((await findSignupByIdAndToken(request.id, statusToken))?.id).toBe(request.id);
      expect((await findSignupByIdAndToken(request.id, confirmToken))?.id).toBe(request.id);
    });

    it('does not find a request with a wrong token, or another request\'s token', async () => {
      const a = await submitted();
      const b = await submitted({ ownerEmail: 'other@example.com' });

      expect(await findSignupByIdAndToken(a.request.id, 'st_wrong')).toBeUndefined();
      expect(await findSignupByIdAndToken(a.request.id, b.statusToken)).toBeUndefined();
    });
  });

  describe('settleSignupTimeouts', () => {
    it('expires an unused link past its expiry', async () => {
      const { request } = await submitted();
      const later = new Date(Date.now() + SIGNUP_LIMITS.confirmTtlMs + 1000);

      const { row: settled, becameFailed } = await settleSignupTimeouts(await row(request.id), later);

      expect(settled.status).toBe(SIGNUP_STATUS.EXPIRED);
      expect(becameFailed).toBe(false);
    });

    it('fails an in-flight request with no heartbeat for too long — once', async () => {
      const { request, confirmToken } = await submitted();
      await confirmSignup(confirmToken);
      await markSignupDispatched(request.id);
      const later = new Date(Date.now() + SIGNUP_LIMITS.stuckAfterMs + 60_000);

      const first = await settleSignupTimeouts(await row(request.id), later);
      const second = await settleSignupTimeouts(await row(request.id), later);

      expect(first.becameFailed).toBe(true);
      expect(first.row.status).toBe(SIGNUP_STATUS.FAILED);
      expect(first.row.lastError).toContain('No progress');
      expect(second.becameFailed).toBe(false);
    });

    it('leaves a request with a recent heartbeat alone', async () => {
      const { request, confirmToken } = await submitted();
      await confirmSignup(confirmToken);
      await markSignupDispatched(request.id);

      const { row: settled, becameFailed } = await settleSignupTimeouts(await row(request.id));

      expect(settled.status).toBe(SIGNUP_STATUS.DISPATCHED);
      expect(becameFailed).toBe(false);
    });

    it('lists only in-flight requests that have gone quiet', async () => {
      const quiet = await submitted();
      await confirmSignup(quiet.confirmToken);
      await submitted({ ownerEmail: 'awaiting@example.com' });
      const later = new Date(Date.now() + SIGNUP_LIMITS.stuckAfterMs + 60_000);

      expect((await listStuckSignups(later)).map(r => r.id)).toEqual([quiet.request.id]);
      expect(await listStuckSignups()).toEqual([]);
    });
  });

  describe('slugs', () => {
    it('reserves a slug for one confirmed request only', async () => {
      const a = await submitted();
      const b = await submitted({ ownerEmail: 'other@example.com' });
      await confirmSignup(a.confirmToken);
      await confirmSignup(b.confirmToken);

      expect(await reserveSignupSlug(a.request.id, 'riverside')).toBe(true);
      expect(await isSlugReservedByAnotherRequest('riverside', b.request.id)).toBe(true);
      expect(await isSlugReservedByAnotherRequest('riverside', a.request.id)).toBe(false);
      expect(await reserveSignupSlug(b.request.id, 'riverside')).toBe(false);
    });

    it('does not reserve a slug for a request that is not confirmed', async () => {
      const { request } = await submitted();

      expect(await reserveSignupSlug(request.id, 'riverside')).toBe(false);
    });
  });

  describe('failure and alerts', () => {
    it('fails an unfinished request once, and never a finished one', async () => {
      const { request, confirmToken } = await submitted();
      await confirmSignup(confirmToken);

      expect((await markSignupFailed(request.id, 'boom'))?.lastError).toBe('boom');
      expect(await markSignupFailed(request.id, 'again')).toBeUndefined();

      const awaiting = await submitted({ ownerEmail: 'awaiting@example.com' });

      expect(await markSignupFailed(awaiting.request.id, 'x')).toBeUndefined();
    });

    it('lets exactly one caller claim an alert, and gives it back on release', async () => {
      const { request, confirmToken } = await submitted();
      await confirmSignup(confirmToken);
      await markSignupFailed(request.id, 'boom');

      expect((await listUnalertedFailedSignups()).map(r => r.id)).toEqual([request.id]);

      const claims = await Promise.all([claimSignupAlert(request.id), claimSignupAlert(request.id)]);

      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(await listUnalertedFailedSignups()).toEqual([]);

      await releaseSignupAlert(request.id);

      expect((await listUnalertedFailedSignups()).map(r => r.id)).toEqual([request.id]);
    });

    it('does not claim an alert for a request that has not failed', async () => {
      const { request } = await submitted();

      expect(await claimSignupAlert(request.id)).toBeUndefined();
    });
  });
});
