/**
 * Pure date/billing-cycle helpers used by the payment service AND the seed
 * script. Kept in `utils/` (not `services/`) so it has no I/O or env-var
 * dependencies — importing this module from the seed must not pull in Env,
 * DB, IQPro, or any service-layer code.
 */

export type SubscriptionFrequency = 'weekly' | 'monthly' | 'semi-annual' | 'annual';

/**
 * Map a free-form plan frequency string to the canonical
 * `SubscriptionFrequency` enum, or null for "no recurring cycle" (one-time,
 * trial, punchcard). Accepts the common variants (Monthly / monthly,
 * semi-annually / semi-annual, yearly / annual).
 */
export function normalizeFrequency(frequency: string | null | undefined): SubscriptionFrequency | null {
  if (!frequency) {
    return null;
  }
  const lower = frequency.toLowerCase();
  switch (lower) {
    case 'weekly':
      return 'weekly';
    case 'monthly':
      return 'monthly';
    case 'semi-annual':
    case 'semi-annually':
    case 'semiannual':
      return 'semi-annual';
    case 'annual':
    case 'annually':
    case 'yearly':
      return 'annual';
    case 'none':
    case 'one-time':
    case 'onetime':
    default:
      return null;
  }
}

/**
 * Add N months to a date, clamping the day-of-month to the last valid day
 * of the target month. Without clamping, JS's `setMonth` overflows — e.g.
 * Jan 31 + 1 month becomes Mar 3 (because Feb has 28 days). For a billing
 * date, we want the last day of Feb instead. Mirrors IQPro's `daysOfMonth`
 * behavior for end-of-month subscriptions.
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const targetDay = result.getDate();
  // Move to the 1st of the target month, then clamp to the last day if the
  // original day-of-month doesn't exist there.
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return result;
}

/**
 * Compute the next payment date from a start date and recurring frequency.
 * Uses real calendar math (months & weeks), not 30-day approximations, so
 * the date lands on the same day-of-month for monthly / semi-annual /
 * annual, mirroring IQPro's `daysOfMonth` subscription schedule.
 */
export function computeNextPaymentDate(from: Date, frequency: SubscriptionFrequency | null): Date {
  const next = new Date(from);
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      return next;
    case 'monthly':
      return addMonths(next, 1);
    case 'semi-annual':
      return addMonths(next, 6);
    case 'annual':
      return addMonths(next, 12);
    default:
      // null / one-time — no recurring cycle. Caller shouldn't ask, but
      // returning `from` is the safe default (no shift).
      return next;
  }
}
