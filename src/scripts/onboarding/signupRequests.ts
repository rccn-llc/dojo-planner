/**
 * The CLI side of `org_signup_request` (control plane). The app side is
 * `services/SignupRequestService.ts`; this module never imports `@/libs/Env`
 * or drizzle, so `org:create` can run it with only a `pg.Pool`.
 *
 * Every write is guarded on the current status, mirroring the app: a run can
 * never resurrect a request the app already expired, or overwrite one that
 * already finished.
 */

import type { Queryable } from './steps';

export type SignupRequestRow = {
  id: string;
  status: string;
  academyName: string;
  slug: string | null;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  clerkOrgId: string | null;
};

export async function readSignupRequest(control: Queryable, id: string): Promise<SignupRequestRow | null> {
  const { rows } = await control.query<{
    id: string;
    status: string;
    academy_name: string;
    slug: string | null;
    owner_name: string;
    owner_email: string;
    owner_phone: string;
    clerk_org_id: string | null;
  }>(
    `SELECT id, status, academy_name, slug, owner_name, owner_email, owner_phone, clerk_org_id
       FROM org_signup_request WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  return row
    ? {
        id: row.id,
        status: row.status,
        academyName: row.academy_name,
        slug: row.slug,
        ownerName: row.owner_name,
        ownerEmail: row.owner_email,
        ownerPhone: row.owner_phone,
        clerkOrgId: row.clerk_org_id,
      }
    : null;
}

// Timestamps are written as UTC wall time — the convention drizzle's `mode:
// 'date'` columns use — whatever the database session's time zone is.

/** Statuses a run may (re)start from. `failed` is included so Re-run works. */
const STARTABLE = ['dispatched', 'provisioning', 'failed'];

/**
 * Claim the request for this run. Returns false when it is not startable
 * (still awaiting confirmation, expired, or already provisioned).
 *
 * A re-run of a failed request clears `alert_sent_at`, so if it fails again
 * the team hears about it again.
 */
export async function markSignupProvisioning(
  control: Queryable,
  id: string,
  attempt: number,
  workflowRunUrl: string | null,
): Promise<boolean> {
  const { rows } = await control.query<{ id: string }>(
    `UPDATE org_signup_request
        SET status = 'provisioning',
            attempt = $2,
            workflow_run_url = COALESCE($3, workflow_run_url),
            alert_sent_at = CASE WHEN status = 'failed' THEN NULL ELSE alert_sent_at END,
            heartbeat_at = (now() AT TIME ZONE 'utc'),
            updated_at = (now() AT TIME ZONE 'utc')
      WHERE id = $1 AND status = ANY($4::text[])
      RETURNING id`,
    [id, attempt, workflowRunUrl, STARTABLE],
  );
  return rows.length > 0;
}

/** Before each step: what the owner's form shows, and proof of life. */
export async function reportSignupStep(control: Queryable, id: string, step: string): Promise<void> {
  await control.query(
    `UPDATE org_signup_request
        SET current_step = $2, heartbeat_at = (now() AT TIME ZONE 'utc'), updated_at = (now() AT TIME ZONE 'utc')
      WHERE id = $1 AND status = 'provisioning'`,
    [id, step],
  );
}

/** Recorded the moment Clerk returns it, so a resumed run can prove the org is its own. */
export async function recordSignupClerkOrg(control: Queryable, id: string, clerkOrgId: string): Promise<void> {
  await control.query(
    `UPDATE org_signup_request SET clerk_org_id = $2, updated_at = (now() AT TIME ZONE 'utc') WHERE id = $1 AND clerk_org_id IS NULL`,
    [id, clerkOrgId],
  );
}

/** `note` (e.g. a readiness warning) is kept in `last_error` for the team; null clears it. */
export async function markSignupProvisioned(control: Queryable, id: string, note: string | null = null): Promise<void> {
  await control.query(
    `UPDATE org_signup_request
        SET status = 'provisioned', provisioned_at = (now() AT TIME ZONE 'utc'), heartbeat_at = (now() AT TIME ZONE 'utc'), last_error = $2, updated_at = (now() AT TIME ZONE 'utc')
      WHERE id = $1 AND status = 'provisioning'`,
    [id, note?.slice(0, 4000) ?? null],
  );
}

/**
 * Record why a run failed. A non-final failure (attempt 1, which the workflow
 * retries) keeps the request `provisioning` so the owner's form keeps showing
 * progress; only the final failure sets `failed`.
 */
export async function recordSignupFailure(
  control: Queryable,
  id: string,
  error: string,
  options: { final: boolean; workflowRunUrl?: string | null },
): Promise<void> {
  await control.query(
    `UPDATE org_signup_request
        SET last_error = $2,
            status = CASE WHEN $3 THEN 'failed' ELSE status END,
            workflow_run_url = COALESCE($4, workflow_run_url),
            heartbeat_at = (now() AT TIME ZONE 'utc'),
            updated_at = (now() AT TIME ZONE 'utc')
      WHERE id = $1 AND status IN ('confirmed', 'dispatched', 'provisioning')`,
    [id, error.slice(0, 4000), options.final, options.workflowRunUrl ?? null],
  );
}
