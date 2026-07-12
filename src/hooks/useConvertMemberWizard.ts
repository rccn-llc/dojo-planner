import type { MemberType, WizardStepData } from './useAddMemberWizard';
import { useState } from 'react';

export type ConversionType = 'hoh-to-individual' | 'individual-to-hoh' | 'family-to-individual';

export type ConvertWizardStep = 'confirm' | 'subscription' | 'waiver' | 'payment' | 'success';

export type ConvertMemberWizardData = WizardStepData & {
  // Source member info (pre-populated)
  memberId: string;
  memberName: string; // full name kept for the convert-confirm UI
  memberEmail: string; // canonical email kept for the convert-confirm UI
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

// Split full name into first/last so the shared step components (which expect
// discrete `firstName` / `lastName` from `WizardStepData`) work without an
// adapter. Single-word names produce an empty `lastName`.
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return { firstName: trimmed, lastName: '' };
  }
  return {
    firstName: trimmed.slice(0, spaceIdx),
    lastName: trimmed.slice(spaceIdx + 1).trim(),
  };
}

function createInitialData(init: ConvertMemberWizardInit): ConvertMemberWizardData {
  const { firstName, lastName } = splitFullName(init.memberName);
  return {
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
    // WizardStepData fields:
    firstName,
    lastName,
    email: init.memberEmail,
    dateOfBirth: init.memberDateOfBirth,
    membershipPlanId: null,
    waiverTemplateId: null,
  };
}

export const useConvertMemberWizard = (init: ConvertMemberWizardInit) => {
  const [step, setStep] = useState<ConvertWizardStep>('confirm');
  const [data, setData] = useState<ConvertMemberWizardData>(() => createInitialData(init));
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
    setData(createInitialData(init));
    setError(null);
    setIsLoading(false);
  };

  return {
    step,
    setStep,
    steps: getSteps(),
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
