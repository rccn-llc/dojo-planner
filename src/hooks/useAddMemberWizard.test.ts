import type { AddMemberWizardData, WizardStep } from './useAddMemberWizard';
import { describe, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { getStepsForMemberType, useAddMemberWizard } from './useAddMemberWizard';

describe('useAddMemberWizard hook', () => {
  describe('initial state', () => {
    it('should initialize with member-type step', async () => {
      const { result } = await renderHook(() => useAddMemberWizard());

      expect(result.current.step).toBe('member-type');
    });

    it('should initialize with empty data', async () => {
      const { result } = await renderHook(() => useAddMemberWizard());

      expect(result.current.data.memberType).toBeNull();
      expect(result.current.data.firstName).toBe('');
      expect(result.current.data.lastName).toBe('');
      expect(result.current.data.email).toBe('');
      expect(result.current.data.phone).toBe('');
      expect(result.current.data.membershipPlanId).toBeNull();
    });

    it('should initialize with no error', async () => {
      const { result } = await renderHook(() => useAddMemberWizard());

      expect(result.current.error).toBeNull();
    });

    it('should initialize with isLoading false', async () => {
      const { result } = await renderHook(() => useAddMemberWizard());

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('updateData', () => {
    it('should update data with partial updates', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.updateData({ firstName: 'John', lastName: 'Doe' });
      });

      expect(result.current.data.firstName).toBe('John');
      expect(result.current.data.lastName).toBe('Doe');
    });

    it('should clear error when updating data', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.setError('Some error');
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.updateData({ firstName: 'John' });
      });

      expect(result.current.error).toBeNull();
    });

    it('should update billingType', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.updateData({ billingType: 'autopay' });
      });

      expect(result.current.data.billingType).toBe('autopay');

      act(() => {
        result.current.updateData({ billingType: 'one-time' });
      });

      expect(result.current.data.billingType).toBe('one-time');
    });

    it('should update payment fields', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.updateData({
          paymentMethod: 'card',
          cardholderName: 'John Doe',
          cardNumber: '4242424242424242',
          cardExpiry: '12/25',
          cardCvc: '123',
        });
      });

      expect(result.current.data.paymentMethod).toBe('card');
      expect(result.current.data.cardholderName).toBe('John Doe');
      expect(result.current.data.cardNumber).toBe('4242424242424242');
      expect(result.current.data.cardExpiry).toBe('12/25');
      expect(result.current.data.cardCvc).toBe('123');
    });

    it('should update ACH fields', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.updateData({
          paymentMethod: 'ach',
          achAccountHolder: 'John Doe',
          achRoutingNumber: '123456789',
          achAccountNumber: '987654321',
        });
      });

      expect(result.current.data.paymentMethod).toBe('ach');
      expect(result.current.data.achAccountHolder).toBe('John Doe');
      expect(result.current.data.achRoutingNumber).toBe('123456789');
      expect(result.current.data.achAccountNumber).toBe('987654321');
    });

    it('should update dateOfBirth', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      const dob = new Date('1990-01-15');
      act(() => {
        result.current.updateData({ dateOfBirth: dob });
      });

      expect(result.current.data.dateOfBirth).toEqual(dob);
    });

    it('should update applied coupon', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      const coupon = {
        id: 'coupon-1',
        code: 'SAVE10',
        type: 'Percentage' as const,
        amount: '10%',
        description: '10% off',
      };

      act(() => {
        result.current.updateData({ appliedCoupon: coupon });
      });

      expect(result.current.data.appliedCoupon).toEqual(coupon);
    });

    it('should update payment status', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.updateData({ paymentStatus: 'processing' });
      });

      expect(result.current.data.paymentStatus).toBe('processing');

      act(() => {
        result.current.updateData({ paymentStatus: 'approved' });
      });

      expect(result.current.data.paymentStatus).toBe('approved');

      act(() => {
        result.current.updateData({ paymentStatus: 'declined', paymentDeclineReason: 'insufficient_funds' });
      });

      expect(result.current.data.paymentStatus).toBe('declined');
      expect(result.current.data.paymentDeclineReason).toBe('insufficient_funds');
    });
  });

  describe('nextStep', () => {
    it('should advance from member-type to details', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.step).toBe('details');
    });

    it('should advance through all steps', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.nextStep();
      });

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

      expect(result.current.step).toBe('payment');

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.step).toBe('success');
    });

    it('should not advance past success step', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.setStep('success');
      });

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.step).toBe('success');
    });

    it('should clear error when advancing', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.setError('Some error');
      });

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('previousStep', () => {
    it('should go back from details to member-type', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.setStep('details');
      });

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.step).toBe('member-type');
    });

    it('should go back through all steps', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.setStep('success');
      });

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.step).toBe('payment');

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.step).toBe('waiver');

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.step).toBe('subscription');

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.step).toBe('photo');

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.step).toBe('details');

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.step).toBe('member-type');
    });

    it('should not go back before member-type step', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.step).toBe('member-type');
    });

    it('should clear error when going back', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.setStep('details');
        result.current.setError('Some error');
      });

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset to initial state', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.updateData({
          firstName: 'John',
          lastName: 'Doe',
          memberType: 'individual',
          billingType: 'autopay',
          paymentMethod: 'card',
        });
        result.current.setStep('payment');
        result.current.setError('Some error');
        result.current.setIsLoading(true);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.step).toBe('member-type');
      expect(result.current.data.memberType).toBeNull();
      expect(result.current.data.firstName).toBe('');
      expect(result.current.data.lastName).toBe('');
      expect(result.current.data.billingType).toBeUndefined();
      expect(result.current.data.paymentMethod).toBeUndefined();
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should reset all payment fields', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.updateData({
          paymentMethod: 'card',
          billingType: 'autopay',
          cardholderName: 'John Doe',
          cardNumber: '4242424242424242',
          cardExpiry: '12/25',
          cardCvc: '123',
          achAccountHolder: 'John Doe',
          achRoutingNumber: '123456789',
          achAccountNumber: '987654321',
          appliedCoupon: { id: '1', code: 'TEST', type: 'Percentage', amount: '10%', description: 'Test' },
          paymentStatus: 'approved',
          paymentDeclineReason: 'insufficient_funds',
          paymentProcessed: true,
        });
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.data.paymentMethod).toBeUndefined();
      expect(result.current.data.billingType).toBeUndefined();
      expect(result.current.data.cardholderName).toBeUndefined();
      expect(result.current.data.cardNumber).toBeUndefined();
      expect(result.current.data.cardExpiry).toBeUndefined();
      expect(result.current.data.cardCvc).toBeUndefined();
      expect(result.current.data.achAccountHolder).toBeUndefined();
      expect(result.current.data.achRoutingNumber).toBeUndefined();
      expect(result.current.data.achAccountNumber).toBeUndefined();
      expect(result.current.data.appliedCoupon).toBeUndefined();
      expect(result.current.data.paymentStatus).toBeUndefined();
      expect(result.current.data.paymentDeclineReason).toBeUndefined();
      expect(result.current.data.paymentProcessed).toBeUndefined();
    });
  });

  describe('error management', () => {
    it('should set error message', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.setError('Validation error');
      });

      expect(result.current.error).toBe('Validation error');
    });

    it('should clear error', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.setError('Validation error');
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('loading state', () => {
    it('should set loading state', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

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

  describe('setStep', () => {
    it('should set step directly', async () => {
      const { result, act } = await renderHook(() => useAddMemberWizard());

      act(() => {
        result.current.setStep('payment');
      });

      expect(result.current.step).toBe('payment');
    });
  });
});

describe('useAddMemberWizard types and exports', () => {
  it('should export AddMemberWizardData type', () => {
    // This test verifies that the types are properly exported
    // The actual hook behavior is tested in component tests (.test.tsx files)
    const testData: AddMemberWizardData = {
      memberType: 'individual',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '1234567890',
      membershipPlanId: null,
      waiverTemplateId: null,
      subscriptionPlan: 'monthly',
    };

    expect(testData.memberType).toBe('individual');
    expect(testData.firstName).toBe('John');
    expect(testData.lastName).toBe('Doe');
  });

  it('should support all member types', () => {
    const memberTypes: Array<'individual' | 'family-member' | 'head-of-household'> = [
      'individual',
      'family-member',
      'head-of-household',
    ];

    expect(memberTypes).toHaveLength(3);
    expect(memberTypes[0]).toBe('individual');
    expect(memberTypes[1]).toBe('family-member');
    expect(memberTypes[2]).toBe('head-of-household');
  });

  it('should support all subscription plans', () => {
    const plans: Array<'free-trial' | 'monthly' | 'annual' | 'custom'> = [
      'free-trial',
      'monthly',
      'annual',
      'custom',
    ];

    expect(plans).toHaveLength(4);
    expect(plans[0]).toBe('free-trial');
    expect(plans[1]).toBe('monthly');
    expect(plans[2]).toBe('annual');
    expect(plans[3]).toBe('custom');
  });

  it('should support all wizard steps including HOH and family steps', () => {
    const steps: WizardStep[] = ['member-type', 'details', 'photo', 'subscription', 'waiver', 'payment', 'hoh-selection', 'family-payment', 'success'];

    expect(steps).toHaveLength(9);
    expect(steps[0]).toBe('member-type');
    expect(steps[6]).toBe('hoh-selection');
    expect(steps[7]).toBe('family-payment');
    expect(steps[8]).toBe('success');
  });

  it('should allow creating data with optional address', () => {
    const dataWithAddress: AddMemberWizardData = {
      memberType: 'individual',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '1234567890',
      membershipPlanId: null,
      waiverTemplateId: null,
      subscriptionPlan: 'monthly',
      address: {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        zipCode: '94102',
        country: 'USA',
      },
    };

    expect(dataWithAddress.address?.street).toBe('123 Main St');
    expect(dataWithAddress.address?.city).toBe('San Francisco');
  });

  it('should allow creating data with optional photo file', () => {
    const mockFile = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });

    const dataWithPhoto: AddMemberWizardData = {
      memberType: 'individual',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '1234567890',
      membershipPlanId: null,
      waiverTemplateId: null,
      subscriptionPlan: 'monthly',
      photoFile: mockFile,
    };

    expect(dataWithPhoto.photoFile?.name).toBe('photo.jpg');
    expect(dataWithPhoto.photoFile?.type).toBe('image/jpeg');
  });

  it('should allow null values for optional fields', () => {
    const minimalData: AddMemberWizardData = {
      memberType: null,
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      membershipPlanId: null,
      waiverTemplateId: null,
    };

    expect(minimalData.memberType).toBeNull();
    expect(minimalData.membershipPlanId).toBeNull();
    expect(minimalData.firstName).toBe('');
    expect(minimalData.email).toBe('');
  });

  it('should allow HOH fields in AddMemberWizardData', () => {
    const dataWithHOH: AddMemberWizardData = {
      memberType: 'family-member',
      firstName: 'Alice',
      lastName: 'Doe',
      email: 'alice@example.com',
      phone: '1234567890',
      membershipPlanId: null,
      waiverTemplateId: null,
      hohMemberId: 'hoh-123',
      hohMemberName: 'John Doe',
      hohMemberEmail: 'john@example.com',
      hohHasPaymentMethod: true,
      hohPaymentMethodLast4: '4242',
      hohPaymentMethodType: 'card',
    };

    expect(dataWithHOH.hohMemberId).toBe('hoh-123');
    expect(dataWithHOH.hohMemberName).toBe('John Doe');
    expect(dataWithHOH.hohHasPaymentMethod).toBe(true);
    expect(dataWithHOH.hohPaymentMethodLast4).toBe('4242');
    expect(dataWithHOH.hohPaymentMethodType).toBe('card');
  });
});

