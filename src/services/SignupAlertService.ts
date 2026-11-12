import * as Sentry from '@sentry/nextjs';
import { logger } from '@/libs/Logger';
import { audit } from '@/services/AuditService';
import { claimSignupAlert, releaseSignupAlert } from '@/services/SignupRequestService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE, SIGNUP_ACTOR_USER_ID, SIGNUP_AUDIT_ORG_ID } from '@/types/Audit';

/**
 * Report a failed sign-up to Sentry — exactly once, however many status reads,
 * confirm calls and sweeps notice the failure at the same moment. The team is
 * notified by a Sentry alert rule on the `area: signup` tag (configured in
 * Sentry, not here), so no address or key lives in the app.
 *
 * Each failed request is its own Sentry issue (fingerprinted by request id), so
 * a "new issue" alert rule fires once per failed sign-up.
 *
 * The event carries the request id, academy name, run link and error — never
 * the owner's email or phone. The team looks those up in `org_signup_request`
 * by id. Sentry is configured with `sendDefaultPii: true`, so the request data
 * and user Sentry would attach (the owner's IP, from their status poll) are
 * stripped from this event explicitly.
 */

// Every quantifier is bounded (RFC 5321: 64-character local part, 63-character
// labels) and the labels are separated by literal dots, so a long run of
// look-alike characters cannot make the match backtrack (ReDoS).
const EMAIL_PATTERN = /[\w.%+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g;

/** Longest `last_error` sent to Sentry. */
const MAX_ERROR_LENGTH = 2000;

/** `last_error` can quote provider bodies; keep addresses out of Sentry. */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, '[email]');
}

export async function alertSignupFailure(requestId: string): Promise<boolean> {
  const row = await claimSignupAlert(requestId);
  if (!row) {
    return false; // already reported, or not failed
  }

  await audit({ userId: SIGNUP_ACTOR_USER_ID, orgId: SIGNUP_AUDIT_ORG_ID }, AUDIT_ACTION.ORG_SIGNUP_FAILED, AUDIT_ENTITY_TYPE.SIGNUP_REQUEST, {
    entityId: row.id,
    status: 'failure',
    error: row.lastError ?? undefined,
  });

  if (!Sentry.getClient()) {
    // Sentry is not configured here (local dev, or NEXT_PUBLIC_SENTRY_DISABLED).
    // The log line below is the report; keep the claim so it is logged once.
    logger.error('[Signup] Sign-up failed (Sentry not configured — this log is the only report)', { requestId: row.id });
    return false;
  }

  Sentry.withScope((scope) => {
    scope.setLevel('error');
    scope.setTag('area', 'signup');
    scope.setTag('signup_request_id', row.id);
    scope.setFingerprint(['signup-failed', row.id]);
    scope.setExtras({
      academyName: row.academyName,
      // Cut before redacting (bounded work), with headroom so an address
      // straddling the cut is still caught; cut again after.
      lastError: row.lastError ? redactEmails(row.lastError.slice(0, MAX_ERROR_LENGTH + 400)).slice(0, MAX_ERROR_LENGTH) : null,
      workflowRunUrl: row.workflowRunUrl,
      attempt: row.attempt,
    });
    scope.addEventProcessor((event) => {
      delete event.request;
      delete event.user;
      return event;
    });
    Sentry.captureMessage(`Sign-up failed: ${row.academyName}`);
  });

  // Serverless: send before the function is frozen. If it could not be sent,
  // give the claim back so the daily sweep reports it.
  const sent = await Sentry.flush(2000);
  if (!sent) {
    logger.error('[Signup] Sign-up failure could not be sent to Sentry; the sweep will retry', { requestId: row.id });
    await releaseSignupAlert(row.id);
  }
  return sent;
}
