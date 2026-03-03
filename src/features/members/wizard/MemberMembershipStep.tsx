'use client';

import type { AddMemberWizardData } from '@/hooks/useAddMemberWizard';
import type { MembershipPlanData } from '@/services/MembersService';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { client } from '@/libs/Orpc';

type MemberMembershipStepProps = {
  data: AddMemberWizardData;
  onUpdate: (updates: Partial<AddMemberWizardData>) => void;
  onNext: () => void | Promise<void>;
  onBack: () => void;
  onCancel: () => void;
  isLoading?: boolean;
};

// Mock membership plans matching the Memberships landing page (6 active plans)
// These are used as fallback when the API is not available
const mockMembershipPlans: MembershipPlanData[] = [
  {
    id: 'mock-plan-1',
    name: '12 Month Commitment (Gold)',
    slug: '12_month_commitment_gold',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 150,
    signupFee: 35,
    frequency: 'Monthly',
    contractLength: '12 Months',
    accessLevel: 'Unlimited',
    description: '12 month contract with unlimited access',
    isTrial: false,
    isActive: true,
  },
  {
    id: 'mock-plan-2',
    name: 'Month to Month (Gold)',
    slug: 'month_to_month_gold',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 170,
    signupFee: 35,
    frequency: 'Monthly',
    contractLength: 'Month-to-Month',
    accessLevel: 'Unlimited',
    description: 'No commitment, month-to-month with unlimited access',
    isTrial: false,
    isActive: true,
  },
  {
    id: 'mock-plan-3',
    name: '7-Day Free Trial',
    slug: '7_day_free_trial',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 0,
    signupFee: 0,
    frequency: 'None',
    contractLength: '7 Days',
    accessLevel: '3 Classes Total',
    description: '7-day trial with 3 classes',
    isTrial: true,
    isActive: true,
  },
  {
    id: 'mock-plan-4',
    name: 'Kids Monthly',
    slug: 'kids_monthly',
    category: 'Kids Program',
    program: 'Kids',
    price: 95,
    signupFee: 25,
    frequency: 'Monthly',
    contractLength: 'Month-to-Month',
    accessLevel: '8 Classes/mo',
    description: 'Monthly membership for kids program',
    isTrial: false,
    isActive: true,
  },
  {
    id: 'mock-plan-5',
    name: 'Kids Free Trial Week',
    slug: 'kids_free_trial_week',
    category: 'Kids Program',
    program: 'Kids',
    price: 0,
    signupFee: 0,
    frequency: 'None',
    contractLength: '7 Days',
    accessLevel: '2 Classes Total',
    description: '7-day trial with 2 classes for kids',
    isTrial: true,
    isActive: true,
  },
  {
    id: 'mock-plan-6',
    name: 'Competition Team',
    slug: 'competition_team',
    category: 'Competition Team',
    program: 'Competition',
    price: 200,
    signupFee: 50,
    frequency: 'Monthly',
    contractLength: '6 Months',
    accessLevel: 'Unlimited',
    description: '6 month commitment for competition team members',
    isTrial: false,
    isActive: true,
  },
];

export const MemberMembershipStep = ({
  data,
  onUpdate,
  onNext,
  onBack,
  onCancel,
  isLoading = false,
}: MemberMembershipStepProps) => {
  const t = useTranslations('AddMemberWizard.MemberMembershipStep');

  const [membershipPlans, setMembershipPlans] = useState<MembershipPlanData[]>([]);
  const [isFetchingPlans, setIsFetchingPlans] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch membership plans from database or use mocks
  useEffect(() => {
    const fetchPlans = async () => {
      setIsFetchingPlans(true);
      try {
        const result = await client.member.listMembershipPlans();
        // Filter to only show active plans
        const activePlans = result.plans.filter(plan => plan.isActive);
        if (activePlans.length > 0) {
          setMembershipPlans(activePlans);
        } else {
          // Use mock plans if no plans in database
          setMembershipPlans(mockMembershipPlans);
        }
      } catch (err) {
        console.error('Failed to fetch membership plans, using mocks:', err);
        // Fall back to mock plans on error
        setMembershipPlans(mockMembershipPlans);
      } finally {
        setIsFetchingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  const handleSelect = (planId: string) => {
    const selectedPlan = membershipPlans.find(p => p.id === planId);
    onUpdate({
      membershipPlanId: planId,
      membershipPlanPrice: selectedPlan?.price,
      membershipPlanFrequency: selectedPlan?.frequency,
      membershipPlanName: selectedPlan?.name,
      membershipPlanIsTrial: selectedPlan?.isTrial ?? undefined,
      membershipPlanContractLength: selectedPlan?.contractLength,
      membershipPlanSignupFee: selectedPlan?.signupFee,
    });
    setError(null);
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

  const formatPrice = (price: number, frequency: string) => {
    if (price === 0) {
      return t('free_price');
    }
    return `$${price.toFixed(2)}/${frequency.toLowerCase() === 'annual' ? 'yr' : 'mo'}`;
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
