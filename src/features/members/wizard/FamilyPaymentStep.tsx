'use client';

import type { Coupon } from '@/features/marketing';
import type { AddMemberWizardData, AppliedCoupon, PaymentDeclineReason, PaymentMethod } from '@/hooks/useAddMemberWizard';
import type { TokenizationIframeConfig } from '@/libs/IQPro';
import { AlertCircle, CreditCard, Landmark, Loader2, Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateCouponDiscount, getValidMembershipCoupons } from '@/features/marketing';
import { useTokenExIframe } from '@/hooks/useTokenExIframe';

type FamilyPaymentStepProps = {
  data: AddMemberWizardData;
  onUpdateAction: (updates: Partial<AddMemberWizardData>) => void;
  onNextAction: () => void;
  onBackAction: () => void;
  onCancelAction: () => void;
  isLoading?: boolean;
  availableCoupons?: Coupon[];
  tokenizationConfig?: TokenizationIframeConfig | null;
};

const TOKENEX_CONTAINER_ID = 'tokenExFamilyIframeDiv';
const TOKENEX_CVV_CONTAINER_ID = 'tokenExFamilyCvvIframeDiv';

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

export const FamilyPaymentStep = ({
  data,
  onUpdateAction,
  onNextAction,
  onBackAction,
  onCancelAction,
  isLoading = false,
  availableCoupons = [],
  tokenizationConfig,
}: FamilyPaymentStepProps) => {
  const t = useTranslations('AddMemberWizard.FamilyPaymentStep');
  const tPayment = useTranslations('AddMemberWizard.MemberPaymentStep');
  const { resolvedTheme } = useTheme();
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tokenizing, setTokenizing] = useState(false);

  const hohHasCard = !!data.hohHasPaymentMethod;
  const originalPrice = data.membershipPlanPrice ?? 0;
  const frequencyLabel = getFrequencyLabel(data.membershipPlanFrequency);
  const paymentMethod = data.paymentMethod || 'card';
  const paymentStatus = data.paymentStatus;

  const getDeclineReasonMessage = (reason?: PaymentDeclineReason): string => {
    switch (reason) {
      case 'insufficient_funds':
        return tPayment('decline_reason_insufficient_funds');
      case 'invalid_cvc':
        return tPayment('decline_reason_invalid_cvc');
      case 'expired_card':
        return tPayment('decline_reason_expired_card');
      case 'card_declined':
        return tPayment('decline_reason_card_declined');
      case 'ach_failed':
        return tPayment('decline_reason_ach_failed');
      default:
        return tPayment('decline_reason_generic');
    }
  };

  // Only init iframe when HOH has no card and we need to collect payment
  const useIframe = !hohHasCard && !!tokenizationConfig;

  // Persist default payment method to wizard state on mount (only for no-card mode)
  useEffect(() => {
    if (!hohHasCard && !data.paymentMethod) {
      onUpdateAction({ paymentMethod: 'card' });
    }
  }, [hohHasCard, data.paymentMethod, onUpdateAction]);

  // TokenEx iframe hook — only active when we need to collect payment
  const {
    isLoaded: iframeLoaded,
    isValid: iframeValid,
    isCvvValid: iframeCvvValid,
    error: iframeError,
    tokenize: iframeTokenize,
  } = useTokenExIframe({
    containerId: TOKENEX_CONTAINER_ID,
    cvvContainerId: TOKENEX_CVV_CONTAINER_ID,
    config: useIframe ? (tokenizationConfig ?? null) : null,
    theme: resolvedTheme === 'dark' ? 'dark' : 'light',
  });

  // Get valid membership coupons
  const validCoupons = useMemo(() => {
    return getValidMembershipCoupons(availableCoupons);
  }, [availableCoupons]);

  // Calculate discount if coupon is applied
  const { discountAmount, finalPrice } = useMemo(() => {
    if (data.appliedCoupon && originalPrice > 0) {
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

  const handleInputChange = (field: string, value: string) => {
    onUpdateAction({ [field]: value });
  };

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    onUpdateAction({
      paymentMethod: method,
      ...(method === 'ach' && !data.achAccountType && { achAccountType: 'Checking' as const }),
    });
  };

  // Validation for no-card payment form
  const isCardholderNameInvalid = touched.cardholderName && !data.cardholderName;
  const isCardNumberInvalid = !useIframe && touched.cardNumber && !data.cardNumber;
  const isCardExpiryInvalid = touched.cardExpiry && !data.cardExpiry;
  const isCardCvcInvalid = touched.cardCvc && !data.cardCvc;
  const isAchAccountHolderInvalid = touched.achAccountHolder && !data.achAccountHolder;
  const isAchRoutingNumberInvalid = touched.achRoutingNumber && !data.achRoutingNumber;
  const isAchAccountNumberInvalid = touched.achAccountNumber && !data.achAccountNumber;

  const isCardFormValid = paymentMethod === 'card'
    && data.cardholderName
    && (useIframe ? iframeValid : data.cardNumber)
    && data.cardExpiry
    && (useIframe ? iframeCvvValid : data.cardCvc);
  const isAchFormValid = paymentMethod === 'ach'
    && data.achAccountHolder
    && data.achRoutingNumber
    && data.achAccountNumber;

  // Can proceed: if HOH has card, always enabled; otherwise need valid payment form
  const canProceed = hohHasCard || isCardFormValid || isAchFormValid;

  const hasCouponApplied = data.appliedCoupon && discountAmount > 0;

  const handleConfirm = useCallback(async () => {
    // If HOH has no card and using iframe for card tokenization
    if (!hohHasCard && useIframe && paymentMethod === 'card') {
      try {
        setTokenizing(true);
        const result = await iframeTokenize();
        onUpdateAction({ cardToken: result.token, cardFirstSix: result.firstSix, cardLastFour: result.lastFour });
        onNextAction();
      } catch {
        onUpdateAction({
          paymentStatus: 'declined',
          paymentDeclineReason: 'card_declined',
        });
      } finally {
        setTokenizing(false);
      }
      return;
    }
    onNextAction();
  }, [hohHasCard, useIframe, paymentMethod, onNextAction, onUpdateAction, iframeTokenize]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">
          {hohHasCard ? t('subtitle_with_card') : t('subtitle_no_card')}
        </p>
      </div>

      {/* Billing Summary */}
      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold">{t('summary_label')}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('member_label')}</span>
            <span className="font-medium">
              {data.firstName}
              {' '}
              {data.lastName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('plan_label')}</span>
            <span className="font-medium">{data.membershipPlanName || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('amount_label')}</span>
            <span className="font-medium">
              {hasCouponApplied
                ? (
                    <>
                      {paymentAmount}
                      {' '}
                      <span className="text-muted-foreground line-through">{formatPaymentAmount(originalPrice)}</span>
                    </>
                  )
                : paymentAmount}
              {frequencyLabel && `/${frequencyLabel}`}
            </span>
          </div>
          <div className="border-t pt-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('hoh_label')}</span>
              <span className="font-medium">{data.hohMemberName}</span>
            </div>
            {hohHasCard && (
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">{t('payment_method_label')}</span>
                <span className="flex items-center gap-1 font-medium">
                  {data.hohPaymentMethodType === 'ach'
                    ? <Landmark className="h-3 w-3" />
                    : <CreditCard className="h-3 w-3" />}
                  {t('payment_method_value', {
                    hohName: data.hohMemberName || '',
                    type: data.hohPaymentMethodType === 'ach' ? 'ACH' : 'Card',
                    last4: data.hohPaymentMethodLast4 || '****',
                  })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Coupon Selection */}
      {validCoupons.length > 0 && originalPrice > 0 && (
        <div>
          <label htmlFor="familyCouponSelect" className="block text-sm font-medium">
            {tPayment('coupon_label')}
          </label>
          <Select
            value={data.appliedCoupon?.id || 'none'}
            onValueChange={handleCouponChange}
            disabled={isLoading}
          >
            <SelectTrigger id="familyCouponSelect" className="mt-1">
              <SelectValue placeholder={tPayment('coupon_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{tPayment('coupon_none')}</SelectItem>
              {validCoupons.map(coupon => (
                <SelectItem key={coupon.id} value={coupon.id}>
                  <span className="flex items-center gap-2">
                    <Tag className="h-3 w-3" />
                    {coupon.code}
                    {' - '}
                    {coupon.type === 'Percentage' && coupon.amount}
                    {coupon.type === 'Fixed Amount' && coupon.amount}
                    {coupon.type === 'Free Trial' && tPayment('coupon_free_trial')}
                    {' '}
                    {tPayment('coupon_off')}
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
              {tPayment('coupon_applied_title', { code: data.appliedCoupon?.code ?? '' })}
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              {tPayment('coupon_savings_message', { amount: formatPaymentAmount(discountAmount) })}
            </p>
          </div>
        </div>
      )}

      {/* Mode A: HOH has card — billing notice */}
      {hohHasCard && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {t('billing_notice', {
              amount: paymentAmount,
              hohName: data.hohMemberName || '',
              price: paymentAmount,
              frequency: frequencyLabel || 'month',
            })}
          </p>
        </div>
      )}

      {/* Mode B: HOH has no card — collect payment */}
      {!hohHasCard && (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('no_card_notice', { hohName: data.hohMemberName || '' })}
            </p>
          </div>

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
              <span className="font-medium">{tPayment('card_tab_label')}</span>
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
              <span className="font-medium">{tPayment('ach_tab_label')}</span>
            </button>
          </div>

          {/* Card Form */}
          {paymentMethod === 'card' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="familyCardholderName" className="block text-sm font-medium">
                  {tPayment('cardholder_name_label')}
                </label>
                <Input
                  id="familyCardholderName"
                  placeholder={tPayment('cardholder_name_placeholder')}
                  value={data.cardholderName || ''}
                  onChange={e => handleInputChange('cardholderName', e.target.value)}
                  onBlur={() => handleInputBlur('cardholderName')}
                  error={isCardholderNameInvalid}
                  disabled={isLoading}
                  className="mt-1"
                />
                {isCardholderNameInvalid && (
                  <p className="text-xs text-destructive">{tPayment('cardholder_name_error')}</p>
                )}
              </div>

              <div>
                <label htmlFor={useIframe ? TOKENEX_CONTAINER_ID : 'familyCardNumber'} className="block text-sm font-medium">
                  {tPayment('card_number_label')}
                </label>
                {useIframe
                  ? (
                      <div>
                        {!iframeLoaded && !iframeError && (
                          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {tPayment('card_number_iframe_loading')}
                          </div>
                        )}
                        {iframeError && (
                          <p className="text-xs text-destructive">{tPayment('card_number_iframe_error')}</p>
                        )}
                        <div
                          id={TOKENEX_CONTAINER_ID}
                          className={`mt-1 h-9 w-full overflow-hidden rounded-md border border-neutral-600 bg-neutral-100 shadow-xs dark:bg-input/30 [&_iframe]:border-none ${
                            isLoading ? 'pointer-events-none opacity-50' : ''
                          } ${!iframeLoaded && !iframeError ? 'hidden' : ''}`}
                        />
                      </div>
                    )
                  : (
                      <>
                        <Input
                          id="familyCardNumber"
                          placeholder={tPayment('card_number_placeholder')}
                          value={data.cardNumber || ''}
                          onChange={e => handleInputChange('cardNumber', e.target.value)}
                          onBlur={() => handleInputBlur('cardNumber')}
                          error={isCardNumberInvalid}
                          disabled={isLoading}
                          className="mt-1"
                        />
                        {isCardNumberInvalid && (
                          <p className="text-xs text-destructive">{tPayment('card_number_error')}</p>
                        )}
                      </>
                    )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="familyCardExpiry" className="block text-sm font-medium">
                    {tPayment('card_expiry_label')}
                  </label>
                  <Input
                    id="familyCardExpiry"
                    placeholder={tPayment('card_expiry_placeholder')}
                    value={data.cardExpiry || ''}
                    onChange={e => handleInputChange('cardExpiry', e.target.value)}
                    onBlur={() => handleInputBlur('cardExpiry')}
                    error={isCardExpiryInvalid}
                    disabled={isLoading}
                    className="mt-1"
                  />
                  {isCardExpiryInvalid && (
                    <p className="text-xs text-destructive">{tPayment('card_expiry_error')}</p>
                  )}
                </div>
                <div>
                  <label htmlFor={useIframe ? TOKENEX_CVV_CONTAINER_ID : 'familyCardCvc'} className="block text-sm font-medium">
                    {tPayment('card_cvc_label')}
                  </label>
                  {useIframe
                    ? (
                        <div
                          id={TOKENEX_CVV_CONTAINER_ID}
                          className={`mt-1 h-9 w-full overflow-hidden rounded-md border border-neutral-600 bg-neutral-100 shadow-xs dark:bg-input/30 [&_iframe]:border-none ${
                            isLoading ? 'pointer-events-none opacity-50' : ''
                          } ${!iframeLoaded && !iframeError ? 'hidden' : ''}`}
                        />
                      )
                    : (
                        <>
                          <Input
                            id="familyCardCvc"
                            placeholder={tPayment('card_cvc_placeholder')}
                            value={data.cardCvc || ''}
                            onChange={e => handleInputChange('cardCvc', e.target.value)}
                            onBlur={() => handleInputBlur('cardCvc')}
                            error={isCardCvcInvalid}
                            disabled={isLoading}
                            className="mt-1"
                          />
                          {isCardCvcInvalid && (
                            <p className="text-xs text-destructive">{tPayment('card_cvc_error')}</p>
                          )}
                        </>
                      )}
                </div>
              </div>
            </div>
          )}

          {/* ACH Form */}
          {paymentMethod === 'ach' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="familyAchAccountHolder" className="block text-sm font-medium">
                  {tPayment('ach_account_holder_label')}
                </label>
                <Input
                  id="familyAchAccountHolder"
                  placeholder={tPayment('ach_account_holder_placeholder')}
                  value={data.achAccountHolder || ''}
                  onChange={e => handleInputChange('achAccountHolder', e.target.value)}
                  onBlur={() => handleInputBlur('achAccountHolder')}
                  error={isAchAccountHolderInvalid}
                  disabled={isLoading}
                  className="mt-1"
                />
                {isAchAccountHolderInvalid && (
                  <p className="text-xs text-destructive">{tPayment('ach_account_holder_error')}</p>
                )}
              </div>
              <div>
                <label htmlFor="familyAchAccountType" className="block text-sm font-medium">
                  {tPayment('ach_account_type_label')}
                </label>
                <Select
                  value={data.achAccountType || 'Checking'}
                  onValueChange={value => handleInputChange('achAccountType', value)}
                  disabled={isLoading}
                >
                  <SelectTrigger id="familyAchAccountType" className="mt-1">
                    <SelectValue placeholder={tPayment('ach_account_type_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Checking">{tPayment('ach_account_type_checking')}</SelectItem>
                    <SelectItem value="Savings">{tPayment('ach_account_type_savings')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="familyAchRoutingNumber" className="block text-sm font-medium">
                  {tPayment('ach_routing_number_label')}
                </label>
                <Input
                  id="familyAchRoutingNumber"
                  placeholder={tPayment('ach_routing_number_placeholder')}
                  value={data.achRoutingNumber || ''}
                  onChange={e => handleInputChange('achRoutingNumber', e.target.value)}
                  onBlur={() => handleInputBlur('achRoutingNumber')}
                  error={isAchRoutingNumberInvalid}
                  disabled={isLoading}
                  className="mt-1"
                />
                {isAchRoutingNumberInvalid && (
                  <p className="text-xs text-destructive">{tPayment('ach_routing_number_error')}</p>
                )}
              </div>
              <div>
                <label htmlFor="familyAchAccountNumber" className="block text-sm font-medium">
                  {tPayment('ach_account_number_label')}
                </label>
                <Input
                  id="familyAchAccountNumber"
                  placeholder={tPayment('ach_account_number_placeholder')}
                  value={data.achAccountNumber || ''}
                  onChange={e => handleInputChange('achAccountNumber', e.target.value)}
                  onBlur={() => handleInputBlur('achAccountNumber')}
                  error={isAchAccountNumberInvalid}
                  disabled={isLoading}
                  className="mt-1"
                />
                {isAchAccountNumberInvalid && (
                  <p className="text-xs text-destructive">{tPayment('ach_account_number_error')}</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Payment Status Alert */}
      {paymentStatus === 'declined' && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">
              {tPayment('payment_declined_title')}
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {getDeclineReasonMessage(data.paymentDeclineReason)}
            </p>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              {tPayment('payment_declined_continue_message')}
            </p>
          </div>
        </div>
      )}

      {paymentStatus === 'processing' && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {tPayment('payment_processing_message')}
          </p>
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
          onClick={handleConfirm}
          disabled={!canProceed || isLoading || tokenizing}
          variant={paymentStatus === 'declined' ? 'outline' : 'default'}
        >
          {(isLoading || tokenizing)
            ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('processing_button')}
                </>
              )
            : paymentStatus === 'declined'
              ? tPayment('continue_without_payment_button')
              : t('confirm_button')}
        </Button>
      </div>
    </div>
  );
};
