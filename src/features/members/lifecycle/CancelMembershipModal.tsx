'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { client } from '@/libs/Orpc';

type CancelMembershipModalProps = {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  memberMembershipId: string;
  memberName: string;
  planName: string;
  cancellationFee: number;
  onSuccess?: () => void;
};

export function CancelMembershipModal({
  isOpen,
  onClose,
  memberId,
  memberMembershipId,
  memberName,
  planName,
  cancellationFee,
  onSuccess,
}: CancelMembershipModalProps) {
  const t = useTranslations('MemberDetailPage.CancelMembershipModal');
  const [waiveFee, setWaiveFee] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const hasFee = cancellationFee > 0;
  const effectiveFee = waiveFee ? 0 : cancellationFee;

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    setResultMessage(null);
    try {
      const result = await client.member.cancelMembership({
        memberId,
        memberMembershipId,
        waiveFee,
      });

      if (result.feeChargeError) {
        // Cancellation succeeded but the fee charge failed — surface as a
        // warning rather than rolling back, since the kiosk behaves the same.
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
      setWaiveFee(false);
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
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    {t('fee_notice_title')}
                  </p>
                  <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                    {t('fee_notice_body', { fee: cancellationFee.toFixed(2) })}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Checkbox
                      id="waive-fee"
                      checked={waiveFee}
                      onCheckedChange={checked => setWaiveFee(checked === true)}
                    />
                    <label htmlFor="waive-fee" className="text-sm text-amber-900 dark:text-amber-100">
                      {t('waive_fee_label')}
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('summary_fee')}</span>
              <span className="font-medium text-foreground">{`$${effectiveFee.toFixed(2)}`}</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">{t('summary_subscription')}</span>
              <span className="font-medium text-foreground">{t('summary_subscription_value')}</span>
            </div>
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
          <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? t('confirming_button') : t('confirm_button')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
