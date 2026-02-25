import { Env } from './Env';
import { logger } from './Logger';

// Module name as a variable so that bundlers (turbopack / webpack) do NOT
// statically resolve the optional @dojo-planner/iqpro-client package.
const IQPRO_MODULE = '@dojo-planner/iqpro-client';

let iqproClient: unknown | null = null;

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

/**
 * Get the IQPro client singleton. Returns null if not configured.
 * Lazily initialized on first call.
 */
export async function getIQProClient(): Promise<unknown | null> {
  if (!isIQProConfigured()) {
    return null;
  }

  if (!iqproClient) {
    const mod = await import(/* webpackIgnore: true */ IQPRO_MODULE);
    const IQProClient = mod.IQProClient;
    iqproClient = new IQProClient({
      clientId: Env.IQPRO_CLIENT_ID!,
      clientSecret: Env.IQPRO_CLIENT_SECRET!,
      scope: Env.IQPRO_SCOPE!,
      oauthUrl: Env.IQPRO_OAUTH_URL!,
      baseUrl: Env.IQPRO_BASE_URL!,
    });
    (iqproClient as { setGatewayContext: (id: string) => void }).setGatewayContext(Env.IQPRO_GATEWAY_ID!);
  }

  return iqproClient;
}

// ===== Tokenization config =====

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
    logger.error('[IQPro] Failed to fetch tokenization config', { status: res.status });
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

  const res = await fetch(`${baseUrl}/api/gateway/${gatewayId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    logger.error('[IQPro] Failed to fetch gateway config', { status: res.status });
    throw new Error(`Gateway config request failed: ${res.status}`);
  }

  const json = await res.json();
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

// Exported for testing – reset cached OAuth token
export function resetOAuthToken(): void {
  cachedOAuthToken = null;
}

// Exported for testing – reset cached gateway processors
export function resetGatewayProcessors(): void {
  cachedProcessors = null;
}
