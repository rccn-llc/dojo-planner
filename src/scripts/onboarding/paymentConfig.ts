/**
 * Payment credentials for a new organization (IQPro or Square): verify them
 * against the processor, then build the encrypted blob exactly as
 * `PaymentProviderConfigService` writes it (`{ provider, credentials }`,
 * AES-GCM, `IQPRO_CONFIG_ENCRYPTION_KEY`), so both the planner and the kiosk
 * read it unchanged.
 */

import type { Buffer } from 'node:buffer';
import { encryptWithKey } from '../../libs/CryptoCore';

export type IqproCredentials = { clientId: string; clientSecret: string; gatewayId: string };
export type IqproPlatform = { scope: string; oauthUrl: string; baseUrl: string };

export function buildIqproConfigBlob(credentials: IqproCredentials, key: Buffer): string {
  return encryptWithKey(JSON.stringify({ provider: 'iqpro', credentials }), key);
}

/**
 * Prove the credentials work BEFORE they are saved: an OAuth token, then the
 * gateway the kiosk reads first. Each failure maps to the setting that is
 * actually wrong — the production 404s were a base URL missing `/iqsaas/v1`,
 * which no amount of re-entering credentials would have fixed.
 */
export async function verifyIqproCredentials(
  credentials: IqproCredentials,
  platform: IqproPlatform,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let token: string;
  try {
    const res = await fetchImpl(platform.oauthUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        scope: platform.scope,
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: res.status === 400 || res.status === 401
          ? `IQPro rejected the Client ID / Client Secret / IQPRO_SCOPE (OAuth ${res.status}). Check they belong to the same IQPro environment as IQPRO_OAUTH_URL.`
          : `IQPro OAuth request failed (${res.status}). Check IQPRO_OAUTH_URL.`,
      };
    }
    token = String((await res.json() as { access_token?: unknown }).access_token ?? '');
    if (!token) {
      return { ok: false, reason: 'IQPro OAuth returned no access token.' };
    }
  } catch (err) {
    return { ok: false, reason: `Could not reach IQPRO_OAUTH_URL (${err instanceof Error ? err.message : 'network error'}).` };
  }

  try {
    const res = await fetchImpl(`${platform.baseUrl}/api/gateway/${encodeURIComponent(credentials.gatewayId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      return {
        ok: false,
        reason: 'IQPro returned 404 for the gateway. Either IQPRO_BASE_URL is wrong (it must include the path, e.g. …/iqsaas/v1, no trailing slash) '
          + 'or the Gateway ID is not in this IQPro environment.',
      };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: `IQPro refused the gateway (${res.status}): these credentials have no access to that Gateway ID.` };
    }
    if (!res.ok) {
      return { ok: false, reason: `IQPro gateway request failed (${res.status}).` };
    }
  } catch (err) {
    return { ok: false, reason: `Could not reach IQPRO_BASE_URL (${err instanceof Error ? err.message : 'network error'}).` };
  }

  return { ok: true };
}

// ── Square ──────────────────────────────────────────────────────────────────

/** The `StoredSquareCredentialsSchema` shape in PaymentProviderConfigService. */
export type SquareCredentials = {
  accessToken: string;
  locationId: string;
  applicationId: string;
  environment: 'sandbox' | 'production';
  webhookSignatureKey: string;
};

/**
 * Square API version sent with the check, matching `SQUARE_API_VERSION` in
 * `libs/Square.ts`. Mirrored, not imported: that module pulls in the logger and
 * with it the full app environment, which scripts do not hold.
 */
const SQUARE_API_VERSION = '2025-01-23';

export function squareApiBase(environment: SquareCredentials['environment']): string {
  return environment === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

export function buildSquareConfigBlob(credentials: SquareCredentials, key: Buffer): string {
  return encryptWithKey(JSON.stringify({ provider: 'square', credentials }), key);
}

/**
 * Prove the access token can see the location, on the API host for the chosen
 * environment. A sandbox token against production (or the reverse) is a 401;
 * a location from another Square account is a 404 — both fixable before
 * anything is saved.
 */
export async function verifySquareCredentials(
  credentials: SquareCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; locationName: string } | { ok: false; reason: string }> {
  let res: Response;
  try {
    res = await fetchImpl(`${squareApiBase(credentials.environment)}/v2/locations/${encodeURIComponent(credentials.locationId)}`, {
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Square-Version': SQUARE_API_VERSION,
        'Accept': 'application/json',
      },
    });
  } catch (err) {
    return { ok: false, reason: `Could not reach Square (${err instanceof Error ? err.message : 'network error'}).` };
  }

  if (res.status === 401) {
    return {
      ok: false,
      reason: `Square rejected the access token for the ${credentials.environment} environment (401). `
        + 'Check it is the token for that environment — a sandbox token does not work against production, or the reverse.',
    };
  }
  if (res.status === 403) {
    return { ok: false, reason: 'Square refused the request (403): the access token lacks permission to read merchant locations.' };
  }
  if (res.status === 404) {
    return { ok: false, reason: `Square has no location ${credentials.locationId} for this access token's account (404). Check the Location ID.` };
  }
  if (!res.ok) {
    return { ok: false, reason: `Square location request failed (${res.status}).` };
  }

  const { location } = await res.json() as { location?: { name?: string; status?: string } };
  if (location?.status && location.status !== 'ACTIVE') {
    return { ok: false, reason: `Square location ${credentials.locationId} is ${location.status}, not ACTIVE — it cannot take payments.` };
  }
  return { ok: true, locationName: location?.name ?? credentials.locationId };
}
