import { describe, expect, it } from 'vitest';
import { fromMinorUnits, squareBaseUrl, toMinorUnits } from './Square';

describe('money conversion', () => {
  // This codebase is float dollars; Square is integer minor units. Every
  // crossing is a rounding decision on the money path, so it goes through
  // exactly one pair of functions rather than ad-hoc `* 100`.
  it('converts dollars to cents', () => {
    expect(toMinorUnits(100)).toBe(10000);
    expect(toMinorUnits(42.5)).toBe(4250);
    expect(toMinorUnits(0)).toBe(0);
  });

  it('rounds half-up at the cent, matching roundCents and Square', () => {
    // Verified against the sandbox: 8.375% of $100 is $8.375, and Square
    // returned 838. Diverging here would mean charging a cent more or less
    // than the provider says.
    expect(toMinorUnits(8.375)).toBe(838);
    expect(toMinorUnits(0.005)).toBe(1);
  });

  it('survives float representation error', () => {
    // 0.1 + 0.2 = 0.30000000000000004. A truncating conversion would yield
    // 30 cents from one path and 29 from another.
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
  });

  it('matches roundCents on the classic float half-cent case', () => {
    // ⚠️ 1.005 is stored as slightly LESS than 1.005, so this rounds DOWN to
    // 100 cents rather than the arithmetically-expected 101.
    //
    // Pinned deliberately: `roundCents` in libs/IQPro.ts does exactly the same
    // thing. What matters on a two-provider money path is that IQPro and
    // Square never disagree about the same amount — a shared quirk is far
    // safer than one provider being "more correct" than the other.
    expect(toMinorUnits(1.005)).toBe(100);
  });

  it('round-trips', () => {
    for (const dollars of [0, 0.01, 1, 42.5, 99.99, 12345.67]) {
      expect(fromMinorUnits(toMinorUnits(dollars))).toBe(dollars);
    }
  });

  it('converts cents back to dollars', () => {
    expect(fromMinorUnits(10000)).toBe(100);
    expect(fromMinorUnits(838)).toBe(8.38);
    expect(fromMinorUnits(0)).toBe(0);
  });
});

describe('squareBaseUrl', () => {
  it('selects the sandbox host', () => {
    expect(squareBaseUrl({ environment: 'sandbox' } as never)).toContain('squareupsandbox.com');
  });

  it('selects production ONLY for an explicit production environment', () => {
    // `environment` is a z.enum rather than a free string precisely so a typo
    // cannot silently mean production — the failure that moves real money.
    expect(squareBaseUrl({ environment: 'production' } as never)).toBe('https://connect.squareup.com');
  });
});
