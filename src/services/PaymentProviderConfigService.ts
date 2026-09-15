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
import type { UpdatePaymentProviderConfigInput } from '@/validations/PaymentSettingsValidation';
import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { controlOrganizationDb } from '@/libs/ControlPlaneReads';
import { decryptSecret, encryptSecret } from '@/libs/Crypto';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { memberSchema, organizationSchema, paymentMethodSchema, platformConfigSchema } from '@/models/Schema';
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

/**
 * What the settings UI may see.
 *
 * ⚠️ Secrets are reported as BOOLEANS only. `clientSecret`, `accessToken` and
 * `webhookSignatureKey` must never cross to the browser; the form treats a
 * blank input as "keep the stored one" precisely because it cannot round-trip
 * the value.
 */
export type PaymentProviderConfigPublic = {
  provider: PaymentProvider;
  source: ConfigSource;
  iqpro: { clientId: string | null; gatewayId: string | null; hasSecret: boolean };
  square: {
    locationId: string | null;
    applicationId: string | null;
    environment: 'sandbox' | 'production';
    hasAccessToken: boolean;
    hasWebhookKey: boolean;
  };
};

/** The secrets that cannot be merged from a prior save because none exists yet. */
export type MissingSecretField
  = | 'iqproClientSecret'
    | 'squareAccessToken'
    | 'squareWebhookSignatureKey';

const MISSING_SECRET_MESSAGE: Record<MissingSecretField, string> = {
  iqproClientSecret:
    'A client secret is required the first time IQPro credentials are saved for this organization.',
  squareAccessToken:
    'An access token is required the first time Square credentials are saved for this organization.',
  squareWebhookSignatureKey:
    'A webhook signature key is required the first time Square credentials are saved for this organization. '
    + 'Square webhooks cannot be verified without it.',
};

/**
 * Thrown when a save would produce credentials with a required secret missing.
 *
 * Happens on the FIRST save for an org: there is no stored blob to merge with,
 * so an omitted secret leaves nothing to preserve. Typed (rather than a bare
 * Error) so the router maps it to a 400 with an actionable message — an
 * untyped throw becomes an opaque 500.
 *
 * ⚠️ The message names the FIELD THAT IS ACTUALLY MISSING. It previously always
 * said "IQPro client secret", so a Square org saving without an access token or
 * a webhook signature key was told to supply an IQPro credential that its form
 * does not even show. The class name is kept for the router's `instanceof`
 * mapping despite now covering three different secrets.
 */
export class MissingClientSecretError extends Error {
  /** Which credential was missing — for callers that branch on it rather than on prose. */
  readonly field: MissingSecretField;

  constructor(field: MissingSecretField = 'iqproClientSecret') {
    super(MISSING_SECRET_MESSAGE[field]);
    this.name = 'MissingClientSecretError';
    this.field = field;
  }
}

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

// ---------- the credential blob ----------

/**
 * Per-provider credential sets, as stored inside
 * `organization.payment_provider_config_enc`.
 *
 * The whole object is JSON-serialised and AES-GCM encrypted as ONE value, so
 * adding a provider means adding a branch here rather than a column pair per
 * credential — which is what the three `iqpro_config_*` columns would have
 * become, once per provider.
 */
const StoredIQProCredentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  gatewayId: z.string().min(1),
});

const StoredSquareCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  locationId: z.string().min(1),
  applicationId: z.string().min(1),
  environment: z.enum(['sandbox', 'production']),
  webhookSignatureKey: z.string().min(1),
});

const StoredProviderConfigSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal(PAYMENT_PROVIDER.IQPRO), credentials: StoredIQProCredentialsSchema }),
  z.object({ provider: z.literal(PAYMENT_PROVIDER.SQUARE), credentials: StoredSquareCredentialsSchema }),
]);

export type StoredProviderConfig = z.infer<typeof StoredProviderConfigSchema>;

/**
 * Decrypt and parse the credential blob.
 *
 * A decrypt failure rethrows (same reasoning as `decryptOrNull`: a bad or
 * rotated key must hard-fail the payment path, never silently fall back to env
 * credentials belonging to a different merchant). A *parse* failure is
 * different — the ciphertext was readable but the content is wrong, which means
 * corrupt or partially-written data. That also throws rather than falling
 * back, for the same reason.
 *
 * "Parse failure" covers BOTH invalid JSON and a valid-JSON blob of the wrong
 * shape. They are deliberately reported as the same error: from the caller's
 * point of view the stored credentials are unusable either way, and the log
 * line distinguishes them for whoever has to diagnose it.
 */
