import { createEnv } from '@t3-oss/env-nextjs';
import * as z from 'zod';

export const Env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    // ---- Multi-tenancy (see src/services/TenantDirectoryService.ts) ----
    // The CONTROL database: holds the `tenant` directory, `tenant_external_ref`,
    // `platform_config`, and the org row's SaaS-billing columns. Must be
    // readable before any tenant database can be opened.
    // Optional, falling back to DATABASE_URL, because during the no-op phase
    // the control plane and the single shared tenant database are the same
    // physical database. Once tenants are split out this should be set
    // explicitly on every deployment.
    CONTROL_DATABASE_URL: z.string().min(1).optional(),
    // Whether the control plane and tenant data are physically separate.
    //
    // EXPLICIT rather than derived. This used to be inferred in five separate
    // places from `CONTROL_DATABASE_URL !== DATABASE_URL`, which meant setting
    // that one variable silently flipped auto-registration, sentinel-row
    // handling, control-pool sizing, webhook routing, and the resolver path all
    // at once — with no way to stage the change or verify it first.
    //
    // Splitting the flag from the connection string means a deployment can
    // populate CONTROL_DATABASE_URL, migrate it, and verify it while STILL
    // serving traffic in 'shared' mode. Flipping to 'split' is then a separate,
    // reversible decision.
    //
    // ⚠️ Before setting 'split', every `tenant` row must carry a real per-org
    // connection string: rows holding the shared-database sentinel throw, and
    // rows encrypted from DATABASE_URL would silently serve the wrong database.
    TENANCY_MODE: z.enum(['shared', 'split']).optional(),
    // Local/dev single-tenant escape hatch: when set, EVERY org resolves to
    // this connection string instead of consulting the `tenant` directory.
    // TenantDirectoryService refuses to honour it when NODE_ENV === 'production'
    // — without that guard a misconfigured production deploy would silently
    // route every tenant to one database.
    DEFAULT_TENANT_DATABASE_URL: z.string().min(1).optional(),
    // AES-256-GCM key (32 raw bytes, hex-encoded) for `tenant.connection_string_enc`.
    // Deliberately separate from IQPRO_CONFIG_ENCRYPTION_KEY: a database
    // connection string is a different trust tier than a payment gateway id.
    // Falls back to the IQPro key when unset so local dev keeps working.
    CONTROL_PLANE_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'must be 64 hex chars (32 bytes)').optional(),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
    BILLING_PLAN_ENV: z.enum(['dev', 'test', 'prod']),
    // Upstash Redis for rate limiting (optional - rate limiting disabled if not configured)
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    // IQPro payment processor for member payments (optional - payments disabled if not configured)
    IQPRO_CLIENT_ID: z.string().min(1).optional(),
    IQPRO_CLIENT_SECRET: z.string().min(1).optional(),
    IQPRO_SCOPE: z.string().min(1).optional(),
    IQPRO_OAUTH_URL: z.string().url().optional(),
    IQPRO_BASE_URL: z.string().url().optional(),
    IQPRO_GATEWAY_ID: z.string().min(1).optional(),
    IQPRO_WEBHOOK_SECRET: z.string().min(1).optional(),
    // AES-256-GCM key (32 raw bytes, hex-encoded → 64 chars) used to encrypt
    // per-org and platform IQPro client_secret values stored in the DB.
    // Required at decrypt time when any encrypted column has a value; optional
    // otherwise so local dev without IQPro keeps booting.
    IQPRO_CONFIG_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'must be 64 hex chars (32 bytes)').optional(),
    // Service fee % applied to every transaction (membership + taxable).
    // Passed to IQPro as a paymentAdjustment of type "ServiceFee" (percentage,
    // not flatAmount — IQPro rejects flatAmount on ServiceFee adjustments).
    SERVICE_FEE_PCT: z.string().optional(),
    // ---- Square (per-org alternative to IQPro; see types/PaymentProvider.ts) ----
    // All optional: an org only reaches these when `payment_provider='square'`,
    // and a missing value resolves to a null config — the same "not configured"
    // signal the IQPro branch already returns.
    //
    // These are env-only in B2. B3 moves per-org credentials into the encrypted
    // `organization.payment_provider_config_enc` blob, at which point these
    // become the fallback for single-tenant deployments (mirroring IQPRO_*).
    SQUARE_ACCESS_TOKEN: z.string().min(1).optional(),
    SQUARE_LOCATION_ID: z.string().min(1).optional(),
    // Also exposed to the browser as NEXT_PUBLIC_SQUARE_APPLICATION_ID — the Web
    // Payments SDK needs it client-side. It is NOT a secret.
    SQUARE_APPLICATION_ID: z.string().min(1).optional(),
    SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().min(1).optional(),
    // An enum rather than a bare string on purpose: IQPro infers its
    // environment by sniffing `baseUrl.includes('sandbox')`, which silently
    // treats a typo'd URL as production. Square states its environment.
    SQUARE_ENVIRONMENT: z.enum(['sandbox', 'production']).optional(),
    // Resend email service (optional - email sending disabled if not configured)
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: z.string().optional(),
    NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST: z.string().optional(),
    // Square's Web Payments SDK runs in the browser and needs the application
    // id to initialise. Public by design — Square treats it as an identifier,
    // not a credential. The access token stays server-only.
    NEXT_PUBLIC_SQUARE_APPLICATION_ID: z.string().optional(),
  },
  shared: {
    NODE_ENV: z.enum(['test', 'development', 'production']).optional(),
  },
  // You need to destructure all the keys manually
  runtimeEnv: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    CONTROL_DATABASE_URL: process.env.CONTROL_DATABASE_URL,
    TENANCY_MODE: process.env.TENANCY_MODE,
    DEFAULT_TENANT_DATABASE_URL: process.env.DEFAULT_TENANT_DATABASE_URL,
    CONTROL_PLANE_ENCRYPTION_KEY: process.env.CONTROL_PLANE_ENCRYPTION_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    BILLING_PLAN_ENV: process.env.BILLING_PLAN_ENV,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    IQPRO_CLIENT_ID: process.env.IQPRO_CLIENT_ID,
    IQPRO_CLIENT_SECRET: process.env.IQPRO_CLIENT_SECRET,
    IQPRO_SCOPE: process.env.IQPRO_SCOPE,
    IQPRO_OAUTH_URL: process.env.IQPRO_OAUTH_URL,
    IQPRO_BASE_URL: process.env.IQPRO_BASE_URL,
    IQPRO_GATEWAY_ID: process.env.IQPRO_GATEWAY_ID,
    IQPRO_WEBHOOK_SECRET: process.env.IQPRO_WEBHOOK_SECRET,
    IQPRO_CONFIG_ENCRYPTION_KEY: process.env.IQPRO_CONFIG_ENCRYPTION_KEY,
    SERVICE_FEE_PCT: process.env.SERVICE_FEE_PCT,
    SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN,
    SQUARE_LOCATION_ID: process.env.SQUARE_LOCATION_ID,
    SQUARE_APPLICATION_ID: process.env.SQUARE_APPLICATION_ID,
    SQUARE_WEBHOOK_SIGNATURE_KEY: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: process.env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN,
    NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST: process.env.NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST,
    NEXT_PUBLIC_SQUARE_APPLICATION_ID: process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID,
    NODE_ENV: process.env.NODE_ENV,
  },
});
