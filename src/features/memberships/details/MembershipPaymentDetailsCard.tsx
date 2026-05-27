'use client';

import type {
  ChargeSignUpFeeOption,
  HoldFeeFrequencyOption,
  PaymentFrequency,
} from '@/hooks/useAddMembershipWizard';
import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type ExtendedPaymentFrequency = PaymentFrequency | 'one-time';

type MembershipPaymentDetailsCardProps = {
  signUpFee: number | null;
  chargeSignUpFee: ChargeSignUpFeeOption;
  monthlyFee: number | null;
  paymentFrequency: ExtendedPaymentFrequency;
  proRateFirstPayment: boolean;
  cancellationFee: number | null;
  holdFeeAmount: number | null;
  holdFeeFrequency: HoldFeeFrequencyOption | null;
  holdLimitPerYear: number | null;
  isTrial: boolean;
  isPunchcard?: boolean;
  onEdit?: () => void;
};

export function MembershipPaymentDetailsCard({
  signUpFee,
  chargeSignUpFee,
  monthlyFee,
  paymentFrequency,
  proRateFirstPayment,
  cancellationFee,
  holdFeeAmount,
  holdFeeFrequency,
  holdLimitPerYear,
  isTrial,
  isPunchcard = false,
  onEdit,
}: MembershipPaymentDetailsCardProps) {
  const t = useTranslations('MembershipDetailPage.PaymentDetailsCard');

  const formatCurrency = (amount: number | null): string => {
    if (amount === null || amount === 0) {
      return t('free');
    }
    return `$${amount.toFixed(2)}`;
  };

  const formatFee = (amount: number | null): string => {
    if (amount === null || amount === 0) {
      return t('no_fee');
    }
    return `$${amount.toFixed(2)}`;
  };

  const frequencyLabels: Record<ExtendedPaymentFrequency, string> = {
    'monthly': t('frequency_monthly'),
    'weekly': t('frequency_weekly'),
    'semi-annually': t('frequency_semi_annually'),
    'annually': t('frequency_annually'),
    'one-time': t('frequency_one_time'),
  };

  const chargeSignUpFeeLabels: Record<ChargeSignUpFeeOption, string> = {
    'at-registration': t('charge_at_registration'),
    'first-payment': t('charge_first_payment'),
  };

  const holdFeeFrequencyLabels: Record<HoldFeeFrequencyOption, string> = {
    'one-time': t('hold_fee_frequency_one_time'),
    'weekly': t('hold_fee_frequency_weekly'),
    'monthly': t('hold_fee_frequency_monthly'),
    'semi-annually': t('hold_fee_frequency_semi_annually'),
    'annually': t('hold_fee_frequency_annually'),
  };

  // Get fee label based on frequency
  const getFeeLabel = (): string => {
    switch (paymentFrequency) {
      case 'weekly':
        return t('weekly_fee_label');
      case 'semi-annually':
        return t('semi_annual_fee_label');
      case 'annually':
        return t('annual_fee_label');
      case 'one-time':
        return t('one_time_fee_label');
      default:
        return t('monthly_fee_label');
    }
  };

  const formatHoldFee = (): string => {
    if (holdFeeAmount === null || holdFeeAmount === 0 || !holdFeeFrequency) {
      return t('no_hold_fee');
    }
    return `$${holdFeeAmount.toFixed(2)} · ${holdFeeFrequencyLabels[holdFeeFrequency]}`;
  };

  return (
    <Card className="flex flex-col p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>

      <div className="mt-6 flex-1 space-y-4">
        {/* Sign-up Fee — hidden for trials and punchcards (neither has a signup fee concept) */}
        {!isTrial && !isPunchcard && (
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

        {/* Pro-rate — hidden for trials, punchcards, and one-time plans */}
        {!isTrial && !isPunchcard && paymentFrequency !== 'one-time' && (
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('prorate_label')}</span>
            <p className="mt-1 text-foreground">
              {proRateFirstPayment ? t('prorate_yes') : t('prorate_no')}
            </p>
          </div>
        )}

        {/* Cancellation + Hold fees + Hold limit — hidden for punchcards */}
        {!isPunchcard && (
          <div className="space-y-4 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">{t('fees_section_title')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-muted-foreground">{t('cancellation_fee_label')}</span>
                <p className="mt-1 text-foreground">{formatFee(cancellationFee)}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">{t('hold_fee_label')}</span>
                <p className="mt-1 text-foreground">{formatHoldFee()}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-muted-foreground">{t('hold_limit_label')}</span>
                <p className="mt-1 text-foreground">
                  {holdLimitPerYear !== null && holdLimitPerYear > 0
                    ? t('hold_limit_value', { count: holdLimitPerYear })
                    : t('no_holds')}
                </p>
              </div>
            </div>
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
