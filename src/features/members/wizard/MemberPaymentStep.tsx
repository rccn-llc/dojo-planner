'use client';

import type { Coupon } from '@/features/marketing';
import type { AddMemberWizardData, AppliedCoupon, BillingType, PaymentDeclineReason, PaymentMethod } from '@/hooks/useAddMemberWizard';
import type { TokenizationIframeConfig } from '@/libs/IQPro';
import { AlertCircle, CheckCircle2, CreditCard, Landmark, Loader2, RefreshCw, Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateCouponDiscount, getValidMembershipCoupons } from '@/features/marketing';
import { useTokenExIframe } from '@/hooks/useTokenExIframe';

type MemberPaymentStepProps = {
  data: AddMemberWizardData;
  onUpdateAction: (updates: Partial<AddMemberWizardData>) => void;
  onNextAction: () => void;
  onBackAction: () => void;
  onCancelAction: () => void;
  isLoading?: boolean;
  availableCoupons?: Coupon[];
  tokenizationConfig?: TokenizationIframeConfig | null;
};

const TOKENEX_CONTAINER_ID = 'tokenExIframeDiv';

const formatPaymentAmount = (price?: number): string => {
  if (price === undefined || price === null || price === 0) {
    return '$0';
  }
  return `$${price.toFixed(2)}`;
};

const getFrequencyLabel = (frequency?: string): string => {
  if (!frequency || frequency === 'None') {
    return '';
  }
  const lower = frequency.toLowerCase();
  if (lower === 'monthly') {
    return 'month';
  }
  if (lower === 'annual' || lower === 'annually' || lower === 'yearly') {
    return 'year';
  }
  return lower;
};

