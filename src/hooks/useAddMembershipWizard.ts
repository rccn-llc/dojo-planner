import { useState } from 'react';

export type MembershipType = 'standard' | 'trial' | 'punchcard';
export type MembershipStatus = 'active' | 'inactive';
export type ChargeSignUpFeeOption = 'at-registration' | 'first-payment';
export type PaymentFrequency = 'monthly' | 'weekly' | 'semi-annually' | 'annually';
export type HoldFeeFrequencyOption = 'one-time' | 'weekly' | 'monthly' | 'semi-annually' | 'annually';
export type MembershipStartDateOption = 'same-as-registration' | 'custom';
export type ContractLength = 'month-to-month' | '3-months' | '6-months' | '12-months';
export type AutoRenewalOption = 'none' | 'month-to-month' | 'same-term';

export type AddMembershipWizardData = {
  // Step 1: Membership Basics
  membershipName: string;
  status: MembershipStatus;
  membershipType: MembershipType;
  description: string;

  // Step 2: Program/Waiver Association
  associatedProgramId: string | null;
  associatedProgramName: string | null;
  associatedWaiverId: string | null;
  associatedWaiverName: string | null;

  // Step 3: Payment Details
  signUpFee: number | null;
  chargeSignUpFee: ChargeSignUpFeeOption;
  monthlyFee: number | null;
  paymentFrequency: PaymentFrequency;
  membershipStartDate: MembershipStartDateOption;
  customStartDate: string;
  proRateFirstPayment: boolean;

  // Step 4: Contract Terms
  contractLength: ContractLength;
  autoRenewal: AutoRenewalOption;
  cancellationFee: number | null;
  holdLimitPerYear: number | null;
  holdFeeAmount: number | null;
  holdFeeFrequency: HoldFeeFrequencyOption | null;

  // Punchcard-specific fields
  classesIncluded: number | null;
  punchcardPrice: number | null;
};

export type MembershipWizardStep = 'basics' | 'program-association' | 'payment-details' | 'contract-terms' | 'success';

const initialData: AddMembershipWizardData = {
  membershipName: '',
  status: 'active',
  membershipType: 'standard',
  description: '',
  associatedProgramId: null,
  associatedProgramName: null,
  associatedWaiverId: null,
  associatedWaiverName: null,
  signUpFee: null,
  chargeSignUpFee: 'at-registration',
  monthlyFee: null,
  paymentFrequency: 'monthly',
  membershipStartDate: 'same-as-registration',
  customStartDate: '',
  proRateFirstPayment: false,
  contractLength: 'month-to-month',
  autoRenewal: 'none',
  cancellationFee: null,
  holdLimitPerYear: null,
  holdFeeAmount: null,
  holdFeeFrequency: null,
  classesIncluded: null,
  punchcardPrice: null,
};

export const useAddMembershipWizard = () => {
  const [step, setStep] = useState<MembershipWizardStep>('basics');
  const [data, setData] = useState<AddMembershipWizardData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateData = (updates: Partial<AddMembershipWizardData>) => {
    setData((prev) => {
      const newData = { ...prev, ...updates };
      return newData;
    });
    setError(null);
  };

  const nextStep = () => {
    const steps: MembershipWizardStep[] = ['basics', 'program-association', 'payment-details', 'contract-terms', 'success'];
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
    const steps: MembershipWizardStep[] = ['basics', 'program-association', 'payment-details', 'contract-terms', 'success'];
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
    setStep('basics');
    setData(initialData);
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
