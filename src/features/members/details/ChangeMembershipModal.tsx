'use client';

import type { MembershipPlanData } from '@/services/MembersService';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { dedupeRequest } from '@/hooks/dedupeRequest';
import { invalidateMembersCache } from '@/hooks/useMembersCache';
import { client } from '@/libs/Orpc';

// Mock membership plans matching the Memberships landing page (6 active plans)
// These are used as fallback when the API returns no plans
const mockMembershipPlans: MembershipPlanData[] = [
  {
    id: 'mock-plan-1',
    name: '12 Month Commitment (Gold)',
    slug: '12_month_commitment_gold',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 150,
    signupFee: 35,
    cancellationFee: 0,
    holdFeeAmount: 0,
    holdFeeFrequency: null,
    holdLimitPerYear: null,
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
    cancellationFee: 0,
    holdFeeAmount: 0,
    holdFeeFrequency: null,
    holdLimitPerYear: null,
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
    cancellationFee: 0,
    holdFeeAmount: 0,
    holdFeeFrequency: null,
    holdLimitPerYear: null,
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
    cancellationFee: 0,
    holdFeeAmount: 0,
    holdFeeFrequency: null,
    holdLimitPerYear: null,
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
    cancellationFee: 0,
    holdFeeAmount: 0,
    holdFeeFrequency: null,
    holdLimitPerYear: null,
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
    cancellationFee: 0,
    holdFeeAmount: 0,
    holdFeeFrequency: null,
    holdLimitPerYear: null,
    frequency: 'Monthly',
    contractLength: '6 Months',
    accessLevel: 'Unlimited',
    description: '6 month commitment for competition team members',
    isTrial: false,
    isActive: true,
  },
];

type ChangeMembershipModalProps = {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  currentMembershipPlanId?: string | null;
  mode: 'add' | 'change';
};

export function ChangeMembershipModal({
  isOpen,
  onClose,
  memberId,
  currentMembershipPlanId,
  mode,
}: ChangeMembershipModalProps) {
  const t = useTranslations('ChangeMembershipModal');
  const router = useRouter();

  const [membershipPlans, setMembershipPlans] = useState<MembershipPlanData[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPlans, setIsFetchingPlans] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch membership plans when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchPlans = async () => {
        setIsFetchingPlans(true);
        try {
          const result = await dedupeRequest('member.listMembershipPlans', async () => client.member.listMembershipPlans());
          // Filter to only show active plans and use mocks as fallback
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
    }
  }, [isOpen]);

  const handleSelectPlan = (planId: string) => {
    setSelectedPlanId(planId);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedPlanId) {
      setError(t('select_plan_error'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'add') {
        await client.member.addMembership({
          memberId,
          membershipPlanId: selectedPlanId,
        });
      } else {
        await client.member.changeMembership({
          memberId,
          newMembershipPlanId: selectedPlanId,
        });
      }

      // Invalidate cache to refresh member data
      invalidateMembersCache();
      router.refresh();
      onClose();
    } catch (err) {
      console.error('Failed to update membership:', err);
      setError(err instanceof Error ? err.message : t('submit_error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedPlanId(null);
    setError(null);
    onClose();
  };

  // Filter out the current plan
  const availablePlans = membershipPlans.filter(
    plan => plan.id !== currentMembershipPlanId,
  );

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
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'add' ? t('add_title') : t('change_title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            {mode === 'add' ? t('add_description') : t('change_description')}
          </p>

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
            : availablePlans.length === 0
              ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-muted-foreground">{t('no_plans_available')}</p>
                  </div>
                )
              : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {availablePlans.map(plan => (
                      <Card
                        key={plan.id}
                        className={`relative cursor-pointer p-4 transition-all hover:border-primary ${
                          selectedPlanId === plan.id
                            ? 'border-2 border-primary bg-primary/5'
                            : 'border'
                        }`}
                        onClick={() => handleSelectPlan(plan.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectPlan(plan.id);
                          }
                        }}
                        aria-pressed={selectedPlanId === plan.id}
                        aria-label={t('select_membership_aria', { name: plan.name })}
                      >
                        {selectedPlanId === plan.id && (
                          <div className="absolute top-2 right-2">
                            <Check className="size-5 text-primary" />
                          </div>
                        )}

                        <div className="space-y-2">
                          <div>
                            <h3 className="font-semibold text-foreground">{plan.name}</h3>
                            <p className="text-xs text-muted-foreground">{plan.category}</p>
                          </div>

                          <p className="text-xl font-bold text-primary">
                            {formatPrice(plan.price, plan.frequency)}
                          </p>

                          {plan.description && (
                            <p className="text-sm text-muted-foreground">{plan.description}</p>
                          )}

                          <div className="text-xs text-muted-foreground">
                            <span>{plan.contractLength}</span>
                            {plan.accessLevel && (
                              <span className="ml-2">
                                •
                                {plan.accessLevel}
                              </span>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              {t('cancel_button')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedPlanId || isLoading || isFetchingPlans}
            >
              {isLoading
                ? t('saving_button')
                : (mode === 'add' ? t('add_button') : t('change_button'))}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
