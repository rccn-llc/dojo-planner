import { describe, expect, it, vi } from 'vitest';
import { newSignupToken } from '@/services/SignupRequestService';
import { isConfirmToken, isSignupRequestId, isSignupToken } from './SignupTokens';

vi.mock('@/libs/ControlDb');

describe('sign-up identifier shapes', () => {
  it('accepts the tokens the app issues', () => {
    const confirm = newSignupToken('confirm');
    const status = newSignupToken('status');

    expect(isConfirmToken(confirm)).toBe(true);
    expect(isSignupToken(confirm)).toBe(true);
    expect(isSignupToken(status)).toBe(true);
    expect(isConfirmToken(status)).toBe(false);
  });

  it('rejects anything else', () => {
    for (const value of ['', 'sc_short', `sc_${'a'.repeat(44)}`, `sx_${'a'.repeat(43)}`, `sc_${'a'.repeat(42)}!`, 42, null]) {
      expect(isSignupToken(value)).toBe(false);
      expect(isConfirmToken(value)).toBe(false);
    }
  });

  it('accepts only UUID request ids', () => {
    expect(isSignupRequestId('6f1c2a4e-1b2c-4d5e-8f90-0123456789ab')).toBe(true);
    expect(isSignupRequestId('6F1C2A4E-1B2C-4D5E-8F90-0123456789AB')).toBe(true);
    expect(isSignupRequestId('req-1')).toBe(false);
    expect(isSignupRequestId('6f1c2a4e-1b2c-4d5e-8f90-0123456789ab\n')).toBe(false);
    expect(isSignupRequestId(undefined)).toBe(false);
  });
});
