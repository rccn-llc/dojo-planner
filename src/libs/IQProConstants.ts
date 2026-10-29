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