function readConfigBlob(enc: string | null | undefined): StoredProviderConfig | null {
  if (!enc) {
    return null;
  }
  let json: string;
  try {
    json = decryptSecret(enc);
  } catch (err) {
    logger.error('[PaymentProviderConfig] failed to decrypt credential blob', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    throw new Error('Failed to decrypt stored payment provider credentials');
  }

  // ⚠️ JSON.parse must be INSIDE the malformed-blob path. Decryptable-but-
  // invalid JSON (a truncated or partially-written blob) otherwise threw a raw
  // SyntaxError straight out of this function: never logged, and surfaced to
  // the caller as an opaque parse error rather than the documented
  // "credentials are malformed". Both corruption modes now report identically.
  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch (err) {
    logger.error('[PaymentProviderConfig] credential blob is not valid JSON', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    throw new Error('Stored payment provider credentials are malformed');
  }

  const parsed = StoredProviderConfigSchema.safeParse(decoded);
  if (!parsed.success) {
    logger.error('[PaymentProviderConfig] credential blob failed schema validation', {
      issues: parsed.error.issues.map(i => i.path.join('.')),
    });
    throw new Error('Stored payment provider credentials are malformed');
  }
  return parsed.data;
}

/** Encrypt a credential set for storage. */
export function writeConfigBlob(config: StoredProviderConfig): string {
  return encryptSecret(JSON.stringify(config));
}

// ---------- per-org (customer flow) ----------

export async function resolveIQProConfig(orgId: string): Promise<IQProConfig | null> {
  const cached = cacheGetOrg(orgId);
  if (cached) {
    return cached;
  }

  const row = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: { paymentProviderConfigEncrypted: true },
  });

  // The blob is the only DB source. An org that has never saved credentials
  // falls through to the IQPRO_* env vars, which is how single-tenant
  // deployments have always worked.
  const blob = readConfigBlob(row?.paymentProviderConfigEncrypted);
  const stored = blob?.provider === PAYMENT_PROVIDER.IQPRO ? blob.credentials : null;

  const config = buildConfig(
    {
      clientId: stored?.clientId ?? null,
      clientSecret: stored?.clientSecret ?? null,
      gatewayId: stored?.gatewayId ?? null,
    },
    Boolean(stored),
  );
  if (config) {
    cacheSetOrg(orgId, config);
  }
  return config;
}

/**
 * Provider-aware resolver: reads `organization.payment_provider` and returns
 * the matching branch of the union. This is what every payment path uses, so
 * the org's provider choice governs which merchant account gets charged.
 *
 * Credentials come from the encrypted blob, falling back to env vars per
 * provider — so a single-tenant deployment that has only ever set `IQPRO_*` /
 * `SQUARE_*` keeps working with no DB row at all.
 */
export async function resolvePaymentProviderConfig(
  orgId: string,
): Promise<PaymentProviderConfig | null> {
  // ⚠️ ONE read. The provider column and the credential blob MUST come from the
  // same row snapshot.
  //
  // The IQPro branch used to delegate to `resolveIQProConfig(orgId)`, which
  // issues its own SECOND read — and consults a 60s cache before doing so. A
  // provider switch landing between the two reads (or simply a stale cache
  // entry) meant this resolver could decide "IQPro" from a fresh column and
  // then pair it with credentials belonging to a different configuration. Worse
  // than a mismatch: `resolveIQProConfig` falls back to the `IQPRO_*` env vars
  // when the blob is not IQPro, so a Square org could be handed the platform's
  // fallback merchant credentials and have a member payment sent there.
  //
  // Reading once removes the window entirely rather than narrowing it, and
  // needs no transaction: a single findFirst is already a consistent snapshot
  // of one row.
  const row = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: { paymentProvider: true, paymentProviderConfigEncrypted: true },
  });
  const provider = row?.paymentProvider ?? PAYMENT_PROVIDER.IQPRO;
  const blob = readConfigBlob(row?.paymentProviderConfigEncrypted);

  if (provider === PAYMENT_PROVIDER.SQUARE) {
    // Guard against a blob whose provider disagrees with the column: trusting
    // the wrong one would charge the wrong merchant. The column wins, and a
    // mismatched blob is treated as absent.
    const stored = blob?.provider === PAYMENT_PROVIDER.SQUARE ? blob.credentials : null;
    return stored
      ? { provider: PAYMENT_PROVIDER.SQUARE, ...stored, source: 'org' }
      : resolveSquareConfigFromEnv();
  }

  const stored = blob?.provider === PAYMENT_PROVIDER.IQPRO ? blob.credentials : null;
  const iqpro = buildConfig(
    {
      clientId: stored?.clientId ?? null,
      clientSecret: stored?.clientSecret ?? null,
      gatewayId: stored?.gatewayId ?? null,
    },
    Boolean(stored),
  );
  if (!iqpro) {
    return null;
  }
  const { source, ...credentials } = iqpro;
  return { provider: PAYMENT_PROVIDER.IQPRO, ...credentials, source };
}

