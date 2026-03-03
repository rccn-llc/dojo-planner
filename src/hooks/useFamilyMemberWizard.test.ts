import type { HOHData } from './useFamilyMemberWizard';
import { describe, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useFamilyMemberWizard } from './useFamilyMemberWizard';

const defaultHOHData: HOHData = {
  id: 'hoh-123',
  name: 'John Doe',
  email: 'john@example.com',
  hasPaymentMethod: true,
  paymentMethodLast4: '4242',
  paymentMethodType: 'card',
};

describe('useFamilyMemberWizard hook', () => {
  describe('initial state', () => {
    it('should initialize with details step', async () => {
      const { result } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      expect(result.current.step).toBe('details');
    });

    it('should initialize data with family-member type and HOH info', async () => {
      const { result } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      expect(result.current.data.memberType).toBe('family-member');
      expect(result.current.data.hohMemberId).toBe('hoh-123');
      expect(result.current.data.hohMemberName).toBe('John Doe');
      expect(result.current.data.hohMemberEmail).toBe('john@example.com');
      expect(result.current.data.hohHasPaymentMethod).toBe(true);
      expect(result.current.data.hohPaymentMethodLast4).toBe('4242');
      expect(result.current.data.hohPaymentMethodType).toBe('card');
    });

    it('should initialize with empty per-member fields', async () => {
      const { result } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      expect(result.current.data.firstName).toBe('');
      expect(result.current.data.lastName).toBe('');
      expect(result.current.data.email).toBe('');
      expect(result.current.data.phone).toBe('');
      expect(result.current.data.membershipPlanId).toBeNull();
    });

    it('should initialize with no error and not loading', async () => {
      const { result } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should initialize with empty completed members', async () => {
      const { result } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      expect(result.current.completedMembers).toEqual([]);
    });
  });

  describe('step navigation', () => {
    it('should advance through all steps', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      expect(result.current.step).toBe('details');

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.step).toBe('photo');

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.step).toBe('subscription');

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.step).toBe('waiver');

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.step).toBe('family-payment');

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.step).toBe('member-success');
    });

    it('should not advance past member-success step', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.setStep('member-success');
      });

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.step).toBe('member-success');
    });

    it('should go back through steps', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.setStep('family-payment');
      });

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.step).toBe('waiver');

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.step).toBe('subscription');
    });

    it('should not go back before details step', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.step).toBe('details');
    });

    it('should clear error when advancing', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.setError('Some error');
      });

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('updateData', () => {
    it('should update data with partial updates', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.updateData({ firstName: 'Alice', lastName: 'Smith' });
      });

      expect(result.current.data.firstName).toBe('Alice');
      expect(result.current.data.lastName).toBe('Smith');
    });

    it('should preserve HOH data when updating member fields', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.updateData({ firstName: 'Alice' });
      });

      expect(result.current.data.hohMemberId).toBe('hoh-123');
      expect(result.current.data.hohMemberName).toBe('John Doe');
    });

    it('should clear error when updating data', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.setError('Validation error');
      });

      act(() => {
        result.current.updateData({ firstName: 'Alice' });
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('addCompletedMember', () => {
    it('should add a completed member to the list', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.addCompletedMember({ id: 'member-1', name: 'Alice Smith' });
      });

      expect(result.current.completedMembers).toHaveLength(1);
      expect(result.current.completedMembers[0]).toEqual({ id: 'member-1', name: 'Alice Smith' });
    });

    it('should accumulate multiple completed members', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.addCompletedMember({ id: 'member-1', name: 'Alice Smith' });
      });

      act(() => {
        result.current.addCompletedMember({ id: 'member-2', name: 'Bob Smith' });
      });

      expect(result.current.completedMembers).toHaveLength(2);
      expect(result.current.completedMembers[1]).toEqual({ id: 'member-2', name: 'Bob Smith' });
    });
  });

  describe('resetForNextMember', () => {
    it('should reset step to details', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.setStep('member-success');
      });

      act(() => {
        result.current.resetForNextMember();
      });

      expect(result.current.step).toBe('details');
    });

    it('should clear per-member fields', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.updateData({
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@example.com',
          phone: '555-1234',
          membershipPlanId: 'plan-1',
        });
      });

      act(() => {
        result.current.resetForNextMember();
      });

      expect(result.current.data.firstName).toBe('');
      expect(result.current.data.lastName).toBe('');
      expect(result.current.data.email).toBe('');
      expect(result.current.data.phone).toBe('');
      expect(result.current.data.membershipPlanId).toBeNull();
    });

    it('should preserve HOH data after reset', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.updateData({ firstName: 'Alice' });
      });

      act(() => {
        result.current.resetForNextMember();
      });

      expect(result.current.data.hohMemberId).toBe('hoh-123');
      expect(result.current.data.hohMemberName).toBe('John Doe');
      expect(result.current.data.hohMemberEmail).toBe('john@example.com');
      expect(result.current.data.hohHasPaymentMethod).toBe(true);
    });

    it('should preserve completed members after reset', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.addCompletedMember({ id: 'member-1', name: 'Alice Smith' });
      });

      act(() => {
        result.current.resetForNextMember();
      });

      expect(result.current.completedMembers).toHaveLength(1);
    });

    it('should clear error and loading state', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.setError('Some error');
        result.current.setIsLoading(true);
      });

      act(() => {
        result.current.resetForNextMember();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('updateHOHPaymentInfo', () => {
    it('should update HOH payment info', async () => {
      const hohWithoutPayment: HOHData = {
        id: 'hoh-123',
        name: 'John Doe',
        email: 'john@example.com',
        hasPaymentMethod: false,
      };

      const { result, act } = await renderHook(() => useFamilyMemberWizard(hohWithoutPayment));

      expect(result.current.data.hohHasPaymentMethod).toBe(false);

      act(() => {
        result.current.updateHOHPaymentInfo({
          hasPaymentMethod: true,
          paymentMethodLast4: '9876',
          paymentMethodType: 'ach',
        });
      });

      expect(result.current.data.hohHasPaymentMethod).toBe(true);
      expect(result.current.data.hohPaymentMethodLast4).toBe('9876');
      expect(result.current.data.hohPaymentMethodType).toBe('ach');
    });
  });

  describe('error management', () => {
    it('should set and clear error', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

      act(() => {
        result.current.setError('Test error');
      });

      expect(result.current.error).toBe('Test error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('loading state', () => {
    it('should set loading state', async () => {
      const { result, act } = await renderHook(() => useFamilyMemberWizard(defaultHOHData));

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
