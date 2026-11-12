import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/libs/CronAuth';
import { logger } from '@/libs/Logger';
import { alertSignupFailure } from '@/services/SignupAlertService';
import { listStuckSignups, listUnalertedFailedSignups, settleSignupTimeouts } from '@/services/SignupRequestService';

/**
 * Daily (vercel.json — daily works on every Vercel plan; hourly needs Pro): the backstop for sign-up failures nobody was polling
 * for — the owner closed the form, so no status read noticed. Fails stuck
 * requests, then reports every failure not yet sent to Sentry. Each report is claimed
 * in one guarded UPDATE, so this cannot double-send with a status read.
 */
export const GET = async (request: Request) => {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let failedStuck = 0;
  for (const row of await listStuckSignups()) {
    const { becameFailed } = await settleSignupTimeouts(row);
    if (becameFailed) {
      failedStuck += 1;
    }
  }

  let alerted = 0;
  for (const row of await listUnalertedFailedSignups()) {
    if (await alertSignupFailure(row.id)) {
      alerted += 1;
    }
  }

  logger.info('[Cron] Sign-up alert sweep complete', { failedStuck, alerted });
  return NextResponse.json({ failedStuck, alerted });
};
