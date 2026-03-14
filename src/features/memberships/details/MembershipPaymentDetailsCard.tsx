'use client';

import type { ChargeSignUpFeeOption, PaymentFrequency } from '@/hooks/useAddMembershipWizard';
import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type MembershipPaymentDetailsCardProps = {
  signUpFee: number | null;
  chargeSignUpFee: ChargeSignUpFeeOption;
  monthlyFee: number | null;
  paymentFrequency: PaymentFrequency;
  proRateFirstPayment: boolean;
  isTrial: boolean;
  onEdit?: () => void;
};

export function MembershipPaymentDetailsCard({
  signUpFee,
  chargeSignUpFee,
  monthlyFee,
  paymentFrequency,
  proRateFirstPayment,
  isTrial,
  onEdit,
}: MembershipPaymentDetailsCardProps) {
  const t = useTranslations('MembershipDetailPage.PaymentDetailsCard');

  const formatCurrency = (amount: number | null): string => {
    if (amount === null || amount === 0) {
      return t('free');
    }
    return `$${amount.toFixed(2)}`;
  };

  const frequencyLabels: Record<PaymentFrequency, string> = {
    monthly: t('frequency_monthly'),
    weekly: t('frequency_weekly'),
    annually: t('frequency_annually'),
  };

  const chargeSignUpFeeLabels: Record<ChargeSignUpFeeOption, string> = {
    'at-registration': t('charge_at_registration'),
    'first-payment': t('charge_first_payment'),
  };

  // Get fee label based on frequency
  const getFeeLabel = (): string => {
    switch (paymentFrequency) {
      case 'weekly':
        return t('weekly_fee_label');
      case 'annually':
        return t('annual_fee_label');
      default:
        return t('monthly_fee_label');
    }
  };

  return (
    <Card className="flex flex-col p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>

      <div className="mt-6 flex-1 space-y-4">
        {/* Sign-up Fee */}
        {!isTrial && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-muted-foreground">{t('signup_fee_label')}</span>
              <p className="mt-1 text-foreground">{formatCurrency(signUpFee)}</p>
            </div>
            {signUpFee !== null && signUpFee > 0 && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">{t('charge_signup_fee_label')}</span>
                <p className="mt-1 text-foreground">{chargeSignUpFeeLabels[chargeSignUpFee]}</p>
              </div>
            )}
          </div>
        )}

        {/* Fee and Frequency */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium text-muted-foreground">{getFeeLabel()}</span>
            <p className="mt-1 text-foreground">{formatCurrency(monthlyFee)}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('payment_frequency_label')}</span>
            <p className="mt-1 text-foreground">{frequencyLabels[paymentFrequency]}</p>
          </div>
        </div>

        {/* Pro-rate */}
        {!isTrial && (
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('prorate_label')}</span>
            <p className="mt-1 text-foreground">
              {proRateFirstPayment ? t('prorate_yes') : t('prorate_no')}
            </p>
          </div>
        )}
      </div>

      {onEdit && (
        <div className="mt-6 flex justify-end">
          <Button variant="outline" size="icon" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}
