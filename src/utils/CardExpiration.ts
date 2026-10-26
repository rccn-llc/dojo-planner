/**
 * Card expiration in the one display format the app stores: 'MM/YY'.
 *
 * Providers disagree on the shape — IQPro reports a string (seen as 'MM/YY',
 * 'MMYY', 'MM/YYYY' and ISO dates across endpoints), Square reports numeric
 * `exp_month` / `exp_year`. Normalizing at the boundary is what lets the
 * payment-method reconcile compare two values and decide a card changed.
 */

/** 'MM/YY' from a month (1–12) and a 2- or 4-digit year; undefined when invalid. */
export function formatExpiration(month: number | undefined, year: number | undefined): string | undefined {
  if (!month || !year || month < 1 || month > 12) {
    return undefined;
  }
  const yy = String(year % 100).padStart(2, '0');
  return `${String(month).padStart(2, '0')}/${yy}`;
}

/** Normalize a provider's expiration string to 'MM/YY'; undefined when unrecognized. */
export function normalizeExpiration(raw: string | null | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const value = raw.trim();

  // ISO date: YYYY-MM[-DD...]
  const iso = /^(\d{4})-(\d{2})/.exec(value);
  if (iso) {
    return formatExpiration(Number(iso[2]), Number(iso[1]));
  }

  // MM/YY, MM/YYYY, MM-YY, MMYY, MMYYYY
  const mmyy = /^(\d{1,2})[/-]?(\d{2}|\d{4})$/.exec(value);
  if (mmyy) {
    return formatExpiration(Number(mmyy[1]), Number(mmyy[2]));
  }

  return undefined;
}