/** Square credentials from env — the fallback when no blob is stored. */
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
    columns: { paymentProviderConfigEncrypted: true },
  });

  const blob = readConfigBlob(row?.paymentProviderConfigEncrypted);
  const stored = blob?.provider === PAYMENT_PROVIDER.IQPRO ? blob.credentials : null;

  // The blob is all-or-nothing (its schema requires all three credentials), so
  // there is no longer a partially-populated state. 'mixed' therefore cannot
  // occur for the org scope; it remains in ConfigSource for the platform
  // resolver, which still reads three independent columns.
  return {
    clientId: stored?.clientId ?? Env.IQPRO_CLIENT_ID ?? null,
    gatewayId: stored?.gatewayId ?? Env.IQPRO_GATEWAY_ID ?? null,
    hasSecret: Boolean(stored?.clientSecret) || Boolean(Env.IQPRO_CLIENT_SECRET),
    source: stored ? 'org' : 'env',
  };
}

/**
 * The settings projection for both providers.
 *
 * Returns BOTH credential sets regardless of the active provider, so the form
 * can pre-fill the other one when an admin switches without losing what was
 * previously entered. Env fallbacks are reported the same way the IQPro-only
 * projection has always done.
 */
export async function getPaymentProviderConfigForAdmin(orgId: string): Promise<PaymentProviderConfigPublic> {
  const row = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.id, orgId),
    columns: { paymentProvider: true, paymentProviderConfigEncrypted: true },
  });

  const provider = row?.paymentProvider ?? PAYMENT_PROVIDER.IQPRO;
  const blob = readConfigBlob(row?.paymentProviderConfigEncrypted);
  const iqproStored = blob?.provider === PAYMENT_PROVIDER.IQPRO ? blob.credentials : null;
  const squareStored = blob?.provider === PAYMENT_PROVIDER.SQUARE ? blob.credentials : null;

  return {
    provider,
    source: blob ? 'org' : 'env',
    iqpro: {
      clientId: iqproStored?.clientId ?? Env.IQPRO_CLIENT_ID ?? null,
      gatewayId: iqproStored?.gatewayId ?? Env.IQPRO_GATEWAY_ID ?? null,
      hasSecret: Boolean(iqproStored?.clientSecret) || Boolean(Env.IQPRO_CLIENT_SECRET),
    },
    square: {
      locationId: squareStored?.locationId ?? Env.SQUARE_LOCATION_ID ?? null,
      applicationId: squareStored?.applicationId ?? Env.SQUARE_APPLICATION_ID ?? null,
      environment: squareStored?.environment ?? Env.SQUARE_ENVIRONMENT ?? 'sandbox',
      hasAccessToken: Boolean(squareStored?.accessToken) || Boolean(Env.SQUARE_ACCESS_TOKEN),
      hasWebhookKey: Boolean(squareStored?.webhookSignatureKey) || Boolean(Env.SQUARE_WEBHOOK_SIGNATURE_KEY),
    },
  };
}

export type IQProConfigUpdateDiff = {
  clientIdChanged: boolean;
  clientSecretChanged: boolean;
  gatewayIdChanged: boolean;
};

/** What changed on a save. Booleans only — never the values themselves. */
export type PaymentProviderUpdateDiff = {
  providerChanged: boolean;
  credentialsChanged: boolean;
  /**
   * Whether ANY secret was supplied on this save. For IQPro that is the client
   * secret; for Square it is the access token OR the webhook signature key,
   * since both are secrets and either being rotated must show in the audit log.
   */
  secretChanged: boolean;
};

