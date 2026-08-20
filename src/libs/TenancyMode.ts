import { Env } from './Env';

/**
 * The single authority on whether the control plane and tenant data are
 * physically separate databases.
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 *
 * This predicate used to be re-derived from `CONTROL_DATABASE_URL !==
 * DATABASE_URL` in five places across four files: tenant auto-registration,
 * shared-database sentinel handling, control-pool sizing, webhook bootstrap
 * routing, and connection-string resolution. Setting one environment variable
 * therefore flipped all five at once, with no staging and no test coverage —
 * and one of them (the webhook bootstrap) fails SILENTLY, turning payment
 * status updates into no-ops rather than errors.
 *
 * Now the mode is explicit and the connection string is just a connection
 * string. A deployment can populate `CONTROL_DATABASE_URL`, migrate it, and
 * verify it while still serving traffic in `shared` mode; flipping to `split`
 * is a separate, reversible decision.
 *
 * ── Defaulting ──────────────────────────────────────────────────────────────
 *
 * Unset means `shared`. That is the safe default: it is what every deployment
 * runs today, and a missing variable must never silently separate the planes.
 */
export type TenancyMode = 'shared' | 'split';

export function tenancyMode(): TenancyMode {
  return Env.TENANCY_MODE ?? 'shared';
}

/**
 * True while the control plane and tenant data live in one physical database.
 *
 * Prefer this over comparing connection strings: the two can legitimately be
 * equal in `split` mode during a staged rollout (control populated, not yet
 * cut over), and unequal in `shared` mode (control migrated ahead of the flip).
 */
export function sharesTenantDatabase(): boolean {
  return tenancyMode() === 'shared';
}

/**
 * Guard for operations that are unsafe once the planes are separate — for
 * example `registerTenants`, which re-encrypts DATABASE_URL as EVERY tenant's
 * connection string and would overwrite real per-org strings with one shared
 * one.
 */
export function assertSharedMode(operation: string): void {
  if (!sharesTenantDatabase()) {
    throw new Error(
      `[Tenancy] ${operation} is only safe while TENANCY_MODE=shared. `
      + 'The control plane is now separate, so each organization must be '
      + 'provisioned with its own connection string instead.',
    );
  }
}
