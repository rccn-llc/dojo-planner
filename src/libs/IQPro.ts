/**
 * IQPro REST integration.
 *
 * All calls go directly through `fetch` with an OAuth bearer token — no SDK
 * dependency. Every request and response is logged in full so vague IQPro
 * 4xx errors can be diagnosed from Better Stack without re-running the call.
 *
 * Configuration is passed in as an `IQProConfig` object (one per organization
 * for customer payments, one platform-wide config for SaaS billing). The
 * resolver lives in `PaymentProviderConfigService` — keeping the lib free of DB imports
 * makes it trivial to mock and avoids circular dependencies.
 */

import type { IQProConfig } from '@/services/PaymentProviderConfigService';
import { Buffer } from 'node:buffer';
import { createPublicKey, constants as cryptoConstants, verify as cryptoVerify } from 'node:crypto';
import { Env } from './Env';
import { logger } from './Logger';
import { redactBodyForLog, redactForLog } from './LogRedaction';

export type { IQProConfig };

// ===== Tokenization config types =====

export type TokenizationIframeConfig = {
  origin: string;
  tokenizationId: string;
  tokenScheme: string;
  authenticationKey: string;
  timestamp: string;
  iframeScriptUrl: string;
};

// ===== OAuth token cache =====
//
// Keyed by clientId — the same credentials produce the same token regardless
// of which org requested it, so deduplication is safe. (oauthUrl and scope are
// platform-wide env vars and don't vary.) Lazy eviction on access; hard cap of
// 100 entries with the soonest-to-expire entry dropped on overflow.

type CachedToken = { token: string; expiresAt: number };
const oauthTokenCache = new Map<string, CachedToken>();
const TOKEN_CACHE_MAX = 100;

/**
 * Turn an IQPro (Azure AD B2C) token failure into an actionable message.
 *
 * ⚠️ IQPro client secrets EXPIRE 365 days after creation, production included.
 * An expired secret still matches what IQPro has on file, so B2C does not say
 * "wrong secret" (AADB2C90081) — it fails during token issuance with
 * AADB2C90085 "The service has encountered an internal error", which reads
 * like an IQPro outage. Every IQPro call for that org (or the platform) then
 * fails until the secret is rotated: Location Settings for an org,
 * `backfillPlatformIQProConfig.ts` for the platform, or the `IQPRO_*` env.
 */
export function describeOAuthFailure(status: number, body: string): string {
  const code = /AADB2C\d+/.exec(body)?.[0];
  switch (code) {
    case 'AADB2C90085':
      return `IQPro OAuth token request failed (${status}, ${code}): the client secret has most likely EXPIRED (IQPro secrets expire 365 days after creation). Rotate it — Location Settings for an org, backfillPlatformIQProConfig.ts for the platform.`;
    case 'AADB2C90081':
      return `IQPro OAuth token request failed (${status}, ${code}): the client secret does not match this client id.`;
    case 'AADB2C90018':
      return `IQPro OAuth token request failed (${status}, ${code}): the client id is unknown to IQPro (wrong environment or deleted client).`;
    default:
      return `OAuth token request failed: ${status}${code ? ` (${code})` : ''}`;
  }
}

async function getOAuthToken(config: IQProConfig): Promise<string> {
  const key = config.clientId;
  const cached = oauthTokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const res = await fetch(config.oauthUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: config.scope,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const message = describeOAuthFailure(res.status, body);
    // clientId only — never the secret.
    logger.error('[IQPro] OAuth token request failed', { status: res.status, clientId: config.clientId, message });
    throw new Error(message);
  }

  const data = await res.json();
  const expiresIn = (data.expires_in ?? 3600) as number;
  const entry: CachedToken = {
    token: data.access_token as string,
    expiresAt: Date.now() + (expiresIn - 60) * 1000,
  };

  if (oauthTokenCache.size >= TOKEN_CACHE_MAX) {
    let oldestKey: string | undefined;
    let oldestExpiry = Infinity;
    for (const [k, v] of oauthTokenCache) {
      if (v.expiresAt < oldestExpiry) {
        oldestExpiry = v.expiresAt;
        oldestKey = k;
      }
    }
    if (oldestKey !== undefined) {
      oauthTokenCache.delete(oldestKey);
    }
  }
  oauthTokenCache.set(key, entry);

  return entry.token;
}

// ===== REST helpers =====