/**
 * Thrown when switching provider would strand saved payment methods.
 *
 * Provider ids do not transfer: an IQPro customer/payment-method/subscription
 * id means nothing to Square, and ACH methods cannot be charged there at all.
 * Flipping an org with saved cards would leave every one of them unusable and
 * every autopay subscription orphaned at the old processor.
 */
export class ProviderSwitchBlockedError extends Error {
  constructor(count: number) {
    super(
      `This organization has ${count} saved payment method(s). Switching payment provider would leave them unusable, `
      + `because provider ids do not transfer between processors. Remove them first.`,
    );
    this.name = 'ProviderSwitchBlockedError';
  }
}

/**
 * Write an org's merchant credentials, for either provider.
 *
 * ⚠️ The provider column and the credential blob are written from the SAME
 * discriminant, in one statement. They must never disagree:
 * `resolvePaymentProviderConfig` treats the column as authoritative and a
 * mismatched blob as absent, so a divergence silently falls back to env
 * credentials — i.e. charges the wrong merchant rather than failing.
 *
 * This replaced `updateIQProConfig`, which hardcoded `provider: 'iqpro'` in
 * both places. Saving from the settings form therefore flipped a Square org
 * back to IQPro, and its next member payment went to the wrong account.
 */
export async function updatePaymentProviderConfig(
  orgId: string,
  input: UpdatePaymentProviderConfigInput,
): Promise<PaymentProviderUpdateDiff> {
  // ⚠️ The whole read-check-write runs in ONE transaction, and the org row is
  // locked FOR UPDATE up front.
  //
  // Two separate races made the un-transactional version unsound:
  //
  //  1. The saved-method check and the provider write were independent
  //     statements, so a card registered in between was stranded at the old
  //     processor anyway — exactly the outcome the check exists to prevent.
  //  2. Two concurrent saves could each read the same "before" provider and
  //     both write, so the recorded `providerChanged` diff (and its audit row)
  //     could describe a transition that never happened.
  //
  // The lock is taken on `organization` rather than on `payment_method`
  // because a row lock cannot prevent an INSERT of a row that does not exist
  // yet — only a predicate lock (SERIALIZABLE) or locking the parent object can.
  //
  // ⚠️ REMAINING GAP, deliberately not closed here. This serialises concurrent
  // *config saves* against each other and makes the check-then-write atomic on
  // this side. It does NOT stop a card registration that is already in flight:
  // `MemberPaymentService` inserts its `payment_method` row after a live call
  // to the processor, outside any transaction, so it never contends on the org
  // row. Closing that fully means having the payment path take this same lock
  // for the duration of a network round-trip to IQPro/Square, which would stall
  // the org row for seconds on every card save — a worse trade than the
  // residual risk.
  //
  // The residual window is now bounded by this transaction rather than by the
  // whole handler, and the outcome is a stranded card on an org that was mid-
  // switch — already a deliberate, rare, admin-initiated action that the
  // ProviderSwitchBlockedError check makes them retry. If that becomes
  // unacceptable, the fix is a `provider_switch_in_progress` flag on the org
  // that the payment path checks, not a longer-held lock.
  return db.transaction(async (tx) => {
    const lockedRows = await tx
      .select({
        paymentProvider: organizationSchema.paymentProvider,
        paymentProviderConfigEncrypted: organizationSchema.paymentProviderConfigEncrypted,
      })
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId))
      .for('update')
      .limit(1);
    const existingRow = lockedRows[0];

    const currentProvider = existingRow?.paymentProvider ?? PAYMENT_PROVIDER.IQPRO;
    const providerChanged = currentProvider !== input.provider;

    // Refuse a switch that would strand saved cards. Inside the transaction, so
    // a card registered concurrently either lands before this read (and blocks
    // the switch) or waits on the org lock (and is refused by the payment path).
    if (providerChanged && existingRow) {
      // `payment_method` carries no organization_id — it is org-scoped through
      // its member, so join up rather than assuming a column that is not there.
      const saved = await tx
        .select({ id: paymentMethodSchema.id })
        .from(paymentMethodSchema)
        .innerJoin(memberSchema, eq(paymentMethodSchema.memberId, memberSchema.id))
        .where(and(
          eq(memberSchema.organizationId, orgId),
          isNotNull(paymentMethodSchema.providerPaymentMethodId),
        ))
        .limit(51);
      if (saved.length > 0) {
        throw new ProviderSwitchBlockedError(saved.length);
      }
    }

    return buildAndPersistConfig(tx, orgId, input, existingRow, providerChanged);
  }).then((diff) => {
    // AFTER commit, never inside the transaction. Invalidating early lets a
    // concurrent read repopulate the cache from the pre-commit state and serve
    // the OLD provider's credentials past the write — the precise failure this
    // invalidation exists to prevent. Without it at all, the previous
    // provider's credentials are served for up to the cache TTL, which on the
    // payment path means charging the wrong merchant account.
    invalidatePaymentProviderConfig(orgId);
    return diff;
  });
}

