import { describe, expect, it } from 'vitest';
import { formatExpiration, normalizeExpiration } from './CardExpiration';

describe('formatExpiration', () => {
  it('formats month + 4-digit or 2-digit year as MM/YY', () => {
    expect(formatExpiration(3, 2029)).toBe('03/29');
    expect(formatExpiration(12, 30)).toBe('12/30');
    expect(formatExpiration(1, 2100)).toBe('01/00');
  });

  it.each([[0, 2029], [13, 2029], [undefined, 2029], [3, undefined], [3, 0]])('returns undefined for %s/%s', (m, y) => {
    expect(formatExpiration(m as number | undefined, y as number | undefined)).toBeUndefined();
  });
});

describe('normalizeExpiration', () => {
  it.each([
    ['03/29', '03/29'],
    ['3/29', '03/29'],
    ['0329', '03/29'],
    ['03/2029', '03/29'],
    ['03-29', '03/29'],
    ['032029', '03/29'],
    ['2029-03', '03/29'],
    ['2029-03-31T00:00:00Z', '03/29'],
    [' 12/30 ', '12/30'],
  ])('normalizes %s → %s', (raw, expected) => {
    expect(normalizeExpiration(raw)).toBe(expected);
  });

  it.each([null, undefined, '', 'soon', '13/29', '1/2/3'])('returns undefined for %s', (raw) => {
    expect(normalizeExpiration(raw)).toBeUndefined();
  });
});
