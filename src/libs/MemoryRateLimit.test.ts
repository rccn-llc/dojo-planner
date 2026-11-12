import { describe, expect, it } from 'vitest';
import { createWindowLimiter } from './MemoryRateLimit';

describe('createWindowLimiter', () => {
  it('allows up to the limit per key per window', () => {
    const limiter = createWindowLimiter({ limit: 2, windowMs: 1000 });

    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 10)).toBe(true);
    expect(limiter.allow('a', 20)).toBe(false);
    expect(limiter.allow('b', 20)).toBe(true);
  });

  it('starts a new window once the old one has passed', () => {
    const limiter = createWindowLimiter({ limit: 1, windowMs: 1000 });

    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 999)).toBe(false);
    expect(limiter.allow('a', 1000)).toBe(true);
  });

  it('clears the table rather than growing past maxTracked', () => {
    const limiter = createWindowLimiter({ limit: 1, windowMs: 1000, maxTracked: 2 });
    limiter.allow('a', 0);
    limiter.allow('b', 0);
    limiter.allow('c', 0);

    expect(limiter.allow('a', 1)).toBe(true); // forgotten by the clear
  });

  it('reset forgets every key', () => {
    const limiter = createWindowLimiter({ limit: 1, windowMs: 1000 });
    limiter.allow('a', 0);
    limiter.reset();

    expect(limiter.allow('a', 1)).toBe(true);
  });

  it('uses the current time by default', () => {
    const limiter = createWindowLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
  });
});
