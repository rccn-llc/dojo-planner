/**
 * Resolves the payment-provider configuration to use for a given flow.
 *
 *  - **Per-org (customer payments):** `resolveIQProConfig(orgId)` reads
 *    `clientId`, `clientSecret`, `gatewayId` from the org row, falling back
 *    to `IQPRO_*` env vars per field. Platform values (`scope`, `oauthUrl`,
 *    `baseUrl`) are always from env.
 *
 *  - **Provider-aware (new):** `resolvePaymentProviderConfig(orgId)` honours
 *    `organization.payment_provider` and returns a discriminated union, so a
 *    caller can `switch` on `.provider`.
 *
 *  - **Platform (SaaS billing):** `resolvePlatformIQProConfig()` reads the
 *    same 3 values from the singleton `platform_config` row, falling back
 *    to env vars per field. SaaS billing is IQPro-only and is deliberately
 *    NOT affected by `payment_provider`. It is read-only from the app: the
 *    admin UI that used to write it was removed, so the row is populated
 *    out-of-process via `src/scripts/backfillPlatformIQProConfig.ts` (or the
 *    `IQPRO_*` env fallback). The platform cache therefore has no explicit
 *    invalidation path — the 60s TTL is the only one, which is fine for a
 *    value that changes out-of-band.
 *
 * ── Why both resolvers exist ────────────────────────────────────────────────
 *
 * `IQProConfig` appears in ~41 type positions across libs/IQPro.ts and four
 * services. Widening the existing resolver's return type to the union would
 * turn all of them into type errors at once, pulling B3's design question
 * (what a provider-agnostic config actually looks like) into what is meant to
 * be an additive change. So the narrowed `resolveIQProConfig` stays, every
 * existing caller compiles untouched, and the union has no consumers until B3
 * rewrites `IPaymentProvider`.
 *
 * Each resolver caches its result for 60s to absorb burst payment traffic.
 * `updateIQProConfig` invalidates the per-org entry.
 *
 * Secrets are encrypted at rest with AES-256-GCM (see `Crypto.ts`).
 */

import type { PaymentProvider } from '@/types/PaymentProvider';
import { eq } from 'drizzle-orm';
import { controlOrganizationDb } from '@/libs/ControlPlaneReads';
import { decryptSecret, encryptSecret } from '@/libs/Crypto';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { organizationSchema, platformConfigSchema } from '@/models/Schema';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';

const PLATFORM_CONFIG_ID = 'singleton';
const CACHE_TTL_MS = 60_000;
const PER_ORG_CACHE_MAX = 200;

/**
 * Where a resolved config's values came from. Exported so the settings UI and
 * the admin projections share one definition — this union was previously
 * hand-written in four places and had to be widened in all of them.
 */
export type ConfigSource = 'org' | 'env' | 'mixed' | 'platform';

export type IQProConfig = {
  clientId: string;
  clientSecret: string;
  gatewayId: string;
  scope: string;
  oauthUrl: string;
  baseUrl: string;
  source: ConfigSource;
};

/** IQPro credentials, tagged for the discriminated union. */
export type IQProProviderConfig = Omit<IQProConfig, 'source'> & {
  provider: typeof PAYMENT_PROVIDER.IQPRO;
};

/**
 * Square credentials.
 *
 * NOTE: there is no read path for these yet. Of the fields Square needs, only
 * `merchant_id` has a column (`tenant.square_merchant_id`, control plane, used
 * for webhook routing); the rest await `payment_provider_config_enc`, which
 * B3 populates. Until then the Square branch resolves from `SQUARE_*` env
 * vars or returns null. Defining the shape now is what lets B3 fill it in.
 *
 * `applicationId` is deliberately PUBLIC — the browser Web Payments SDK needs
 * it — so it must never be treated as a secret in an admin projection.
 */
export type SquareProviderConfig = {
  provider: typeof PAYMENT_PROVIDER.SQUARE;
  accessToken: string;
  locationId: string;
  applicationId: string;
  environment: 'sandbox' | 'production';
  webhookSignatureKey: string;
};

/**
 * The provider-aware config. Discriminated on `provider`, so a `switch`
 * narrows automatically and TypeScript catches an unhandled provider at
 * compile time once B3 starts consuming it.
 */
export type PaymentProviderConfig = (IQProProviderConfig | SquareProviderConfig) & {
  source: ConfigSource;
};

export type IQProConfigPublic = {
  clientId: string | null;
  gatewayId: string | null;
  hasSecret: boolean;
  source: ConfigSource;
};

export type UpdateIQProConfigInput = {
  clientId: string;
  clientSecret?: string;
  gatewayId: string;
};

// ---------- caches ----------

type CacheEntry = { config: IQProConfig; expiresAt: number };

const perOrgCache = new Map<string, CacheEntry>();
let platformCache: CacheEntry | null = null;

function cacheGetOrg(orgId: string): IQProConfig | null {
  const entry = perOrgCache.get(orgId);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    perOrgCache.delete(orgId);
    return null;
  }
  return entry.config;
}

