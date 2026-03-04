'use client';

import type { Coupon } from '@/features/marketing';
import type { AddMemberWizardData, AppliedCoupon, MemberType, PaymentDeclineReason } from '@/hooks/useAddMemberWizard';
import type { ConversionType, ConvertMemberWizardData } from '@/hooks/useConvertMemberWizard';
import type { TokenizationIframeConfig } from '@/libs/IQPro';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConvertMemberWizard } from '@/hooks/useConvertMemberWizard';
import { client } from '@/libs/Orpc';
import { MemberMembershipStep } from '../wizard/MemberMembershipStep';
import { MemberPaymentStep } from '../wizard/MemberPaymentStep';
import { MemberWaiverStep } from '../wizard/MemberWaiverStep';
import { ConvertConfirmStep } from './ConvertConfirmStep';
import { ConvertSuccessStep } from './ConvertSuccessStep';

function computeDiscountedPrice(price: number | undefined, coupon: AppliedCoupon): number | undefined {
  if (price === undefined || price <= 0) {
    return price;
  }
  switch (coupon.type) {
    case 'Percentage': {
      const percentageMatch = coupon.amount.match(/(\d+(?:\.\d+)?)/);
      const pct = percentageMatch?.[1] ? Number.parseFloat(percentageMatch[1]) : Number.NaN;
      return Number.isNaN(pct) ? price : Math.max(0, price - (price * pct / 100));
    }
    case 'Fixed Amount': {
      const fixedMatch = coupon.amount.match(/(\d+(?:\.\d+)?)/);
      const fixed = fixedMatch?.[1] ? Number.parseFloat(fixedMatch[1]) : Number.NaN;
      return Number.isNaN(fixed) ? price : Math.max(0, price - fixed);
    }
    case 'Free Trial':
      return 0;
  }
}

/**
 * Adapt ConvertMemberWizardData to AddMemberWizardData shape
 * so existing step components (MemberMembershipStep, MemberWaiverStep, MemberPaymentStep) can be reused.
 */
function toAddMemberData(data: ConvertMemberWizardData): AddMemberWizardData {
  return {
    memberType: data.targetMemberType,
    firstName: data.memberName.split(' ')[0] ?? '',
    lastName: data.memberName.split(' ').slice(1).join(' ') ?? '',
    email: data.memberEmail,
    phone: '',
    dateOfBirth: data.memberDateOfBirth,
    membershipPlanId: data.membershipPlanId,
    membershipPlanPrice: data.membershipPlanPrice,
    membershipPlanFrequency: data.membershipPlanFrequency,
    membershipPlanName: data.membershipPlanName,
    membershipPlanIsTrial: data.membershipPlanIsTrial,
    membershipPlanContractLength: data.membershipPlanContractLength,
    membershipPlanSignupFee: data.membershipPlanSignupFee,
    waiverTemplateId: data.waiverTemplateId,
    waiverSignatureDataUrl: data.waiverSignatureDataUrl,
    waiverSignedByName: data.waiverSignedByName,
    waiverSignedByRelationship: data.waiverSignedByRelationship,
    waiverGuardianEmail: data.waiverGuardianEmail,
    waiverSignedAt: data.waiverSignedAt,
    waiverSkipped: data.waiverSkipped,
    waiverRenderedContent: data.waiverRenderedContent,
    paymentMethod: data.paymentMethod,
    billingType: data.billingType,
    cardholderName: data.cardholderName,
    cardNumber: data.cardNumber,
    cardToken: data.cardToken,
    cardFirstSix: data.cardFirstSix,
    cardLastFour: data.cardLastFour,
    cardExpiry: data.cardExpiry,
    cardCvc: data.cardCvc,
    achAccountHolder: data.achAccountHolder,
    achRoutingNumber: data.achRoutingNumber,
    achAccountNumber: data.achAccountNumber,
    achAccountType: data.achAccountType,
    appliedCoupon: data.appliedCoupon,
    paymentStatus: data.paymentStatus,
    paymentDeclineReason: data.paymentDeclineReason,
    paymentProcessed: data.paymentProcessed,
  };
}

type ConvertMemberModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  memberId: string;
  memberName: string;
  memberEmail: string;
  currentMemberType: MemberType;
  memberDateOfBirth?: Date;
  conversionType: ConversionType;
  hasMembership: boolean;
  hasPaymentMethod: boolean;
  currentHOHId?: string;
  currentHOHName?: string;
  availableCoupons?: Coupon[];
};

