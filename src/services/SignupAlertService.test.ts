import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alertSignupFailure, redactEmails } from './SignupAlertService';

const claim = vi.fn();
const release = vi.fn();
vi.mock('@/services/SignupRequestService', () => ({
  claimSignupAlert: (id: string) => claim(id),
  releaseSignupAlert: (id: string) => release(id),
}));
const audit = vi.fn();
vi.mock('@/services/AuditService', () => ({ audit: (...a: unknown[]) => audit(...a) }));
const loggerError = vi.fn();
vi.mock('@/libs/Logger', () => ({ logger: { error: (...a: unknown[]) => loggerError(...a) } }));

const sentry = vi.hoisted(() => {
  const scope = {
    setLevel: vi.fn(),
    setTag: vi.fn(),
    setFingerprint: vi.fn(),
    setExtras: vi.fn(),
    addEventProcessor: vi.fn(),
  };
  return {
    scope,
    getClient: vi.fn(),
    captureMessage: vi.fn(),
    flush: vi.fn(),
    withScope: vi.fn((fn: (s: typeof scope) => void) => fn(scope)),
  };
});
vi.mock('@sentry/nextjs', () => ({
  getClient: () => sentry.getClient(),
  captureMessage: (m: string) => sentry.captureMessage(m),
  flush: (t: number) => sentry.flush(t),
  withScope: (fn: (s: typeof sentry.scope) => void) => sentry.withScope(fn),
}));

const ROW = {
  id: 'req-1',
  academyName: 'Riverside Jiu-Jitsu',
  ownerName: 'Jordan Rivera',
  ownerEmail: 'jordan@example.com',
  ownerPhone: '555 010 0199',
  lastError: 'Clerk 422: jordan@example.com already invited',
  workflowRunUrl: 'https://github.com/x/y/actions/runs/1',
  attempt: 2,
};

describe('alertSignupFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claim.mockResolvedValue(ROW);
    sentry.getClient.mockReturnValue({});
    sentry.flush.mockResolvedValue(true);
  });

  it('claims, audits and sends ONE tagged, fingerprinted Sentry event', async () => {
    expect(await alertSignupFailure('req-1')).toBe(true);

    expect(sentry.captureMessage).toHaveBeenCalledWith('Sign-up failed: Riverside Jiu-Jitsu');
    expect(sentry.scope.setLevel).toHaveBeenCalledWith('error');
    expect(sentry.scope.setTag).toHaveBeenCalledWith('area', 'signup');
    expect(sentry.scope.setTag).toHaveBeenCalledWith('signup_request_id', 'req-1');
    expect(sentry.scope.setFingerprint).toHaveBeenCalledWith(['signup-failed', 'req-1']);
    expect(sentry.flush).toHaveBeenCalledWith(2000);
    expect(audit).toHaveBeenCalledWith(
      { userId: 'system:public-signup', orgId: 'public-signup' },
      'orgSignup.failed',
      'signupRequest',
      expect.objectContaining({ entityId: 'req-1', status: 'failure' }),
    );
    expect(release).not.toHaveBeenCalled();
  });

  it('keeps the owner\'s email and phone out of the event', async () => {
    await alertSignupFailure('req-1');

    const extras = sentry.scope.setExtras.mock.calls[0]![0];
    const sent = JSON.stringify([extras, sentry.captureMessage.mock.calls, sentry.scope.setTag.mock.calls]);

    expect(extras).toEqual({
      academyName: 'Riverside Jiu-Jitsu',
      lastError: 'Clerk 422: [email] already invited',
      workflowRunUrl: ROW.workflowRunUrl,
      attempt: 2,
    });
    expect(sent).not.toContain('jordan@example.com');
    expect(sent).not.toContain('555 010 0199');
  });

  it('strips the request data and user Sentry would attach', async () => {
    await alertSignupFailure('req-1');
    const processor = sentry.scope.addEventProcessor.mock.calls[0]![0] as (e: Record<string, unknown>) => Record<string, unknown>;

    expect(processor({ message: 'x', request: { headers: {} }, user: { ip_address: '203.0.113.7' } })).toEqual({ message: 'x' });
  });

  it('does nothing when another caller already claimed the report', async () => {
    claim.mockResolvedValue(undefined);

    expect(await alertSignupFailure('req-1')).toBe(false);
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('gives the claim back when the event could not be sent, so the sweep retries', async () => {
    sentry.flush.mockResolvedValue(false);

    expect(await alertSignupFailure('req-1')).toBe(false);
    expect(release).toHaveBeenCalledWith('req-1');
  });

  it('logs once (keeping the claim) when Sentry is not configured', async () => {
    sentry.getClient.mockReturnValue(undefined);

    expect(await alertSignupFailure('req-1')).toBe(false);
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('Sentry not configured'), { requestId: 'req-1' });
  });

  it('sends at most 2000 characters of the error', async () => {
    claim.mockResolvedValue({ ...ROW, lastError: 'x'.repeat(10_000) });
    await alertSignupFailure('req-1');

    expect(sentry.scope.setExtras.mock.calls[0]![0].lastError).toHaveLength(2000);
  });

  it('handles a failure with no recorded error', async () => {
    claim.mockResolvedValue({ ...ROW, lastError: null });
    await alertSignupFailure('req-1');

    expect(sentry.scope.setExtras.mock.calls[0]![0].lastError).toBeNull();
  });
});

describe('redactEmails', () => {
  it('replaces every address', () => {
    expect(redactEmails('a@b.co and Jordan.Rivera+x@Example.COM.')).toBe('[email] and [email].');
    expect(redactEmails('no addresses here')).toBe('no addresses here');
    expect(redactEmails('user@localhost')).toBe('user@localhost'); // no dot: not an address we redact
  });

  it('stays fast on input built to make a regex backtrack', () => {
    const hostile = `${'a'.repeat(50_000)}@${'a.'.repeat(50_000)}`;
    const started = performance.now();
    redactEmails(hostile);

    expect(performance.now() - started).toBeLessThan(500);
  });
});
