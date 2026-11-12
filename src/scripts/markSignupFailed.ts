/**
 * The `onboard-org` workflow's failure step: mark a sign-up request FAILED.
 *
 * `org:create` records its own final failure, but not when the job dies before
 * it gets that far (checkout, `npm ci`, a cancelled run). This makes sure the
 * owner's form stops showing "Setting up…" and the app reports it to Sentry.
 *
 * ⚠️ Runs in a PUBLIC Actions log: it prints the request id and nothing else.
 *
 * Usage:
 *   CONTROL_DATABASE_URL=... npx tsx src/scripts/markSignupFailed.ts --request=<id> [--runUrl=<url>]
 */

import type { Queryable } from './onboarding/steps';
import process from 'node:process';
import { Pool } from 'pg';
import { recordSignupFailure } from './onboarding/signupRequests';
import { maskForCi } from './onboarding/unattended';

export const JOB_FAILED_MESSAGE = 'The GitHub onboard-org job failed before org:create recorded an error (checkout, npm ci, a cancelled run…) — see the run.';

/**
 * Keep org:create's own error when it recorded one; otherwise explain that the
 * job failed around it.
 */
export async function markSignupFailed(
  control: Queryable,
  requestId: string,
  runUrl: string | null,
  retries = 1,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { rows } = await control.query<{ last_error: string | null }>(
        'SELECT last_error FROM org_signup_request WHERE id = $1',
        [requestId],
      );
      const existing = rows[0]?.last_error ?? null;
      await recordSignupFailure(control, requestId, existing ?? JOB_FAILED_MESSAGE, { final: true, workflowRunUrl: runUrl });
      return;
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

type ClosablePool = Queryable & { end: () => Promise<void> };

/** The script body, with its inputs injectable for tests. */
export async function runMarkSignupFailed(
  argv: readonly string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
  makePool: (connectionString: string) => ClosablePool = connectionString => new Pool({ connectionString, max: 1 }),
): Promise<void> {
  const requestId = argv.find(a => a.startsWith('--request='))?.slice('--request='.length);
  const runUrl = argv.find(a => a.startsWith('--runUrl='))?.slice('--runUrl='.length) || null;
  if (!requestId) {
    throw new Error('Usage: markSignupFailed.ts --request=<id> [--runUrl=<url>]');
  }
  const controlUrl = env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    throw new Error('CONTROL_DATABASE_URL is not set.');
  }
  // Mask the control URL (and its host and password) before anything could print it.
  maskForCi(true, [controlUrl]);

  const control = makePool(controlUrl);
  try {
    await markSignupFailed(control, requestId, runUrl);
    console.info(`Sign-up request ${requestId} marked failed.`);
  } finally {
    await control.end();
  }
}

if (process.argv[1]?.includes('markSignupFailed')) {
  runMarkSignupFailed().catch(() => {
    // No error text: it could carry the connection string or a host.
    console.error('Could not mark the sign-up request failed. The app will fail it after 15 minutes without progress.');
    process.exit(1);
  });
}
