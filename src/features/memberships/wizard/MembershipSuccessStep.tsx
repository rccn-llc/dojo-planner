'use client';

import type { AddMembershipWizardData } from '@/hooks/useAddMembershipWizard';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

type MembershipSuccessStepProps = {
  data: AddMembershipWizardData;
  onDone: () => void;
};

export const MembershipSuccessStep = ({ data, onDone }: MembershipSuccessStepProps) => {
  const t = useTranslations('AddMembershipWizard.MembershipSuccessStep');

  const formatPrice = (amount: number | null) => {
    if (amount === null || amount === 0) {
      return t('price_free');
    }
    return `$${amount.toFixed(2)}`;
  };

  const getFrequencyLabel = () => {
    switch (data.paymentFrequency) {
      case 'monthly':
        return t('frequency_monthly');
      case 'weekly':
        return t('frequency_weekly');
      case 'semi-annually':
        return t('frequency_semi_annually');
      case 'annually':
        return t('frequency_annually');
      default:
        return data.paymentFrequency;
    }
  };

  const getContractLengthLabel = () => {
    switch (data.contractLength) {
      case 'month-to-month':
        return t('contract_month_to_month');
      case '3-months':
        return t('contract_3_months');
      case '6-months':
        return t('contract_6_months');
      case '12-months':
        return t('contract_12_months');
      default:
        return data.contractLength;
    }
  };

  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="rounded-full bg-green-100 p-4 dark:bg-green-950">
          <svg className="size-12 text-green-600 dark:text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {t('description', { name: data.membershipName })}
        </p>
      </div>

      {/* Membership Summary */}
      <div className="rounded-lg border border-border bg-secondary/30 p-4 text-left">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{t('summary_title')}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('summary_name')}</span>
            <span className="font-medium text-foreground">{data.membershipName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('summary_status')}</span>
            <span className="font-medium text-foreground">
              {data.status === 'active' ? t('status_active') : t('status_inactive')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('summary_type')}</span>
            <span className="font-medium text-foreground">
              {data.membershipType === 'trial' && t('type_trial')}
              {data.membershipType === 'standard' && t('type_standard')}
              {data.membershipType === 'punchcard' && t('type_punchcard')}
            </span>
          </div>
          {data.membershipType === 'punchcard'
            ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('summary_classes_included')}</span>
                    <span className="font-medium text-foreground">
                      {data.classesIncluded}
                      {' '}
                      {t('classes_label')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('summary_punchcard_price')}</span>
                    <span className="font-medium text-foreground">{formatPrice(data.punchcardPrice)}</span>
                  </div>
                </>
              )
            : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('summary_monthly_fee')}</span>
                    <span className="font-medium text-foreground">{formatPrice(data.monthlyFee)}</span>
                  </div>
                  {data.signUpFee !== null && data.signUpFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('summary_signup_fee')}</span>
                      <span className="font-medium text-foreground">{formatPrice(data.signUpFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('summary_frequency')}</span>
                    <span className="font-medium text-foreground">{getFrequencyLabel()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('summary_contract')}</span>
                    <span className="font-medium text-foreground">{getContractLengthLabel()}</span>
                  </div>
                </>
              )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('summary_associated_program')}</span>
            <span className="font-medium text-foreground">
              {data.associatedProgramName ?? t('no_program')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('summary_associated_waiver')}</span>
            <span className="font-medium text-foreground">
              {data.associatedWaiverName ?? t('no_waiver')}
            </span>
          </div>
          {data.cancellationFee !== null && data.cancellationFee > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('summary_cancellation_fee')}</span>
              <span className="font-medium text-foreground">{formatPrice(data.cancellationFee)}</span>
            </div>
          )}
          {data.holdLimitPerYear !== null && data.holdLimitPerYear > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('summary_hold_limit')}</span>
              <span className="font-medium text-foreground">
                {data.holdLimitPerYear}
                {' '}
                {t('per_year')}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="pt-6">
        <Button onClick={onDone} className="w-full">
          {t('done_button')}
        </Button>
      </div>
    </div>
  );
};
