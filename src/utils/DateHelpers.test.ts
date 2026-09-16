import { describe, expect, it } from 'vitest';
import { formatDateOnly, parseDateOnly, parseDateOnlyOrNull } from './DateHelpers';

describe('parseDateOnly', () => {
  it('parses a date-only string to UTC midnight', () => {
    const d = parseDateOnly('2026-03-14');

    expect(d.toISOString()).toBe('2026-03-14T00:00:00.000Z');
  });

  it('preserves the calendar day regardless of the host timezone', () => {
    // The regression this helper exists for: a bare `new Date('2026-03-14')`
    // is UTC midnight, so reading it back with LOCAL getters west of UTC
    // yields March 13. Reading with UTC getters must always give March 14.
    const d = parseDateOnly('2026-03-14');

    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2); // zero-based March
    expect(d.getUTCDate()).toBe(14);
  });

  it('handles a leap day', () => {
    expect(parseDateOnly('2024-02-29').toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it('handles a date inside a US DST spring-forward transition', () => {
    // 2026-03-08 is the US spring-forward date. A local-midnight parse can
    // land on a non-existent or shifted instant; UTC anchoring cannot.
    expect(parseDateOnly('2026-03-08').toISOString()).toBe('2026-03-08T00:00:00.000Z');
  });

  it('handles a date inside a US DST fall-back transition', () => {
    expect(parseDateOnly('2026-11-01').toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('returns an invalid Date for malformed input', () => {
    expect(Number.isNaN(parseDateOnly('not-a-date').getTime())).toBe(true);
  });

  it('rejects an impossible calendar day rather than rolling it over', () => {
    // `new Date('2026-02-30T00:00:00Z')` does not fail — it silently becomes
    // March 2. A wrong day is worse than a rejected one.
    expect(Number.isNaN(parseDateOnly('2026-02-30').getTime())).toBe(true);
    expect(Number.isNaN(parseDateOnly('2025-02-29').getTime())).toBe(true);
    expect(Number.isNaN(parseDateOnly('2026-04-31').getTime())).toBe(true);
    expect(Number.isNaN(parseDateOnly('2026-13-01').getTime())).toBe(true);
  });

  it('rejects anything that is not exactly YYYY-MM-DD', () => {
    expect(Number.isNaN(parseDateOnly('2026-3-14').getTime())).toBe(true);
    expect(Number.isNaN(parseDateOnly('2026-03-14T12:00:00Z').getTime())).toBe(true);
    expect(Number.isNaN(parseDateOnly('2026-03').getTime())).toBe(true);
    expect(Number.isNaN(parseDateOnly(' 2026-03-14 ').getTime())).toBe(true);
  });
});

describe('parseDateOnlyOrNull', () => {
  it('returns null for empty string, null and undefined', () => {
    expect(parseDateOnlyOrNull('')).toBeNull();
    expect(parseDateOnlyOrNull(null)).toBeNull();
    expect(parseDateOnlyOrNull(undefined)).toBeNull();
  });

  it('returns null for a malformed value instead of an Invalid Date', () => {
    expect(parseDateOnlyOrNull('2026-99-99')).toBeNull();
  });

  it('returns null for a roll-over date, per its documented contract', () => {
    expect(parseDateOnlyOrNull('2026-02-30')).toBeNull();
    expect(parseDateOnlyOrNull('2026-04-31')).toBeNull();
  });

  it('accepts a real leap day', () => {
    expect(parseDateOnlyOrNull('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it('parses a valid value', () => {
    expect(parseDateOnlyOrNull('2026-03-14')?.toISOString()).toBe('2026-03-14T00:00:00.000Z');
  });
});

describe('formatDateOnly', () => {
  it('formats a UTC-midnight Date back to its calendar day', () => {
    expect(formatDateOnly(new Date('2026-03-14T00:00:00Z'))).toBe('2026-03-14');
  });

  it('zero-pads single-digit months and days', () => {
    expect(formatDateOnly(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-05');
  });

  it('reads the UTC day, not the local day, for a late-UTC timestamp', () => {
    // 23:30Z on the 14th is still the 14th in UTC even though it is the 15th
    // in eastern-hemisphere local time.
    expect(formatDateOnly(new Date('2026-03-14T23:30:00Z'))).toBe('2026-03-14');
  });

  it('round-trips with parseDateOnly', () => {
    for (const s of ['2024-02-29', '2026-03-08', '2026-11-01', '2026-12-31']) {
      expect(formatDateOnly(parseDateOnly(s))).toBe(s);
    }
  });
});
