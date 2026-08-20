import { beforeEach, describe, expect, it } from 'vitest';
import { resolveTargets } from './migrateTenants';

const TENANT = 'postgresql://u:p@tenant-host/db';
const CONTROL = 'postgresql://u:p@control-host/db';

describe('resolveTargets', () => {
  beforeEach(() => {
    delete process.env.CONTROL_DATABASE_URL;
    process.env.DATABASE_URL = TENANT;
  });

  it('migrates only the shared database when no control plane is configured', () => {
    expect(resolveTargets()).toEqual([
      { orgId: '(shared database)', connectionString: TENANT },
    ]);
  });

  it('migrates the control plane FIRST when it is a distinct database', () => {
    // Order matters: the tenant directory lives in the control plane, and A3's
    // fan-out reads it to discover every other target.
    process.env.CONTROL_DATABASE_URL = CONTROL;

    expect(resolveTargets().map(t => t.orgId)).toEqual([
      '(control plane)',
      '(shared database)',
    ]);
  });

  it('does not migrate the same database twice when both point at one URL', () => {
    // The staged-rollout default: CONTROL_DATABASE_URL may be set to the same
    // database long before TENANCY_MODE flips.
    process.env.CONTROL_DATABASE_URL = TENANT;

    expect(resolveTargets()).toHaveLength(1);
  });

  it('throws when DATABASE_URL is missing rather than silently migrating nothing', () => {
    delete process.env.DATABASE_URL;

    expect(() => resolveTargets()).toThrow(/DATABASE_URL is not set/);
  });
});
