/**
 * Pure validation for `npm run org:create`. Nothing here touches the network
 * or a database, so every check is unit-tested.
 *
 * Each rule exists because the manual onboarding path got it wrong at least
 * once: a dev Clerk key against production, a masked Neon password pasted from
 * the console, a local encryption key encrypting production rows, a direct
 * (non-pooled) connection string, a base URL missing its path.
 */

import type { Buffer } from 'node:buffer';
import { decryptWithKey } from '../../libs/CryptoCore';

export type OnboardTarget = 'production' | 'preview';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

/** `CTA San Carlos!` → `cta-san-carlos`. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
}

/** The kiosk resolves an org by `?org=<slug>`, so the slug is user-facing. */
export function validateSlug(slug: string): string | null {
  if (!SLUG_PATTERN.test(slug)) {
    return 'Slug must be 1–50 lowercase letters, digits or hyphens, starting and ending with a letter or digit.';
  }
  if (slug.startsWith('org_')) {
    return 'Slug must not start with "org_" — the kiosk treats that prefix as a raw org id.';
  }
  return null;
}

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@][^\s@.]*\.[^\s@]+$/.test(email) ? null : 'Not a valid email address.';
}

/**
 * Production runs on the Clerk PRODUCTION instance, Preview on development.
 * A mismatch creates the org in the wrong instance, where the other app's
 * keys can never see it.
 */
export function checkClerkKeyForTarget(secretKey: string, target: OnboardTarget): string | null {
  const expected = target === 'production' ? 'sk_live_' : 'sk_test_';
  if (!secretKey.startsWith('sk_live_') && !secretKey.startsWith('sk_test_')) {
    return 'CLERK_SECRET_KEY is not a Clerk secret key (expected sk_live_… or sk_test_…).';
  }
  if (!secretKey.startsWith(expected)) {
    return `CLERK_SECRET_KEY is a ${secretKey.slice(0, 8)} key, but the target is ${target} (expects ${expected}…).`;
  }
  return null;
}

/**
 * A tenant connection string must be a pooled Neon URL with a real password.
 * Returns every problem found, so the operator fixes them in one pass.
 */
export function checkTenantConnectionString(
  connectionString: string,
  controlConnectionString: string,
): string[] {
  const problems: string[] = [];
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return ['Not a valid connection string URL.'];
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    problems.push(`Expected a postgres:// URL, got ${url.protocol}`);
  }
  // The Neon console masks the password unless "show password" is clicked;
  // pasting the masked string yields `password authentication failed`.
  if (!url.password || decodeURIComponent(url.password).includes('*')) {
    problems.push('The password is missing or masked (****). Reveal it before copying.');
  }
  if (url.hostname.endsWith('.neon.tech') && !url.hostname.includes('-pooler')) {
    problems.push('Use the POOLED connection string (hostname contains -pooler); the app serves tenants through the pooler.');
  }
  if (sameDatabase(connectionString, controlConnectionString)) {
    problems.push('That is the CONTROL database. A tenant needs a database of its own.');
  }
  return problems;
}

/** Compare host, port and database, ignoring credentials and pooler-vs-direct. */
export function sameDatabase(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    // `host` includes the port: two local servers on one hostname are distinct.
    const host = (u: URL) => u.host.replace('-pooler.', '.');
    return host(ua) === host(ub) && ua.pathname === ub.pathname;
  } catch {
    return false;
  }
}

/**
 * The encryption key must decrypt EVERY existing tenant row. A key that
 * decrypts none of them is the wrong key — the classic mistake being the dev
 * key from `.env.local` — and using it would write rows production can never
 * read. With no rows yet there is nothing to compare against, so that passes.
 */
export function checkEncryptionKeyAgainstTenants(
  rows: { orgId: string; connectionStringEncrypted: string }[],
  key: Buffer,
  sentinel: string,
): string | null {
  const failures = rows
    .filter(r => r.connectionStringEncrypted !== sentinel)
    .filter((r) => {
      try {
        decryptWithKey(r.connectionStringEncrypted, key);
        return false;
      } catch {
        return true;
      }
    })
    .map(r => r.orgId);

  if (failures.length === 0) {
    return null;
  }
  return `The encryption key cannot decrypt the tenant row(s) for ${failures.join(', ')}. `
    + 'Use the key this control plane was written with (Vercel → IQPRO_CONFIG_ENCRYPTION_KEY for this environment).';
}

/**
 * IQPro platform URLs must belong to the same IQPro environment as the target.
 * Not fatal (a deliberate sandbox production is possible during setup), so the
 * caller shows this as a warning.
 */