export const ConvertMemberModal = ({
  isOpen,
  onCloseAction,
  memberId,
  memberName,
  memberEmail,
  currentMemberType,
  memberDateOfBirth,
  conversionType,
  hasMembership,
  hasPaymentMethod,
  currentHOHId,
  currentHOHName,
  availableCoupons = [],
}: ConvertMemberModalProps) => {
  const router = useRouter();
  const t = useTranslations('ConvertMember');

  const targetMemberType: MemberType = conversionType === 'individual-to-hoh'
    ? 'head-of-household'
    : 'individual';

  const wizard = useConvertMemberWizard({
    memberId,
    memberName,
    memberEmail,
    currentMemberType,
    memberDateOfBirth,
    conversionType,
    targetMemberType,
    hasMembership,
    hasPaymentMethod,
    currentHOHId,
    currentHOHName,
  });

  const [tokenizationConfig, setTokenizationConfig] = useState<TokenizationIframeConfig | null>(null);
  const cardTokenRef = useRef<string | undefined>(undefined);
  const cardFirstSixRef = useRef<string | undefined>(undefined);
  const cardLastFourRef = useRef<string | undefined>(undefined);

  const updateDataWithRef = (updates: Partial<ConvertMemberWizardData>) => {
    if (updates.cardToken !== undefined) {
      cardTokenRef.current = updates.cardToken;
    }
    if (updates.cardFirstSix !== undefined) {
      cardFirstSixRef.current = updates.cardFirstSix;
    }
    if (updates.cardLastFour !== undefined) {
      cardLastFourRef.current = updates.cardLastFour;
    }
    wizard.updateData(updates);
  };

  // Fetch tokenization config when modal opens (only needed for payment step)
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const needsPayment = conversionType === 'family-to-individual'
      || (conversionType === 'hoh-to-individual' && !hasPaymentMethod);
    if (!needsPayment) {
      return;
    }
    client.payment.getTokenizationConfig({ origin: window.location.origin })
      .then(config => setTokenizationConfig(config ?? null))
      .catch(() => setTokenizationConfig(null));
  }, [isOpen, conversionType, hasPaymentMethod]);

  const handleCancel = () => {
    cardTokenRef.current = undefined;
    cardFirstSixRef.current = undefined;
    cardLastFourRef.current = undefined;
    wizard.reset();
    onCloseAction();
  };

  const handleSuccess = () => {
    cardTokenRef.current = undefined;
    cardFirstSixRef.current = undefined;
    cardLastFourRef.current = undefined;
    wizard.reset();
    onCloseAction();
    router.refresh();
  };

  const handleConvert = async () => {
    // If payment was declined and processed, user chose to proceed — go to success
    if (wizard.data.paymentStatus === 'declined' && wizard.data.paymentProcessed) {
      wizard.setStep('success');
      return;
    }

    try {
      wizard.setIsLoading(true);
      wizard.clearError();

      // 1. Unlink family member from HOH (family-to-individual only)
      if (conversionType === 'family-to-individual' && wizard.data.currentHOHId) {
        await client.member.unlinkFamilyMember({
          memberId,
          hohMemberId: wizard.data.currentHOHId,
        });
      }

      // 2. Update the member type
      await client.member.updateMemberType({
        id: memberId,
        memberType: targetMemberType,
      });

      // 3. Add membership if one was selected in the wizard
      if (wizard.data.membershipPlanId) {
        if (hasMembership || (conversionType === 'family-to-individual')) {
          // Change existing membership (marks old as 'converted', creates new)
          await client.member.changeMembership({
            memberId,
            newMembershipPlanId: wizard.data.membershipPlanId,
          });
        } else {
          // No existing membership — add new
          await client.member.addMembership({
            memberId,
            membershipPlanId: wizard.data.membershipPlanId,
          });
        }
      }

      // 4. Create signed waiver if waiver was signed
      if (
        wizard.data.waiverTemplateId
        && wizard.data.waiverSignatureDataUrl
        && wizard.data.waiverRenderedContent
        && !wizard.data.waiverSkipped
      ) {
        let memberAgeAtSigning: number | undefined;
        if (wizard.data.memberDateOfBirth) {
          const today = new Date();
          let age = today.getFullYear() - wizard.data.memberDateOfBirth.getFullYear();
          const monthDiff = today.getMonth() - wizard.data.memberDateOfBirth.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < wizard.data.memberDateOfBirth.getDate())) {
            age--;
          }
          memberAgeAtSigning = age;
        }

        const [firstName = '', ...lastParts] = memberName.split(' ');
        const lastName = lastParts.join(' ');

        await client.waivers.createSignedWaiver({
          waiverTemplateId: wizard.data.waiverTemplateId,
          memberId,
          signatureDataUrl: wizard.data.waiverSignatureDataUrl,
          signedByName: wizard.data.waiverSignedByName || firstName,
          signedByRelationship: wizard.data.waiverSignedByRelationship || 'self',
          ...(wizard.data.waiverGuardianEmail && { signedByEmail: wizard.data.waiverGuardianEmail }),
          memberFirstName: firstName,
          memberLastName: lastName,
          memberEmail,
          ...(wizard.data.memberDateOfBirth && { memberDateOfBirth: wizard.data.memberDateOfBirth }),
          ...(memberAgeAtSigning !== undefined && { memberAgeAtSigning }),
          renderedContent: wizard.data.waiverRenderedContent,
          ...(wizard.data.membershipPlanName && { membershipPlanName: wizard.data.membershipPlanName }),
          ...(wizard.data.membershipPlanPrice !== undefined && { membershipPlanPrice: wizard.data.membershipPlanPrice }),
          ...(wizard.data.membershipPlanFrequency && { membershipPlanFrequency: wizard.data.membershipPlanFrequency }),
          ...(wizard.data.membershipPlanContractLength && { membershipPlanContractLength: wizard.data.membershipPlanContractLength }),
          ...(wizard.data.membershipPlanSignupFee !== undefined && { membershipPlanSignupFee: wizard.data.membershipPlanSignupFee }),
          ...(wizard.data.membershipPlanIsTrial !== undefined && { membershipPlanIsTrial: wizard.data.membershipPlanIsTrial }),
          ...(wizard.data.appliedCoupon && {
            couponCode: wizard.data.appliedCoupon.code,
            couponType: wizard.data.appliedCoupon.type,
            couponAmount: wizard.data.appliedCoupon.amount,
            couponDiscountedPrice: computeDiscountedPrice(wizard.data.membershipPlanPrice, wizard.data.appliedCoupon),
          }),
        });
      }

      // 5. Process payment (family-to-individual, or HOH-to-individual without payment method)
      const finalPrice = wizard.data.appliedCoupon
        ? computeDiscountedPrice(wizard.data.membershipPlanPrice, wizard.data.appliedCoupon) ?? 0
        : (wizard.data.membershipPlanPrice ?? 0);

      let paymentDeclined = false;

      if (wizard.data.paymentMethod && finalPrice > 0) {
        try {
          wizard.updateData({ paymentStatus: 'processing' });

          const [firstName = '', ...lastParts] = memberName.split(' ');
          const lastName = lastParts.join(' ');

          const paymentResult = await client.payment.process({
            memberId,
            memberEmail,
            memberFirstName: firstName,
            memberLastName: lastName,
            paymentMethod: wizard.data.paymentMethod,
            billingType: wizard.data.billingType || 'autopay',
            amount: finalPrice,
            description: wizard.data.membershipPlanName
              ? `Membership: ${wizard.data.membershipPlanName}`
              : 'Membership payment',
            ...(wizard.data.cardholderName && { cardholderName: wizard.data.cardholderName }),
            ...((cardTokenRef.current || wizard.data.cardToken) && { cardToken: cardTokenRef.current || wizard.data.cardToken }),
            ...((cardFirstSixRef.current || wizard.data.cardFirstSix) && { cardFirstSix: cardFirstSixRef.current || wizard.data.cardFirstSix }),
            ...((cardLastFourRef.current || wizard.data.cardLastFour) && { cardLastFour: cardLastFourRef.current || wizard.data.cardLastFour }),
            ...(wizard.data.cardNumber && !cardTokenRef.current && !wizard.data.cardToken && { cardNumber: wizard.data.cardNumber }),
            ...(wizard.data.cardExpiry && { cardExpiry: wizard.data.cardExpiry }),
            ...(wizard.data.cardCvc && { cardCvc: wizard.data.cardCvc }),
            ...(wizard.data.achAccountHolder && { achAccountHolder: wizard.data.achAccountHolder }),
            ...(wizard.data.achRoutingNumber && { achRoutingNumber: wizard.data.achRoutingNumber }),
            ...(wizard.data.achAccountNumber && { achAccountNumber: wizard.data.achAccountNumber }),
            ...(wizard.data.achAccountType && { achAccountType: wizard.data.achAccountType }),
            ...(wizard.data.membershipPlanId && { membershipPlanId: wizard.data.membershipPlanId }),
            ...(wizard.data.membershipPlanFrequency && { membershipPlanFrequency: wizard.data.membershipPlanFrequency }),
            ...(wizard.data.appliedCoupon && { appliedCoupon: wizard.data.appliedCoupon }),
          });

          wizard.updateData({
            paymentStatus: paymentResult.success ? 'approved' : 'declined',
            paymentDeclineReason: paymentResult.declineReason as PaymentDeclineReason | undefined,
            paymentProcessed: true,
          });

          if (!paymentResult.success) {
            paymentDeclined = true;
          }
        } catch {
          wizard.updateData({
            paymentStatus: 'declined',
            paymentDeclineReason: 'card_declined',
            paymentProcessed: true,
          });
          paymentDeclined = true;
        }
      }

      if (paymentDeclined) {
        return;
      }

      wizard.setStep('success');
    } catch (error) {
      let errorMessage = 'Failed to convert member. Please try again.';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        const errObj = error as Record<string, unknown>;
        if ('message' in errObj) {
          errorMessage = String(errObj.message);
        }
      }
      wizard.setError(errorMessage);
    } finally {
      wizard.setIsLoading(false);
    }
  };

  const handleConfirmNext = () => {
    if (conversionType === 'individual-to-hoh') {
      // Simple conversion — no additional steps needed
      handleConvert();
    } else {
      wizard.nextStep();
    }
  };

  const getDialogTitle = (): string => {
    switch (wizard.step) {
      case 'confirm':
        return t('dialog_title_confirm');
      case 'subscription':
        return t('dialog_title_subscription');
      case 'waiver':
        return t('dialog_title_waiver');
      case 'payment':
        return t('dialog_title_payment');
      case 'success':
        return t('dialog_title_success');
      default:
        return t('dialog_title_confirm');
    }
  };

  // Adapter for step components that expect AddMemberWizardData
  const adaptedData = toAddMemberData(wizard.data);

  // Fields shared between AddMemberWizardData and ConvertMemberWizardData
  const SHARED_FIELDS = [
    'membershipPlanId',
    'membershipPlanPrice',
    'membershipPlanFrequency',
    'membershipPlanName',
    'membershipPlanIsTrial',
    'membershipPlanContractLength',
    'membershipPlanSignupFee',
    'waiverTemplateId',
    'waiverSignatureDataUrl',
    'waiverSignedByName',
    'waiverSignedByRelationship',
    'waiverGuardianEmail',
    'waiverSignedAt',
    'waiverSkipped',
    'waiverRenderedContent',
    'paymentMethod',
    'billingType',
    'cardholderName',
    'cardNumber',
    'cardToken',
    'cardFirstSix',
    'cardLastFour',
    'cardExpiry',
    'cardCvc',
    'achAccountHolder',
    'achRoutingNumber',
    'achAccountNumber',
    'achAccountType',
    'appliedCoupon',
    'paymentStatus',
    'paymentDeclineReason',
    'paymentProcessed',
  ] as const;

  const adaptedUpdate = (updates: Partial<AddMemberWizardData>) => {
    const mapped: Partial<ConvertMemberWizardData> = {};
    for (const key of SHARED_FIELDS) {
      if (updates[key] !== undefined) {
        (mapped as Record<string, unknown>)[key] = updates[key];
      }
    }
    updateDataWithRef(mapped);
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleCancel()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
        </DialogHeader>

        <div className="py-6">
          {wizard.step === 'confirm' && (
            <ConvertConfirmStep
              data={wizard.data}
              onNext={handleConfirmNext}
              onCancel={handleCancel}
            />
          )}

          {wizard.step === 'subscription' && (
            <MemberMembershipStep
              data={adaptedData}
              onUpdate={adaptedUpdate}
              onNext={wizard.nextStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              isLoading={wizard.isLoading}
            />
          )}

          {wizard.step === 'waiver' && (
            <MemberWaiverStep
              data={adaptedData}
              onUpdate={adaptedUpdate}
              onNext={wizard.nextStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              isLoading={wizard.isLoading}
              memberDateOfBirth={wizard.data.memberDateOfBirth}
            />
          )}

          {wizard.step === 'payment' && (
            <MemberPaymentStep
              data={adaptedData}
              onUpdateAction={adaptedUpdate}
              onNextAction={handleConvert}
              onBackAction={wizard.previousStep}
              onCancelAction={handleCancel}
              isLoading={wizard.isLoading}
              availableCoupons={availableCoupons}
              tokenizationConfig={tokenizationConfig}
              memberType={targetMemberType}
            />
          )}

          {wizard.step === 'success' && (
            <ConvertSuccessStep
              data={wizard.data}
              onDone={handleSuccess}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
