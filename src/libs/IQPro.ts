/**
 * IQPro REST integration.
 *
 * All calls go directly through `fetch` with an OAuth bearer token — no SDK
 * dependency. Every request and response is logged in full so vague IQPro
 * 4xx errors can be diagnosed from Better Stack without re-running the call.
 */

import { Env } from './Env';
import { logger } from './Logger';

// ===== Tokenization config types =====

export type TokenizationIframeConfig = {
  origin: string;
  tokenizationId: string;
  tokenScheme: string;
  authenticationKey: string;
  timestamp: string;
  iframeScriptUrl: string;
};

/**
 * Check if IQPro payment processing is configured.
 * Returns false if any required env var is missing.
 */
export function isIQProConfigured(): boolean {
  return !!(
    Env.IQPRO_CLIENT_ID
    && Env.IQPRO_CLIENT_SECRET
    && Env.IQPRO_SCOPE
    && Env.IQPRO_OAUTH_URL
    && Env.IQPRO_BASE_URL
    && Env.IQPRO_GATEWAY_ID
  );
}

// ===== OAuth token (cached per process) =====

let cachedOAuthToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(): Promise<string> {
  if (cachedOAuthToken && Date.now() < cachedOAuthToken.expiresAt) {
    return cachedOAuthToken.token;
  }

  const res = await fetch(Env.IQPRO_OAUTH_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: Env.IQPRO_CLIENT_ID!,
      client_secret: Env.IQPRO_CLIENT_SECRET!,
      scope: Env.IQPRO_SCOPE!,
    }),
  });

  if (!res.ok) {
    throw new Error(`OAuth token request failed: ${res.status}`);
  }

  const data = await res.json();
  const expiresIn = (data.expires_in ?? 3600) as number;

  cachedOAuthToken = {
    token: data.access_token as string,
    // Expire 60s early to avoid edge-case clock issues
    expiresAt: Date.now() + (expiresIn - 60) * 1000,
  };

  return cachedOAuthToken.token;
}

// ===== REST helpers =====

/**
 * Authenticated POST to the IQPro gateway API.
 * Logs the full request body and full response body (or error body).
 */
