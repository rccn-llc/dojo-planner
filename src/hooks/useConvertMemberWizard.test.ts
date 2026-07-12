import { describe, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { getStepsForConversion, useConvertMemberWizard } from './useConvertMemberWizard';

const defaultInit = {
  memberId: 'member-123',
  memberName: 'John Doe',
  memberEmail: 'john@test.com',
  currentMemberType: 'head-of-household' as const,
  conversionType: 'hoh-to-individual' as const,
  targetMemberType: 'individual' as const,
  hasMembership: true,
  hasPaymentMethod: true,
};

describe('getStepsForConversion', () => {
  describe('hoh-to-individual', () => {
    it('should return confirm → success when member has membership and payment', () => {
      const steps = getStepsForConversion('hoh-to-individual', true, true);

      expect(steps).toEqual(['confirm', 'success']);
    });

    it('should include subscription and waiver when no membership', () => {
      const steps = getStepsForConversion('hoh-to-individual', false, true);

      expect(steps).toEqual(['confirm', 'subscription', 'waiver', 'success']);
    });

    it('should include payment when no payment method', () => {
      const steps = getStepsForConversion('hoh-to-individual', true, false);

      expect(steps).toEqual(['confirm', 'payment', 'success']);
    });

    it('should include subscription, waiver, and payment when neither exists', () => {
      const steps = getStepsForConversion('hoh-to-individual', false, false);

      expect(steps).toEqual([
        'confirm',
        'subscription',
        'waiver',
        'payment',
        'success',
      ]);
    });
  });

  describe('individual-to-hoh', () => {
    it('should always return confirm → success', () => {
      const steps = getStepsForConversion('individual-to-hoh', true, true);

      expect(steps).toEqual(['confirm', 'success']);
    });

    it('should return confirm → success regardless of membership/payment', () => {
      const steps = getStepsForConversion('individual-to-hoh', false, false);

      expect(steps).toEqual(['confirm', 'success']);
    });
  });

  describe('family-to-individual', () => {
    it('should always return full flow', () => {
      const steps = getStepsForConversion('family-to-individual', true, true);

      expect(steps).toEqual([
        'confirm',
        'subscription',
        'waiver',
        'payment',
        'success',
      ]);
    });

    it('should return full flow regardless of membership/payment', () => {
      const steps = getStepsForConversion('family-to-individual', false, false);

      expect(steps).toEqual([
        'confirm',
        'subscription',
        'waiver',
        'payment',
        'success',
      ]);
    });
  });
});

describe('useConvertMemberWizard', () => {
  describe('initial state', () => {
    it('should initialize with confirm step', async () => {
      const { result } = await renderHook(() => useConvertMemberWizard(defaultInit));

      expect(result.current.step).toBe('confirm');
    });

    it('should initialize with data from init', async () => {
      const { result } = await renderHook(() => useConvertMemberWizard(defaultInit));

      expect(result.current.data.memberId).toBe('member-123');
      expect(result.current.data.memberName).toBe('John Doe');
      expect(result.current.data.memberEmail).toBe('john@test.com');
      expect(result.current.data.currentMemberType).toBe('head-of-household');
      expect(result.current.data.conversionType).toBe('hoh-to-individual');
      expect(result.current.data.targetMemberType).toBe('individual');
      expect(result.current.data.hasMembership).toBe(true);
      expect(result.current.data.hasPaymentMethod).toBe(true);
    });

    it('should initialize membership and waiver fields as null', async () => {
      const { result } = await renderHook(() => useConvertMemberWizard(defaultInit));

      expect(result.current.data.membershipPlanId).toBeNull();
      expect(result.current.data.waiverTemplateId).toBeNull();
    });

    it('should initialize with no error', async () => {
      const { result } = await renderHook(() => useConvertMemberWizard(defaultInit));

      expect(result.current.error).toBeNull();
    });

    it('should initialize with isLoading false', async () => {
      const { result } = await renderHook(() => useConvertMemberWizard(defaultInit));

      expect(result.current.isLoading).toBe(false);
    });

    it('should expose the computed steps (used to detect the last step before success)', async () => {
      const { result } = await renderHook(() => useConvertMemberWizard(defaultInit));

      // defaultInit is hoh-to-individual with membership + payment method on file.
      expect(result.current.steps).toEqual(getStepsForConversion('hoh-to-individual', true, true));
      expect(result.current.steps).toEqual(['confirm', 'success']);
    });

    it('should include HOH data when provided', async () => {
      const init = {
        ...defaultInit,
        conversionType: 'family-to-individual' as const,
        currentMemberType: 'family-member' as const,
        targetMemberType: 'individual' as const,
        currentHOHId: 'hoh-999',
        currentHOHName: 'Jane Doe',
      };

      const { result } = await renderHook(() => useConvertMemberWizard(init));

      expect(result.current.data.currentHOHId).toBe('hoh-999');
      expect(result.current.data.currentHOHName).toBe('Jane Doe');
    });
  });

  describe('updateData', () => {
    it('should update data with partial updates', async () => {
      const { result, act } = await renderHook(() => useConvertMemberWizard(defaultInit));

      act(() => {
        result.current.updateData({ membershipPlanId: 'plan-1', membershipPlanName: 'Monthly' });
      });

      expect(result.current.data.membershipPlanId).toBe('plan-1');
      expect(result.current.data.membershipPlanName).toBe('Monthly');
    });

    it('should clear error when updating data', async () => {
      const { result, act } = await renderHook(() => useConvertMemberWizard(defaultInit));

      act(() => {
        result.current.setError('Some error');
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.updateData({ membershipPlanId: 'plan-1' });
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('nextStep', () => {
    it('should advance to the next step', async () => {
      const { result, act } = await renderHook(() => useConvertMemberWizard(defaultInit));

      // hoh-to-individual with membership+payment: confirm → success
      expect(result.current.step).toBe('confirm');

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.step).toBe('success');
    });

    it('should not advance past the last step', async () => {
      const { result, act } = await renderHook(() => useConvertMemberWizard(defaultInit));

      act(() => {
        result.current.nextStep(); // confirm → success
      });

      expect(result.current.step).toBe('success');

      act(() => {
        result.current.nextStep(); // should stay on success
      });

      expect(result.current.step).toBe('success');
    });

    it('should clear error on step advance', async () => {
      const { result, act } = await renderHook(() => useConvertMemberWizard(defaultInit));

      act(() => {
        result.current.setError('Test error');
      });

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('previousStep', () => {
    it('should go back to previous step', async () => {
      const init = {
        ...defaultInit,
        hasMembership: false,
      };

      const { result, act } = await renderHook(() => useConvertMemberWizard(init));

      // confirm → subscription → waiver → success
      act(() => {
        result.current.nextStep(); // confirm → subscription
      });

      expect(result.current.step).toBe('subscription');

      act(() => {
        result.current.previousStep(); // subscription → confirm
      });

      expect(result.current.step).toBe('confirm');
    });

    it('should not go before the first step', async () => {
      const { result, act } = await renderHook(() => useConvertMemberWizard(defaultInit));

      act(() => {
        result.current.previousStep(); // should stay on confirm
      });

      expect(result.current.step).toBe('confirm');
    });
  });

  describe('reset', () => {
    it('should reset to initial state', async () => {
      const { result, act } = await renderHook(() => useConvertMemberWizard(defaultInit));

      act(() => {
        result.current.updateData({ membershipPlanId: 'plan-1' });
        result.current.setError('Test error');
        result.current.nextStep();
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.step).toBe('confirm');
      expect(result.current.data.membershipPlanId).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('error management', () => {
    it('should set error message', async () => {
      const { result, act } = await renderHook(() => useConvertMemberWizard(defaultInit));

      act(() => {
        result.current.setError('Something went wrong');
      });

      expect(result.current.error).toBe('Something went wrong');
    });

    it('should clear error', async () => {
      const { result, act } = await renderHook(() => useConvertMemberWizard(defaultInit));

      act(() => {
        result.current.setError('Error');
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('loading state', () => {
    it('should update isLoading', async () => {
      const { result, act } = await renderHook(() => useConvertMemberWizard(defaultInit));

      act(() => {
        result.current.setIsLoading(true);
      });

      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.setIsLoading(false);
      });

      expect(result.current.isLoading).toBe(false);
    });
  });
});