export async function iqproPost<T = Record<string, unknown>>(
  config: IQProConfig,
  path: string,
  body: unknown,
): Promise<T> {
  const token = await getOAuthToken(config);

  logger.info('[IQPro] POST request', {
    path,
    body: JSON.stringify(redactForLog(body), null, 2),
  });

  const res = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (!res.ok) {
    logger.error('[IQPro] POST failed', {
      path,
      status: res.status,
      response: redactBodyForLog(text),
    });
    throw new Error(`IQPro API ${path} failed: ${res.status} ${redactBodyForLog(text)}`);
  }

  logger.info('[IQPro] POST response', {
    path,
    status: res.status,
    response: redactBodyForLog(text),
  });

  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function iqproPut<T = Record<string, unknown>>(
  config: IQProConfig,
  path: string,
  body: unknown,
): Promise<T> {
  const token = await getOAuthToken(config);

  logger.info('[IQPro] PUT request', {
    path,
    body: JSON.stringify(redactForLog(body), null, 2),
  });

  const res = await fetch(`${config.baseUrl}${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (!res.ok) {
    logger.error('[IQPro] PUT failed', {
      path,
      status: res.status,
      response: redactBodyForLog(text),
    });
    throw new Error(`IQPro API PUT ${path} failed: ${res.status} ${redactBodyForLog(text)}`);
  }

  logger.info('[IQPro] PUT response', {
    path,
    status: res.status,
    response: redactBodyForLog(text),
  });

  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function iqproGet<T = Record<string, unknown>>(
  config: IQProConfig,
  path: string,
): Promise<T> {
  const token = await getOAuthToken(config);

  logger.info('[IQPro] GET request', { path });

  const res = await fetch(`${config.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();

  if (!res.ok) {
    logger.error('[IQPro] GET failed', {
      path,
      status: res.status,
      response: redactBodyForLog(text),
    });
    throw new Error(`IQPro API GET ${path} failed: ${res.status}`);
  }

  logger.info('[IQPro] GET response', {
    path,
    status: res.status,
    response: redactBodyForLog(text),
  });

  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ===== Tokenization config =====

export async function getTokenizationConfig(
  config: IQProConfig,
  clientOrigin: string,
): Promise<TokenizationIframeConfig> {
  const token = await getOAuthToken(config);
  const url = `${config.baseUrl}/api/v1/gateway/${config.gatewayId}/tokenization/configuration`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: clientOrigin,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    logger.error('[IQPro] Failed to fetch tokenization config', {
      status: res.status,
      response: redactBodyForLog(errorBody),
    });
    throw new Error(`Tokenization config request failed: ${res.status}`);
  }

  const json = await res.json();

  const iframeConfig
    = json?.data?.iframeConfiguration?.iqProV2
      ?? json?.data?.mobileConfiguration?.iqProV2;

  if (!iframeConfig) {
    logger.error('[IQPro] Tokenization config missing iqProV2 data', {
      keys: json?.data ? Object.keys(json.data) : 'no data',
    });
    throw new Error('Tokenization config missing iframe configuration');
  }

  const isSandbox = config.baseUrl.includes('sandbox');
  const iframeScriptUrl = isSandbox
    ? 'https://sandbox.api.basyspro.com/Iframe/iframe/iframe-v3.js'
    : 'https://api.basyspro.com/Iframe/iframe/iframe-v3.js';

  return {
    origin: iframeConfig.origin,
    tokenizationId: iframeConfig.tokenizationId,
    tokenScheme: iframeConfig.tokenScheme,
    authenticationKey: iframeConfig.authenticationKey,
    timestamp: iframeConfig.timestamp,
    iframeScriptUrl,
  };
}

// ===== ACH Tokenization =====

export type AchAccountType = 'Checking' | 'Savings';

export type TokenizeAchParams = {
  accountNumber: string;
  routingNumber: string;
  secCode?: string;
  achAccountType?: AchAccountType;
};

export type TokenizeAchResult = {
  achToken: string;
};

export async function tokenizeAch(
  config: IQProConfig,
  params: TokenizeAchParams,
): Promise<TokenizeAchResult> {
  const token = await getOAuthToken(config);
  const vaultBaseUrl = new URL(config.baseUrl).origin;
  const requestBody = {
    accountNumber: params.accountNumber,
    routingNumber: params.routingNumber,
    secCode: params.secCode ?? 'WEB',
    achAccountType: params.achAccountType ?? 'Checking',
  };

  logger.info('[IQPro] ACH tokenize request', {
    routingNumber: params.routingNumber,
    accountType: requestBody.achAccountType,
    secCode: requestBody.secCode,
  });

  const res = await fetch(`${vaultBaseUrl}/vault/api/v1/Tokenize/Ach`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const text = await res.text();

  if (!res.ok) {
    logger.error('[IQPro] ACH tokenization failed', {
      status: res.status,
      response: redactBodyForLog(text),
    });
    throw new Error(`ACH tokenization failed: ${res.status}`);
  }

  logger.info('[IQPro] ACH tokenize response', {
    status: res.status,
    response: redactBodyForLog(text),
  });

  const json = text ? JSON.parse(text) : {};
  const achToken = (json?.data?.achId ?? json?.achToken ?? json?.data?.achToken ?? json?.token) as string | undefined;

  if (!achToken) {
    logger.error('[IQPro] ACH tokenization response missing achToken', {
      keys: Object.keys(json ?? {}),
      dataKeys: json?.data ? Object.keys(json.data) : 'no data',
    });
    throw new Error('ACH tokenization response missing achToken');
  }

  return { achToken };
}

// ===== Gateway processor config =====

export type GatewayProcessors = {
  cardProcessorId: string | null;
  achProcessorId: string | null;
};

const processorsCache = new Map<string, GatewayProcessors>();

export async function getGatewayProcessors(config: IQProConfig): Promise<GatewayProcessors> {
  const cached = processorsCache.get(config.gatewayId);
  if (cached) {
    return cached;
  }

  const token = await getOAuthToken(config);

  logger.info('[IQPro] Gateway config request', { gatewayId: config.gatewayId });

  const res = await fetch(`${config.baseUrl}/api/gateway/${config.gatewayId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();

  if (!res.ok) {
    logger.error('[IQPro] Failed to fetch gateway config', {
      status: res.status,
      response: redactBodyForLog(text),
    });
    throw new Error(`Gateway config request failed: ${res.status}`);
  }

  logger.info('[IQPro] Gateway config response', {
    status: res.status,
    response: redactBodyForLog(text),
  });

  const json = text ? JSON.parse(text) : {};
  const processors = (json?.data?.processors ?? []) as Array<{
    processorId: string;
    isDefaultCard: boolean;
    isDefaultAch: boolean;
  }>;

  // Prefer the processor flagged as default, but fall back to the first
  // available processor of that kind. Some gateways (notably the sandbox) have
  // processors provisioned but none flagged isDefaultCard/isDefaultAch — the
  // old behaviour returned null there, which hard-failed every charge with
  // "No processor configured" and surfaced as a payment decline (#214/#215/#216
  // card, #264 ACH, #219 vaulted). The fallback lets those gateways charge.
  const defaultCard = processors.find(p => p.isDefaultCard) ?? processors[0];
  const defaultAch = processors.find(p => p.isDefaultAch) ?? processors[0];

  const result: GatewayProcessors = {
    cardProcessorId: defaultCard?.processorId ?? null,
    achProcessorId: defaultAch?.processorId ?? null,
  };
  processorsCache.set(config.gatewayId, result);

  const usedCardFallback = !processors.some(p => p.isDefaultCard) && result.cardProcessorId !== null;
  const usedAchFallback = !processors.some(p => p.isDefaultAch) && result.achProcessorId !== null;
  logger.info('[IQPro] Gateway processors loaded', { ...result, usedCardFallback, usedAchFallback });
  return result;
}

// ===== Service fee config =====

/**
 * The platform's service-fee percentage.
 *
 * Platform-wide, not per-provider: the same rate applies whichever processor
 * an organization uses, so Square reads it from here rather than keeping a
 * second copy that could drift.
 */
export function getServiceFeePct(): number {
  const fromEnv = Env.SERVICE_FEE_PCT?.trim();
  if (!fromEnv) {
    throw new Error('SERVICE_FEE_PCT is not set. Add it to .env.local (e.g. SERVICE_FEE_PCT=3.75).');
  }
  const parsed = Number.parseFloat(fromEnv);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`SERVICE_FEE_PCT must be a non-negative number, got "${fromEnv}"`);
  }
  return parsed;
}

// ===== Fee calculation =====

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Clamp a tax percentage to the valid [0, 100] range. A non-finite value
 * (NaN / Infinity from a corrupt DB column) collapses to 0 rather than
 * poisoning the charge total.
 */
function clampTaxPct(pct: number): number {
  if (!Number.isFinite(pct)) {
    return 0;
  }
  return Math.min(100, Math.max(0, pct));
}

export type ComputedFeeBreakdown = {
  baseAmount: number;
  taxAmount: number;
  taxPct: number;
  serviceFeeAmount: number;
  serviceFeePct: number;
  amount: number;
};

type CalculateServiceFeeParams = {
  baseAmount: number;
  processorId: string;
  token?: string;
  creditCardBin?: string;
};

async function fetchServiceFeeAmount(
  config: IQProConfig,
  params: CalculateServiceFeeParams,
): Promise<number> {
  const body: Record<string, unknown> = {
    baseAmount: params.baseAmount,
    addTaxToTotal: true,
    taxAmount: 0,
    processorId: params.processorId,
    transactionType: 'Sale',
    paymentAdjustments: [
      { type: 'ServiceFee', percentage: getServiceFeePct(), flatAmount: null },
    ],
  };
  if (params.token) {
    body.token = params.token;
  } else if (params.creditCardBin) {
    body.creditCardBin = params.creditCardBin;
  }

  const res = await iqproPost<{ data?: { serviceFeesAmount?: number } }>(
    config,
    `/api/gateway/${config.gatewayId}/transaction/calculatefees`,
    body,
  );
  const data = (res.data ?? res) as { serviceFeesAmount?: number };
  return roundCents(data.serviceFeesAmount ?? 0);
}

export async function computeFeeBreakdown(
  config: IQProConfig,
  baseAmount: number,
  isTaxable: boolean,
  taxStatePct: number,
  serviceFeeLookup: Omit<CalculateServiceFeeParams, 'baseAmount'>,
): Promise<ComputedFeeBreakdown> {
  const base = roundCents(baseAmount);
  // Defend against a corrupt/negative organization.location_tax_rate (a `real`
  // with no DB CHECK). An out-of-range value would otherwise produce a negative
  // or oversized tax charged to the card. Clamp to [0, 100]; non-finite → 0.
  const taxPct = isTaxable ? clampTaxPct(taxStatePct) : 0;
  const serviceFeePct = getServiceFeePct();
  const taxAmount = roundCents(base * (taxPct / 100));
  const serviceFeeAmount = await fetchServiceFeeAmount(config, { ...serviceFeeLookup, baseAmount: base });
  const amount = roundCents(base + taxAmount + serviceFeeAmount);
  return {
    baseAmount: base,
    taxAmount,
    taxPct,
    serviceFeeAmount,
    serviceFeePct,
    amount,
  };
}

export function buildServiceFeeAdjustment(breakdown: ComputedFeeBreakdown): {
  type: string;
  percentage: number;
  flatAmount: null;
} {
  return {
    type: 'ServiceFee',
    percentage: breakdown.serviceFeePct,
    flatAmount: null,
  };
}

export function buildTaxAdjustment(breakdown: ComputedFeeBreakdown): {
  type: string;
  percentage: null;
  flatAmount: number;
} {
  return {
    type: 'Tax',
    percentage: null,
    flatAmount: breakdown.taxAmount,
  };
}

// ===== Transaction response parsing =====

export function mapTransactionStatus(txData: Record<string, unknown>): 'approved' | 'declined' {
  const raw = ((txData.status ?? '') as string).toLowerCase();
  if (raw === 'captured' || raw === 'settled' || raw === 'authorized' || raw === 'pendingsettlement') {
    return 'approved';
  }
  return 'declined';
}

export function assertTransactionApproved(txData: Record<string, unknown>): void {
  if (mapTransactionStatus(txData) === 'approved') {
    return;
  }
  const reason = (
    txData.processorResponseText
    ?? txData.processorResponseMessage
    ?? txData.response
    ?? 'Transaction declined'
  ) as string;
  throw new Error(reason);
}

// ===== Saved payment method lookup =====

export type SavedPaymentMethodInfo = {
  type: 'card' | 'ach';
  firstSix?: string;
  last4?: string;
  achToken?: string;
};

export async function getCustomerPaymentMethod(
  config: IQProConfig,
  customerId: string,
  paymentMethodId: string,
): Promise<SavedPaymentMethodInfo | null> {
  const res = await iqproGet<{ data?: Record<string, unknown> }>(
    config,
    `/api/gateway/${config.gatewayId}/customer/${customerId}`,
  );
  const data = (res.data ?? res) as Record<string, unknown>;
  const paymentMethods = (data.paymentMethods ?? []) as Array<Record<string, unknown>>;
  const pm = paymentMethods.find((p) => {
    const id = (p.customerPaymentMethodId ?? p.paymentMethodId ?? p.id) as string | undefined;
    return id === paymentMethodId;
  });
  if (!pm) {
    return null;
  }
  const card = pm.card as Record<string, unknown> | undefined;
  const ach = pm.ach as Record<string, unknown> | undefined;
  if (card) {
    const masked = ((card.maskedNumber ?? card.maskedCard ?? '') as string) || '';
    const firstSix = masked.length >= 6 ? masked.slice(0, 6) : undefined;
    const last4 = masked.length >= 4 ? masked.slice(-4) : undefined;
    return { type: 'card', firstSix, last4 };
  }
  if (ach) {
    const accountMasked = ((ach.accountNumber ?? ach.maskedAccount ?? '') as string) || '';
    const last4 = accountMasked.length >= 4 ? accountMasked.slice(-4) : undefined;
    const achToken = (ach.achToken ?? ach.token ?? ach.achId) as string | undefined;
    return { type: 'ach', last4, achToken };
  }
  return null;
}

// ===== Webhook signature (RSA-SHA256, PKCS#1 v1.5) =====
//
// "iQ Pro+ Webhook API Guide" §2–4: IQPro signs the `resource` object of each
// webhook with the GATEWAY's RSA private key. The matching public key comes
// from `GET /api/gateway/{gatewayId}/configuration` → `data.webhookPublicKey`
// (null until a webhook has been created for the gateway). Keys differ per
// gateway, so per org — and sandbox and production keys differ too.

type CachedKey = { pem: string | null; expiresAt: number };
const webhookKeyCache = new Map<string, CachedKey>();
const WEBHOOK_KEY_TTL_MS = 60 * 60 * 1000;

/**
 * A bare base64 key as SPKI PEM; an existing PEM passes through.
 *
 * ⚠️ IQPro's `webhookPublicKey` is a bare PKCS#1 `RSAPublicKey`
 * (`MIIBigKCAYEA…`), NOT SPKI (`MIIBIjANBgkq…`). Wrapping it in
 * `BEGIN PUBLIC KEY` fails to parse (ERR_OSSL_ASN1_WRONG_TAG), so every real
 * webhook failed verification — found with the first sandbox delivery. Both
 * DER encodings are tried and the key is re-exported as SPKI.
 */
export function toPublicKeyPem(key: string): string {
  const trimmed = key.trim();
  if (trimmed.includes('-----BEGIN')) {
    return trimmed;
  }
  const body = trimmed.replace(/\s+/g, '');
  const der = Buffer.from(body, 'base64');
  for (const type of ['spki', 'pkcs1'] as const) {
    try {
      return createPublicKey({ key: der, format: 'der', type }).export({ type: 'spki', format: 'pem' }).toString().trim();
    } catch {
      // Not this encoding — try the next.
    }
  }
  // Unparseable: wrap it anyway so verification fails closed, not with a throw.
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

/**
 * The gateway's webhook public key as PEM, or null when the gateway has no
 * webhook configured or the key cannot be fetched. Cached per gateway for an
 * hour; `force` bypasses the cache (used once when verification fails, in case
 * the key rotated).
 */
export async function getWebhookPublicKey(config: IQProConfig, opts: { force?: boolean } = {}): Promise<string | null> {
  const cached = webhookKeyCache.get(config.gatewayId);
  if (!opts.force && cached && Date.now() < cached.expiresAt) {
    return cached.pem;
  }

  try {
    const res = await iqproGet<{ data?: { webhookPublicKey?: string | null } }>(
      config,
      `/api/gateway/${config.gatewayId}/configuration`,
    );
    const raw = res.data?.webhookPublicKey;
    const pem = raw ? toPublicKeyPem(raw) : null;
    webhookKeyCache.set(config.gatewayId, { pem, expiresAt: Date.now() + WEBHOOK_KEY_TTL_MS });
    if (!pem) {
      logger.warn('[IQPro] Gateway has no webhookPublicKey — create a webhook in Developer Hub first', {
        gatewayId: config.gatewayId,
      });
    }
    return pem;
  } catch (error) {
    logger.error('[IQPro] Failed to fetch webhook public key', {
      gatewayId: config.gatewayId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * The webhook public key to verify against: the dev-only override when set
 * outside production, otherwise the gateway's key.
 */
export async function resolveWebhookPublicKey(config: IQProConfig, opts: { force?: boolean } = {}): Promise<string | null> {
  const override = Env.IQPRO_WEBHOOK_PUBLIC_KEY_OVERRIDE;
  if (override) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[IQPro] IQPRO_WEBHOOK_PUBLIC_KEY_OVERRIDE is set in production — IGNORED');
    } else {
      return toPublicKeyPem(override);
    }
  }
  return getWebhookPublicKey(config, opts);
}

/**
 * The exact source text of a top-level member's value in a JSON object, or
 * null. Used to verify the signature against the bytes IQPro actually sent:
 * IQPro serializes with .NET, which writes decimals like `10.50` verbatim,
 * whereas `JSON.stringify(JSON.parse(...))` would write `10.5` and every such
 * signature would fail.
 */
export function extractRawJsonMember(raw: string, member: string): string | null {
  let i = 0;
  const n = raw.length;
  const skipWs = () => {
    while (i < n && /\s/.test(raw[i]!)) {
      i++;
    }
  };
  const readString = (): string | null => {
    if (raw[i] !== '"') {
      return null;
    }
    const start = i;
    i++;
    while (i < n && raw[i] !== '"') {
      i += raw[i] === '\\' ? 2 : 1;
    }
    i++;
    try {
      return JSON.parse(raw.slice(start, i)) as string;
    } catch {
      return null;
    }
  };
  const skipValue = (): boolean => {
    const ch = raw[i];
    if (ch === '"') {
      return readString() !== null;
    }
    if (ch === '{' || ch === '[') {
      let depth = 0;
      while (i < n) {
        const c = raw[i]!;
        if (c === '"') {
          if (readString() === null) {
            return false;
          }
          continue;
        }
        if (c === '{' || c === '[') {
          depth++;
        } else if (c === '}' || c === ']') {
          depth--;
          if (depth === 0) {
            i++;
            return true;
          }
        }
        i++;
      }
      return false;
    }
    while (i < n && raw[i] !== ',' && raw[i] !== '}' && !/\s/.test(raw[i]!)) {
      i++;
    }
    return true;
  };

  skipWs();
  if (raw[i] !== '{') {
    return null;
  }
  i++;
  while (i < n) {
    skipWs();
    if (raw[i] === '}') {
      return null;
    }
    const key = readString();
    if (key === null) {
      return null;
    }
    skipWs();
    if (raw[i] !== ':') {
      return null;
    }
    i++;
    skipWs();
    const valueStart = i;
    if (!skipValue()) {
      return null;
    }
    if (key === member) {
      return raw.slice(valueStart, i);
    }
    skipWs();
    if (raw[i] === ',') {
      i++;
    }
  }
  return null;
}

const BASE64_RE = /^[A-Z0-9+/]+={0,2}$/i;

/**
 * Verify an IQPro webhook. Fails closed: any missing input, malformed
 * signature, or crypto error is `false`.
 *
 * Checked first against the raw `resource` bytes from the request body, then
 * against a re-serialization (what the guide's own example does). Both are
 * checked with the same key, so trying two encodings does not weaken it.
 */
export function verifyIQProWebhookSignature(params: {
  rawBody: string;
  resource: unknown;
  signature: string | null | undefined;
  publicKeyPem: string | null | undefined;
}): boolean {
  const { rawBody, resource, signature, publicKeyPem } = params;
  if (!signature || !publicKeyPem || resource === undefined || resource === null || !BASE64_RE.test(signature)) {
    return false;
  }

  const signatureBytes = Buffer.from(signature, 'base64');
  const candidates = new Set<string>();
  const rawResource = extractRawJsonMember(rawBody, 'resource');
  if (rawResource) {
    candidates.add(rawResource);
  }
  candidates.add(JSON.stringify(resource));

  for (const candidate of candidates) {
    try {
      const ok = cryptoVerify(
        'sha256',
        Buffer.from(candidate, 'utf8'),
        { key: publicKeyPem, padding: cryptoConstants.RSA_PKCS1_PADDING },
        signatureBytes,
      );
      if (ok) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

// ===== Test helpers =====

export function resetOAuthTokenCache(): void {
  oauthTokenCache.clear();
}

export function resetGatewayProcessorsCache(): void {
  processorsCache.clear();
}

export function resetWebhookPublicKeyCache(): void {
  webhookKeyCache.clear();
}
