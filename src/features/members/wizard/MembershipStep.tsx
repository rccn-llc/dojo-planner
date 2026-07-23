'use client';

import type { MemberType, WizardStepData } from '@/hooks/useAddMemberWizard';
import type { MembershipPlanData } from '@/services/MembersService';
import { useOrganization } from '@clerk/nextjs';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useMembershipPlansCache } from '@/hooks/useMembershipPlansCache';

/**
 * The AddMember flow has a HOH-only "Skip for now" button that the convert
 * flow doesn't need. We model this by accepting an optional `memberType` +
 * `membershipSkipped` superset of `WizardStepData` — the convert flow simply
 * omits them and the Skip button is hidden. Both AddMemberWizardData and
 * ConvertMemberWizardData are assignable here because the extra fields are
 * optional.
 */
type MembershipStepData = WizardStepData & {
  memberType?: MemberType | null;
  membershipSkipped?: boolean;
};

type MembershipStepProps = {
  data: MembershipStepData;
  onUpdate: (updates: Partial<MembershipStepData>) => void;
  onNext: () => void | Promise<void>;
  onBack: () => void;
  onCancel: () => void;
  isLoading?: boolean;
};

export const MembershipStep = ({
  data,
  onUpdate,
  onNext,
  onBack,
  onCancel,
  isLoading = false,
}: MembershipStepProps) => {
  const t = useTranslations('AddMemberWizard.MembershipStep');
  const { organization } = useOrganization();

  // Membership plans come from the shared cache (deduped + revalidated on
  // mutation) instead of a per-mount fetch. We show only active plans and
  // surface a real error state — never fabricated mock plans, which would let
  // an operator create a member against a non-existent plan id.
  const { plans: allPlans, loading: isFetchingPlans, error } = useMembershipPlansCache(organization?.id);
  const membershipPlans: MembershipPlanData[] = allPlans.filter(plan => plan.isActive);

  // #133: when the user reaches this step (which includes navigating Back from
  // a later step after previously clicking Skip), clear the stale
  // `membershipSkipped` flag. Without this, returning to Subscription leaves
  // the wizard in a stuck "you skipped" state where Next is disabled and the
  // user has to click Skip a second time to advance.
  useEffect(() => {
    if (data.membershipSkipped) {
      onUpdate({ membershipSkipped: false });
    }
    // Run once on mount only — the click on Skip happens AFTER mount, and we
    // don't want this effect to wipe the flag the user just set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (planId: string) => {
    const selectedPlan = membershipPlans.find(p => p.id === planId);
    // When the user picks a free-trial plan, clear any card/ACH data they may
    // have entered for a previously-selected paid plan. The PaymentStep hides
    // the form for trials, so leftover values would never get cleared by the
    // form itself.
    const trialClears = selectedPlan?.isTrial
      ? {
          paymentMethod: undefined,
          cardToken: undefined,
          cardFirstSix: undefined,
          cardLastFour: undefined,
          cardholderName: undefined,
          cardNumber: undefined,
          cardExpiry: undefined,
          cardCvc: undefined,
          achAccountHolder: undefined,
          achRoutingNumber: undefined,
          achAccountNumber: undefined,
          achAccountType: undefined,
        }
      : {};
    onUpdate({
      membershipPlanId: planId,
      membershipPlanPrice: selectedPlan?.price,
      membershipPlanFrequency: selectedPlan?.frequency,
      membershipPlanName: selectedPlan?.name,
      membershipPlanIsTrial: selectedPlan?.isTrial ?? undefined,
      membershipPlanContractLength: selectedPlan?.contractLength,
      membershipPlanSignupFee: selectedPlan?.signupFee,
      ...trialClears,
    });
  };

  const handleNext = async () => {
    if (data.membershipPlanId) {
      // Clear membershipSkipped if user selected a plan after previously skipping
      if (data.membershipSkipped) {
        onUpdate({ membershipSkipped: false });
      }
      await onNext();
    }
  };

  const handleSkip = async () => {
    onUpdate({
      membershipPlanId: null,
      membershipPlanPrice: undefined,
      membershipPlanFrequency: undefined,
      membershipPlanName: undefined,
      membershipPlanIsTrial: undefined,
      membershipPlanContractLength: undefined,
      membershipPlanSignupFee: undefined,
      membershipSkipped: true,
    });
    await onNext();
  };

  const formatPrice = (price: number, frequency: string | null) => {
    if (price === 0) {
      return t('free_price');
    }
    const base = `$${price.toFixed(2)}`;
    if (!frequency || frequency === 'None') {
      return base;
    }
    const lower = frequency.toLowerCase();
    if (lower === 'weekly') {
      return `${base}/wk`;
    }
    if (lower === 'semi-annual' || lower === 'semi-annually') {
      return `${base}/6mo`;
    }
    if (lower === 'annual' || lower === 'annually') {
      return `${base}/yr`;
    }
    return `${base}/mo`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isFetchingPlans
        ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">{t('loading_plans')}</p>
            </div>
          )
        : membershipPlans.length === 0
          ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">{t('no_plans_available')}</p>
              </div>
            )
          : (
              <div className="max-h-96 space-y-3 overflow-y-auto pr-2">
                {membershipPlans.map(plan => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => handleSelect(plan.id)}
                    className={`relative w-full cursor-pointer rounded-lg border-2 p-4 text-left transition-all ${
                      data.membershipPlanId === plan.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:border-primary/50 hover:bg-accent/50'
                    }`}
                    aria-pressed={data.membershipPlanId === plan.id}
                    aria-label={t('select_plan_aria', { name: plan.name })}
                  >
                    {data.membershipPlanId === plan.id && (
                      <div className="absolute top-3 right-3">
                        <Check className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className="flex flex-col gap-2 pr-8">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-foreground">{plan.name}</h3>
                          <p className="text-xs text-muted-foreground">{plan.category}</p>
                        </div>
                        <span className="shrink-0 text-lg font-bold text-primary">
                          {formatPrice(plan.price, plan.frequency)}
                        </span>
                      </div>
                      {plan.description && (
                        <p className="text-sm text-muted-foreground">{plan.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{plan.contractLength}</span>
                        {plan.accessLevel && (
                          <>
                            <span>•</span>
                            <span>{plan.accessLevel}</span>
                          </>
                        )}
                        {plan.signupFee > 0 && (
                          <>
                            <span>•</span>
                            <span>
                              $
                              {plan.signupFee}
                              {' '}
                              signup fee
                            </span>
                          </>
                        )}
                      </div>
                      {plan.isTrial && (
                        <span className="inline-flex w-fit items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {t('trial_badge')}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

      <div className="flex justify-between gap-3 pt-6">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            {t('back_button')}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t('cancel_button')}
          </Button>
        </div>
        <div className="flex gap-3">
          {data.memberType === 'head-of-household' && (
            <Button variant="ghost" onClick={handleSkip} disabled={isLoading || isFetchingPlans}>
              {t('skip_button')}
            </Button>
          )}
          <Button onClick={handleNext} disabled={!data.membershipPlanId || isLoading || isFetchingPlans}>
            {isLoading ? `${t('next_button')}...` : t('next_button')}
          </Button>
        </div>
      </div>
    </div>
  );
};
