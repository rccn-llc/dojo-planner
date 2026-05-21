/**
 * IQPro REST integration.
 *
 * All calls go directly through `fetch` with an OAuth bearer token — no SDK
 * dependency. Every request and response is logged in full so vague IQPro
 * 4xx errors can be diagnosed from Better Stack without re-running the call.
 *
 * Configuration is passed in as an `IQProConfig` object (one per organization
 * for customer payments, one platform-wide config for SaaS billing). The
 * resolver lives in `IQProConfigService` — keeping the lib free of DB imports
 * makes it trivial to mock and avoids circular dependencies.
 */

import type { IQProConfig } from '@/services/IQProConfigService';
import { Env } from './Env';
import { logger } from './Logger';

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
    throw new Error(`OAuth token request failed: ${res.status}`);
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
    body: JSON.stringify(body, null, 2),
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
      response: text || '(empty body)',
    });
    throw new Error(`IQPro API ${path} failed: ${res.status} ${text}`);
  }

  logger.info('[IQPro] POST response', {
    path,
    status: res.status,
    response: text || '(empty body)',
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
    body: JSON.stringify(body, null, 2),
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
      response: text || '(empty body)',
    });
    throw new Error(`IQPro API PUT ${path} failed: ${res.status} ${text}`);
  }

  logger.info('[IQPro] PUT response', {
    path,
    status: res.status,
    response: text || '(empty body)',
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
      response: text || '(empty body)',
    });
    throw new Error(`IQPro API GET ${path} failed: ${res.status}`);
  }

  logger.info('[IQPro] GET response', {
    path,
    status: res.status,
    response: text || '(empty body)',
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
      response: errorBody || '(empty body)',
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
      response: text || '(empty body)',
    });
    throw new Error(`ACH tokenization failed: ${res.status}`);
  }

  logger.info('[IQPro] ACH tokenize response', {
    status: res.status,
    response: text || '(empty body)',
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
      response: text || '(empty body)',
    });
    throw new Error(`Gateway config request failed: ${res.status}`);
  }

  logger.info('[IQPro] Gateway config response', {
    status: res.status,
    response: text || '(empty body)',
  });

  const json = text ? JSON.parse(text) : {};
  const processors = (json?.data?.processors ?? []) as Array<{
    processorId: string;
    isDefaultCard: boolean;
    isDefaultAch: boolean;
  }>;

  const defaultCard = processors.find(p => p.isDefaultCard);
  const defaultAch = processors.find(p => p.isDefaultAch);

  const result: GatewayProcessors = {
    cardProcessorId: defaultCard?.processorId ?? null,
    achProcessorId: defaultAch?.processorId ?? null,
  };
  processorsCache.set(config.gatewayId, result);

  logger.info('[IQPro] Gateway processors loaded', result);
  return result;
}

// ===== Service fee config =====

function getServiceFeePct(): number {
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

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
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
  const taxPct = isTaxable ? taxStatePct : 0;
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

// ===== Test helpers =====

export function resetOAuthTokenCache(): void {
  oauthTokenCache.clear();
}

export function resetGatewayProcessorsCache(): void {
  processorsCache.clear();
}
