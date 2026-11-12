import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// =============================================================================
// CONTROL-PLANE SCHEMA
// =============================================================================
//
// These tables live in the CONTROL database — the one shared database that must
// be readable BEFORE any tenant database can be opened. They are deliberately
// kept in a separate module from `Schema.ts` so `ControlDb` can be typed against
// them alone, and so it is obvious at a glance which plane a table belongs to.
//
// The DDL for both tables is also appended to `migrations/0000_baseline.sql`,
// which means they are additionally created (empty and inert) inside every
// tenant database. That is intentional: it preserves the "one hand-authored
// baseline" invariant rather than introducing a second migration artifact.
//
// See the plan's "Unified schema" section for which columns of `organization`
// are control-plane vs tenant-plane.

/** Lifecycle of a tenant's own database. */
export const TENANT_STATUS = {
  /** Row exists, database is being created. Not yet routable. */
  PROVISIONING: 'provisioning',
  /** Normal operation. The only status that resolves. */
  ACTIVE: 'active',
  /** Data copy in flight — reads and writes must be refused for this org only. */
  MIGRATING: 'migrating',
  /** Deliberately disabled (billing, abuse, support action). */
  SUSPENDED: 'suspended',
  /** Deprovisioned. Retained for audit; never resolves. */
  ARCHIVED: 'archived',
} as const;

export type TenantStatus = (typeof TENANT_STATUS)[keyof typeof TENANT_STATUS];

export const TENANT_STATUS_VALUES = Object.values(TENANT_STATUS) as TenantStatus[];

/**
 * The connection directory: Clerk organization id → that org's database.
 *
 * This is the bootstrap table. Nothing else can be resolved until a row here is
 * read, which is why it cannot live in a tenant database.
 */
