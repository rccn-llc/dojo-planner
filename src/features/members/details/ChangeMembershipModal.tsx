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
        setError(null);
        try {
          const result = await dedupeRequest('member.listMembershipPlans', async () => client.member.listMembershipPlans());
          // Only active plans are selectable. An empty result renders the
          // `no_plans_available` empty state — this previously fell back to six
          // hardcoded `mock-plan-N` fixtures, whose ids are not real rows, so
          // selecting one sent a non-existent FK to addMembership/changeMembership
          // and failed with a 500.
          setMembershipPlans(result.plans.filter(plan => plan.isActive));
        } catch (err) {
          console.error('Failed to fetch membership plans:', err);
          setMembershipPlans([]);
          setError(err instanceof Error ? err.message : t('submit_error'));
        } finally {
          setIsFetchingPlans(false);
        }
      };
      fetchPlans();
    }
  }, [isOpen, t]);

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
