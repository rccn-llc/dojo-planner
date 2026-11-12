import type { OrgSignupRequest } from '@/models/ControlSchema';
import type { SignupInput } from '@/validations/SignupValidation';
import { randomUUID } from 'node:crypto';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { SIGNUP_STATUS } from '@/models/ControlSchema';
import { createClerkAdmin } from '@/scripts/onboarding/clerkAdmin';
import { slugify, validateSlug } from '@/scripts/onboarding/preflight';
import { audit } from '@/services/AuditService';
import { sendSignupConfirmationEmail } from '@/services/EmailService';
import { alertSignupFailure } from '@/services/SignupAlertService';
import { dispatchOnboardWorkflow } from '@/services/SignupDispatchService';
import {
  checkSignupLimits,
  confirmSignup,
  expireSignupAfterEmailFailure,
  findSignupByIdAndToken,
  isSlugReservedByAnotherRequest,
  markSignupDispatched,
  markSignupFailed,
  newSignupToken,
  reserveSignupSlug,
  settleSignupTimeouts,
  submitSignupRequest,
} from '@/services/SignupRequestService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE, SIGNUP_ACTOR_USER_ID, SIGNUP_AUDIT_ORG_ID } from '@/types/Audit';
import { SIGNUP_LIMITS, signupAppUrl, signupTarget } from '@/utils/SignupConfig';

/**
 * The public sign-up flow: submit → confirm → (GitHub provisions) → status.
 * Route handlers stay thin and HTTP-only; every decision is made here.
 */

const SIGNUP_AUDIT_CONTEXT = { userId: SIGNUP_ACTOR_USER_ID, orgId: SIGNUP_AUDIT_ORG_ID };

export function statusUrlFor(requestId: string, token: string): string {
  return `${signupAppUrl()}/api/signup/status?id=${encodeURIComponent(requestId)}&token=${encodeURIComponent(token)}`;
}

// ── Submit ───────────────────────────────────────────────────────────────────

export type AcceptedSubmit = { kind: 'accepted'; requestId: string; statusToken: string; statusUrl: string };

export type SubmitOutcome
  = | AcceptedSubmit
    | { kind: 'rate_limited'; retryAfterSeconds: number }
    | { kind: 'unavailable' }
    | { kind: 'email_failed' };

/** A plausible-looking acceptance that stores nothing (honeypot, duplicate in progress). */
export function decoyAcceptance(): AcceptedSubmit {
  const requestId = randomUUID();
  const statusToken = newSignupToken('status');
  return { kind: 'accepted', requestId, statusToken, statusUrl: statusUrlFor(requestId, statusToken) };
}

export async function submitSignup(
  input: SignupInput,
  meta: { ip: string | null; userAgent: string | null },
): Promise<SubmitOutcome> {
  const limits = await checkSignupLimits({ ip: meta.ip, email: input.ownerEmail });
  if (!limits.ok) {
    logger.warn('[Signup] Limit reached', { reason: limits.reason });
    return limits.reason === 'daily'
      ? { kind: 'unavailable' }
      : { kind: 'rate_limited', retryAfterSeconds: limits.retryAfterSeconds };
  }

  const result = await submitSignupRequest(input, meta);
  if (result.kind === 'in_progress') {
    // Same response as a fresh sign-up, so the form cannot be used to learn
    // whether an address already has an academy being set up.
    logger.info('[Signup] Submission for an email that already has a sign-up in progress');
    return decoyAcceptance();
  }
  if (result.kind === 'email_limit') {
    return { kind: 'rate_limited', retryAfterSeconds: Math.ceil(SIGNUP_LIMITS.perEmailWindowMs / 1000) };
  }

  const { request, confirmToken, statusToken } = result;
  const confirmUrl = `${signupAppUrl()}/signup/confirm?id=${encodeURIComponent(request.id)}&token=${encodeURIComponent(confirmToken)}`;
  const sent = await sendSignupConfirmationEmail({
    toEmail: request.ownerEmail,
    ownerName: request.ownerName,
    academyName: request.academyName,
    confirmUrl,
    expiresInHours: Math.round(SIGNUP_LIMITS.confirmTtlMs / 3_600_000),
  });
  if (!sent) {
    await expireSignupAfterEmailFailure(request.id);
    logger.error('[Signup] Confirmation email failed; request expired', { requestId: request.id });
    return { kind: 'email_failed' };
  }

  await audit(SIGNUP_AUDIT_CONTEXT, AUDIT_ACTION.ORG_SIGNUP_SUBMIT, AUDIT_ENTITY_TYPE.SIGNUP_REQUEST, {
    entityId: request.id,
    status: 'success',
    ipAddress: meta.ip ?? undefined,
    userAgent: meta.userAgent ?? undefined,
  });
  logger.info('[Signup] Accepted', { requestId: request.id, refreshed: result.kind === 'refreshed' });

  return { kind: 'accepted', requestId: request.id, statusToken, statusUrl: statusUrlFor(request.id, statusToken) };
}

