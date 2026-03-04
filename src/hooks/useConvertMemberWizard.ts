import type { AppliedCoupon, BillingType, MemberType, PaymentDeclineReason, PaymentMethod, PaymentStatus, SignerRelationship } from './useAddMemberWizard';
import { useState } from 'react';

export type ConversionType = 'hoh-to-individual' | 'individual-to-hoh' | 'family-to-individual';

export type ConvertWizardStep = 'confirm' | 'subscription' | 'waiver' | 'payment' | 'success';

export type ConvertMemberWizardData = {
  // Source member info (pre-populated)
  memberId: string;
  memberName: string;
  memberEmail: string;
  currentMemberType: MemberType;
  memberDateOfBirth?: Date;

  // Conversion target
  conversionType: ConversionType;
  targetMemberType: MemberType;

  // For family-to-individual: current HOH info
  currentHOHId?: string;
  currentHOHName?: string;

  // Whether the member currently has an active membership
  hasMembership: boolean;
  // Whether the member currently has a valid payment method
  hasPaymentMethod: boolean;

  // Membership selection (when member needs a new membership)
  membershipPlanId: string | null;
  membershipPlanPrice?: number;
  membershipPlanFrequency?: string;
  membershipPlanName?: string;
  membershipPlanIsTrial?: boolean;
  membershipPlanContractLength?: string;
  membershipPlanSignupFee?: number;

  // Waiver
  waiverTemplateId: string | null;
  waiverSignatureDataUrl?: string;
  waiverSignedByName?: string;
  waiverSignedByRelationship?: SignerRelationship;
  waiverGuardianEmail?: string;
  waiverSignedAt?: Date;
  waiverSkipped?: boolean;
  waiverRenderedContent?: string;

  // Payment
  paymentMethod?: PaymentMethod;
  billingType?: BillingType;
  cardholderName?: string;
  cardNumber?: string;
  cardToken?: string;
  cardFirstSix?: string;
  cardLastFour?: string;
  cardExpiry?: string;
  cardCvc?: string;
  achAccountHolder?: string;
  achRoutingNumber?: string;
  achAccountNumber?: string;
  achAccountType?: 'Checking' | 'Savings';

  // Coupon
  appliedCoupon?: AppliedCoupon | null;

  // Payment processing state
  paymentStatus?: PaymentStatus;
  paymentDeclineReason?: PaymentDeclineReason;
  paymentProcessed?: boolean;
};

export function getStepsForConversion(
  conversionType: ConversionType,
  hasMembership: boolean,
  hasPaymentMethod: boolean,
): ConvertWizardStep[] {
  switch (conversionType) {
    case 'hoh-to-individual': {
      const steps: ConvertWizardStep[] = ['confirm'];
      if (!hasMembership) {
        steps.push('subscription', 'waiver');
      }
      if (!hasPaymentMethod) {
        steps.push('payment');
      }
      steps.push('success');
      return steps;
    }

    case 'individual-to-hoh':
      return ['confirm', 'success'];

    case 'family-to-individual':
      return ['confirm', 'subscription', 'waiver', 'payment', 'success'];
  }
}

type ConvertMemberWizardInit = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  currentMemberType: MemberType;
  memberDateOfBirth?: Date;
  conversionType: ConversionType;
  targetMemberType: MemberType;
  hasMembership: boolean;
  hasPaymentMethod: boolean;
  currentHOHId?: string;
  currentHOHName?: string;
};

export const useConvertMemberWizard = (init: ConvertMemberWizardInit) => {
  const [step, setStep] = useState<ConvertWizardStep>('confirm');
  const [data, setData] = useState<ConvertMemberWizardData>({
    memberId: init.memberId,
    memberName: init.memberName,
    memberEmail: init.memberEmail,
    currentMemberType: init.currentMemberType,
    memberDateOfBirth: init.memberDateOfBirth,
    conversionType: init.conversionType,
    targetMemberType: init.targetMemberType,
    hasMembership: init.hasMembership,
    hasPaymentMethod: init.hasPaymentMethod,
    currentHOHId: init.currentHOHId,
    currentHOHName: init.currentHOHName,
    membershipPlanId: null,
    waiverTemplateId: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateData = (updates: Partial<ConvertMemberWizardData>) => {
    setData(prev => ({ ...prev, ...updates }));
    setError(null);
  };

  const getSteps = () => getStepsForConversion(data.conversionType, data.hasMembership, data.hasPaymentMethod);

  const nextStep = () => {
    const steps = getSteps();
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1 && currentIndex !== -1) {
      const nextStepValue = steps[currentIndex + 1];
      if (nextStepValue) {
        setStep(nextStepValue);
        setError(null);
      }
    }
  };

  const previousStep = () => {
    const steps = getSteps();
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      const prevStepValue = steps[currentIndex - 1];
      if (prevStepValue) {
        setStep(prevStepValue);
        setError(null);
      }
    }
  };

  const setErrorMessage = (message: string) => {
    setError(message);
  };

  const clearError = () => {
    setError(null);
  };

  const reset = () => {
    setStep('confirm');
    setData({
      memberId: init.memberId,
      memberName: init.memberName,
      memberEmail: init.memberEmail,
      currentMemberType: init.currentMemberType,
      memberDateOfBirth: init.memberDateOfBirth,
      conversionType: init.conversionType,
      targetMemberType: init.targetMemberType,
      hasMembership: init.hasMembership,
      hasPaymentMethod: init.hasPaymentMethod,
      currentHOHId: init.currentHOHId,
      currentHOHName: init.currentHOHName,
      membershipPlanId: null,
      waiverTemplateId: null,
    });
    setError(null);
    setIsLoading(false);
  };

  return {
    step,
    setStep,
    data,
    updateData,
    nextStep,
    previousStep,
    reset,
    error,
    setError: setErrorMessage,
    clearError,
    isLoading,
    setIsLoading,
  };
};
