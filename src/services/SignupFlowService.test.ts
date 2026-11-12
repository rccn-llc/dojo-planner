import type { OrgSignupRequest } from '@/models/ControlSchema';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { controlDb } from '@/libs/ControlDb';
import { orgSignupRequestSchema, SIGNUP_STATUS } from '@/models/ControlSchema';
import { SIGNUP_LIMITS } from '@/utils/SignupConfig';
import {
  assignSignupSlug,
  confirmAndDispatch,
  decoyAcceptance,
  readSignupStatus,
  submitSignup,
  toPublicStatus,
} from './SignupFlowService';
import { confirmSignup, markSignupDispatched, submitSignupRequest } from './SignupRequestService';

vi.mock('@/libs/ControlDb');
vi.mock('@/libs/Env', () => ({ Env: { CLERK_SECRET_KEY: 'sk_test_not_real' } }));
vi.mock('@/libs/Logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const audit = vi.fn();
vi.mock('@/services/AuditService', () => ({ audit: (...a: unknown[]) => audit(...a) }));
const sendConfirmation = vi.fn();
vi.mock('@/services/EmailService', () => ({ sendSignupConfirmationEmail: (p: unknown) => sendConfirmation(p) }));
const dispatch = vi.fn();
vi.mock('@/services/SignupDispatchService', () => ({ dispatchOnboardWorkflow: (...a: unknown[]) => dispatch(...a) }));
const alert = vi.fn();
vi.mock('@/services/SignupAlertService', () => ({ alertSignupFailure: (id: string) => alert(id) }));
const getOrganization = vi.fn();
vi.mock('@/scripts/onboarding/clerkAdmin', () => ({
  createClerkAdmin: () => ({ getOrganization: (slug: string) => getOrganization(slug) }),
}));

const t = orgSignupRequestSchema;
const INPUT = {
  academyName: 'Riverside Jiu-Jitsu',
  ownerName: 'Jordan Rivera',
  ownerEmail: 'jordan@example.com',
  ownerPhone: '+1 555 010 0199',
};
const META = { ip: '203.0.113.7', userAgent: 'agent' };

async function stored(id: string): Promise<OrgSignupRequest> {
  const [row] = await controlDb.select().from(t).where(eq(t.id, id));
  return row!;
}

async function awaitingRequest(overrides: Partial<typeof INPUT> = {}) {
  const result = await submitSignupRequest({ ...INPUT, ...overrides }, META);
  if (result.kind !== 'created' && result.kind !== 'refreshed') {
    throw new Error(result.kind);
  }
  return result;
}

describe('SignupFlowService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test');
    await controlDb.delete(t);
    sendConfirmation.mockResolvedValue(true);
    dispatch.mockResolvedValue({ ok: true });
    getOrganization.mockResolvedValue(null);
  });

  describe('submitSignup', () => {
    it('stores the request, emails a confirm link carrying id + token, and returns a status URL', async () => {
      const outcome = await submitSignup(INPUT, META);

      expect(outcome.kind).toBe('accepted');

      if (outcome.kind !== 'accepted') {
        return;
      }

      expect(outcome.statusUrl).toBe(`https://app.example.test/api/signup/status?id=${outcome.requestId}&token=${encodeURIComponent(outcome.statusToken)}`);

      const email = sendConfirmation.mock.calls[0]![0];

      expect(email).toMatchObject({ toEmail: 'jordan@example.com', ownerName: 'Jordan Rivera', academyName: 'Riverside Jiu-Jitsu', expiresInHours: 48 });
      expect(email.confirmUrl).toMatch(new RegExp(`^https://app\\.example\\.test/signup/confirm\\?id=${outcome.requestId}&token=sc_`));
      expect(audit).toHaveBeenCalledWith(expect.anything(), 'orgSignup.submit', 'signupRequest', expect.objectContaining({ entityId: outcome.requestId, ipAddress: META.ip }));
    });

    it('expires the request and reports email_failed when the email cannot be sent', async () => {
      sendConfirmation.mockResolvedValue(false);

      expect(await submitSignup(INPUT, META)).toEqual({ kind: 'email_failed' });

      const [row] = await controlDb.select().from(t);

      expect(row?.status).toBe(SIGNUP_STATUS.EXPIRED);
    });

    it('answers an email already being set up with a decoy that stores and sends nothing', async () => {
      const { confirmToken } = await awaitingRequest();
      await confirmSignup(confirmToken);

      const outcome = await submitSignup(INPUT, META);

      expect(outcome.kind).toBe('accepted');
      expect(sendConfirmation).not.toHaveBeenCalled();
      expect(await controlDb.select().from(t)).toHaveLength(1);
    });

    it('maps the per-IP limit to rate_limited and the daily cap to unavailable', async () => {
      for (let i = 0; i < SIGNUP_LIMITS.perIp; i++) {
        await awaitingRequest({ ownerEmail: `o${i}@example.com` });
      }

      expect(await submitSignup({ ...INPUT, ownerEmail: 'new@example.com' }, META)).toEqual({ kind: 'rate_limited', retryAfterSeconds: 900 });

      for (let i = 0; i < SIGNUP_LIMITS.perDay; i++) {
        await submitSignupRequest({ ...INPUT, ownerEmail: `d${i}@example.com` }, { ip: `198.51.100.${i}`, userAgent: null });
      }

      expect(await submitSignup({ ...INPUT, ownerEmail: 'late@example.com' }, { ip: '192.0.2.9', userAgent: null })).toEqual({ kind: 'unavailable' });
    });

    it('maps the per-request email allowance to rate_limited', async () => {
      for (let i = 0; i < SIGNUP_LIMITS.perEmail; i++) {
        await submitSignupRequest(INPUT, { ip: `198.51.100.${i}`, userAgent: null });
      }

      expect(await submitSignup(INPUT, { ip: '192.0.2.9', userAgent: null })).toMatchObject({ kind: 'rate_limited' });
    });
  });

  it('builds decoys that look like real acceptances', () => {
    const decoy = decoyAcceptance();

    expect(decoy.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(decoy.statusToken).toMatch(/^st_/);
    expect(decoy.statusUrl).toContain(decoy.requestId);
  });

  describe('assignSignupSlug', () => {
    it('takes the academy slug when free', async () => {
      const { request, confirmToken } = await awaitingRequest();
      await confirmSignup(confirmToken);

      expect(await assignSignupSlug(request, async () => false)).toBe('riverside-jiu-jitsu');
      expect((await stored(request.id)).slug).toBe('riverside-jiu-jitsu');
    });

    it('adds -2, -3 … past slugs taken in Clerk or by other sign-ups', async () => {
      const first = await awaitingRequest();
      await confirmSignup(first.confirmToken);
      await assignSignupSlug(first.request, async () => false);

      const second = await awaitingRequest({ ownerEmail: 'other@example.com' });
      await confirmSignup(second.confirmToken);
      const takenInClerk = new Set(['riverside-jiu-jitsu-2']);

      expect(await assignSignupSlug(second.request, async slug => takenInClerk.has(slug))).toBe('riverside-jiu-jitsu-3');
    });

    it('keeps an already assigned slug', async () => {
      const { request } = await awaitingRequest();

      expect(await assignSignupSlug({ ...request, slug: 'kept' }, async () => true)).toBe('kept');
    });

    it('gives up after the attempt limit', async () => {
      const { request, confirmToken } = await awaitingRequest();
      await confirmSignup(confirmToken);

      expect(await assignSignupSlug(request, async () => true, 3)).toBeNull();
    });

    it('keeps a suffixed slug within 50 characters', async () => {
      const { request, confirmToken } = await awaitingRequest({ academyName: `${'a'.repeat(60)} academy` });
      await confirmSignup(confirmToken);
      const slug = await assignSignupSlug(request, async s => !s.endsWith('-2'));

      expect(slug?.endsWith('-2')).toBe(true);
      expect(slug!.length).toBeLessThanOrEqual(50);
    });
  });

  describe('confirmAndDispatch', () => {
    it('confirms, reserves the slug, starts the job, and marks the request dispatched', async () => {
      const { request, confirmToken } = await awaitingRequest();

      expect(await confirmAndDispatch(confirmToken)).toEqual({ kind: 'started', requestId: request.id });
      expect(dispatch).toHaveBeenCalledWith(request.id, 'preview');

      const row = await stored(request.id);

      expect(row.status).toBe(SIGNUP_STATUS.DISPATCHED);
      expect(row.slug).toBe('riverside-jiu-jitsu');
      expect(getOrganization).toHaveBeenCalledWith('riverside-jiu-jitsu');
    });

    it('does not dispatch twice for a replayed confirmation', async () => {
      const { request, confirmToken } = await awaitingRequest();
      await confirmAndDispatch(confirmToken);

      expect(await confirmAndDispatch(confirmToken)).toEqual({ kind: 'already_confirmed', requestId: request.id });
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('fails and alerts when GitHub refuses the dispatch', async () => {
      dispatch.mockResolvedValue({ ok: false, retryable: false, error: 'GitHub dispatch token rejected — renew GITHUB_DISPATCH_TOKEN' });
      const { request, confirmToken } = await awaitingRequest();

      expect(await confirmAndDispatch(confirmToken)).toEqual({ kind: 'failed', requestId: request.id });

      const row = await stored(request.id);

      expect(row.status).toBe(SIGNUP_STATUS.FAILED);
      expect(row.lastError).toContain('renew GITHUB_DISPATCH_TOKEN');
      expect(alert).toHaveBeenCalledWith(request.id);
    });

    it('fails and alerts when no slug is free', async () => {
      getOrganization.mockResolvedValue({ id: 'org_taken' });
      const { request, confirmToken } = await awaitingRequest();

      expect(await confirmAndDispatch(confirmToken)).toEqual({ kind: 'failed', requestId: request.id });
      expect((await stored(request.id)).lastError).toContain('No free slug');
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('fails and alerts when the Clerk lookup throws', async () => {
      getOrganization.mockRejectedValue(new Error('Clerk 500'));
      const { request, confirmToken } = await awaitingRequest();

      expect(await confirmAndDispatch(confirmToken)).toEqual({ kind: 'failed', requestId: request.id });
      expect((await stored(request.id)).lastError).toContain('Clerk 500');
    });

    it('passes through expired and unknown tokens', async () => {
      expect(await confirmAndDispatch('sc_nope')).toEqual({ kind: 'not_found' });
    });
  });

  describe('public status', () => {
    const base = { academyName: 'Riverside', ownerEmail: 'jordan@example.com', currentStep: null, lastError: 'secret host db.internal' } as unknown as OrgSignupRequest;

    it.each([
      [SIGNUP_STATUS.AWAITING_CONFIRMATION, { state: 'awaiting_confirmation', message: 'Check your email for a confirmation link.' }],
      [SIGNUP_STATUS.EXPIRED, { state: 'expired' }],
      [SIGNUP_STATUS.CONFIRMED, { state: 'provisioning', step: 'queued' }],
      [SIGNUP_STATUS.DISPATCHED, { state: 'provisioning', step: 'queued' }],
      [SIGNUP_STATUS.PROVISIONED, { state: 'ready', signInUrl: 'https://app.example.test/sign-in' }],
      [SIGNUP_STATUS.FAILED, { state: 'failed' }],
    ])('maps %s', (status, expected) => {
      expect(toPublicStatus({ ...base, status })).toMatchObject(expected);
    });

    it.each([
      ['clerk-org', 'organization'],
      ['database', 'database'],
      ['provision', 'database'],
      ['seed', 'starter_data'],
      ['activate', 'starter_data'],
      ['owner', 'invitation'],
      ['verify', 'invitation'],
      ['something-new', 'queued'],
      [null, 'queued'],
    ])('maps CLI step %s to %s', (step, expected) => {
      expect(toPublicStatus({ ...base, status: SIGNUP_STATUS.PROVISIONING, currentStep: step }).step).toBe(expected);
    });

    it('never exposes last_error, the slug or ids', () => {
      const text = JSON.stringify(toPublicStatus({ ...base, status: SIGNUP_STATUS.FAILED, slug: 'riverside', clerkOrgId: 'org_x' } as OrgSignupRequest));

      expect(text).not.toContain('db.internal');
      expect(text).not.toContain('org_x');
      expect(text).not.toContain('riverside"');
    });

    it('never names the owner or the academy, whatever the state', () => {
      for (const status of Object.values(SIGNUP_STATUS)) {
        const text = JSON.stringify(toPublicStatus({ ...base, status }));

        expect(text).not.toContain('jordan@example.com');
        expect(text).not.toContain('Riverside');
      }
    });

    it('reads status by id + token, failing a stuck request and alerting', async () => {
      const { request, confirmToken, statusToken } = await awaitingRequest();
      await confirmSignup(confirmToken);
      await markSignupDispatched(request.id);
      await controlDb.update(t).set({ heartbeatAt: new Date(Date.now() - SIGNUP_LIMITS.stuckAfterMs - 60_000) }).where(eq(t.id, request.id));

      expect(await readSignupStatus(request.id, statusToken)).toMatchObject({ state: 'failed' });
      expect(alert).toHaveBeenCalledWith(request.id);
    });

    it('returns null for a wrong token', async () => {
      const { request } = await awaitingRequest();

      expect(await readSignupStatus(request.id, 'st_wrong')).toBeNull();
    });

    it('does not alert again once the alert was sent', async () => {
      const { request, confirmToken, statusToken } = await awaitingRequest();
      await confirmSignup(confirmToken);
      await controlDb.update(t).set({ status: SIGNUP_STATUS.FAILED, alertSentAt: new Date() }).where(eq(t.id, request.id));

      await readSignupStatus(request.id, statusToken);

      expect(alert).not.toHaveBeenCalled();
    });
  });
});
