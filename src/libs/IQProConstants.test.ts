import { describe, expect, it } from 'vitest';
import { IQPRO_BILLING_PERIOD, IQPRO_SUBSCRIPTION_STATUS, IQPRO_UNIT } from './IQProConstants';

// Values read from IQPro's /api/constants/billingperiod and /api/constants/units
// (sandbox). A change here changes what every IQPro charge and subscription
// says it is billing — e.g. the old 1/3/4/6 rendered as Acre/Ampere/Are.
describe('IQPro constants', () => {
  it('billing periods match /api/constants/billingperiod', () => {
    expect(IQPRO_BILLING_PERIOD).toEqual({ DAILY: 1, WEEKLY: 2, MONTHLY: 4, YEARLY: 6, SIX_MONTHS: 7 });
  });

  it('units match /api/constants/units', () => {
    expect(IQPRO_UNIT).toEqual({ DAYS: 36, HALF_YEAR: 69, MONTHS: 120, PIECE: 138, WEEKS: 191, YEARS: 193 });
  });

  it('subscription statuses: 1 is DRAFT (never bills), new subscriptions are SCHEDULED', () => {
    expect(IQPRO_SUBSCRIPTION_STATUS).toEqual({ DRAFT: 1, SCHEDULED: 2, TRIALING: 3, ACTIVE: 4, OVERDUE: 5, PAUSED: 6, CANCELLED: 7 });
  });
});
