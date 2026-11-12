import { getBaseUrl } from './Helpers';

/**
 * Configuration for the public sign-up endpoint (`/api/signup`). Constants
 * rather than env vars: none of this is secret, and every value here is
 * reviewed in code rather than set per deployment.
 */

/** The app's public URL in production. Confirmation links point here. */
export const SIGNUP_PRODUCTION_APP_URL = 'https://app.dojoplanner.com';

/** Pages allowed to POST the sign-up form from a browser. */
const PRODUCTION_ORIGINS = ['https://www.dojoplanner.com', 'https://dojoplanner.com'];

/**
 * Extra origins accepted outside production, so the sample form
 * (`docs/signup-form-example.html`) can be served locally and pointed at a
 * preview deployment. Add the www staging origin here once it exists.
 */
const NON_PRODUCTION_ORIGINS = ['http://localhost:3000', 'http://localhost:8080'];

/** Where the GitHub job that runs `org:create` lives. */
export const SIGNUP_GITHUB = {
  repository: 'rccn-llc/dojo-planner',
  workflow: 'onboard-org.yml',
  ref: 'main',
} as const;

export const SIGNUP_LIMITS = {
  /** Submissions per IP address per window. */
  perIp: 5,
  perIpWindowMs: 15 * 60_000,
  /** Requests per owner email per window, and confirmation emails per request. */
  perEmail: 3,
  perEmailWindowMs: 24 * 60 * 60_000,
  /** New requests across everyone per day. */
  perDay: 20,
  perDayWindowMs: 24 * 60 * 60_000,
  /** How long a confirmation link works. */
  confirmTtlMs: 48 * 60 * 60_000,
  /** A dispatched or provisioning request with no heartbeat for this long is failed. */
  stuckAfterMs: 15 * 60_000,
  /** Status polls per IP per minute, per server instance. */
  statusPollsPerMinute: 30,
  /** Largest accepted request body. */
  maxBodyBytes: 4096,
} as const;

/** Vercel sets VERCEL_ENV; anything else (local, CI) is not production. */
export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/** Which `onboard-org` target this deployment provisions into. */
export function signupTarget(): 'production' | 'preview' {
  return isProductionDeployment() ? 'production' : 'preview';
}

export function signupAllowedOrigins(): readonly string[] {
  return isProductionDeployment()
    ? PRODUCTION_ORIGINS
    : [...PRODUCTION_ORIGINS, ...NON_PRODUCTION_ORIGINS];
}

/**
 * Base URL for links in sign-up emails and responses. Production is pinned to
 * the custom domain: `NEXT_PUBLIC_APP_URL` there is a deployment URL.
 */
export function signupAppUrl(): string {
  const base = isProductionDeployment() ? SIGNUP_PRODUCTION_APP_URL : getBaseUrl();
  return base.replace(/\/+$/, '');
}
