'use client';

import type { MembershipCardProps } from '@/templates/MembershipCard';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAddMembershipWizard } from '@/hooks/useAddMembershipWizard';
import { client } from '@/libs/Orpc';
import { invalidateMembershipPlansCache } from '../../../hooks/useMembershipPlansCache';
import { transformWizardDataToDb } from '../membershipPlanTransformers';
import { MembershipBasicsStep } from './MembershipBasicsStep';
import { MembershipContractStep } from './MembershipContractStep';
import { MembershipPaymentStep } from './MembershipPaymentStep';
import { MembershipProgramAssociationStep } from './MembershipProgramAssociationStep';
import { MembershipSuccessStep } from './MembershipSuccessStep';

type AddMembershipModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  onMembershipCreated?: (newMembership: MembershipCardProps) => void;
};

export const AddMembershipModal = ({ isOpen, onCloseAction, onMembershipCreated }: AddMembershipModalProps) => {
  const router = useRouter();
  const wizard = useAddMembershipWizard();
  const t = useTranslations('AddMembershipWizard');

  // Re-entrancy guard — drops duplicate clicks before React flushes the
  // disabled-button state. Mirrors the pattern in AddMemberModal.
  const submittingRef = useRef(false);

  const handleCancel = () => {
    submittingRef.current = false;
    wizard.reset();
    onCloseAction();
  };

  const handleSuccess = () => {
    submittingRef.current = false;
    wizard.reset();
    onCloseAction();
    router.refresh();
  };

  const handleFinalStep = async () => {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;

    try {
      wizard.setIsLoading(true);
      wizard.clearError();

      const payload = transformWizardDataToDb(wizard.data);
      const result = await client.membershipPlans.create(payload);

      // Surface the new plan to the parent in UI shape so the optimistic
      // append continues to work; the cache invalidation right after is the
      // canonical refresh.
      if (onMembershipCreated) {
        const isPunchcard = wizard.data.membershipType === 'punchcard';
        const newMembership: MembershipCardProps = {
          id: result.plan.id,
          name: result.plan.name,
          category: result.plan.category,
          status: result.plan.isActive ? 'Active' : 'Inactive',
          isTrial: result.plan.isTrial,
          isMonthly: result.plan.frequency === 'Monthly' && !isPunchcard,
          isPunchcard,
          price: result.plan.price === 0 ? 'Free' : `$${result.plan.price.toFixed(2)}${isPunchcard ? '' : '/mo'}`,
          signupFee: isPunchcard
            ? 'One-time purchase'
            : result.plan.signupFee === 0
              ? 'No signup fee'
              : `$${result.plan.signupFee.toFixed(2)} signup fee`,
          frequency: result.plan.frequency ?? 'One-time',
          contract: result.plan.contractLength,
          access: result.plan.accessLevel,
          activeCount: 0,
          revenue: isPunchcard ? '$0 total' : '$0/mo revenue',
        };
        onMembershipCreated(newMembership);
      }

      await invalidateMembershipPlansCache();
      wizard.setStep('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create membership. Please try again.';
      wizard.setError(message);
    } finally {
      wizard.setIsLoading(false);
      submittingRef.current = false;
    }
  };

  const getDialogTitle = () => {
    switch (wizard.step) {
      case 'basics':
        return t('step_basics_title');
      case 'program-association':
        return t('step_program_association_title');
      case 'payment-details':
        return t('step_payment_details_title');
      case 'contract-terms':
        return t('step_contract_terms_title');
      case 'success':
        return t('step_success_title');
      default:
        return t('modal_title');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={isOpen => !isOpen && handleCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
        </DialogHeader>

        <div className="py-6">
          {wizard.step === 'basics' && (
            <MembershipBasicsStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={wizard.nextStep}
              onCancel={handleCancel}
              error={wizard.error}
            />
          )}

          {wizard.step === 'program-association' && (
            <MembershipProgramAssociationStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={wizard.nextStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              error={wizard.error}
            />
          )}

          {wizard.step === 'payment-details' && (
            <MembershipPaymentStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={wizard.nextStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              error={wizard.error}
            />
          )}

          {wizard.step === 'contract-terms' && (
            <MembershipContractStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={handleFinalStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              isLoading={wizard.isLoading}
              error={wizard.error}
            />
          )}

          {wizard.step === 'success' && (
            <MembershipSuccessStep
              data={wizard.data}
              onDone={handleSuccess}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
