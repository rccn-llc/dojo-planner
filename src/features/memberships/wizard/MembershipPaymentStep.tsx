'use client';

import type {
  AddMembershipWizardData,
  ChargeSignUpFeeOption,
  HoldFeeFrequencyOption,
  PaymentFrequency,
} from '@/hooks/useAddMembershipWizard';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type MembershipPaymentStepProps = {
  data: AddMembershipWizardData;
  onUpdate: (updates: Partial<AddMembershipWizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  error?: string | null;
};

export const MembershipPaymentStep = ({ data, onUpdate, onNext, onBack, onCancel, error }: MembershipPaymentStepProps) => {
  const t = useTranslations('AddMembershipWizard.MembershipPaymentStep');
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleNumberChange = (field: keyof AddMembershipWizardData, value: string) => {
    const numValue = value ? Number.parseFloat(value) : null;
    onUpdate({ [field]: numValue });
  };

  // For trial memberships, payment details are optional (can be $0)
  // For standard memberships, monthly fee is required
  // For punchcard memberships, classes included and price are required
  const isTrialMembership = data.membershipType === 'trial';
  const isPunchcardMembership = data.membershipType === 'punchcard';

  const isMonthlyFeeInvalid = touched.monthlyFee
    && !isTrialMembership
    && !isPunchcardMembership
    && (data.monthlyFee === null || data.monthlyFee < 0);

  const isClassesIncludedInvalid = touched.classesIncluded
    && isPunchcardMembership
    && (data.classesIncluded === null || data.classesIncluded < 1);

  const isPunchcardPriceInvalid = touched.punchcardPrice
    && isPunchcardMembership
    && (data.punchcardPrice === null || data.punchcardPrice < 0);

  const isFormValid = (() => {
    if (isTrialMembership) {
      return true;
    }
    if (isPunchcardMembership) {
      return (data.classesIncluded !== null && data.classesIncluded >= 1)
        && (data.punchcardPrice !== null && data.punchcardPrice >= 0);
    }
    return data.monthlyFee !== null && data.monthlyFee >= 0;
  })();

  // Get the appropriate fee label based on payment frequency
  const getFeeLabel = () => {
    switch (data.paymentFrequency) {
      case 'weekly':
        return t('weekly_fee_label');
      case 'semi-annually':
        return t('semi_annual_fee_label');
      case 'annually':
        return t('annual_fee_label');
      default:
        return t('monthly_fee_label');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Punchcard-specific fields */}
        {isPunchcardMembership && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('classes_included_label')}</label>
                <Input
                  type="number"
                  placeholder={t('classes_included_placeholder')}
                  value={data.classesIncluded ?? ''}
                  onChange={e => handleNumberChange('classesIncluded', e.target.value)}
                  onBlur={() => handleInputBlur('classesIncluded')}
                  error={isClassesIncludedInvalid}
                  min={1}
                  step="1"
                />
                {isClassesIncludedInvalid && (
                  <p className="text-xs text-destructive">{t('classes_included_error')}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('punchcard_price_label')}</label>
                <div className="relative">
                  <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number"
                    placeholder={t('punchcard_price_placeholder')}
                    value={data.punchcardPrice ?? ''}
                    onChange={e => handleNumberChange('punchcardPrice', e.target.value)}
                    onBlur={() => handleInputBlur('punchcardPrice')}
                    error={isPunchcardPriceInvalid}
                    className="pl-7"
                    min={0}
                    step="0.01"
                  />
                </div>
                {isPunchcardPriceInvalid && (
                  <p className="text-xs text-destructive">{t('punchcard_price_error')}</p>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{t('punchcard_description')}</p>
          </>
        )}

        {/* Standard/Trial membership fields */}
        {!isPunchcardMembership && (
          <>
            {/* Sign-up Fee and Charge Option */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('signup_fee_label')}</label>
                <div className="relative">
                  <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number"
                    placeholder={t('signup_fee_placeholder')}
                    value={data.signUpFee ?? ''}
                    onChange={e => handleNumberChange('signUpFee', e.target.value)}
                    className="pl-7"
                    min={0}
                    step="0.01"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('charge_signup_fee_label')}</label>
                <Select
                  value={data.chargeSignUpFee}
                  onValueChange={(value: ChargeSignUpFeeOption) => onUpdate({ chargeSignUpFee: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="at-registration">{t('charge_at_registration')}</SelectItem>
                    <SelectItem value="first-payment">{t('charge_first_payment')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fee and Payment Frequency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{getFeeLabel()}</label>
                <div className="relative">
                  <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number"
                    placeholder={t('monthly_fee_placeholder')}
                    value={data.monthlyFee ?? ''}
                    onChange={e => handleNumberChange('monthlyFee', e.target.value)}
                    onBlur={() => handleInputBlur('monthlyFee')}
                    error={isMonthlyFeeInvalid}
                    className="pl-7"
                    min={0}
                    step="0.01"
                  />
                </div>
                {isMonthlyFeeInvalid && (
                  <p className="text-xs text-destructive">{t('monthly_fee_error')}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('payment_frequency_label')}</label>
                <Select
                  value={data.paymentFrequency}
                  onValueChange={(value: PaymentFrequency) => onUpdate({ paymentFrequency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{t('frequency_monthly')}</SelectItem>
                    <SelectItem value="weekly">{t('frequency_weekly')}</SelectItem>
                    <SelectItem value="semi-annually">{t('frequency_semi_annually')}</SelectItem>
                    <SelectItem value="annually">{t('frequency_annually')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pro-rate First Payment */}
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-foreground">{t('prorate_label')}</label>
                <p className="text-xs text-muted-foreground">{t('prorate_description')}</p>
              </div>
              <Switch
                checked={data.proRateFirstPayment}
                onCheckedChange={(checked) => {
                  onUpdate({ proRateFirstPayment: checked });
                }}
              />
            </div>

            {/* Cancellation Fee + Hold Fee section */}
            <div className="space-y-4 border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground">{t('fees_section_title')}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{t('cancellation_fee_label')}</label>
                  <div className="relative">
                    <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      type="number"
                      placeholder={t('cancellation_fee_placeholder')}
                      value={data.cancellationFee ?? ''}
                      onChange={e => handleNumberChange('cancellationFee', e.target.value)}
                      className="pl-7"
                      min={0}
                      step="0.01"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('cancellation_fee_help')}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{t('hold_fee_amount_label')}</label>
                  <div className="relative">
                    <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      type="number"
                      placeholder={t('hold_fee_amount_placeholder')}
                      value={data.holdFeeAmount ?? ''}
                      onChange={e => handleNumberChange('holdFeeAmount', e.target.value)}
                      className="pl-7"
                      min={0}
                      step="0.01"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('hold_fee_amount_help')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{t('hold_fee_frequency_label')}</label>
                  <Select
                    value={data.holdFeeFrequency ?? ''}
                    onValueChange={(value: HoldFeeFrequencyOption) => onUpdate({ holdFeeFrequency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('hold_fee_frequency_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one-time">{t('hold_fee_frequency_one_time')}</SelectItem>
                      <SelectItem value="weekly">{t('hold_fee_frequency_weekly')}</SelectItem>
                      <SelectItem value="monthly">{t('hold_fee_frequency_monthly')}</SelectItem>
                      <SelectItem value="semi-annually">{t('hold_fee_frequency_semi_annually')}</SelectItem>
                      <SelectItem value="annually">{t('hold_fee_frequency_annually')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('hold_fee_frequency_help')}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{t('hold_limit_label')}</label>
                  <Input
                    type="number"
                    placeholder={t('hold_limit_placeholder')}
                    value={data.holdLimitPerYear ?? ''}
                    onChange={e => handleNumberChange('holdLimitPerYear', e.target.value)}
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground">{t('hold_limit_help')}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-between gap-3 pt-6">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            {t('back_button')}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t('cancel_button')}
          </Button>
        </div>
        <Button onClick={onNext} disabled={!isFormValid}>
          {t('next_button')}
        </Button>
      </div>
    </div>
  );
};
