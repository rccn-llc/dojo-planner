'use client';

import type {
  ChargeSignUpFeeOption,
  HoldFeeFrequencyOption,
  PaymentFrequency,
} from '@/hooks/useAddMembershipWizard';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type ExtendedPaymentFrequency = PaymentFrequency | 'one-time';

type EditPaymentDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
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
  onSave: (data: {
    signUpFee: number | null;
    chargeSignUpFee: ChargeSignUpFeeOption;
    monthlyFee: number | null;
    paymentFrequency: ExtendedPaymentFrequency;
    proRateFirstPayment: boolean;
    cancellationFee: number | null;
    holdFeeAmount: number | null;
    holdFeeFrequency: HoldFeeFrequencyOption | null;
    holdLimitPerYear: number | null;
  }) => void;
};

export function EditPaymentDetailsModal({
  isOpen,
  onClose,
  signUpFee: initialSignUpFee,
  chargeSignUpFee: initialChargeSignUpFee,
  monthlyFee: initialMonthlyFee,
  paymentFrequency: initialPaymentFrequency,
  proRateFirstPayment: initialProRate,
  cancellationFee: initialCancellationFee,
  holdFeeAmount: initialHoldFeeAmount,
  holdFeeFrequency: initialHoldFeeFrequency,
  holdLimitPerYear: initialHoldLimit,
  isTrial,
  isPunchcard = false,
  onSave,
}: EditPaymentDetailsModalProps) {
  const t = useTranslations('MembershipDetailPage.EditPaymentDetailsModal');

  const [signUpFee, setSignUpFee] = useState<number | null>(initialSignUpFee);
  const [chargeSignUpFee, setChargeSignUpFee] = useState<ChargeSignUpFeeOption>(initialChargeSignUpFee);
  const [monthlyFee, setMonthlyFee] = useState<number | null>(initialMonthlyFee);
  const [paymentFrequency, setPaymentFrequency] = useState<ExtendedPaymentFrequency>(initialPaymentFrequency);
  const [proRateFirstPayment, setProRateFirstPayment] = useState(initialProRate);
  const [cancellationFee, setCancellationFee] = useState<number | null>(initialCancellationFee);
  const [holdFeeAmount, setHoldFeeAmount] = useState<number | null>(initialHoldFeeAmount);
  const [holdFeeFrequency, setHoldFeeFrequency] = useState<HoldFeeFrequencyOption | null>(initialHoldFeeFrequency);
  const [holdLimitPerYear, setHoldLimitPerYear] = useState<number | null>(initialHoldLimit);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleNumberChange = (setter: (value: number | null) => void, value: string) => {
    const numValue = value ? Number.parseFloat(value) : null;
    setter(numValue);
  };

  const isMonthlyFeeInvalid = touched.monthlyFee
    && !isTrial
    && (monthlyFee === null || monthlyFee < 0);

  const isFormValid = isTrial || (monthlyFee !== null && monthlyFee >= 0);

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

  const resetState = () => {
    setSignUpFee(initialSignUpFee);
    setChargeSignUpFee(initialChargeSignUpFee);
    setMonthlyFee(initialMonthlyFee);
    setPaymentFrequency(initialPaymentFrequency);
    setProRateFirstPayment(initialProRate);
    setCancellationFee(initialCancellationFee);
    setHoldFeeAmount(initialHoldFeeAmount);
    setHoldFeeFrequency(initialHoldFeeFrequency);
    setHoldLimitPerYear(initialHoldLimit);
    setTouched({});
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    onSave({
      signUpFee,
      chargeSignUpFee,
      monthlyFee,
      paymentFrequency,
      proRateFirstPayment,
      cancellationFee,
      holdFeeAmount: isPunchcard ? null : holdFeeAmount,
      holdFeeFrequency: isPunchcard ? null : holdFeeFrequency,
      holdLimitPerYear: isPunchcard ? null : holdLimitPerYear,
    });
    setIsLoading(false);
  };

  const handleCancel = () => {
    resetState();
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      resetState();
    } else {
      handleCancel();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Sign-up Fee and Charge Option — hidden for trials and punchcards */}
          {!isTrial && !isPunchcard && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('signup_fee_label')}</label>
                <div className="relative">
                  <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number"
                    placeholder={t('signup_fee_placeholder')}
                    value={signUpFee ?? ''}
                    onChange={e => handleNumberChange(setSignUpFee, e.target.value)}
                    className="pl-7"
                    min={0}
                    step="0.01"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('charge_signup_fee_label')}</label>
                <Select
                  value={chargeSignUpFee}
                  onValueChange={(value: ChargeSignUpFeeOption) => setChargeSignUpFee(value)}
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
          )}

          {/* Fee and Payment Frequency */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{getFeeLabel()}</label>
              <div className="relative">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  placeholder={t('fee_placeholder')}
                  value={monthlyFee ?? ''}
                  onChange={e => handleNumberChange(setMonthlyFee, e.target.value)}
                  onBlur={() => handleInputBlur('monthlyFee')}
                  error={isMonthlyFeeInvalid}
                  className="pl-7"
                  min={0}
                  step="0.01"
                />
              </div>
              {isMonthlyFeeInvalid && (
                <p className="text-xs text-destructive">{t('fee_error')}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('payment_frequency_label')}</label>
              {isPunchcard
                ? (
                    <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                      {t('frequency_one_time')}
                    </div>
                  )
                : (
                    <Select
                      value={paymentFrequency}
                      onValueChange={(value: ExtendedPaymentFrequency) => setPaymentFrequency(value)}
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
                  )}
            </div>
          </div>

          {/* Pro-rate First Payment — hidden for trials, punchcards, and one-time plans */}
          {!isTrial && !isPunchcard && paymentFrequency !== 'one-time' && (
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-foreground">{t('prorate_label')}</label>
                <p className="text-xs text-muted-foreground">{t('prorate_description')}</p>
              </div>
              <Switch
                checked={proRateFirstPayment}
                onCheckedChange={setProRateFirstPayment}
              />
            </div>
          )}

          {/* Cancellation + Hold fees + Hold limit — hidden for punchcards */}
          {!isPunchcard && (
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
                      value={cancellationFee ?? ''}
                      onChange={e => handleNumberChange(setCancellationFee, e.target.value)}
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
                      value={holdFeeAmount ?? ''}
                      onChange={e => handleNumberChange(setHoldFeeAmount, e.target.value)}
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
                    value={holdFeeFrequency ?? ''}
                    onValueChange={(value: HoldFeeFrequencyOption) => setHoldFeeFrequency(value)}
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
                    value={holdLimitPerYear ?? ''}
                    onChange={e => handleNumberChange(setHoldLimitPerYear, e.target.value)}
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground">{t('hold_limit_help')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              {t('cancel_button')}
            </Button>
            <Button onClick={handleSubmit} disabled={!isFormValid || isLoading}>
              {isLoading ? t('saving_button') : t('save_button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