function cacheSetOrg(orgId: string, config: IQProConfig): void {
  if (perOrgCache.size >= PER_ORG_CACHE_MAX) {
    const firstKey = perOrgCache.keys().next().value;
    if (firstKey !== undefined) {
      perOrgCache.delete(firstKey);
    }
  }
  perOrgCache.set(orgId, { config, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheGetPlatform(): IQProConfig | null {
  if (!platformCache) {
    return null;
  }
  if (Date.now() > platformCache.expiresAt) {
    platformCache = null;
    return null;
  }
  return platformCache.config;
}

function cacheSetPlatform(config: IQProConfig): void {
  platformCache = { config, expiresAt: Date.now() + CACHE_TTL_MS };
}

export function resetIQProConfigCache(): void {
  perOrgCache.clear();
  platformCache = null;
}

// ---------- helpers ----------

function buildConfig(
  source: { clientId: string | null | undefined; clientSecret: string | null | undefined; gatewayId: string | null | undefined },
  dbHasAnyField: boolean,
): IQProConfig | null {
  const clientId = source.clientId ?? Env.IQPRO_CLIENT_ID ?? null;
  const clientSecret = source.clientSecret ?? Env.IQPRO_CLIENT_SECRET ?? null;
  const gatewayId = source.gatewayId ?? Env.IQPRO_GATEWAY_ID ?? null;
  const scope = Env.IQPRO_SCOPE ?? null;
  const oauthUrl = Env.IQPRO_OAUTH_URL ?? null;
  const baseUrl = Env.IQPRO_BASE_URL ?? null;

  if (!clientId || !clientSecret || !gatewayId || !scope || !oauthUrl || !baseUrl) {
    return null;
  }

  const dbFields = [source.clientId, source.clientSecret, source.gatewayId];
  const dbCount = dbFields.filter(v => v != null).length;
  let computedSource: IQProConfig['source'];
  if (!dbHasAnyField || dbCount === 0) {
    computedSource = 'env';
  } else if (dbCount === 3) {
    computedSource = 'org';
  } else {
    computedSource = 'mixed';
  }

  return { clientId, clientSecret, gatewayId, scope, oauthUrl, baseUrl, source: computedSource };
}

function decryptOrNull(enc: string | null | undefined): string | null {
  if (!enc) {
    return null;
  }
  try {
    return decryptSecret(enc);
  } catch (err) {
    logger.error('[IQProConfig] failed to decrypt client secret', { error: err instanceof Error ? err.message : 'unknown' });
    throw new Error('Failed to decrypt stored IQPro client secret');
  }
}

// ---------- per-org (customer flow) ----------

export async function resolveIQProConfig(orgId: string): Promise<IQProConfig | null> {
  const cached = cacheGetOrg(orgId);
  if (cached) {
    return cached;
  }

  const row = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: {
      iqproConfigClientId: true,
      iqproConfigClientSecretEncrypted: true,
      iqproConfigGatewayId: true,
    },
  });

  const dbClientId = row?.iqproConfigClientId ?? null;
  const dbSecret = decryptOrNull(row?.iqproConfigClientSecretEncrypted);
  const dbGatewayId = row?.iqproConfigGatewayId ?? null;
  const dbHasAnyField = Boolean(dbClientId || dbSecret || dbGatewayId);

  const config = buildConfig({ clientId: dbClientId, clientSecret: dbSecret, gatewayId: dbGatewayId }, dbHasAnyField);
  if (config) {
    cacheSetOrg(orgId, config);
  }
  return config;
}

/**
 * Provider-aware resolver. Reads `organization.payment_provider` and returns
 * the matching branch of the union.
 *
 * Deliberately has NO consumers yet — B3 is where `IPaymentProvider` stops
 * taking `IQProConfig` and starts switching on `.provider`. Adding it now keeps
 * B2 additive: nothing that compiles today changes behaviour.
 *
 * The Square branch resolves from `SQUARE_*` env vars only. The per-org
 * credential columns do not exist yet (`payment_provider_config_enc` is empty
 * until B3), so an org set to `square` with no env vars configured gets `null`
 * — the same "not configured" signal the IQPro branch already returns, which
 * callers already handle by disabling payment features.
 */
export async function resolvePaymentProviderConfig(
  orgId: string,
): Promise<PaymentProviderConfig | null> {
  const provider = await resolveProviderForOrg(orgId);

  if (provider === PAYMENT_PROVIDER.SQUARE) {
    return resolveSquareConfigFromEnv();
  }

  const iqpro = await resolveIQProConfig(orgId);
  if (!iqpro) {
    return null;
  }
  const { source, ...credentials } = iqpro;
  return { provider: PAYMENT_PROVIDER.IQPRO, ...credentials, source };
}

/** Reads the discriminator. Defaults to IQPro when the org row is missing. */
async function resolveProviderForOrg(orgId: string): Promise<PaymentProvider> {
  const row = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: { paymentProvider: true },
  });
  return row?.paymentProvider ?? PAYMENT_PROVIDER.IQPRO;
}

/**
 * Square credentials from env. Not cached: there is no DB round-trip to
 * absorb, and caching would only add an invalidation path to maintain for a
 * branch B3 is about to replace with the encrypted per-org blob.
 */
