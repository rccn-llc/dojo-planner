'use client';

import type { Coupon } from '@/features/marketing';
import type { PaymentDeclineReason, PaymentMethod } from '@/hooks/useAddMemberWizard';
import type { HOHData } from '@/hooks/useFamilyMemberWizard';
import type { TokenizationIframeConfig } from '@/libs/IQPro';
import { useOrganization, useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFamilyMemberWizard } from '@/hooks/useFamilyMemberWizard';
import { client } from '@/libs/Orpc';
import { FamilyMemberSuccessStep } from './FamilyMemberSuccessStep';
import { FamilyPaymentStep } from './FamilyPaymentStep';
import { MemberDetailsStep } from './MemberDetailsStep';
import { MemberPhotoStep } from './MemberPhotoStep';
import { MembershipStep } from './MembershipStep';
import { buildSignedWaiverPayload, computeDiscountedPrice, fileToDataUrl } from './memberWizardUtils';
import { WaiverStep } from './WaiverStep';

type AddFamilyMembersModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  hohMember: HOHData;
  availableCoupons?: Coupon[];
};

export const AddFamilyMembersModal = ({
  isOpen,
  onCloseAction,
  hohMember,
  availableCoupons = [],
}: AddFamilyMembersModalProps) => {
  const router = useRouter();
  const wizard = useFamilyMemberWizard(hohMember);
  const { user } = useUser();
  const { organization } = useOrganization();
  const t = useTranslations('AddFamilyMembersModal');

  const [tokenizationConfig, setTokenizationConfig] = useState<TokenizationIframeConfig | null>(null);

  // Refs for TokenEx iframe token data (avoids stale closure)
  const cardTokenRef = useRef<string | undefined>(undefined);
  const cardFirstSixRef = useRef<string | undefined>(undefined);
  const cardLastFourRef = useRef<string | undefined>(undefined);

  // Tracks the just-created family member's id between member.create and the
  // payment call. On payment decline + cancel, this is what we pass to
  // client.member.removeFully to roll back the half-finished signup (#132).
  const createdMemberIdRef = useRef<string | undefined>(undefined);
  const createdMemberMembershipIdRef = useRef<string | undefined>(undefined);

  // Re-entrancy guard for handleFamilyMemberSubmit — see AddMemberModal for rationale.
  const submittingRef = useRef(false);

  // Key to force TokenEx iframe re-init between family members
  const [paymentStepKey, setPaymentStepKey] = useState(0);

  // Fetch tokenization config
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const fetchConfig = async () => {
      try {
        const config = await client.payment.getTokenizationConfig({
          origin: window.location.origin,
        });
        setTokenizationConfig(config);
      } catch {
        setTokenizationConfig(null);
      }
    };
    fetchConfig();
  }, [isOpen]);

  const updateDataWithRef = (updates: Parameters<typeof wizard.updateData>[0]) => {
    if ('cardToken' in updates && updates.cardToken) {
      cardTokenRef.current = updates.cardToken;
    }
    if ('cardFirstSix' in updates && updates.cardFirstSix) {
      cardFirstSixRef.current = updates.cardFirstSix;
    }
    if ('cardLastFour' in updates && updates.cardLastFour) {
      cardLastFourRef.current = updates.cardLastFour;
    }
    wizard.updateData(updates);
  };

  const handleCancel = () => {
    // #132 — if the in-progress family member was created earlier in the
    // flow and the user is now bailing after a payment decline, roll back.
    // Already-completed family members (in wizard.completedMembers) are
    // left alone — those payments succeeded.
    const memberIdToRollBack = createdMemberIdRef.current;
    if (memberIdToRollBack && wizard.data.paymentStatus === 'declined') {
      void client.member.removeFully({ id: memberIdToRollBack }).catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[AddFamilyMembers] Rollback failed:', err);
        }
      });
    }
    cardTokenRef.current = undefined;
    cardFirstSixRef.current = undefined;
    cardLastFourRef.current = undefined;
    createdMemberIdRef.current = undefined;
    createdMemberMembershipIdRef.current = undefined;
    submittingRef.current = false;
    wizard.reset();
    onCloseAction();
    if (wizard.completedMembers.length > 0) {
      router.refresh();
    }
  };

  const handleDone = () => {
    cardTokenRef.current = undefined;
    cardFirstSixRef.current = undefined;
    cardLastFourRef.current = undefined;
    createdMemberIdRef.current = undefined;
    createdMemberMembershipIdRef.current = undefined;
    submittingRef.current = false;
    wizard.reset();
    onCloseAction();
    router.refresh();
  };

  const handleAddAnother = () => {
    cardTokenRef.current = undefined;
    cardFirstSixRef.current = undefined;
    cardLastFourRef.current = undefined;
    createdMemberIdRef.current = undefined;
    createdMemberMembershipIdRef.current = undefined;
    submittingRef.current = false;
    wizard.resetForNextMember();
    setPaymentStepKey(prev => prev + 1);
  };

  // Fire-and-forget email sending helper
  const sendConfirmationEmail = async (memberId: string) => {
    try {
      const emailParams: Record<string, unknown> = {
        memberId,
        memberEmail: wizard.data.email,
        memberName: `${wizard.data.firstName} ${wizard.data.lastName}`,
        ...(wizard.data.membershipPlanName && { membershipPlanName: wizard.data.membershipPlanName }),
        ...(wizard.data.membershipPlanPrice !== undefined && { membershipPlanPrice: wizard.data.membershipPlanPrice }),
        ...(wizard.data.membershipPlanFrequency && { membershipPlanFrequency: wizard.data.membershipPlanFrequency }),
        memberType: 'family-member',
        hohName: hohMember.name,
      };

      if (
        wizard.data.waiverTemplateId
        && wizard.data.waiverSignatureDataUrl
        && wizard.data.waiverRenderedContent
        && !wizard.data.waiverSkipped
        && organization?.name
      ) {
        emailParams.waiverPdfData = {
          organizationName: organization.name,
          waiverName: 'Membership Waiver',
          waiverVersion: 1,
          renderedContent: wizard.data.waiverRenderedContent,
          memberFirstName: wizard.data.firstName,
          memberLastName: wizard.data.lastName,
          memberEmail: wizard.data.email,
          signatureDataUrl: wizard.data.waiverSignatureDataUrl,
          signedByName: wizard.data.waiverSignedByName || wizard.data.firstName,
          ...(wizard.data.waiverSignedByRelationship && { signedByRelationship: wizard.data.waiverSignedByRelationship }),
          ...(wizard.data.waiverMemberSignatureDataUrl && { memberSignatureDataUrl: wizard.data.waiverMemberSignatureDataUrl }),
          ...(wizard.data.waiverMemberSignedByName && { memberSignedByName: wizard.data.waiverMemberSignedByName }),
          signedAt: wizard.data.waiverSignedAt || new Date(),
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
        };
      }

      await client.member.sendConfirmationEmail(emailParams as Parameters<typeof client.member.sendConfirmationEmail>[0]);
    } catch (emailErr) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[AddFamilyMembers] Failed to send confirmation email:', emailErr);
      }
    }
  };

  const handleFamilyMemberSubmit = async () => {
    if (wizard.data.paymentStatus === 'declined' && wizard.data.paymentProcessed) {
      wizard.setStep('member-success');
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

      if (!user) {
        throw new Error('User not authenticated');
      }
      if (!organization) {
        throw new Error('User not part of an organization');
      }

      // Build address payload
      const addressPayload = wizard.data.address
        ? {
            street: wizard.data.address.street,
            apartment: wizard.data.address.apartment,
            city: wizard.data.address.city,
            state: wizard.data.address.state,
            zipCode: wizard.data.address.zipCode,
            country: wizard.data.address.country,
          }
        : undefined;

      // Convert photo to base64
      let photoUrl: string | undefined;
      if (wizard.data.photoFile) {
        photoUrl = await fileToDataUrl(wizard.data.photoFile);
      }

      // Steps 1-3 (create member, sign waiver, link to HOH) run ONCE. On a
      // payment-decline "Try Again", the member already exists — re-running
      // create would spawn a duplicate active member on every retry (#220). If
      // we already created one, reuse it and jump straight to payment.
      let result: { id: string | undefined; memberMembershipId?: string };
      if (createdMemberIdRef.current) {
        result = { id: createdMemberIdRef.current, memberMembershipId: createdMemberMembershipIdRef.current };
      } else {
        // 1. Create the member
        const created = await client.member.create({
          email: wizard.data.email,
          firstName: wizard.data.firstName,
          lastName: wizard.data.lastName,
          phone: wizard.data.phone,
          dateOfBirth: wizard.data.dateOfBirth!,
          memberType: 'family-member' as const,
          ...(wizard.data.membershipPlanId && { membershipPlanId: wizard.data.membershipPlanId }),
          ...(addressPayload && { address: addressPayload }),
          ...(photoUrl && { photoUrl }),
          ...(wizard.data.appliedCoupon && {
            appliedCoupon: {
              id: wizard.data.appliedCoupon.id,
              code: wizard.data.appliedCoupon.code,
              type: wizard.data.appliedCoupon.type,
              amount: wizard.data.appliedCoupon.amount,
              description: wizard.data.appliedCoupon.description,
            },
          }),
        });
        result = created;
        // Track the new member's id so a retry reuses it and handleCancel can
        // roll back the whole signup chain if the user bails after a decline.
        createdMemberIdRef.current = created.id;
        createdMemberMembershipIdRef.current = created.memberMembershipId;

        // 2. Create signed waiver if applicable
        if (
          created.id
          && wizard.data.waiverTemplateId
          && wizard.data.waiverSignatureDataUrl
          && wizard.data.waiverRenderedContent
          && !wizard.data.waiverSkipped
        ) {
          await client.waivers.createSignedWaiver(
            buildSignedWaiverPayload(wizard.data, created.id),
          );
        }

        // 3. Link family member to HOH
        if (created.id) {
          await client.member.linkFamilyMember({
            memberId: created.id,
            hohMemberId: hohMember.id,
            relationship: 'family-member',
          });
        }
      }

      // 4. Process payment. Recurring (post-coupon) goes in `amount`; the
      // signup fee rides separately so the IQPro subscription is configured at
      // the recurring price only (the fee is bundled into the initial Sale).
      const planPrice = wizard.data.appliedCoupon
        ? computeDiscountedPrice(wizard.data.membershipPlanPrice, wizard.data.appliedCoupon) ?? 0
        : (wizard.data.membershipPlanPrice ?? 0);
      const signupFee = wizard.data.membershipPlanSignupFee ?? 0;
      const totalDueToday = planPrice + signupFee;

      let paymentDeclined = false;

      if (totalDueToday > 0 && result.id) {
        try {
          wizard.updateData({ paymentStatus: 'processing' });

          const paymentMemberId = wizard.data.hohHasPaymentMethod
            ? hohMember.id
            : result.id;

          const paymentResult = await client.payment.process({
            memberId: paymentMemberId,
            memberEmail: wizard.data.email,
            memberFirstName: wizard.data.firstName,
            memberLastName: wizard.data.lastName,
            ...(wizard.data.phone && { memberPhone: wizard.data.phone }),
            ...(wizard.data.address && { memberAddress: wizard.data.address }),
            paymentMethod: wizard.data.hohHasPaymentMethod
              ? (wizard.data.hohPaymentMethodType || 'card')
              : (wizard.data.paymentMethod || 'card'),
            // 'saved' tells the server to charge HOH's existing IQPro PM
            // without re-collecting card data.
            paymentMethodSource: wizard.data.hohHasPaymentMethod ? 'saved' : 'new',
            billingType: 'autopay',
            amount: planPrice,
            signupFee,
            description: wizard.data.membershipPlanName
              ? `Membership: ${wizard.data.membershipPlanName}`
              : 'Membership payment',
            ...(!wizard.data.hohHasPaymentMethod && {
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
            }),
            ...(wizard.data.membershipPlanId && { membershipPlanId: wizard.data.membershipPlanId }),
            ...(wizard.data.membershipPlanFrequency && { membershipPlanFrequency: wizard.data.membershipPlanFrequency }),
            // Family member's own membership row id — the payment service
            // updates this row with the IQPro subscription id + dates.
            ...(result.memberMembershipId && { memberMembershipId: result.memberMembershipId }),
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

          // If HOH had no payment method and payment succeeded, update HOH payment info
          // so subsequent family members can use the newly registered card.
          if (paymentResult.success && !wizard.data.hohHasPaymentMethod) {
            try {
              const pmResult = await client.member.getHOHPaymentMethods({ hohMemberId: hohMember.id });
              if (pmResult.paymentMethods && pmResult.paymentMethods.length > 0) {
                const primary = pmResult.paymentMethods[0]!;
                wizard.updateHOHPaymentInfo({
                  hasPaymentMethod: true,
                  paymentMethodLast4: primary.last4 || undefined,
                  paymentMethodType: (primary.type === 'bank_transfer' ? 'ach' : 'card') as PaymentMethod,
                });
              }
            } catch {
              // Non-critical — next member will just collect payment again
            }
          }
        } catch (paymentError) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[AddFamilyMembers] Payment error:', paymentError);
          }
          wizard.updateData({
            paymentStatus: 'declined',
            paymentDeclineReason: 'card_declined',
            paymentProcessed: true,
          });
          paymentDeclined = true;
        }
      }

      // 5. Send confirmation email
      if (result.id) {
        sendConfirmationEmail(result.id);
      }

      if (paymentDeclined) {
        return;
      }

      // 6. Track completed member and advance to success
      wizard.addCompletedMember({
        id: result.id ?? '',
        name: `${wizard.data.firstName} ${wizard.data.lastName}`,
      });
      wizard.setStep('member-success');
    } catch (error) {
      console.error('[AddFamilyMembers] Failed to create family member:', error);
      let errorMessage = 'Failed to create member. Please try again.';
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

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleCancel();
        }
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('title')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t('subtitle', { hohName: hohMember.name })}
          </p>
        </DialogHeader>

        {wizard.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {wizard.error}
          </div>
        )}

        {wizard.step === 'details' && (
          <MemberDetailsStep
            data={wizard.data}
            onUpdate={wizard.updateData}
            onNext={wizard.nextStep}
            onBack={handleCancel}
            onCancel={handleCancel}
            error={wizard.error}
          />
        )}

        {wizard.step === 'photo' && (
          <MemberPhotoStep
            data={wizard.data}
            onUpdate={wizard.updateData}
            onNext={wizard.nextStep}
            onBack={wizard.previousStep}
            onCancel={handleCancel}
          />
        )}

        {wizard.step === 'subscription' && (
          <MembershipStep
            data={wizard.data}
            onUpdate={wizard.updateData}
            onNext={wizard.nextStep}
            onBack={wizard.previousStep}
            onCancel={handleCancel}
            isLoading={wizard.isLoading}
          />
        )}

        {wizard.step === 'waiver' && (
          <WaiverStep
            data={wizard.data}
            onUpdate={wizard.updateData}
            onNext={wizard.nextStep}
            onBack={wizard.previousStep}
            onCancel={handleCancel}
            memberDateOfBirth={wizard.data.dateOfBirth}
          />
        )}

        {wizard.step === 'family-payment' && (
          <FamilyPaymentStep
            key={paymentStepKey}
            data={wizard.data}
            onUpdateAction={updateDataWithRef}
            onNextAction={handleFamilyMemberSubmit}
            onBackAction={wizard.previousStep}
            onCancelAction={handleCancel}
            isLoading={wizard.isLoading}
            availableCoupons={availableCoupons}
            tokenizationConfig={tokenizationConfig}
          />
        )}

        {wizard.step === 'member-success' && (
          <FamilyMemberSuccessStep
            memberName={`${wizard.data.firstName} ${wizard.data.lastName}`}
            completedMembers={wizard.completedMembers}
            onAddAnother={handleAddAnother}
            onDone={handleDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
