import type { AddMemberWizardData, PaymentMethod } from './useAddMemberWizard';

import { useState } from 'react';

export type FamilyMemberWizardStep = 'details' | 'photo' | 'subscription' | 'waiver' | 'family-payment' | 'member-success';

const STEPS: FamilyMemberWizardStep[] = ['details', 'photo', 'subscription', 'waiver', 'family-payment', 'member-success'];

export type HOHData = {
  id: string;
  name: string;
  email: string;
  hasPaymentMethod: boolean;
  paymentMethodLast4?: string;
  paymentMethodType?: PaymentMethod;
};

export type CompletedFamilyMember = {
  id: string;
  name: string;
};

function createInitialData(hohData: HOHData): AddMemberWizardData {
  return {
    memberType: 'family-member',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    membershipPlanId: null,
    waiverTemplateId: null,
    hohMemberId: hohData.id,
    hohMemberName: hohData.name,
    hohMemberEmail: hohData.email,
    hohHasPaymentMethod: hohData.hasPaymentMethod,
    hohPaymentMethodLast4: hohData.paymentMethodLast4,
    hohPaymentMethodType: hohData.paymentMethodType,
  };
}

export const useFamilyMemberWizard = (hohData: HOHData) => {
  const [step, setStep] = useState<FamilyMemberWizardStep>('details');
  const [data, setData] = useState<AddMemberWizardData>(() => createInitialData(hohData));
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [completedMembers, setCompletedMembers] = useState<CompletedFamilyMember[]>([]);

  const updateData = (updates: Partial<AddMemberWizardData>) => {
    setData(prev => ({ ...prev, ...updates }));
    setError(null);
  };

  const nextStep = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex < STEPS.length - 1 && currentIndex !== -1) {
      const nextStepValue = STEPS[currentIndex + 1];
      if (nextStepValue) {
        setStep(nextStepValue);
        setError(null);
      }
    }
  };

  const previousStep = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex > 0) {
      const prevStepValue = STEPS[currentIndex - 1];
      if (prevStepValue) {
        setStep(prevStepValue);
        setError(null);
      }
    }
  };

  const addCompletedMember = (member: CompletedFamilyMember) => {
    setCompletedMembers(prev => [...prev, member]);
  };

  const updateHOHPaymentInfo = (info: {
    hasPaymentMethod: boolean;
    paymentMethodLast4?: string;
    paymentMethodType?: PaymentMethod;
  }) => {
    setData(prev => ({
      ...prev,
      hohHasPaymentMethod: info.hasPaymentMethod,
      hohPaymentMethodLast4: info.paymentMethodLast4,
      hohPaymentMethodType: info.paymentMethodType,
    }));
  };

  const resetForNextMember = () => {
    setStep('details');
    setData(prev => ({
      ...createInitialData(hohData),
      // Preserve updated HOH payment info from previous member creation
      hohHasPaymentMethod: prev.hohHasPaymentMethod,
      hohPaymentMethodLast4: prev.hohPaymentMethodLast4,
      hohPaymentMethodType: prev.hohPaymentMethodType,
    }));
    setError(null);
    setIsLoading(false);
  };

  const reset = () => {
    setStep('details');
    setData(createInitialData(hohData));
    setError(null);
    setIsLoading(false);
    setCompletedMembers([]);
  };

  return {
    step,
    setStep,
    data,
    updateData,
    nextStep,
    previousStep,
    reset,
    resetForNextMember,
    error,
    setError,
    clearError: () => setError(null),
    isLoading,
    setIsLoading,
    completedMembers,
    addCompletedMember,
    updateHOHPaymentInfo,
  };
};