describe('getStepsForMemberType', () => {
  it('should return standard steps for null member type', () => {
    const steps = getStepsForMemberType(null);

    expect(steps).toEqual(['member-type', 'details', 'photo', 'subscription', 'waiver', 'payment', 'success']);
  });

  it('should return standard steps for individual member type', () => {
    const steps = getStepsForMemberType('individual');

    expect(steps).toEqual(['member-type', 'details', 'photo', 'subscription', 'waiver', 'payment', 'success']);
  });

  it('should return standard steps for head-of-household member type', () => {
    const steps = getStepsForMemberType('head-of-household');

    expect(steps).toEqual(['member-type', 'details', 'photo', 'subscription', 'waiver', 'payment', 'success']);
  });

  it('should return family-member steps with hoh-selection and family-payment', () => {
    const steps = getStepsForMemberType('family-member');

    expect(steps).toEqual(['member-type', 'details', 'photo', 'subscription', 'waiver', 'hoh-selection', 'family-payment', 'success']);
  });

  it('should not include payment step for family-member flow', () => {
    const steps = getStepsForMemberType('family-member');

    expect(steps).not.toContain('payment');
  });

  it('should not include hoh-selection or family-payment for individual flow', () => {
    const steps = getStepsForMemberType('individual');

    expect(steps).not.toContain('hoh-selection');
    expect(steps).not.toContain('family-payment');
  });
});

