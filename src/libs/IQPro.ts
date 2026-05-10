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

// ===== Service fee config =====

/**
 * Service fee percentage applied to EVERY transaction. Passed to IQPro as a
 * paymentAdjustment of type "ServiceFee" (percentage, not flatAmount — IQPro
 * rejects flatAmount on ServiceFee adjustments). The flat amount is computed
 * by IQPro's /calculatefees endpoint per Basys team guidance.
 */
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
  baseAmount: number; // subtotal - discount (amount fees are calculated on)
  taxAmount: number; // taxable transactions only; 0 for memberships
  taxPct: number; // the rate that was applied (0 if non-taxable)
  serviceFeeAmount: number; // from IQPro /calculatefees (not computed locally)
  serviceFeePct: number; // the rate that was requested
  amount: number; // final total charged = base + tax + serviceFee
};

type CalculateServiceFeeParams = {
  baseAmount: number;
  processorId: string;
  token?: string;
  creditCardBin?: string;
};

/**
 * Call IQPro's POST /transaction/calculatefees to get the service fee amount
 * for a given base. We send a single paymentAdjustment of type "ServiceFee"
 * with the configured percentage; IQPro returns the computed flat amount in
 * `serviceFeesAmount`.
 */
async function fetchServiceFeeAmount(params: CalculateServiceFeeParams): Promise<number> {
  const gatewayId = Env.IQPRO_GATEWAY_ID!;
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
  // IQPro accepts exactly one of token or creditCardBin.
  if (params.token) {
    body.token = params.token;
  } else if (params.creditCardBin) {
    body.creditCardBin = params.creditCardBin;
  }

  const res = await iqproPost<{ data?: { serviceFeesAmount?: number } }>(
    `/api/gateway/${gatewayId}/transaction/calculatefees`,
    body,
  );
  const data = (res.data ?? res) as { serviceFeesAmount?: number };
  return roundCents(data.serviceFeesAmount ?? 0);
}

/**
 * Compute the full fee breakdown for a transaction.
 * - Tax is computed locally (taxable only; 0 for memberships). The caller
 *   supplies the org-specific tax rate via `taxStatePct`.
 * - Service fee amount is computed by IQPro via /calculatefees, using the
 *   configured ServiceFee percentage. A processor ID + token-or-BIN are required.
 */
export async function computeFeeBreakdown(
  baseAmount: number,
  isTaxable: boolean,
  taxStatePct: number,
  serviceFeeLookup: Omit<CalculateServiceFeeParams, 'baseAmount'>,
): Promise<ComputedFeeBreakdown> {
  const base = roundCents(baseAmount);
  const taxPct = isTaxable ? taxStatePct : 0;
  const serviceFeePct = getServiceFeePct();
  const taxAmount = roundCents(base * (taxPct / 100));
  const serviceFeeAmount = await fetchServiceFeeAmount({ ...serviceFeeLookup, baseAmount: base });
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

/**
 * Build the paymentAdjustments entry for the service fee.
 *
 * IQPro requires ServiceFee adjustments to be expressed as a percentage only —
 * passing a flatAmount with type: "ServiceFee" fails validation with
 * "ServiceFee must be expressed as a percentage". The gateway computes the
 * flat amount itself from the percentage.
 *
 * We still call /calculatefees upstream to preview the exact flat amount
 * (and surface it in our UI/receipts), but on the /transaction call we only
 * send the percentage.
 */
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

/**
 * Build the paymentAdjustments entry for sales tax. Used for TAXABLE
 * transactions only. Per Basys team guidance, tax is expressed solely via this
 * paymentAdjustment (not via remit.taxAmount) so it shows up distinctly in
 * reporting.
 *
 * IQPro requires Tax adjustments to be expressed as a flat amount only —
 * passing a percentage with type: "Tax" fails validation with
 * "Tax must be expressed as a flat amount".
 */
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

/**
 * Parse an IQPro transaction response into an approval status. IQPro returns
 * `status: "Captured" | "Settled" | "Authorized" | "Declined" | "Failed" |
 * "PendingSettlement"` etc. Anything not in the approved set is treated as
 * declined for safety — we never want to treat an ambiguous status as approved.
 */
export function mapTransactionStatus(txData: Record<string, unknown>): 'approved' | 'declined' {
  const raw = ((txData.status ?? '') as string).toLowerCase();
  if (raw === 'captured' || raw === 'settled' || raw === 'authorized' || raw === 'pendingsettlement') {
    return 'approved';
  }
  return 'declined';
}

/**
 * Throws if the transaction was not approved. The thrown Error's message
 * includes IQPro's processorResponseText when available so decline reasons
 * bubble up cleanly to the client.
 */
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

/**
 * Fetch a single saved payment method's details (BIN + last4 for card, achToken
 * for ACH) by querying the customer record. Used for vaulted-charge fee
 * calculation, since IQPro's /calculatefees endpoint requires a token or BIN
 * to derive the surcharge / service fee.
 */
export async function getCustomerPaymentMethod(
  customerId: string,
  paymentMethodId: string,
): Promise<SavedPaymentMethodInfo | null> {
  if (!isIQProConfigured()) {
    return null;
  }
  const gatewayId = Env.IQPRO_GATEWAY_ID!;
  const res = await iqproGet<{ data?: Record<string, unknown> }>(
    `/api/gateway/${gatewayId}/customer/${customerId}`,
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

// Exported for testing – reset cached OAuth token
export function resetOAuthToken(): void {
  cachedOAuthToken = null;
}

// Exported for testing – reset cached gateway processors
export function resetGatewayProcessors(): void {
  cachedProcessors = null;
}
