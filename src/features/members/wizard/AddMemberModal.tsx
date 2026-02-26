'use client';

import type { Coupon } from '@/features/marketing';
import type { AppliedCoupon, PaymentDeclineReason } from '@/hooks/useAddMemberWizard';
import type { TokenizationIframeConfig } from '@/libs/IQPro';
import { useOrganization, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAddMemberWizard } from '@/hooks/useAddMemberWizard';
import { client } from '@/libs/Orpc';
import { FamilyPaymentStep } from './FamilyPaymentStep';
import { HOHSelectionStep } from './HOHSelectionStep';
import { MemberDetailsStep } from './MemberDetailsStep';
import { MemberMembershipStep } from './MemberMembershipStep';
import { MemberPaymentStep } from './MemberPaymentStep';
import { MemberPhotoStep } from './MemberPhotoStep';
import { MemberSuccessStep } from './MemberSuccessStep';
import { MemberTypeStep } from './MemberTypeStep';
import { MemberWaiverStep } from './MemberWaiverStep';

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

type AddMemberModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  availableCoupons?: Coupon[];
};

export const AddMemberModal = ({ isOpen, onCloseAction, availableCoupons = [] }: AddMemberModalProps) => {
  const router = useRouter();
  const wizard = useAddMemberWizard();
  const { user } = useUser();
  const { organization } = useOrganization();
  const [tokenizationConfig, setTokenizationConfig] = useState<TokenizationIframeConfig | null>(null);
  // Holds the cardToken + cardFirstSix + cardLastFour from iframe tokenization so handleFinalNext
  // can access them without waiting for React state to commit (avoids stale closure).
  const cardTokenRef = useRef<string | undefined>(undefined);
  const cardFirstSixRef = useRef<string | undefined>(undefined);
  const cardLastFourRef = useRef<string | undefined>(undefined);

  // Wrapper around wizard.updateData that also captures card refs synchronously
  // so handleFinalNext can read them (React setState is async).
  const updateDataWithRef = (updates: Partial<typeof wizard.data>) => {
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

  // Fetch tokenization config on mount (returns null if IQPro not configured)
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    client.payment.getTokenizationConfig({ origin: window.location.origin })
      .then((config) => {
        setTokenizationConfig(config ?? null);
      })
      .catch((err) => {
        // IQPro not configured — use fallback plain inputs
        if (process.env.NODE_ENV === 'development') {
          console.warn('[AddMemberModal] Failed to fetch tokenization config:', err);
        }
        setTokenizationConfig(null);
      });
  }, [isOpen]);

  const handleCancel = () => {
    cardTokenRef.current = undefined;
    cardFirstSixRef.current = undefined;
    cardLastFourRef.current = undefined;
    wizard.reset();
    onCloseAction();
  };

  const handleSuccess = async () => {
    console.info('[Add Member Wizard] Member created successfully:', {
      timestamp: new Date().toISOString(),
      memberData: wizard.data,
    });
    cardTokenRef.current = undefined;
    cardFirstSixRef.current = undefined;
    cardLastFourRef.current = undefined;
    wizard.reset();
    onCloseAction();
    router.refresh();
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
        ...(wizard.data.memberType && { memberType: wizard.data.memberType }),
        ...(wizard.data.memberType === 'family-member' && wizard.data.hohMemberName && { hohName: wizard.data.hohMemberName }),
      };

      // Include waiver PDF data if waiver was signed
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
      // Fire-and-forget — don't block wizard on email failure
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Add Member Wizard] Failed to send confirmation email:', emailErr);
      }
    }
  };

  const handleFinalNext = async () => {
    try {
      wizard.setIsLoading(true);
      wizard.clearError();

      // Log authorization context
      console.info('[Add Member Wizard] Starting member creation with Clerk context:', {
        timestamp: new Date().toISOString(),
        user: {
          id: user?.id,
          email: user?.primaryEmailAddress?.emailAddress,
          role: user?.publicMetadata?.role,
        },
        organization: {
          id: organization?.id,
          name: organization?.name,
          subscriptionPlan: organization?.publicMetadata?.subscriptionPlan,
        },
        wizardData: wizard.data,
      });

      // Verify authorization
      if (!user) {
        throw new Error('User not authenticated');
      }

      if (!organization) {
        throw new Error('User not part of an organization');
      }

      // Create the member with all collected data
      // Build address object with only the fields needed
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

      // Convert photo file to base64 data URL if present
      let photoUrl: string | undefined;
      if (wizard.data.photoFile) {
        photoUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(wizard.data.photoFile!);
        });
      }

      // Determine member status based on payment result
      // If payment was declined, set status to 'past due'
      // Note: amountDue will be calculated from a separate billing table in the future
      const isPaymentDeclined = wizard.data.paymentStatus === 'declined';

      const createPayload = {
        email: wizard.data.email,
        firstName: wizard.data.firstName,
        lastName: wizard.data.lastName,
        phone: wizard.data.phone,
        dateOfBirth: wizard.data.dateOfBirth!,
        ...(wizard.data.memberType && { memberType: wizard.data.memberType }),
        ...(wizard.data.membershipPlanId && { membershipPlanId: wizard.data.membershipPlanId }),
        ...(addressPayload && { address: addressPayload }),
        ...(photoUrl && { photoUrl }),
        ...(isPaymentDeclined && { status: 'past due' as const }),
        ...(wizard.data.appliedCoupon && {
          appliedCoupon: {
            id: wizard.data.appliedCoupon.id,
            code: wizard.data.appliedCoupon.code,
            type: wizard.data.appliedCoupon.type,
            amount: wizard.data.appliedCoupon.amount,
            description: wizard.data.appliedCoupon.description,
          },
        }),
      };

      console.info('[Add Member Wizard] Member creation payload:', {
        timestamp: new Date().toISOString(),
        payload: createPayload,
        addressPayload,
        hasPhoto: !!photoUrl,
      });

      const result = await client.member.create(createPayload);
      console.info('[Add Member Wizard] Member created successfully:', {
        timestamp: new Date().toISOString(),
        result,
      });

      // Create signed waiver record if waiver was signed during the wizard
      if (
        result.id
        && wizard.data.waiverTemplateId
        && wizard.data.waiverSignatureDataUrl
        && wizard.data.waiverRenderedContent
        && !wizard.data.waiverSkipped
      ) {
        // Calculate age at signing
        let memberAgeAtSigning: number | undefined;
        if (wizard.data.dateOfBirth) {
          const today = new Date();
          let age = today.getFullYear() - wizard.data.dateOfBirth.getFullYear();
          const monthDiff = today.getMonth() - wizard.data.dateOfBirth.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < wizard.data.dateOfBirth.getDate())) {
            age--;
          }
          memberAgeAtSigning = age;
        }

        await client.waivers.createSignedWaiver({
          waiverTemplateId: wizard.data.waiverTemplateId,
          memberId: result.id,
          signatureDataUrl: wizard.data.waiverSignatureDataUrl,
          signedByName: wizard.data.waiverSignedByName || wizard.data.firstName,
          signedByRelationship: wizard.data.waiverSignedByRelationship || 'self',
          ...(wizard.data.waiverGuardianEmail && { signedByEmail: wizard.data.waiverGuardianEmail }),
          memberFirstName: wizard.data.firstName,
          memberLastName: wizard.data.lastName,
          memberEmail: wizard.data.email,
          ...(wizard.data.dateOfBirth && { memberDateOfBirth: wizard.data.dateOfBirth }),
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
            couponDiscountedPrice: computeDiscountedPrice(
              wizard.data.membershipPlanPrice,
              wizard.data.appliedCoupon,
            ),
          }),
        });

        console.info('[Add Member Wizard] Signed waiver created for member:', result.id);
      }

      // Process payment if payment details were collected and amount > 0
      const finalPrice = wizard.data.appliedCoupon
        ? computeDiscountedPrice(wizard.data.membershipPlanPrice, wizard.data.appliedCoupon) ?? 0
        : (wizard.data.membershipPlanPrice ?? 0);

      if (wizard.data.paymentMethod && finalPrice > 0 && result.id) {
        try {
          wizard.updateData({ paymentStatus: 'processing' });

          const paymentResult = await client.payment.process({
            memberId: result.id,
            memberEmail: wizard.data.email,
            memberFirstName: wizard.data.firstName,
            memberLastName: wizard.data.lastName,
            ...(wizard.data.phone && { memberPhone: wizard.data.phone }),
            ...(wizard.data.address && { memberAddress: wizard.data.address }),
            paymentMethod: wizard.data.paymentMethod,
            billingType: wizard.data.billingType || 'one-time',
            amount: finalPrice,
            description: wizard.data.membershipPlanName
              ? `Membership: ${wizard.data.membershipPlanName}`
              : 'Membership payment',
            // Card fields (cardToken = PCI-compliant tokenized card; cardNumber = fallback)
            // Read cardToken from ref because React setState in MemberPaymentStep is async
            // and wizard.data.cardToken may not yet reflect the tokenized value.
            ...(wizard.data.cardholderName && { cardholderName: wizard.data.cardholderName }),
            ...((cardTokenRef.current || wizard.data.cardToken) && { cardToken: cardTokenRef.current || wizard.data.cardToken }),
            ...((cardFirstSixRef.current || wizard.data.cardFirstSix) && { cardFirstSix: cardFirstSixRef.current || wizard.data.cardFirstSix }),
            ...((cardLastFourRef.current || wizard.data.cardLastFour) && { cardLastFour: cardLastFourRef.current || wizard.data.cardLastFour }),
            ...(wizard.data.cardNumber && !cardTokenRef.current && !wizard.data.cardToken && { cardNumber: wizard.data.cardNumber }),
            ...(wizard.data.cardExpiry && { cardExpiry: wizard.data.cardExpiry }),
            ...(wizard.data.cardCvc && { cardCvc: wizard.data.cardCvc }),
            // ACH fields
            ...(wizard.data.achAccountHolder && { achAccountHolder: wizard.data.achAccountHolder }),
            ...(wizard.data.achRoutingNumber && { achRoutingNumber: wizard.data.achRoutingNumber }),
            ...(wizard.data.achAccountNumber && { achAccountNumber: wizard.data.achAccountNumber }),
            // Membership context
            ...(wizard.data.membershipPlanId && { membershipPlanId: wizard.data.membershipPlanId }),
            ...(wizard.data.membershipPlanFrequency && { membershipPlanFrequency: wizard.data.membershipPlanFrequency }),
            ...(wizard.data.appliedCoupon && { appliedCoupon: wizard.data.appliedCoupon }),
          });

          wizard.updateData({
            paymentStatus: paymentResult.success ? 'approved' : 'declined',
            paymentDeclineReason: paymentResult.declineReason as PaymentDeclineReason | undefined,
            paymentProcessed: true,
          });

          if (!paymentResult.success && process.env.NODE_ENV === 'development') {
            console.warn('[Add Member Wizard] Payment declined:', paymentResult.declineReason);
          }
        } catch (paymentError) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Add Member Wizard] Payment processing error:', paymentError);
          }
          wizard.updateData({
            paymentStatus: 'declined',
            paymentDeclineReason: 'card_declined',
            paymentProcessed: true,
          });
        }
      }

      // Send confirmation email (fire-and-forget)
      if (result.id) {
        sendConfirmationEmail(result.id);
      }

      // Move to success step
      wizard.setStep('success');
    } catch (error) {
      // Log full error details for debugging
      console.error('[Add Member Wizard] Failed to create member - Full error:', JSON.stringify(error, null, 2));
      console.error('[Add Member Wizard] Error details:', {
        timestamp: new Date().toISOString(),
        errorType: typeof error,
        isError: error instanceof Error,
        message: error instanceof Error ? error.message : undefined,
        name: error instanceof Error ? error.name : undefined,
        keys: error && typeof error === 'object' ? Object.keys(error) : [],
      });

      let errorMessage = 'Failed to create member. Please try again.';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        // Handle ORPC errors which may have different structure
        const errObj = error as Record<string, unknown>;
        if ('message' in errObj) {
          errorMessage = String(errObj.message);
        } else if ('data' in errObj && typeof errObj.data === 'object' && errObj.data && 'message' in errObj.data) {
          errorMessage = String((errObj.data as Record<string, unknown>).message);
        }
      }

      wizard.setError(errorMessage);
    } finally {
      wizard.setIsLoading(false);
    }
  };

  // Handler for family member final step (after FamilyPaymentStep)
  const handleFamilyMemberFinalNext = async () => {
    try {
      wizard.setIsLoading(true);
      wizard.clearError();

      if (!user) {
        throw new Error('User not authenticated');
      }
      if (!organization) {
        throw new Error('User not part of an organization');
      }

      // Build member creation payload (same as individual)
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

      let photoUrl: string | undefined;
      if (wizard.data.photoFile) {
        photoUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(wizard.data.photoFile!);
        });
      }

      const createPayload = {
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
      };

      // 1. Create the member
      const result = await client.member.create(createPayload);

      // 2. Create signed waiver if applicable
      if (
        result.id
        && wizard.data.waiverTemplateId
        && wizard.data.waiverSignatureDataUrl
        && wizard.data.waiverRenderedContent
        && !wizard.data.waiverSkipped
      ) {
        let memberAgeAtSigning: number | undefined;
        if (wizard.data.dateOfBirth) {
          const today = new Date();
          let age = today.getFullYear() - wizard.data.dateOfBirth.getFullYear();
          const monthDiff = today.getMonth() - wizard.data.dateOfBirth.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < wizard.data.dateOfBirth.getDate())) {
            age--;
          }
          memberAgeAtSigning = age;
        }

        await client.waivers.createSignedWaiver({
          waiverTemplateId: wizard.data.waiverTemplateId,
          memberId: result.id,
          signatureDataUrl: wizard.data.waiverSignatureDataUrl,
          signedByName: wizard.data.waiverSignedByName || wizard.data.firstName,
          signedByRelationship: wizard.data.waiverSignedByRelationship || 'self',
          ...(wizard.data.waiverGuardianEmail && { signedByEmail: wizard.data.waiverGuardianEmail }),
          memberFirstName: wizard.data.firstName,
          memberLastName: wizard.data.lastName,
          memberEmail: wizard.data.email,
          ...(wizard.data.dateOfBirth && { memberDateOfBirth: wizard.data.dateOfBirth }),
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
            couponDiscountedPrice: computeDiscountedPrice(
              wizard.data.membershipPlanPrice,
              wizard.data.appliedCoupon,
            ),
          }),
        });
      }

      // 3. Link family member to HOH
      if (result.id && wizard.data.hohMemberId) {
        await client.member.linkFamilyMember({
          memberId: result.id,
          hohMemberId: wizard.data.hohMemberId,
          relationship: 'family-member',
        });
      }

      // 4. Process payment using HOH's context
      const finalPrice = wizard.data.appliedCoupon
        ? computeDiscountedPrice(wizard.data.membershipPlanPrice, wizard.data.appliedCoupon) ?? 0
        : (wizard.data.membershipPlanPrice ?? 0);

      if (finalPrice > 0 && result.id && wizard.data.hohMemberId) {
        try {
          wizard.updateData({ paymentStatus: 'processing' });

          // Use HOH's member ID for payment processing so their
          // existing payment method is found by the payment service.
          // The subscription will be created under the HOH's IQPro customer.
          const paymentMemberId = wizard.data.hohHasPaymentMethod
            ? wizard.data.hohMemberId!
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
            billingType: 'autopay',
            amount: finalPrice,
            description: wizard.data.membershipPlanName
              ? `Membership: ${wizard.data.membershipPlanName}`
              : 'Membership payment',
            // If HOH has no card, use newly collected card/ACH details
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
            }),
            ...(wizard.data.membershipPlanId && { membershipPlanId: wizard.data.membershipPlanId }),
            ...(wizard.data.membershipPlanFrequency && { membershipPlanFrequency: wizard.data.membershipPlanFrequency }),
            ...(wizard.data.appliedCoupon && { appliedCoupon: wizard.data.appliedCoupon }),
          });

          wizard.updateData({
            paymentStatus: paymentResult.success ? 'approved' : 'declined',
            paymentDeclineReason: paymentResult.declineReason as PaymentDeclineReason | undefined,
            paymentProcessed: true,
          });
        } catch (paymentError) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Add Member Wizard] Family member payment error:', paymentError);
          }
          wizard.updateData({
            paymentStatus: 'declined',
            paymentDeclineReason: 'card_declined',
            paymentProcessed: true,
          });
        }
      }

      // 5. Send confirmation email (fire-and-forget)
      if (result.id) {
        sendConfirmationEmail(result.id);
      }

      // 6. Move to success
      wizard.setStep('success');
    } catch (error) {
      console.error('[Add Member Wizard] Failed to create family member:', error);
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
    }
  };

  const handleSubscriptionNext = async () => {
    // Navigate to payment step after membership selection
    // The payment step will handle determining if payment is actually required
    // based on the selected membership plan (trials, free plans, etc.)
    wizard.nextStep();
  };

  return (
    <Dialog open={isOpen} onOpenChange={isOpen => !isOpen && handleCancel()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {wizard.step === 'member-type' && 'Choose Member Type'}
            {wizard.step === 'details' && 'Add Member Details'}
            {wizard.step === 'photo' && 'Add Member Photo'}
            {wizard.step === 'subscription' && 'Choose Membership Plan'}
            {wizard.step === 'waiver' && 'Sign Waiver'}
            {wizard.step === 'payment' && 'Payment Information'}
            {wizard.step === 'hoh-selection' && 'Select Head of Household'}
            {wizard.step === 'family-payment' && 'Confirm Family Member Billing'}
            {wizard.step === 'success' && 'Success'}
          </DialogTitle>
        </DialogHeader>

        <div className="py-6">
          {wizard.step === 'member-type' && (
            <MemberTypeStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={wizard.nextStep}
              onCancel={handleCancel}
            />
          )}

          {wizard.step === 'details' && (
            <MemberDetailsStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={wizard.nextStep}
              onBack={wizard.previousStep}
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
            <MemberMembershipStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={handleSubscriptionNext}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              isLoading={wizard.isLoading}
            />
          )}

          {wizard.step === 'waiver' && (
            <MemberWaiverStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={wizard.nextStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              isLoading={wizard.isLoading}
              memberDateOfBirth={wizard.data.dateOfBirth}
            />
          )}

          {wizard.step === 'payment' && (
            <MemberPaymentStep
              data={wizard.data}
              onUpdateAction={updateDataWithRef}
              onNextAction={handleFinalNext}
              onBackAction={wizard.previousStep}
              onCancelAction={handleCancel}
              isLoading={wizard.isLoading}
              availableCoupons={availableCoupons}
              tokenizationConfig={tokenizationConfig}
              memberType={wizard.data.memberType || undefined}
            />
          )}

          {wizard.step === 'hoh-selection' && (
            <HOHSelectionStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={wizard.nextStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              isLoading={wizard.isLoading}
            />
          )}

          {wizard.step === 'family-payment' && (
            <FamilyPaymentStep
              data={wizard.data}
              onUpdateAction={updateDataWithRef}
              onNextAction={handleFamilyMemberFinalNext}
              onBackAction={wizard.previousStep}
              onCancelAction={handleCancel}
              isLoading={wizard.isLoading}
              availableCoupons={availableCoupons}
              tokenizationConfig={tokenizationConfig}
            />
          )}

          {wizard.step === 'success' && (
            <MemberSuccessStep
              data={wizard.data}
              onDone={handleSuccess}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