describe('useAddMemberWizard conditional step routing', () => {
  it('should navigate through family-member steps correctly', async () => {
    const { result, act } = await renderHook(() => useAddMemberWizard());

    // Set member type to family-member first
    act(() => {
      result.current.updateData({ memberType: 'family-member' });
    });

    // Navigate through steps
    act(() => {
      result.current.nextStep();
    });

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

    expect(result.current.step).toBe('hoh-selection');

    act(() => {
      result.current.nextStep();
    });

    expect(result.current.step).toBe('family-payment');

    act(() => {
      result.current.nextStep();
    });

    expect(result.current.step).toBe('success');
  });

  it('should go back through family-member steps correctly', async () => {
    const { result, act } = await renderHook(() => useAddMemberWizard());

    act(() => {
      result.current.updateData({ memberType: 'family-member' });
      result.current.setStep('family-payment');
    });

    act(() => {
      result.current.previousStep();
    });

    expect(result.current.step).toBe('hoh-selection');

    act(() => {
      result.current.previousStep();
    });

    expect(result.current.step).toBe('waiver');
  });

  it('should navigate through head-of-household steps (same as individual)', async () => {
    const { result, act } = await renderHook(() => useAddMemberWizard());

    act(() => {
      result.current.updateData({ memberType: 'head-of-household' });
    });

    // Navigate to waiver step
    act(() => {
      result.current.nextStep(); // details
    });

    act(() => {
      result.current.nextStep(); // photo
    });

    act(() => {
      result.current.nextStep(); // subscription
    });

    act(() => {
      result.current.nextStep(); // waiver
    });

    expect(result.current.step).toBe('waiver');

    act(() => {
      result.current.nextStep(); // payment (not hoh-selection)
    });

    expect(result.current.step).toBe('payment');
  });

  it('should update HOH fields via updateData', async () => {
    const { result, act } = await renderHook(() => useAddMemberWizard());

    act(() => {
      result.current.updateData({
        hohMemberId: 'hoh-abc',
        hohMemberName: 'Parent User',
        hohMemberEmail: 'parent@test.com',
        hohHasPaymentMethod: true,
        hohPaymentMethodLast4: '1234',
        hohPaymentMethodType: 'ach',
      });
    });

    expect(result.current.data.hohMemberId).toBe('hoh-abc');
    expect(result.current.data.hohMemberName).toBe('Parent User');
    expect(result.current.data.hohMemberEmail).toBe('parent@test.com');
    expect(result.current.data.hohHasPaymentMethod).toBe(true);
    expect(result.current.data.hohPaymentMethodLast4).toBe('1234');
    expect(result.current.data.hohPaymentMethodType).toBe('ach');
  });

  it('should clear HOH fields on reset', async () => {
    const { result, act } = await renderHook(() => useAddMemberWizard());

    act(() => {
      result.current.updateData({
        hohMemberId: 'hoh-abc',
        hohMemberName: 'Parent User',
        hohMemberEmail: 'parent@test.com',
        hohHasPaymentMethod: true,
        hohPaymentMethodLast4: '1234',
        hohPaymentMethodType: 'card',
      });
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.data.hohMemberId).toBeUndefined();
    expect(result.current.data.hohMemberName).toBeUndefined();
    expect(result.current.data.hohMemberEmail).toBeUndefined();
    expect(result.current.data.hohHasPaymentMethod).toBeUndefined();
    expect(result.current.data.hohPaymentMethodLast4).toBeUndefined();
    expect(result.current.data.hohPaymentMethodType).toBeUndefined();
  });
});
