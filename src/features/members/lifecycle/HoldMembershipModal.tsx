'use client';

import { Pause } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { client } from '@/libs/Orpc';

type HoldMembershipModalProps = {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  memberMembershipId: string;
  memberName: string;
  planName: string;
  holdFeeAmount: number;
  holdFeeFrequency: string | null;
  onSuccess?: () => void;
};

function formatFrequencyCadence(frequency: string | null): string {
  if (!frequency || frequency === 'one-time') {
    return '';
  }
  switch (frequency) {
    case 'Weekly': return '/wk';
    case 'Monthly': return '/mo';
    case 'Semi-Annual': return '/6mo';
    case 'Annual': return '/yr';
    default: return '';
  }
}

export function HoldMembershipModal({
  isOpen,
  onClose,
  memberId,
  memberMembershipId,
  memberName,
  planName,
  holdFeeAmount,
  holdFeeFrequency,
  onSuccess,
}: HoldMembershipModalProps) {
  const t = useTranslations('MemberDetailPage.HoldMembershipModal');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const hasFee = holdFeeAmount > 0 && holdFeeFrequency;
  const isRecurringFee = hasFee && holdFeeFrequency !== 'one-time';
  const cadenceSuffix = formatFrequencyCadence(holdFeeFrequency);

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    setResultMessage(null);
    try {
      const result = await client.member.holdMembership({
        memberId,
        memberMembershipId,
      });

      if (result.feeChargeError) {
        setResultMessage(t('partial_success', { error: result.feeChargeError }));
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_generic'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) {
      setError(null);
      setResultMessage(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { memberName, planName })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {hasFee && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
              <div className="flex items-start gap-3">
                <Pause className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {isRecurringFee ? t('recurring_fee_title') : t('one_time_fee_title')}
                  </p>
                  <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">
                    {isRecurringFee
                      ? t('recurring_fee_body', { fee: holdFeeAmount.toFixed(2), cadence: cadenceSuffix })
                      : t('one_time_fee_body', { fee: holdFeeAmount.toFixed(2) })}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border p-4 text-sm">
            <p className="text-muted-foreground">{t('explanation')}</p>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {resultMessage && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              {resultMessage}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            {t('back_button')}
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? t('confirming_button') : t('confirm_button')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