function resolveSquareConfigFromEnv(): PaymentProviderConfig | null {
  const accessToken = Env.SQUARE_ACCESS_TOKEN ?? null;
  const locationId = Env.SQUARE_LOCATION_ID ?? null;
  const applicationId = Env.SQUARE_APPLICATION_ID ?? null;
  const webhookSignatureKey = Env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? null;
  const environment = Env.SQUARE_ENVIRONMENT ?? null;

  if (!accessToken || !locationId || !applicationId || !webhookSignatureKey || !environment) {
    return null;
  }

  return {
    provider: PAYMENT_PROVIDER.SQUARE,
    accessToken,
    locationId,
    applicationId,
    environment,
    webhookSignatureKey,
    source: 'env',
  };
}

/**
 * Invalidate an org's cached credentials.
 *
 * MUST be called wherever `organization.payment_provider` is written. The cache
 * is keyed by orgId alone, so without this a provider flip serves the previous
 * provider's credentials for up to the 60s TTL — which on the payment path
 * means charging the wrong merchant account, not merely a stale read.
 */
export function invalidatePaymentProviderConfig(orgId: string): void {
  perOrgCache.delete(orgId);
}

export async function getIQProConfigForAdmin(orgId: string): Promise<IQProConfigPublic> {
  const row = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: {
      iqproConfigClientId: true,
      iqproConfigClientSecretEncrypted: true,
      iqproConfigGatewayId: true,
    },
  });

  const dbHasAnyField = Boolean(
    row?.iqproConfigClientId || row?.iqproConfigClientSecretEncrypted || row?.iqproConfigGatewayId,
  );
  const dbCount = [row?.iqproConfigClientId, row?.iqproConfigClientSecretEncrypted, row?.iqproConfigGatewayId].filter(Boolean).length;

  let source: IQProConfigPublic['source'];
  if (!dbHasAnyField) {
    source = 'env';
  } else if (dbCount === 3) {
    source = 'org';
  } else {
    source = 'mixed';
  }

  return {
    clientId: row?.iqproConfigClientId ?? Env.IQPRO_CLIENT_ID ?? null,
    gatewayId: row?.iqproConfigGatewayId ?? Env.IQPRO_GATEWAY_ID ?? null,
    hasSecret: Boolean(row?.iqproConfigClientSecretEncrypted) || Boolean(Env.IQPRO_CLIENT_SECRET),
    source,
  };
}

export type IQProConfigUpdateDiff = {
  clientIdChanged: boolean;
  clientSecretChanged: boolean;
  gatewayIdChanged: boolean;
};

export async function updateIQProConfig(
  orgId: string,
  input: UpdateIQProConfigInput,
): Promise<IQProConfigUpdateDiff> {
  const existing = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: {
      iqproConfigClientId: true,
      iqproConfigClientSecretEncrypted: true,
      iqproConfigGatewayId: true,
    },
  });

  const diff: IQProConfigUpdateDiff = {
    clientIdChanged: existing?.iqproConfigClientId !== input.clientId,
    clientSecretChanged: input.clientSecret != null && input.clientSecret !== '',
    gatewayIdChanged: existing?.iqproConfigGatewayId !== input.gatewayId,
  };

  const set: Partial<typeof organizationSchema.$inferInsert> = {
    iqproConfigClientId: input.clientId,
    iqproConfigGatewayId: input.gatewayId,
  };
  if (diff.clientSecretChanged && input.clientSecret) {
    set.iqproConfigClientSecretEncrypted = encryptSecret(input.clientSecret);
  }

  await db
    .insert(organizationSchema)
    .values({ id: orgId, ...set })
    .onConflictDoUpdate({
      target: organizationSchema.id,
      set,
    });

  perOrgCache.delete(orgId);
  return diff;
}

// ---------- platform (SaaS billing) ----------

export async function resolvePlatformIQProConfig(): Promise<IQProConfig | null> {
  const cached = cacheGetPlatform();
  if (cached) {
    return cached;
  }

  const row = await controlOrganizationDb().query.platformConfigSchema.findFirst({
    where: eq(platformConfigSchema.id, PLATFORM_CONFIG_ID),
    columns: {
      saasProviderClientId: true,
      saasProviderClientSecretEncrypted: true,
      saasProviderGatewayId: true,
    },
  });

  const dbClientId = row?.saasProviderClientId ?? null;
  const dbSecret = decryptOrNull(row?.saasProviderClientSecretEncrypted);
  const dbGatewayId = row?.saasProviderGatewayId ?? null;
  const dbHasAnyField = Boolean(dbClientId || dbSecret || dbGatewayId);

  const config = buildConfig({ clientId: dbClientId, clientSecret: dbSecret, gatewayId: dbGatewayId }, dbHasAnyField);
  if (!config) {
    return null;
  }
  // Re-tag the source for platform flow: 'org' becomes 'platform'.
  const tagged: IQProConfig = { ...config, source: config.source === 'org' ? 'platform' : config.source };
  cacheSetPlatform(tagged);
  return tagged;
}