export const MemberPaymentStep = ({
  data,
  onUpdateAction,
  onNextAction,
  onBackAction,
  onCancelAction,
  isLoading = false,
  availableCoupons = [],
  tokenizationConfig,
}: MemberPaymentStepProps) => {
  const t = useTranslations('AddMemberWizard.MemberPaymentStep');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tokenizing, setTokenizing] = useState(false);

  const useIframe = !!tokenizationConfig;
  const paymentMethod = data.paymentMethod || 'card';

  // Persist default payment method to wizard state on mount
  useEffect(() => {
    if (!data.paymentMethod) {
      onUpdateAction({ paymentMethod: 'card' });
    }
  }, [data.paymentMethod, onUpdateAction]);

  // TokenEx iframe hook — only active when config is provided (null = skip init)
  const {
    isLoaded: iframeLoaded,
    isValid: iframeValid,
    error: iframeError,
    tokenize: iframeTokenize,
  } = useTokenExIframe({
    containerId: TOKENEX_CONTAINER_ID,
    config: tokenizationConfig ?? null,
  });
  const originalPrice = data.membershipPlanPrice ?? 0;
  const frequencyLabel = getFrequencyLabel(data.membershipPlanFrequency);
  const paymentStatus = data.paymentStatus;

  // Determine if this is a recurring membership (monthly or annual)
  const isRecurringMembership = data.membershipPlanFrequency
    && data.membershipPlanFrequency.toLowerCase() !== 'none'
    && !data.membershipPlanIsTrial;

  // Default to autopay for recurring memberships, one-time otherwise
  const billingType: BillingType = data.billingType
    || (isRecurringMembership ? 'autopay' : 'one-time');

  // Get valid membership coupons
  const validCoupons = useMemo(() => {
    return getValidMembershipCoupons(availableCoupons);
  }, [availableCoupons]);

  // Calculate discount if coupon is applied
  const { discountAmount, finalPrice } = useMemo(() => {
    if (data.appliedCoupon && originalPrice > 0) {
      // Convert AppliedCoupon to Coupon format for calculation
      const couponForCalc: Coupon = {
        id: data.appliedCoupon.id,
        code: data.appliedCoupon.code,
        type: data.appliedCoupon.type,
        amount: data.appliedCoupon.amount,
        description: data.appliedCoupon.description,
        applyTo: 'Memberships',
        usage: '0/0',
        startDateTime: '',
        endDateTime: '',
        status: 'Active',
      };
      return calculateCouponDiscount(couponForCalc, originalPrice);
    }
    return { discountAmount: 0, finalPrice: originalPrice };
  }, [data.appliedCoupon, originalPrice]);

  const paymentAmount = formatPaymentAmount(finalPrice);

  const handleInputChange = (field: string, value: string) => {
    // Reset payment status when user changes payment details after a decline
    // This allows them to retry with new information
    if (paymentStatus === 'declined') {
      onUpdateAction({
        [field]: value,
        paymentStatus: undefined,
        paymentDeclineReason: undefined,
        paymentProcessed: false,
      });
    } else {
      onUpdateAction({ [field]: value });
    }
  };

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    onUpdateAction({
      paymentMethod: method,
      // Reset payment status when changing method
      paymentStatus: undefined,
      paymentDeclineReason: undefined,
      paymentProcessed: false,
    });
  };

  const handleBillingTypeChange = (newBillingType: BillingType) => {
    onUpdateAction({
      billingType: newBillingType,
      // Reset payment status when changing billing type
      paymentStatus: undefined,
      paymentDeclineReason: undefined,
      paymentProcessed: false,
    });
  };

  const handleCouponChange = (couponId: string) => {
    if (couponId === 'none') {
      onUpdateAction({ appliedCoupon: null });
      return;
    }

    const selectedCoupon = validCoupons.find(c => c.id === couponId);
    if (selectedCoupon) {
      const appliedCoupon: AppliedCoupon = {
        id: selectedCoupon.id,
        code: selectedCoupon.code,
        type: selectedCoupon.type,
        amount: selectedCoupon.amount,
        description: selectedCoupon.description,
      };
      onUpdateAction({ appliedCoupon });
    }
  };

  // Card validation helpers for touched fields
  const isCardholderNameInvalid = touched.cardholderName && !data.cardholderName;
  const isCardNumberInvalid = !useIframe && touched.cardNumber && !data.cardNumber;
  const isCardExpiryInvalid = touched.cardExpiry && !data.cardExpiry;
  const isCardCvcInvalid = touched.cardCvc && !data.cardCvc;

  // ACH validation helpers for touched fields
  const isAchAccountHolderInvalid = touched.achAccountHolder && !data.achAccountHolder;
  const isAchRoutingNumberInvalid = touched.achRoutingNumber && !data.achRoutingNumber;
  const isAchAccountNumberInvalid = touched.achAccountNumber && !data.achAccountNumber;

  // Card form valid: iframe mode checks iframeValid instead of cardNumber
  const isCardFormValid = paymentMethod === 'card'
    && data.cardholderName
    && (useIframe ? iframeValid : data.cardNumber)
    && data.cardExpiry
    && data.cardCvc;

  const isAchFormValid = paymentMethod === 'ach'
    && data.achAccountHolder
    && data.achRoutingNumber
    && data.achAccountNumber;

  const isFormValid = isCardFormValid || isAchFormValid;

  const getDeclineReasonMessage = (reason?: PaymentDeclineReason): string => {
    switch (reason) {
      case 'insufficient_funds':
        return t('decline_reason_insufficient_funds');
      case 'invalid_cvc':
        return t('decline_reason_invalid_cvc');
      case 'expired_card':
        return t('decline_reason_expired_card');
      case 'card_declined':
        return t('decline_reason_card_declined');
      case 'ach_failed':
        return t('decline_reason_ach_failed');
      default:
        return t('decline_reason_generic');
    }
  };

  // Determine plan label and period for display
  const planText = data.membershipPlanName || '';
  const periodText = frequencyLabel;
  const originalAmountText = formatPaymentAmount(originalPrice);
  const hasCouponApplied = data.appliedCoupon && discountAmount > 0;

  // Handle next: tokenize via iframe if needed, then proceed.
  const handleNextClick = useCallback(async () => {
    if (!useIframe || paymentMethod !== 'card') {
      onNextAction();
      return;
    }

    try {
      setTokenizing(true);
      const result = await iframeTokenize();
      onUpdateAction({ cardToken: result.token, cardFirstSix: result.firstSix, cardLastFour: result.lastFour });
      onNextAction();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tokenization failed';
      if (process.env.NODE_ENV === 'development') {
        console.warn('[TokenEx] Tokenization failed:', msg);
      }
      onUpdateAction({
        paymentStatus: 'declined',
        paymentDeclineReason: 'card_declined',
      });
    } finally {
      setTokenizing(false);
    }
  }, [useIframe, paymentMethod, onNextAction, onUpdateAction, iframeTokenize]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">
          {hasCouponApplied
            ? (
                <>
                  {t('pay_amount', { amount: paymentAmount })}
                  {' '}
                  <span className="text-base font-normal text-muted-foreground line-through">
                    {originalAmountText}
                  </span>
                </>
              )
            : t('pay_amount', { amount: paymentAmount })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('payment_description', {
            plan: planText,
            amount: paymentAmount,
            period: periodText,
          })}
        </p>
      </div>

      {/* Coupon Selection */}
      {validCoupons.length > 0 && originalPrice > 0 && (
        <div>
          <label htmlFor="couponSelect" className="block text-sm font-medium">
            {t('coupon_label')}
          </label>
          <Select
            value={data.appliedCoupon?.id || 'none'}
            onValueChange={handleCouponChange}
            disabled={isLoading}
          >
            <SelectTrigger id="couponSelect" className="mt-1">
              <SelectValue placeholder={t('coupon_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('coupon_none')}</SelectItem>
              {validCoupons.map(coupon => (
                <SelectItem key={coupon.id} value={coupon.id}>
                  <span className="flex items-center gap-2">
                    <Tag className="h-3 w-3" />
                    {coupon.code}
                    {' - '}
                    {coupon.type === 'Percentage' && coupon.amount}
                    {coupon.type === 'Fixed Amount' && coupon.amount}
                    {coupon.type === 'Free Trial' && t('coupon_free_trial')}
                    {' '}
                    {t('coupon_off')}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Savings Alert */}
      {hasCouponApplied && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
          <Tag className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          <div>
            <p className="font-medium text-green-800 dark:text-green-200">
              {t('coupon_applied_title', { code: data.appliedCoupon?.code ?? '' })}
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              {t('coupon_savings_message', { amount: formatPaymentAmount(discountAmount) })}
            </p>
          </div>
        </div>
      )}

      {/* Billing Type Selection (only for recurring memberships) */}
      {isRecurringMembership && originalPrice > 0 && (
        <div>
          <label className="mb-2 block text-sm font-medium">
            {t('billing_type_label')}
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleBillingTypeChange('autopay')}
              disabled={isLoading}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 transition-all ${
                billingType === 'autopay'
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background hover:border-primary/50 hover:bg-accent/50'
              } ${isLoading ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <RefreshCw className="h-5 w-5" />
              <div className="text-left">
                <span className="block font-medium">{t('billing_type_autopay')}</span>
                <span className="text-xs text-muted-foreground">{t('billing_type_autopay_description', { period: periodText })}</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleBillingTypeChange('one-time')}
              disabled={isLoading}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 transition-all ${
                billingType === 'one-time'
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background hover:border-primary/50 hover:bg-accent/50'
              } ${isLoading ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <CreditCard className="h-5 w-5" />
              <div className="text-left">
                <span className="block font-medium">{t('billing_type_onetime')}</span>
                <span className="text-xs text-muted-foreground">{t('billing_type_onetime_description')}</span>
              </div>
            </button>
          </div>
          {billingType === 'autopay' && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('billing_type_autopay_note', { period: periodText })}
            </p>
          )}
        </div>
      )}

      {/* Payment Status Alerts */}
      {paymentStatus === 'approved' && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          <div>
            <p className="font-medium text-green-800 dark:text-green-200">
              {t('payment_approved_title')}
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              {t('payment_approved_message')}
            </p>
          </div>
        </div>
      )}

      {paymentStatus === 'declined' && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">
              {t('payment_declined_title')}
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {getDeclineReasonMessage(data.paymentDeclineReason)}
            </p>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              {t('payment_declined_continue_message')}
            </p>
          </div>
        </div>
      )}

      {paymentStatus === 'processing' && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {t('payment_processing_message')}
          </p>
        </div>
      )}

      {/* Payment Method Tabs */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handlePaymentMethodChange('card')}
          disabled={isLoading}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 transition-all ${
            paymentMethod === 'card'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-background hover:border-primary/50 hover:bg-accent/50'
          } ${isLoading ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <CreditCard className="h-5 w-5" />
          <span className="font-medium">{t('card_tab_label')}</span>
        </button>

        <button
          type="button"
          onClick={() => handlePaymentMethodChange('ach')}
          disabled={isLoading}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 transition-all ${
            paymentMethod === 'ach'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-background hover:border-primary/50 hover:bg-accent/50'
          } ${isLoading ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <Landmark className="h-5 w-5" />
          <span className="font-medium">{t('ach_tab_label')}</span>
        </button>
      </div>

      {/* Card Payment Form */}
      {paymentMethod === 'card' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="cardholderName" className="block text-sm font-medium">
              {t('cardholder_name_label')}
            </label>
            <Input
              id="cardholderName"
              placeholder={t('cardholder_name_placeholder')}
              value={data.cardholderName || ''}
              onChange={e => handleInputChange('cardholderName', e.target.value)}
              onBlur={() => handleInputBlur('cardholderName')}
              error={isCardholderNameInvalid}
              disabled={isLoading}
              className="mt-1"
            />
            {isCardholderNameInvalid && (
              <p className="text-xs text-destructive">{t('cardholder_name_error')}</p>
            )}
          </div>

          <div>
            <label htmlFor={useIframe ? TOKENEX_CONTAINER_ID : 'cardNumber'} className="block text-sm font-medium">
              {t('card_number_label')}
            </label>
            {useIframe
              ? (
                  <div>
                    {!iframeLoaded && !iframeError && (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('card_number_iframe_loading')}
                      </div>
                    )}
                    {iframeError && (
                      <p className="text-xs text-destructive">{t('card_number_iframe_error')}</p>
                    )}
                    <div
                      id={TOKENEX_CONTAINER_ID}
                      className={`mt-1 h-10 w-full overflow-hidden rounded-md border border-input bg-background ${
                        isLoading ? 'pointer-events-none opacity-50' : ''
                      } ${!iframeLoaded && !iframeError ? 'hidden' : ''}`}
                    />
                  </div>
                )
              : (
                  <>
                    <Input
                      id="cardNumber"
                      placeholder={t('card_number_placeholder')}
                      value={data.cardNumber || ''}
                      onChange={e => handleInputChange('cardNumber', e.target.value)}
                      onBlur={() => handleInputBlur('cardNumber')}
                      error={isCardNumberInvalid}
                      disabled={isLoading}
                      className="mt-1"
                    />
                    {isCardNumberInvalid && (
                      <p className="text-xs text-destructive">{t('card_number_error')}</p>
                    )}
                  </>
                )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="cardExpiry" className="block text-sm font-medium">
                {t('card_expiry_label')}
              </label>
              <Input
                id="cardExpiry"
                placeholder={t('card_expiry_placeholder')}
                value={data.cardExpiry || ''}
                onChange={e => handleInputChange('cardExpiry', e.target.value)}
                onBlur={() => handleInputBlur('cardExpiry')}
                error={isCardExpiryInvalid}
                disabled={isLoading}
                className="mt-1"
              />
              {isCardExpiryInvalid && (
                <p className="text-xs text-destructive">{t('card_expiry_error')}</p>
              )}
            </div>

            <div>
              <label htmlFor="cardCvc" className="block text-sm font-medium">
                {t('card_cvc_label')}
              </label>
              <Input
                id="cardCvc"
                placeholder={t('card_cvc_placeholder')}
                value={data.cardCvc || ''}
                onChange={e => handleInputChange('cardCvc', e.target.value)}
                onBlur={() => handleInputBlur('cardCvc')}
                error={isCardCvcInvalid}
                disabled={isLoading}
                className="mt-1"
              />
              {isCardCvcInvalid && (
                <p className="text-xs text-destructive">{t('card_cvc_error')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ACH Payment Form */}
      {paymentMethod === 'ach' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="achAccountHolder" className="block text-sm font-medium">
              {t('ach_account_holder_label')}
            </label>
            <Input
              id="achAccountHolder"
              placeholder={t('ach_account_holder_placeholder')}
              value={data.achAccountHolder || ''}
              onChange={e => handleInputChange('achAccountHolder', e.target.value)}
              onBlur={() => handleInputBlur('achAccountHolder')}
              error={isAchAccountHolderInvalid}
              disabled={isLoading}
              className="mt-1"
            />
            {isAchAccountHolderInvalid && (
              <p className="text-xs text-destructive">{t('ach_account_holder_error')}</p>
            )}
          </div>

          <div>
            <label htmlFor="achRoutingNumber" className="block text-sm font-medium">
              {t('ach_routing_number_label')}
            </label>
            <Input
              id="achRoutingNumber"
              placeholder={t('ach_routing_number_placeholder')}
              value={data.achRoutingNumber || ''}
              onChange={e => handleInputChange('achRoutingNumber', e.target.value)}
              onBlur={() => handleInputBlur('achRoutingNumber')}
              error={isAchRoutingNumberInvalid}
              disabled={isLoading}
              className="mt-1"
            />
            {isAchRoutingNumberInvalid && (
              <p className="text-xs text-destructive">{t('ach_routing_number_error')}</p>
            )}
          </div>

          <div>
            <label htmlFor="achAccountNumber" className="block text-sm font-medium">
              {t('ach_account_number_label')}
            </label>
            <Input
              id="achAccountNumber"
              placeholder={t('ach_account_number_placeholder')}
              value={data.achAccountNumber || ''}
              onChange={e => handleInputChange('achAccountNumber', e.target.value)}
              onBlur={() => handleInputBlur('achAccountNumber')}
              error={isAchAccountNumberInvalid}
              disabled={isLoading}
              className="mt-1"
            />
            {isAchAccountNumberInvalid && (
              <p className="text-xs text-destructive">{t('ach_account_number_error')}</p>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between gap-3 pt-6">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBackAction} disabled={isLoading || tokenizing}>
            {t('back_button')}
          </Button>
          <Button variant="outline" onClick={onCancelAction} disabled={isLoading || tokenizing}>
            {t('cancel_button')}
          </Button>
        </div>
        <Button
          onClick={handleNextClick}
          disabled={!isFormValid || isLoading || tokenizing}
        >
          {(isLoading || tokenizing)
            ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('processing_button')}
                </>
              )
            : t('next_button')}
        </Button>
      </div>
    </div>
  );
};