export async function iqproPost<T = Record<string, unknown>>(
  path: string,
  body: unknown,
): Promise<T> {
  const token = await getOAuthToken();
  const baseUrl = Env.IQPRO_BASE_URL!;

  logger.info('[IQPro] POST request', {
    path,
    body: JSON.stringify(body, null, 2),
  });

  const res = await fetch(`${baseUrl}${path}`, {
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

/**
 * Authenticated PUT to the IQPro gateway API.
 * Logs the full request body and full response body (or error body).
 */
export async function iqproPut<T = Record<string, unknown>>(
  path: string,
  body: unknown,
): Promise<T> {
  const token = await getOAuthToken();
  const baseUrl = Env.IQPRO_BASE_URL!;

  logger.info('[IQPro] PUT request', {
    path,
    body: JSON.stringify(body, null, 2),
  });

  const res = await fetch(`${baseUrl}${path}`, {
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

/**
 * Authenticated GET to the IQPro gateway API.
 * Logs the path and full response body (or error body).
 */
export async function iqproGet<T = Record<string, unknown>>(
  path: string,
): Promise<T> {
  const token = await getOAuthToken();
  const baseUrl = Env.IQPRO_BASE_URL!;

  logger.info('[IQPro] GET request', { path });

  const res = await fetch(`${baseUrl}${path}`, {
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

/**
 * Fetch the tokenization iframe configuration from the IQPro API.
 * Returns null if IQPro is not configured.
 */
export async function getTokenizationConfig(clientOrigin: string): Promise<TokenizationIframeConfig | null> {
  if (!isIQProConfigured()) {
    return null;
  }

  const token = await getOAuthToken();
  const baseUrl = Env.IQPRO_BASE_URL!;
  const gatewayId = Env.IQPRO_GATEWAY_ID!;

  const url = `${baseUrl}/api/v1/gateway/${gatewayId}/tokenization/configuration`;

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

  // The iqProV2 config may live under iframeConfiguration or mobileConfiguration
  // depending on gateway setup. Both contain the same TokenEx fields.
  const iframeConfig
    = json?.data?.iframeConfiguration?.iqProV2
      ?? json?.data?.mobileConfiguration?.iqProV2;

  if (!iframeConfig) {
    logger.error('[IQPro] Tokenization config missing iqProV2 data', {
      keys: json?.data ? Object.keys(json.data) : 'no data',
    });
    throw new Error('Tokenization config missing iframe configuration');
  }

  // Derive iframe script URL from base URL (sandbox vs production)
  const isSandbox = baseUrl.includes('sandbox');
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

/**
 * Tokenize an ACH account number via the IQPro Vault API.
 * Returns an achToken that can be used in place of the raw account number.
 */
export async function tokenizeAch(params: TokenizeAchParams): Promise<TokenizeAchResult> {
  if (!isIQProConfigured()) {
    throw new Error('IQPro is not configured');
  }

  const token = await getOAuthToken();
  // The vault API lives at the domain root, not under the /iqsaas/v1 path prefix
  const vaultBaseUrl = new URL(Env.IQPRO_BASE_URL!).origin;
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
  // The vault API returns { data: { achId, maskedAccount } }
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

let cachedProcessors: GatewayProcessors | null = null;

/**
 * Fetch the default card and ACH processor IDs for the configured gateway.
 * Results are cached for the lifetime of the process.
 */
export async function getGatewayProcessors(): Promise<GatewayProcessors> {
  if (cachedProcessors) {
    return cachedProcessors;
  }

  if (!isIQProConfigured()) {
    return { cardProcessorId: null, achProcessorId: null };
  }

  const token = await getOAuthToken();
  const baseUrl = Env.IQPRO_BASE_URL!;
  const gatewayId = Env.IQPRO_GATEWAY_ID!;

  logger.info('[IQPro] Gateway config request', { gatewayId });

  const res = await fetch(`${baseUrl}/api/gateway/${gatewayId}`, {
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

  cachedProcessors = {
    cardProcessorId: defaultCard?.processorId ?? null,
    achProcessorId: defaultAch?.processorId ?? null,
  };

  logger.info('[IQPro] Gateway processors loaded', cachedProcessors);
  return cachedProcessors;
}

// ===== Fee calculation =====

export type CalculateFeesParams = {
  baseAmount: number;
  processorId: string;
  state: string;
  paymentMethod: 'card' | 'ach';
  creditCardBin?: string;
  token?: string;
  paymentAdjustments?: Array<{
    type: string;
    percentage?: number | null;
    flatAmount?: number | null;
  }>;
};

export type CalculateFeesResult = {
  isSurchargeable: boolean;
  isPinCapable: boolean;
  surchargeRate: number;
  surchargeAmount: number;
  serviceFeesAmount: number;
  convenienceFeesAmount: number;
  baseAmount: number;
  amount: number;
  tip: number;
  taxAmount: number;
  cardBrand: string | null;
  cardType: string | null;
};

/**
 * Server-authoritative fee calculation. Returns the canonical surcharge,
 * service-fee, convenience-fee, and tax amounts for a given base amount and
 * payment method. Used to build the `remit` block on a transaction so amounts
 * and adjustments reconcile exactly with what IQPro will charge.
 */
export async function calculateTransactionFees(
  params: CalculateFeesParams,
): Promise<CalculateFeesResult> {
  const gatewayId = Env.IQPRO_GATEWAY_ID!;
  const body: Record<string, unknown> = {
    baseAmount: params.baseAmount,
    addTaxToTotal: true,
    taxAmount: 0,
    processorId: params.processorId,
    transactionType: 'Sale',
    state: params.state,
  };

  // IQPro accepts exactly one of token or creditCardBin, never both. Prefer
  // token when available — it identifies the specific card, whereas BIN only
  // identifies the issuing range.
  if (params.token) {
    body.token = params.token;
  } else if (params.creditCardBin) {
    body.creditCardBin = params.creditCardBin;
  }
  if (params.paymentAdjustments && params.paymentAdjustments.length > 0) {
    body.paymentAdjustments = params.paymentAdjustments;
  }

  const res = await iqproPost<{ data?: CalculateFeesResult }>(
    `/api/gateway/${gatewayId}/transaction/calculatefees`,
    body,
  );
  return (res.data ?? res) as CalculateFeesResult;
}

// Exported for testing – reset cached OAuth token
export function resetOAuthToken(): void {
  cachedOAuthToken = null;
}

// Exported for testing – reset cached gateway processors
export function resetGatewayProcessors(): void {
  cachedProcessors = null;
}