export function checkIqproEnvironment(baseUrl: string, oauthUrl: string, target: OnboardTarget): string | null {
  const sandbox = [baseUrl, oauthUrl].map(u => u.includes('sandbox.'));
  if (sandbox[0] !== sandbox[1]) {
    return 'IQPRO_BASE_URL and IQPRO_OAUTH_URL point at different IQPro environments (one is sandbox).';
  }
  if (target === 'production' && sandbox[0]) {
    return 'The target is production but the IQPro URLs are SANDBOX — payments will not settle.';
  }
  if (target === 'preview' && !sandbox[0]) {
    return 'The target is preview but the IQPro URLs are LIVE — real cards would be charged.';
  }
  if (baseUrl.endsWith('/')) {
    return 'IQPRO_BASE_URL has a trailing slash; every request path would contain "//" and 404.';
  }
  return null;
}

/**
 * The control database and the Clerk key must belong to the SAME environment.
 * The orgs already registered in the control plane must therefore exist in the
 * Clerk instance the key belongs to. Observed failure this catches: a
 * production CONTROL_DATABASE_URL left exported in the shell overrode
 * `.env.onboard.preview`; the shared encryption key still verified, and a
 * dev-instance org was registered in the PRODUCTION control plane.
 *
 * Passes when the control plane is empty (nothing to compare) or when at least
 * one sampled org is found — a preview control plane can hold orgs since
 * deleted from Clerk.
 */
export function checkControlPlaneMatchesClerk(
  sampledOrgIds: string[],
  foundOrgIds: string[],
  target: OnboardTarget,
): string | null {
  if (sampledOrgIds.length === 0 || foundOrgIds.length > 0) {
    return null;
  }
  return `None of the control database's organizations (${sampledOrgIds.join(', ')}) exist in this Clerk ${target} instance. `
    + 'The control database and CLERK_SECRET_KEY belong to different environments — check for a CONTROL_DATABASE_URL '
    + 'or CLERK_SECRET_KEY exported in your shell, which overrides the .env.onboard file.';
}

/** Variables that select an ENVIRONMENT; a shell value silently beating the file is how runs cross over. */
export const ENVIRONMENT_SELECTING_VARS = [
  'CLERK_SECRET_KEY',
  'CONTROL_DATABASE_URL',
  'IQPRO_CONFIG_ENCRYPTION_KEY',
  'CONTROL_PLANE_ENCRYPTION_KEY',
  'IQPRO_SCOPE',
  'IQPRO_OAUTH_URL',
  'IQPRO_BASE_URL',
] as const;

/** Which environment-selecting variables are already set before the file loads. */
export function shellOverrides(env: Record<string, string | undefined>): string[] {
  return ENVIRONMENT_SELECTING_VARS.filter(name => Boolean(env[name]));
}

/**
 * Square credentials that are internally inconsistent. Square application ids
 * carry their environment (`sandbox-sq0idb-…` vs `sq0idp-…`), so a mismatch is
 * caught without a network call. Returns hard errors.
 */
export function checkSquareCredentials(credentials: {
  applicationId: string;
  locationId: string;
  accessToken: string;
  webhookSignatureKey: string;
  environment: 'sandbox' | 'production';
}): string[] {
  const problems: string[] = [];
  for (const [name, value] of Object.entries({
    'Application ID': credentials.applicationId,
    'Location ID': credentials.locationId,
    'Access Token': credentials.accessToken,
    'Webhook Signature Key': credentials.webhookSignatureKey,
  })) {
    if (!value.trim()) {
      problems.push(`The Square ${name} is required.`);
    }
  }
  const sandboxApp = credentials.applicationId.startsWith('sandbox-');
  if (credentials.applicationId && credentials.environment === 'production' && sandboxApp) {
    problems.push('The Application ID is a SANDBOX id (sandbox-…) but the environment is production.');
  }
  if (credentials.applicationId && credentials.environment === 'sandbox' && !sandboxApp) {
    problems.push('The environment is sandbox but the Application ID is not a sandbox id (it should start with sandbox-).');
  }
  return problems;
}

/** Square environment vs onboarding target — a warning, like the IQPro one. */
export function checkSquareEnvironment(environment: 'sandbox' | 'production', target: OnboardTarget): string | null {
  if (target === 'production' && environment === 'sandbox') {
    return 'The target is production but the Square environment is SANDBOX — payments will not settle.';
  }
  if (target === 'preview' && environment === 'production') {
    return 'The target is preview but the Square environment is PRODUCTION — real cards would be charged.';
  }
  return null;
}
