import { useState } from 'react';

export type MemberType = 'individual' | 'family-member' | 'head-of-household';
type SubscriptionPlan = 'free-trial' | 'monthly' | 'annual';
export type PaymentMethod = 'card' | 'ach';
export type PaymentStatus = 'pending' | 'processing' | 'approved' | 'declined';
export type PaymentDeclineReason = 'insufficient_funds' | 'invalid_cvc' | 'expired_card' | 'card_declined' | 'ach_failed';
export type BillingType = 'autopay' | 'one-time';

// Coupon information for payment step
export type AppliedCoupon = {
  id: string;
  code: string;
  type: 'Percentage' | 'Fixed Amount' | 'Free Trial';
  amount: string;
  description: string;
};

export type SignerRelationship = 'self' | 'parent' | 'guardian' | 'legal_guardian';

export type AddMemberWizardData = {
  // Step 1: Member Type
  memberType: MemberType | null;

  // Step 2: Member Details
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth?: Date;
  address?: {
    street: string;
    apartment?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };

  // Step 3: Photo
  photoFile?: File | null;
  photoUrl?: string;

  // Step 4: Membership
  membershipPlanId: string | null;
  membershipPlanPrice?: number;
  membershipPlanFrequency?: string;
  membershipPlanName?: string;
  membershipPlanIsTrial?: boolean;
  membershipPlanContractLength?: string;
  membershipPlanSignupFee?: number;
  // Legacy fields (kept for backwards compatibility)
  subscriptionPlan?: SubscriptionPlan | null;
  subscriptionId?: string;

  // Step 5: Waiver (required when membership has associated waiver)
  waiverTemplateId: string | null;
  waiverSignatureDataUrl?: string;
  waiverSignedByName?: string;
  waiverSignedByRelationship?: SignerRelationship;
  waiverGuardianEmail?: string;
  waiverSignedAt?: Date;
  waiverSkipped?: boolean;
  waiverRenderedContent?: string;

  // Step 6: Payment (only for monthly/annual plans)
  paymentMethod?: PaymentMethod;
  billingType?: BillingType; // autopay (recurring) or one-time payment
  cardholderName?: string;
  cardNumber?: string; // Fallback: raw card (local dev without IQPro)
  cardToken?: string; // PCI-compliant: tokenized card from TokenEx iframe
  cardFirstSix?: string; // First 6 digits (BIN) from TokenEx tokenization (for maskedCard)
  cardLastFour?: string; // Last 4 digits from TokenEx tokenization (for maskedCard)
  cardExpiry?: string;
  cardCvc?: string;
  achAccountHolder?: string;
  achRoutingNumber?: string;
  achAccountNumber?: string;
  achAccountType?: 'Checking' | 'Savings';

  // HOH (Head of Household) fields — used when memberType is 'family-member'
  hohMemberId?: string;
  hohMemberName?: string;
  hohMemberEmail?: string;
  hohHasPaymentMethod?: boolean;
  hohPaymentMethodLast4?: string;
  hohPaymentMethodType?: PaymentMethod;

  // Membership skipped (HOH only — no membership selected, card capture only)
  membershipSkipped?: boolean;

  // Coupon applied to payment
  appliedCoupon?: AppliedCoupon | null;

  // Payment processing state
  paymentStatus?: PaymentStatus;
  paymentDeclineReason?: PaymentDeclineReason;
  paymentProcessed?: boolean;
};

export type WizardStep = 'member-type' | 'details' | 'photo' | 'subscription' | 'waiver' | 'payment' | 'hoh-selection' | 'family-payment' | 'success';

export function getStepsForMemberType(memberType: MemberType | null): WizardStep[] {
  if (memberType === 'family-member') {
    return ['member-type', 'details', 'photo', 'subscription', 'waiver', 'hoh-selection', 'family-payment', 'success'];
  }
  // individual and head-of-household share the same flow
  return ['member-type', 'details', 'photo', 'subscription', 'waiver', 'payment', 'success'];
}

export const useAddMemberWizard = () => {
  const [step, setStep] = useState<WizardStep>('member-type');
  const [data, setData] = useState<AddMemberWizardData>({
    memberType: null,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    membershipPlanId: null,
    waiverTemplateId: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateData = (updates: Partial<AddMemberWizardData>) => {
    setData((prev) => {
      const newData = { ...prev, ...updates };
      return newData;
    });
    setError(null);
  };

  const nextStep = () => {
    const steps = getStepsForMemberType(data.memberType);
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
    const steps = getStepsForMemberType(data.memberType);
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
    setStep('member-type');
    setData({
      memberType: null,
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      membershipPlanId: null,
      waiverTemplateId: null,
      waiverSignatureDataUrl: undefined,
      waiverSignedByName: undefined,
      waiverSignedByRelationship: undefined,
      waiverGuardianEmail: undefined,
      waiverSignedAt: undefined,
      waiverSkipped: undefined,
      waiverRenderedContent: undefined,
      membershipSkipped: undefined,
      paymentMethod: undefined,
      billingType: undefined,
      cardholderName: undefined,
      cardNumber: undefined,
      cardToken: undefined,
      cardFirstSix: undefined,
      cardLastFour: undefined,
      cardExpiry: undefined,
      cardCvc: undefined,
      achAccountHolder: undefined,
      achRoutingNumber: undefined,
      achAccountNumber: undefined,
      achAccountType: undefined,
      hohMemberId: undefined,
      hohMemberName: undefined,
      hohMemberEmail: undefined,
      hohHasPaymentMethod: undefined,
      hohPaymentMethodLast4: undefined,
      hohPaymentMethodType: undefined,
      appliedCoupon: undefined,
      paymentStatus: undefined,
      paymentDeclineReason: undefined,
      paymentProcessed: undefined,
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
