/**
 * IQPro reference ids. Kept out of `libs/IQPro.ts` (which tests mock wholesale)
 * so payload builders always see the real values.
 */

// Read from IQPro's own `/api/constants/billingperiod` and `/api/constants/units`
// (sandbox, 2026-10). ⚠️ The unit ids the app used to send (1 / 3 / 4 / 6,
// believed to be Item / Month / Year / Week) are actually Acre / Alcoholic
// strength by volume / Ampere / Are — IQPro read every existing charge back as
// "Acre". Always use these names, never a bare number.

export const IQPRO_BILLING_PERIOD = {
  DAILY: 1,
  WEEKLY: 2,
  MONTHLY: 4,
  YEARLY: 6,
  /** Native semi-annual. Requires `monthsOfYear` + `daysOfMonth` in the schedule. */
  SIX_MONTHS: 7,
} as const;

export const IQPRO_UNIT = {
  DAYS: 36,
  HALF_YEAR: 69,
  MONTHS: 120,
  /** Generic "each" for one-off Sale line items (fees, store, events). */
  PIECE: 138,
  WEEKS: 191,
  YEARS: 193,
} as const;

/**
 * `subscriptionStatusId`. IQPro has no constants endpoint for these; the names
 * come from the sandbox's own read-backs and validation errors (2026-10).
 *
 * ⚠️ Every subscription both apps created used to send 1 believing it meant
 * Active — it is DRAFT, which never bills. Create with SCHEDULED: IQPro
 * validates the status against the dates and rejects ACTIVE (and TRIALING
 * without a trial) at creation with "status expected is Scheduled"; it moves
 * the subscription on by itself once billing starts.
 */
export const IQPRO_SUBSCRIPTION_STATUS = {
  DRAFT: 1,
  SCHEDULED: 2,
  TRIALING: 3,
  ACTIVE: 4,
  OVERDUE: 5,
  PAUSED: 6,
  CANCELLED: 7,
} as const;
