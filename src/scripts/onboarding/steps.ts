/**
 * Onboarding state: what has already been done for an organization, so a
 * re-run after a failure resumes instead of repeating (or duplicating) work.
 *
 * Every probe takes a `Queryable` (a `pg.Pool` satisfies it), so the logic is
 * testable without a database.
 */

import { randomUUID } from 'node:crypto';
import { TENANT_STATUS } from '../../models/ControlSchema';
import { orgScopePredicate, TENANT_TABLES } from '../../services/TenantDataMap';

export type Queryable = {
  query: <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;
};

export type TenantRow = { status: string; connectionStringEncrypted: string };

export async function readTenantRow(control: Queryable, orgId: string): Promise<TenantRow | null> {
  const { rows } = await control.query<{ status: string; connection_string_enc: string }>(
    'SELECT status, connection_string_enc FROM tenant WHERE org_id = $1',
    [orgId],
  );
  const row = rows[0];
  return row ? { status: row.status, connectionStringEncrypted: row.connection_string_enc } : null;
}

export async function readAllTenantRows(control: Queryable): Promise<{ orgId: string; connectionStringEncrypted: string }[]> {
  const { rows } = await control.query<{ org_id: string; connection_string_enc: string }>(
    'SELECT org_id, connection_string_enc FROM tenant',
  );
  return rows.map(r => ({ orgId: r.org_id, connectionStringEncrypted: r.connection_string_enc }));
}

/** Rows this org owns in a tenant database — the same selection activation checks. */
export async function countOrgRows(tenant: Queryable, orgId: string): Promise<number> {
  let total = 0;
  for (const entry of TENANT_TABLES) {
    const { rows } = await tenant.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "${entry.table}" WHERE ${orgScopePredicate(entry)}`,
      [orgId],
    );
    total += Number(rows[0]?.n ?? 0);
  }
  return total;
}

export async function hasPaymentConfig(tenant: Queryable, orgId: string): Promise<boolean> {
  const { rows } = await tenant.query<{ enc: string | null }>(
    'SELECT payment_provider_config_enc AS enc FROM organization WHERE id = $1',
    [orgId],
  );
  return Boolean(rows[0]?.enc);
}

/** The provider an org's saved credentials belong to, or null when none are saved. */
export async function readConfiguredProvider(tenant: Queryable, orgId: string): Promise<string | null> {
  const { rows } = await tenant.query<{ provider: string; enc: string | null }>(
    'SELECT payment_provider AS provider, payment_provider_config_enc AS enc FROM organization WHERE id = $1',
    [orgId],
  );
  return rows[0]?.enc ? rows[0].provider : null;
}

/**
 * Upsert, never a bare UPDATE: an UPDATE against a missing organization row
 * matches nothing and reports success.
 */
export async function writePaymentConfig(
  tenant: Queryable,
  orgId: string,
  provider: 'iqpro' | 'square',
  encryptedBlob: string,
): Promise<void> {
  // The provider column and the blob are written together, so they can never
  // disagree — the same invariant PaymentProviderConfigService keeps.
  await tenant.query(
    `INSERT INTO organization (id, payment_provider, payment_provider_config_enc)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE
       SET payment_provider = EXCLUDED.payment_provider,
           payment_provider_config_enc = EXCLUDED.payment_provider_config_enc,
           updated_at = now()`,
    [orgId, provider, encryptedBlob],
  );
}

const TRIAL_DAYS = 30;

/**
 * Make sure the org has its CONTROL-plane billing row, with the same honest
 * synthetic trial `seed.ts --referenceDataOnly` writes. Seed only writes it
 * when it seeds; a resumed run that skips seeding (data already present, e.g.
 * seeded against another control plane) would otherwise leave the org with no
 * subscription row at all. Never touches an org that already has a billing
 * status, so a real subscription is never overwritten.
 *
 * Period end is in MILLISECONDS, as everywhere else `saas_current_period_end`
 * is written.
 */
export async function ensureControlTrial(
  control: Queryable,
  orgId: string,
  ownerClerkUserId: string | undefined,
  now: number = Date.now(),
): Promise<{ written: boolean; status: string | null }> {
  const { rows } = await control.query<{ status: string | null }>(
    'SELECT saas_subscription_status AS status FROM organization WHERE id = $1',
    [orgId],
  );
  const existing = rows[0]?.status ?? null;
  if (existing) {
    return { written: false, status: existing };
  }
  await control.query(
    `INSERT INTO organization (id, saas_subscription_status, saas_current_period_end, saas_responsible_clerk_user_id)
     VALUES ($1, 'trial', $2, $3)
     ON CONFLICT (id) DO UPDATE
       SET saas_subscription_status = 'trial',
           saas_current_period_end = EXCLUDED.saas_current_period_end,
           saas_responsible_clerk_user_id = EXCLUDED.saas_responsible_clerk_user_id,
           updated_at = now()
       WHERE organization.saas_subscription_status IS NULL`,
    [orgId, now + TRIAL_DAYS * 24 * 60 * 60 * 1000, ownerClerkUserId ?? `seed_owner_user_${randomUUID()}`],
  );
  return { written: true, status: 'trial' };
}

export type OnboardState = {
  clerkOrgExists: boolean;
  ownerAccessGranted: boolean;
  databaseExists: boolean;
  tenantStatus: string | null;
  orgRowCount: number;
  paymentSaved: boolean;
  paymentRequested: boolean;
};

export type StepId = 'clerk-org' | 'owner' | 'database' | 'provision' | 'seed' | 'payment' | 'activate' | 'verify';
export type PlannedStep = { id: StepId; label: string; done: boolean };

/**
 * The fixed order, annotated with what is already done. Order is the safety
 * property: payment credentials are written BEFORE activation so an org is
 * never live with a half-configured processor, and activation comes last
 * because `cutoverTenant --activate-only` refuses an empty database anyway.
 */
export function planSteps(state: OnboardState): PlannedStep[] {
  const provisioned = state.tenantStatus !== null;
  const steps: PlannedStep[] = [
    { id: 'clerk-org', label: 'Create Clerk organization', done: state.clerkOrgExists },
    { id: 'owner', label: 'Grant academy owner access', done: state.ownerAccessGranted },
    { id: 'database', label: 'Create tenant database', done: state.databaseExists },
    { id: 'provision', label: 'Register database + apply schema', done: provisioned },
    { id: 'seed', label: 'Seed starter data', done: state.orgRowCount > 0 },
  ];
  if (state.paymentRequested) {
    steps.push({ id: 'payment', label: 'Save payment credentials', done: state.paymentSaved });
  }
  steps.push(
    { id: 'activate', label: 'Activate tenant', done: state.tenantStatus === TENANT_STATUS.ACTIVE },
    { id: 'verify', label: 'Verify', done: false },
  );
  return steps;
}