export const tenantSchema = pgTable(
  'tenant',
  {
    // The Clerk organization id — the tenancy key used everywhere in the app.
    orgId: text('org_id').primaryKey(),
    // Human label for operators. Mirrors the Clerk org name; NOT authoritative.
    displayName: text('display_name'),
    // AES-256-GCM ciphertext of the full Postgres connection string. Encrypted
    // with the same mechanism as IQPro secrets (see libs/Crypto.ts) but under a
    // separate key — a connection string is a different trust tier than a
    // gateway id.
    connectionStringEncrypted: text('connection_string_enc').notNull(),
    // e.g. 'aws-us-east-2'. Backs the per-org data-residency claim.
    region: text('region').notNull(),
    // Neon identifiers, for the provisioning and teardown scripts.
    neonProjectId: text('neon_project_id'),
    neonBranchId: text('neon_branch_id'),
    // One of TENANT_STATUS. Only 'active' resolves; see TenantDirectoryService.
    status: text('status').notNull().default(TENANT_STATUS.PROVISIONING),
    // Square merchant id, captured at OAuth time. This is the webhook routing
    // key for Square (its payloads carry merchant_id), so it must be readable
    // before any tenant database is opened.
    squareMerchantId: text('square_merchant_id'),
    // Tag of the last migration successfully applied to THIS tenant's database,
    // compared against migrations/meta/_journal.json at resolve time.
    schemaVersion: text('schema_version'),
    schemaVersionAppliedAt: timestamp('schema_version_applied_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('tenant_status_idx').on(table.status),
    index('tenant_region_idx').on(table.region),
    uniqueIndex('tenant_square_merchant_idx').on(table.squareMerchantId),
  ],
);

/**
 * Global directory mapping a provider-issued external id to a tenant, so a
 * webhook that carries no organization discriminator can still be routed.
 *
 * Needed for IQPro, whose payloads identify only a subscription or transaction
 * id. Square is NOT expected here — its webhooks carry `merchant_id`, which
 * routes directly via `tenant.square_merchant_id`.
 */
export const tenantExternalRefSchema = pgTable(
  'tenant_external_ref',
  {
    // 'provider_subscription' | 'provider_transaction' | 'provider_customer' |
    // 'saas_subscription' | 'stripe_customer'
    refType: text('ref_type').notNull(),
    refId: text('ref_id').notNull(),
    orgId: text('org_id').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    // A single provider Sale can produce TWO transaction rows sharing one
    // provider transaction id (the signup-fee split in MemberPaymentService).
    // Inserts here must therefore be ON CONFLICT DO NOTHING against this index,
    // or the second row throws inside a db.transaction and violates the
    // degrade-don't-throw invariant.
    uniqueIndex('tenant_external_ref_pk_idx').on(table.refType, table.refId),
    index('tenant_external_ref_org_idx').on(table.orgId),
  ],
);

/**
 * Lifecycle of a public sign-up from www.dojoplanner.com. The order matters:
 * each status is only ever reached from the one before it, and `failed` /
 * `expired` are terminal until an operator re-runs the GitHub job.
 */
export const SIGNUP_STATUS = {
  /** Form accepted; confirmation email sent; nothing provisioned. */
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  /** The owner clicked Confirm; a slug has been assigned. */
  CONFIRMED: 'confirmed',
  /** The GitHub `onboard-org` job was started. */
  DISPATCHED: 'dispatched',
  /** `org:create --fromRequest` is running (attempt 1 or 2). */
  PROVISIONING: 'provisioning',
  /** The org is active and the owner has been invited. */
  PROVISIONED: 'provisioned',
  /** Both attempts failed, the job died, or GitHub refused the dispatch. */
  FAILED: 'failed',
  /** The confirmation link was never used, or its email could not be sent. */
  EXPIRED: 'expired',
} as const;

export type SignupStatus = (typeof SIGNUP_STATUS)[keyof typeof SIGNUP_STATUS];

/** Statuses that still hold an owner email or slug. */
export const OPEN_SIGNUP_STATUSES: readonly SignupStatus[] = [
  SIGNUP_STATUS.AWAITING_CONFIRMATION,
  SIGNUP_STATUS.CONFIRMED,
  SIGNUP_STATUS.DISPATCHED,
  SIGNUP_STATUS.PROVISIONING,
];

/**
 * One row per public sign-up. This is the durable record of who applied and
 * what happened, and the hand-off between the app (which accepts and confirms)
 * and `org:create --fromRequest` running in GitHub Actions (which provisions).
 *
 * Control plane because no tenant database exists for the org yet.
 *
 * ⚠️ `last_error` is internal: it can hold provider messages and hosts, so it is
 * never logged by the CLI (the repo's Actions logs are public) and never
 * returned to the form.
 */
export const orgSignupRequestSchema = pgTable(
  'org_signup_request',
  {
    id: text('id').primaryKey(),
    status: text('status').notNull().default(SIGNUP_STATUS.AWAITING_CONFIRMATION),
    academyName: text('academy_name').notNull(),
    // Assigned at confirmation, when it is checked against Clerk.
    slug: text('slug'),
    ownerName: text('owner_name').notNull(),
    // Always lowercase — the unique "one open request per email" index relies on it.
    ownerEmail: text('owner_email').notNull(),
    ownerPhone: text('owner_phone').notNull(),
    // sha256 hex of the emailed token. The token itself is never stored.
    confirmTokenHash: text('confirm_token_hash').notNull(),
    confirmExpiresAt: timestamp('confirm_expires_at', { mode: 'date' }).notNull(),
    confirmedAt: timestamp('confirmed_at', { mode: 'date' }),
    // Confirmation emails sent for this request. Capped, so resubmitting the
    // same address cannot be used to flood someone's inbox.
    confirmEmailsSent: integer('confirm_emails_sent').notNull().default(0),
    // sha256 hex of the token the form polls with. It can only READ status.
    statusTokenHash: text('status_token_hash').notNull(),
    // A `planSteps` step name, written by the CLI before each step.
    currentStep: text('current_step'),
    attempt: integer('attempt').notNull().default(0),
    heartbeatAt: timestamp('heartbeat_at', { mode: 'date' }),
    clerkOrgId: text('clerk_org_id'),
    workflowRunUrl: text('workflow_run_url'),
    lastError: text('last_error'),
    provisionedAt: timestamp('provisioned_at', { mode: 'date' }),
    // Set in the same guarded UPDATE that claims the alert, so it is sent once.
    alertSentAt: timestamp('alert_sent_at', { mode: 'date' }),
    submitIp: text('submit_ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    uniqueIndex('org_signup_request_confirm_token_idx').on(table.confirmTokenHash),
    uniqueIndex('org_signup_request_status_token_idx').on(table.statusTokenHash),
    // At most one OPEN request per owner email. `owner_email` is always stored
    // lowercased (SignupRequestService), so a plain column index is
    // case-insensitive in effect — and unlike `lower(...)` it is a column the
    // test suites' drizzle-orm mocks can describe.
    uniqueIndex('org_signup_request_open_email_idx')
      .on(table.ownerEmail)
      .where(sql`${table.status} IN ('awaiting_confirmation', 'confirmed', 'dispatched', 'provisioning')`),
    // A slug, once assigned, is reserved unless its request expired.
    uniqueIndex('org_signup_request_slug_idx')
      .on(table.slug)
      .where(sql`${table.status} <> 'expired'`),
    index('org_signup_request_ip_created_idx').on(table.submitIp, table.createdAt),
    index('org_signup_request_email_created_idx').on(table.ownerEmail, table.createdAt),
    index('org_signup_request_status_idx').on(table.status),
  ],
);

export type OrgSignupRequest = typeof orgSignupRequestSchema.$inferSelect;
