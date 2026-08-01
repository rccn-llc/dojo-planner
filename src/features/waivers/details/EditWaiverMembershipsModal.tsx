'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { client } from '@/libs/Orpc';

type MembershipPlan = {
  id: string;
  name: string;
};

type EditWaiverMembershipsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  waiverId: string;
  currentMembershipIds: string[];
  onSave: (membershipIds: string[]) => Promise<void>;
};

export function EditWaiverMembershipsModal({
  isOpen,
  onClose,
  waiverId,
  currentMembershipIds,
  onSave,
}: EditWaiverMembershipsModalProps) {
  const t = useTranslations('WaiverDetailPage.EditMembershipsModal');

  const [allPlans, setAllPlans] = useState<MembershipPlan[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(currentMembershipIds));
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const fetchPlans = async () => {
      try {
        setIsLoadingPlans(true);
        const result = await client.member.listMembershipPlans();
        setAllPlans(result.plans.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      } catch (err) {
        console.error('Failed to fetch membership plans:', err);
      } finally {
        setIsLoadingPlans(false);
      }
    };

    fetchPlans();
  }, [isOpen, waiverId]);

  const handleToggle = useCallback((planId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) {
        next.delete(planId);
      } else {
        next.add(planId);
      }
      return next;
    });
  }, []);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      await onSave([...selectedIds]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedIds(new Set(currentMembershipIds));
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setSelectedIds(new Set(currentMembershipIds));
    } else {
      handleCancel();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">{t('description')}</p>

          {isLoadingPlans
            ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }, (_, i) => (
                    <Skeleton key={`plan-${String(i)}`} className="h-10" />
                  ))}
                </div>
              )
            : allPlans.length === 0
              ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">{t('no_plans')}</p>
                )
              : (
                  <div className="max-h-75 space-y-2 overflow-y-auto">
                    {allPlans.map(plan => (
                      <label
                        key={plan.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedIds.has(plan.id)}
                          onCheckedChange={() => handleToggle(plan.id)}
                        />
                        <span className="text-sm font-medium">{plan.name}</span>
                      </label>
                    ))}
                  </div>
                )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              {t('cancel_button')}
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading || isLoadingPlans}>
              {isLoading ? t('saving_button') : t('save_button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
