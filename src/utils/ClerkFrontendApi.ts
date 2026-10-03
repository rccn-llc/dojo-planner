import { Buffer } from 'node:buffer';

// A Clerk publishable key is `pk_(test|live)_<base64(frontendApiHost + '$')>`.
// Development instances use `*.clerk.accounts.dev`, which the CSP already
// allows by wildcard; a production instance's Frontend API is
// `clerk.<your-domain>`, which no static entry can anticipate. Deriving the host
// from the key keeps the CSP correct for whichever instance an environment uses
// (Production on the prod instance, Preview/local on dev) with no extra env var.

const PUBLISHABLE_KEY_PATTERN = /^pk_(?:test|live)_([A-Za-z0-9+/=]+)$/;
const HOSTNAME_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/**
 * Returns the `https://` origin of the Clerk Frontend API encoded in a
 * publishable key, or `null` when the key is missing or malformed. Never
 * throws — this runs while `next.config.ts` builds the CSP header.
 */
export function getClerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const match = publishableKey?.trim().match(PUBLISHABLE_KEY_PATTERN);
  if (!match?.[1]) {
    return null;
  }

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  if (!decoded.endsWith('$')) {
    return null;
  }

  // Validated as a bare hostname so a crafted key cannot inject extra CSP
  // sources or directives (spaces, `;`, wildcards, schemes).
  const host = decoded.slice(0, -1);
  return HOSTNAME_PATTERN.test(host) ? `https://${host}` : null;
}
