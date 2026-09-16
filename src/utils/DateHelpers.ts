import { format as formatFns, parse as parseFns } from 'date-fns';

// Shared date-only helpers.
//
// A "date-only" value in this app is a calendar day with no meaningful time
// component: an event session date, a membership start date, an early-bird
// deadline. Those are stored as `YYYY-MM-DD` strings in form state and as
// timestamps in the DB.
//
// The trap these helpers exist to close: `new Date('2026-03-14')` is parsed by
// the spec as UTC midnight, so west of UTC it reads back as March 13. Several
// call sites hand-rolled `new Date(`${s}T00:00:00Z`)` to fix that while others
// used the bare form and shipped an off-by-one. Four separate copies of the
// Date -> string direction also existed. Both directions now live here, and
// both are anchored to UTC so a round trip is lossless.
//
// NOTE: these are deliberately NOT for wall-clock moments the user picked in
// their own timezone (e.g. a coupon's expiry instant). Those must stay local —
// see `combineDateTime` in `couponDataTransformers.ts`.

/** Parse a `YYYY-MM-DD` date-only string into a Date at UTC midnight. */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/**
 * Parse a `YYYY-MM-DD` string, returning `null` for empty/malformed input
 * instead of an `Invalid Date`. Use when the value comes from an optional
 * field that may be blank.
 */
export function parseDateOnlyOrNull(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = parseDateOnly(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Format a Date as a `YYYY-MM-DD` date-only string, read in UTC. */
export function formatDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a Date as `YYYY-MM-DD` using its LOCAL calendar fields.
 *
 * Use this only when the Date was built from local getters/setters (e.g.
 * "the next Tuesday from today"). Formatting such a Date with
 * `formatDateOnly` would read UTC fields and can land on the previous or
 * next day depending on the host offset.
 */
export function formatDateOnlyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a `yyyy-MM-dd` string into a Date at LOCAL midnight.
 *
 * Counterpart to `formatDateOnlyLocal`. Use this for values a calendar UI
 * renders to the user, so the day they see is the day in their timezone.
 * Returns `undefined` for empty or malformed input rather than an
 * `Invalid Date`, so a half-typed value cannot break a picker.
 */
export function parseDateOnlyLocal(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(year, month - 1, day);
  // Reject roll-overs such as 2026-02-30, which the Date constructor would
  // silently turn into March 2.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

// ── Typed date-entry display format ─────────────────────────────────────────
//
// Every date FIELD in the app is typed as MM/DD/YYYY (see `DateTextInput`),
// which is distinct from the `yyyy-MM-dd` used for form state and the wire.
// These two live here rather than in the component file so the component
// exports only a component.

export const DATE_DISPLAY_FORMAT = 'MM/dd/yyyy';
export const DATE_DISPLAY_PLACEHOLDER = 'MM/DD/YYYY';

/** Format a Date for display in a typed date field. Blank for no/invalid date. */
export function dateToDisplay(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }
  return formatFns(date, DATE_DISPLAY_FORMAT);
}

/**
 * Parse an MM/DD/YYYY string typed by a user.
 *
 * Returns the Date only when the string parses AND round-trips to the same
 * text: date-fns accepts "02/30/2020" and rolls it to March 1, which must be
 * rejected as malformed rather than silently accepted as a different day.
 */
export function parseDisplay(text: string): Date | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = parseFns(trimmed, DATE_DISPLAY_FORMAT, new Date());
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  if (formatFns(parsed, DATE_DISPLAY_FORMAT) !== trimmed) {
    return null;
  }
  return parsed;
}