// ── Slug ─────────────────────────────────────────────────────────────────────

type SlugLookup = (slug: string) => Promise<boolean>;

/** True when Clerk already has an organization with this slug. */
function clerkSlugTaken(): SlugLookup {
  const clerk = createClerkAdmin(Env.CLERK_SECRET_KEY);
  return async slug => (await clerk.getOrganization(slug)) !== null;
}

/**
 * `riverside-jiu-jitsu`, then `-2`, `-3`, … — free in Clerk AND among other
 * sign-ups. The reservation is the request's own unique index, so two
 * confirmations that pick the same slug at the same moment cannot both win.
 */
export async function assignSignupSlug(
  request: OrgSignupRequest,
  isTakenInClerk: SlugLookup = clerkSlugTaken(),
  maxAttempts = 20,
): Promise<string | null> {
  if (request.slug) {
    return request.slug;
  }
  const base = slugify(request.academyName);
  for (let n = 1; n <= maxAttempts; n++) {
    const suffix = n === 1 ? '' : `-${n}`;
    const candidate = `${base.slice(0, 50 - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (validateSlug(candidate) !== null) {
      continue;
    }
    if (await isSlugReservedByAnotherRequest(candidate, request.id)) {
      continue;
    }
    if (await isTakenInClerk(candidate)) {
      continue;
    }
    if (await reserveSignupSlug(request.id, candidate)) {
      return candidate;
    }
  }
  return null;
}

// ── Confirm ──────────────────────────────────────────────────────────────────

export type ConfirmOutcome
  = | { kind: 'started'; requestId: string }
    | { kind: 'already_confirmed'; requestId: string }
    | { kind: 'failed'; requestId: string }
    | { kind: 'expired' }
    | { kind: 'not_found' };

async function failAndAlert(requestId: string, lastError: string): Promise<void> {
  const failed = await markSignupFailed(requestId, lastError);
  logger.error('[Signup] Request failed', { requestId, error: lastError });
  if (failed) {
    await alertSignupFailure(requestId);
  }
}

export async function confirmAndDispatch(token: string): Promise<ConfirmOutcome> {
  const confirmed = await confirmSignup(token);
  if (confirmed.kind === 'not_found' || confirmed.kind === 'expired') {
    return confirmed;
  }
  if (confirmed.kind === 'already_confirmed') {
    return { kind: 'already_confirmed', requestId: confirmed.request.id };
  }

  const { request } = confirmed;
  await audit(SIGNUP_AUDIT_CONTEXT, AUDIT_ACTION.ORG_SIGNUP_CONFIRM, AUDIT_ENTITY_TYPE.SIGNUP_REQUEST, {
    entityId: request.id,
    status: 'success',
  });

  let slug: string | null;
  try {
    slug = await assignSignupSlug(request);
  } catch (error) {
    await failAndAlert(request.id, `Slug assignment failed: ${error instanceof Error ? error.message : String(error)}`);
    return { kind: 'failed', requestId: request.id };
  }
  if (!slug) {
    await failAndAlert(request.id, `No free slug for "${request.academyName}" after 20 attempts`);
    return { kind: 'failed', requestId: request.id };
  }

  const dispatch = await dispatchOnboardWorkflow(request.id, signupTarget());
  if (!dispatch.ok) {
    await audit(SIGNUP_AUDIT_CONTEXT, AUDIT_ACTION.ORG_SIGNUP_DISPATCH, AUDIT_ENTITY_TYPE.SIGNUP_REQUEST, {
      entityId: request.id,
      status: 'failure',
      error: dispatch.error,
    });
    await failAndAlert(request.id, dispatch.error);
    return { kind: 'failed', requestId: request.id };
  }

  await markSignupDispatched(request.id);
  await audit(SIGNUP_AUDIT_CONTEXT, AUDIT_ACTION.ORG_SIGNUP_DISPATCH, AUDIT_ENTITY_TYPE.SIGNUP_REQUEST, {
    entityId: request.id,
    status: 'success',
  });
  logger.info('[Signup] Provisioning started', { requestId: request.id });
  return { kind: 'started', requestId: request.id };
}

// ── Status ───────────────────────────────────────────────────────────────────

export type PublicSignupState = 'awaiting_confirmation' | 'provisioning' | 'ready' | 'failed' | 'expired';
export type PublicSignupStep = 'queued' | 'organization' | 'database' | 'starter_data' | 'invitation';

export type PublicSignupStatus = {
  state: PublicSignupState;
  step?: PublicSignupStep;
  message: string;
  signInUrl?: string;
};

/** CLI step ids (`planSteps` in scripts/onboarding/steps.ts) → what the owner sees. */
const STEP_FOR_CLI_STEP: Record<string, PublicSignupStep> = {
  'clerk-org': 'organization',
  'database': 'database',
  'provision': 'database',
  'seed': 'starter_data',
  'activate': 'starter_data',
  'owner': 'invitation',
  'verify': 'invitation',
};

const STEP_MESSAGE: Record<PublicSignupStep, string> = {
  queued: 'Starting setup…',
  organization: 'Creating your organization',
  database: 'Preparing your database',
  starter_data: 'Loading starter data',
  invitation: 'Sending your invitation',
};

/**
 * Fixed public wording only. `last_error`, the slug, hosts and ids never leave
 * the server through this — nor the owner's email or the academy name: the
 * status URL carries its token in the query string, which can end up in
 * browser history and logs, so what it returns names no one.
 */
export function toPublicStatus(row: OrgSignupRequest): PublicSignupStatus {
  switch (row.status) {
    case SIGNUP_STATUS.AWAITING_CONFIRMATION:
      return { state: 'awaiting_confirmation', message: 'Check your email for a confirmation link.' };
    case SIGNUP_STATUS.EXPIRED:
      return { state: 'expired', message: 'That link expired. Please submit the form again.' };
    case SIGNUP_STATUS.CONFIRMED:
    case SIGNUP_STATUS.DISPATCHED:
      return { state: 'provisioning', step: 'queued', message: STEP_MESSAGE.queued };
    case SIGNUP_STATUS.PROVISIONING: {
      const step = (row.currentStep && STEP_FOR_CLI_STEP[row.currentStep]) || 'queued';
      return { state: 'provisioning', step, message: STEP_MESSAGE[step] };
    }
    case SIGNUP_STATUS.PROVISIONED:
      return {
        state: 'ready',
        message: 'Ready — check your email for your invitation.',
        signInUrl: `${signupAppUrl()}/sign-in`,
      };
    default:
      return {
        state: 'failed',
        message: 'We couldn\'t finish setting up your academy. Our team has been notified and will contact you.',
      };
  }
}

/** Read a request for the form, applying expiry and the stuck-run check on the way. */
export async function readSignupStatus(id: string, token: string): Promise<PublicSignupStatus | null> {
  const found = await findSignupByIdAndToken(id, token);
  if (!found) {
    return null;
  }
  const { row, becameFailed } = await settleSignupTimeouts(found);
  if (becameFailed) {
    logger.error('[Signup] Request stuck; marked failed', { requestId: row.id });
  }
  if (row.status === SIGNUP_STATUS.FAILED && !row.alertSentAt) {
    await alertSignupFailure(row.id);
  }
  return toPublicStatus(row);
}