/**
 * The credential-merge and write half of `updatePaymentProviderConfig`.
 *
 * Split out only so the transactional guard above stays readable; it is not
 * meant to be called on its own, and MUST run inside that transaction because
 * it writes the provider column the lock protects.
 */
async function buildAndPersistConfig(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orgId: string,
  input: UpdatePaymentProviderConfigInput,
  existingRow: { paymentProviderConfigEncrypted: string | null } | undefined,
  providerChanged: boolean,
): Promise<PaymentProviderUpdateDiff> {
  const existingBlob = readConfigBlob(existingRow?.paymentProviderConfigEncrypted);
  // Only reuse a stored secret when the blob belongs to the SAME provider —
  // an IQPro client secret is not a Square access token.
  const existingSame = existingBlob?.provider === input.provider ? existingBlob.credentials : null;

  let stored: StoredProviderConfig;
  let secretChanged: boolean;
  let credentialsChanged: boolean;

  if (input.provider === PAYMENT_PROVIDER.IQPRO) {
    const previous = existingSame as { clientId: string; clientSecret: string; gatewayId: string } | null;
    const provided = input.clientSecret != null && input.clientSecret !== '';
    // A blank secret means "keep the stored one" — it is never sent to the
    // browser, so the form cannot round-trip it.
    const clientSecret = provided ? input.clientSecret! : previous?.clientSecret;
    if (!clientSecret) {
      throw new MissingClientSecretError('iqproClientSecret');
    }
    secretChanged = provided;
    credentialsChanged = previous?.clientId !== input.clientId || previous?.gatewayId !== input.gatewayId;
    stored = {
      provider: PAYMENT_PROVIDER.IQPRO,
      credentials: { clientId: input.clientId, clientSecret, gatewayId: input.gatewayId },
    };
  } else {
    const previous = existingSame as {
      accessToken: string;
      locationId: string;
      applicationId: string;
      environment: 'sandbox' | 'production';
      webhookSignatureKey: string;
    } | null;
    const provided = input.accessToken != null && input.accessToken !== '';
    const accessToken = provided ? input.accessToken! : previous?.accessToken;
    if (!accessToken) {
      throw new MissingClientSecretError('squareAccessToken');
    }
    // The webhook key is equally a secret and merges the same way, but it is
    // required by the stored schema, so a first save must supply it.
    const webhookKeyProvided = input.webhookSignatureKey != null && input.webhookSignatureKey !== '';
    const webhookSignatureKey = webhookKeyProvided
      ? input.webhookSignatureKey!
      : previous?.webhookSignatureKey;
    if (!webhookSignatureKey) {
      throw new MissingClientSecretError('squareWebhookSignatureKey');
    }
    // EITHER Square secret counts. Reporting only the access token left the
    // audit trail claiming "secret unchanged" after a webhook signature key —
    // the credential that authenticates every inbound Square webhook — had just
    // been rotated.
    secretChanged = provided || webhookKeyProvided;
    credentialsChanged = previous?.locationId !== input.locationId
      || previous?.applicationId !== input.applicationId
      || previous?.environment !== input.environment;
    stored = {
      provider: PAYMENT_PROVIDER.SQUARE,
      credentials: {
        accessToken,
        locationId: input.locationId,
        applicationId: input.applicationId,
        environment: input.environment,
        webhookSignatureKey,
      },
    };
  }

  const set: Partial<typeof organizationSchema.$inferInsert> = {
    paymentProvider: input.provider,
    paymentProviderConfigEncrypted: writeConfigBlob(stored),
  };

  await tx
    .insert(organizationSchema)
    .values({ id: orgId, ...set })
    .onConflictDoUpdate({ target: organizationSchema.id, set });

  return { providerChanged, credentialsChanged, secretChanged };
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
