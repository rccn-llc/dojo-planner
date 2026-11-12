import { describe, expect, it } from 'vitest';
import { confirmLimiter, resetSignupRouteState, statusCache, statusLimiter } from './SignupRouteState';

describe('resetSignupRouteState', () => {
  it('clears both limiters and the status cache', () => {
    for (let i = 0; i < 10; i++) {
      confirmLimiter.allow('203.0.113.7');
    }
    for (let i = 0; i < 30; i++) {
      statusLimiter.allow('203.0.113.7');
    }
    statusCache.set('id:token', { at: 0, status: { state: 'expired' } as never });

    expect(confirmLimiter.allow('203.0.113.7')).toBe(false);
    expect(statusLimiter.allow('203.0.113.7')).toBe(false);

    resetSignupRouteState();

    expect(confirmLimiter.allow('203.0.113.7')).toBe(true);
    expect(statusLimiter.allow('203.0.113.7')).toBe(true);
    expect(statusCache.size).toBe(0);
  });
});
