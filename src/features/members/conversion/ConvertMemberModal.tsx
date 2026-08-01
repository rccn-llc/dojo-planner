'use client';

import type { Coupon } from '@/features/marketing';
import type { MemberType, PaymentDeclineReason } from '@/hooks/useAddMemberWizard';
import type { ConversionType, ConvertMemberWizardData } from '@/hooks/useConvertMemberWizard';
import type { TokenizationIframeConfig } from '@/libs/IQPro';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { dedupeRequest } from '@/hooks/dedupeRequest';
import { useConvertMemberWizard } from '@/hooks/useConvertMemberWizard';
import { client } from '@/libs/Orpc';
import { MembershipStep } from '../wizard/MembershipStep';
import { buildPaymentMethodFields, buildSignedWaiverPayload, captureCardRefs, computeDiscountedPrice } from '../wizard/memberWizardUtils';
import { PaymentStep } from '../wizard/PaymentStep';
import { WaiverStep } from '../wizard/WaiverStep';
import { ConvertConfirmStep } from './ConvertConfirmStep';
import { ConvertSuccessStep } from './ConvertSuccessStep';

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

  // Re-entrancy guard for handleConvert — see AddMemberModal for rationale.
  const submittingRef = useRef(false);

  const cardRefs = { cardToken: cardTokenRef, cardFirstSix: cardFirstSixRef, cardLastFour: cardLastFourRef };
  const updateDataWithRef = (updates: Partial<ConvertMemberWizardData>) => {
    captureCardRefs(updates, cardRefs);
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
    dedupeRequest(`payment.getTokenizationConfig:${JSON.stringify({ origin: window.location.origin })}`, async () => client.payment.getTokenizationConfig({ origin: window.location.origin }))
      .then(config => setTokenizationConfig(config ?? null))
      .catch(() => setTokenizationConfig(null));
  }, [isOpen, conversionType, hasPaymentMethod]);

  const handleCancel = () => {
    cardTokenRef.current = undefined;
    cardFirstSixRef.current = undefined;
    cardLastFourRef.current = undefined;
    submittingRef.current = false;
    wizard.reset();
    onCloseAction();
  };

  const handleSuccess = () => {
    cardTokenRef.current = undefined;
    cardFirstSixRef.current = undefined;
    cardLastFourRef.current = undefined;
    submittingRef.current = false;
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

    // Re-entrancy guard — see AddMemberModal.handleFinalNext for rationale.
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;

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

      // 3. Add membership if one was selected in the wizard. Capture the new
      // member_membership.id so the subsequent payment call can attach the
      // IQPro subscription + first/next payment dates to the right row.
      let newMemberMembershipId: string | undefined;
      if (wizard.data.membershipPlanId) {
        if (hasMembership || (conversionType === 'family-to-individual')) {
          // Change existing membership (marks old as 'converted', creates new)
          const r = await client.member.changeMembership({
            memberId,
            newMembershipPlanId: wizard.data.membershipPlanId,
          });
          newMemberMembershipId = r?.id;
        } else {
          // No existing membership — add new
          const r = await client.member.addMembership({
            memberId,
            membershipPlanId: wizard.data.membershipPlanId,
          });
          newMemberMembershipId = r?.id;
        }
      }

      // 4. Create signed waiver if waiver was signed
      if (
        wizard.data.waiverTemplateId
        && wizard.data.waiverSignatureDataUrl
        && wizard.data.waiverRenderedContent
        && !wizard.data.waiverSkipped
      ) {
        const [firstName = '', ...lastParts] = memberName.split(' ');
        const lastName = lastParts.join(' ');

        await client.waivers.createSignedWaiver(
          buildSignedWaiverPayload(wizard.data, memberId, { firstName, lastName, email: memberEmail }),
        );
      }

      // 5. Process payment (family-to-individual, or HOH-to-individual
      // without payment method). Recurring (post-coupon) goes in `amount`;
      // the signup fee rides separately so the IQPro subscription is
      // configured at the recurring price only.
      const planPrice = wizard.data.appliedCoupon
        ? computeDiscountedPrice(wizard.data.membershipPlanPrice, wizard.data.appliedCoupon) ?? 0
        : (wizard.data.membershipPlanPrice ?? 0);
      const signupFee = wizard.data.membershipPlanSignupFee ?? 0;
      const totalDueToday = planPrice + signupFee;

      let paymentDeclined = false;

      if (wizard.data.paymentMethod && totalDueToday > 0) {
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
            amount: planPrice,
            signupFee,
            description: wizard.data.membershipPlanName
              ? `Membership: ${wizard.data.membershipPlanName}`
              : 'Membership payment',
            ...buildPaymentMethodFields(wizard.data, cardRefs),
            ...(wizard.data.membershipPlanId && { membershipPlanId: wizard.data.membershipPlanId }),
            ...(wizard.data.membershipPlanFrequency && { membershipPlanFrequency: wizard.data.membershipPlanFrequency }),
            // New membership row from step 3 — payment service attaches the
            // IQPro subscription id + first/next payment dates here.
            ...(newMemberMembershipId && { memberMembershipId: newMemberMembershipId }),
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
      submittingRef.current = false;
    }
  };

  // Advance to the next step, but run the actual conversion (handleConvert) when
  // the next step is `success` — i.e. this is the last data-entry step. The
  // payment step wires handleConvert directly; this covers every other case
  // where the final step before success is confirm/subscription/waiver:
  //  - Individual→HOH (steps: confirm → success)
  //  - HOH→Individual with a membership + payment method already on file
  //    (steps: confirm → success)
  //  - HOH→Individual with a payment method but no membership
  //    (steps: confirm → subscription → waiver → success, no payment step)
  // Without this, the wizard advanced straight to the success screen and the
  // conversion RPC never fired, so the member type never changed (#224, #210).
  const handleStepNext = () => {
    const currentIndex = wizard.steps.indexOf(wizard.step);
    const nextStep = wizard.steps[currentIndex + 1];
    if (nextStep === 'success') {
      handleConvert();
    } else {
      wizard.nextStep();
    }
  };

  const handleConfirmNext = handleStepNext;

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
            <MembershipStep
              data={wizard.data}
              onUpdate={updateDataWithRef}
              onNext={handleStepNext}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              isLoading={wizard.isLoading}
            />
          )}

          {wizard.step === 'waiver' && (
            <WaiverStep
              data={wizard.data}
              onUpdate={updateDataWithRef}
              onNext={handleStepNext}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              isLoading={wizard.isLoading}
              memberDateOfBirth={wizard.data.memberDateOfBirth}
            />
          )}

          {wizard.step === 'payment' && (
            <PaymentStep
              data={wizard.data}
              onUpdateAction={updateDataWithRef}
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
