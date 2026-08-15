/**
 * Resolves the IQPro configuration to use for a given flow:
 *
 *  - **Per-org (customer payments):** `resolveIQProConfig(orgId)` reads
 *    `clientId`, `clientSecret`, `gatewayId` from the org row, falling back
 *    to `IQPRO_*` env vars per field. Platform values (`scope`, `oauthUrl`,
 *    `baseUrl`) are always from env.
 *
 *  - **Platform (SaaS billing):** `resolvePlatformIQProConfig()` reads the
 *    same 3 values from the singleton `platform_config` row, falling back
 *    to env vars per field.
 *
 * Each resolver caches its result for 60s to absorb burst payment traffic.
 * `updateIQProConfig` / `updatePlatformConfig` invalidate the relevant
 * cache entry.
 *
 * Secrets are encrypted at rest with AES-256-GCM (see `Crypto.ts`).
 */

import { eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '@/libs/Crypto';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { organizationSchema, platformConfigSchema } from '@/models/Schema';

const PLATFORM_CONFIG_ID = 'singleton';
const CACHE_TTL_MS = 60_000;
const PER_ORG_CACHE_MAX = 200;

export type IQProConfig = {
  clientId: string;
  clientSecret: string;
  gatewayId: string;
  scope: string;
  oauthUrl: string;
  baseUrl: string;
  source: 'org' | 'env' | 'mixed' | 'platform';
};

export type IQProConfigPublic = {
  clientId: string | null;
  gatewayId: string | null;
  hasSecret: boolean;
  source: 'org' | 'env' | 'mixed' | 'platform';
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

export async function isIQProConfiguredForOrg(orgId: string): Promise<boolean> {
  return (await resolveIQProConfig(orgId)) !== null;
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

  const row = await db.query.platformConfigSchema.findFirst({
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

export async function getPlatformConfigForAdmin(): Promise<IQProConfigPublic> {
  const row = await db.query.platformConfigSchema.findFirst({
    where: eq(platformConfigSchema.id, PLATFORM_CONFIG_ID),
    columns: {
      saasProviderClientId: true,
      saasProviderClientSecretEncrypted: true,
      saasProviderGatewayId: true,
    },
  });

  const dbHasAnyField = Boolean(
    row?.saasProviderClientId || row?.saasProviderClientSecretEncrypted || row?.saasProviderGatewayId,
  );
  const dbCount = [row?.saasProviderClientId, row?.saasProviderClientSecretEncrypted, row?.saasProviderGatewayId].filter(Boolean).length;

  let source: IQProConfigPublic['source'];
  if (!dbHasAnyField) {
    source = 'env';
  } else if (dbCount === 3) {
    source = 'platform';
  } else {
    source = 'mixed';
  }

  return {
    clientId: row?.saasProviderClientId ?? Env.IQPRO_CLIENT_ID ?? null,
    gatewayId: row?.saasProviderGatewayId ?? Env.IQPRO_GATEWAY_ID ?? null,
    hasSecret: Boolean(row?.saasProviderClientSecretEncrypted) || Boolean(Env.IQPRO_CLIENT_SECRET),
    source,
  };
}

export async function updatePlatformConfig(
  input: UpdateIQProConfigInput,
): Promise<IQProConfigUpdateDiff> {
  const existing = await db.query.platformConfigSchema.findFirst({
    where: eq(platformConfigSchema.id, PLATFORM_CONFIG_ID),
    columns: {
      saasProviderClientId: true,
      saasProviderClientSecretEncrypted: true,
      saasProviderGatewayId: true,
    },
  });

  const diff: IQProConfigUpdateDiff = {
    clientIdChanged: existing?.saasProviderClientId !== input.clientId,
    clientSecretChanged: input.clientSecret != null && input.clientSecret !== '',
    gatewayIdChanged: existing?.saasProviderGatewayId !== input.gatewayId,
  };

  const set: Partial<typeof platformConfigSchema.$inferInsert> = {
    saasProviderClientId: input.clientId,
    saasProviderGatewayId: input.gatewayId,
  };
  if (diff.clientSecretChanged && input.clientSecret) {
    set.saasProviderClientSecretEncrypted = encryptSecret(input.clientSecret);
  }

  await db
    .insert(platformConfigSchema)
    .values({ id: PLATFORM_CONFIG_ID, ...set })
    .onConflictDoUpdate({
      target: platformConfigSchema.id,
      set,
    });

  platformCache = null;
  return diff;
}
