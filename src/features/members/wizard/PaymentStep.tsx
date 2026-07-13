'use client';

import type { Coupon } from '@/features/marketing';
import type { AppliedCoupon, BillingType, MemberType, PaymentDeclineReason, PaymentMethod, WizardStepData } from '@/hooks/useAddMemberWizard';
import type { TokenizationIframeConfig } from '@/libs/IQPro';
import { AlertCircle, CheckCircle2, CreditCard, Info, Landmark, Loader2, RefreshCw, Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateCouponDiscount, getValidMembershipCoupons } from '@/features/marketing';
import { useTokenExIframe } from '@/hooks/useTokenExIframe';

type PaymentStepProps = {
  data: WizardStepData;
  onUpdateAction: (updates: Partial<WizardStepData>) => void;
  onNextAction: () => void;
  onBackAction: () => void;
  onCancelAction: () => void;
  isLoading?: boolean;
  availableCoupons?: Coupon[];
  tokenizationConfig?: TokenizationIframeConfig | null;
  memberType?: MemberType;
  captureOnly?: boolean;
};

const TOKENEX_CONTAINER_ID = 'tokenExIframeDiv';
const TOKENEX_CVV_CONTAINER_ID = 'tokenExCvvIframeDiv';

const formatPaymentAmount = (price?: number): string => {
  if (price === undefined || price === null || price === 0) {
    return '$0';
  }
  return `$${price.toFixed(2)}`;
};

const getFrequencyLabel = (frequency?: string | null): string => {
  if (!frequency || frequency === 'None') {
    return '';
  }
  const lower = frequency.toLowerCase();
  if (lower === 'monthly') {
    return 'month';
  }
  if (lower === 'weekly') {
    return 'week';
  }
  if (lower === 'semi-annual' || lower === 'semi-annually') {
    return '6 months';
  }
  if (lower === 'annual' || lower === 'annually' || lower === 'yearly') {
    return 'year';
  }
  return lower;
};

export const PaymentStep = ({
  data,
  onUpdateAction,
  onNextAction,
  onBackAction,
  onCancelAction,
  isLoading = false,
  availableCoupons = [],
  tokenizationConfig,
  memberType,
  captureOnly = false,
}: PaymentStepProps) => {
  const t = useTranslations('AddMemberWizard.PaymentStep');
  const tHOH = useTranslations('AddMemberWizard.PaymentStep_HOHNotice');
  const { resolvedTheme } = useTheme();
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
    isCvvValid: iframeCvvValid,
    error: iframeError,
    tokenize: iframeTokenize,
  } = useTokenExIframe({
    containerId: TOKENEX_CONTAINER_ID,
    cvvContainerId: TOKENEX_CVV_CONTAINER_ID,
    config: tokenizationConfig ?? null,
    theme: resolvedTheme === 'dark' ? 'dark' : 'light',
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

  // Sync computed default billing type to wizard data so it's available in AddMemberModal
  useEffect(() => {
    if (!data.billingType && billingType) {
      onUpdateAction({ billingType });
    }
  }, [data.billingType, billingType, onUpdateAction]);

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

  // Signup fee is charged once on the first transaction only; the recurring
  // subscription (when autopay) is configured at `finalPrice` only. Display
  // the combined total as today's charge, but break it out below so the user
  // sees exactly what will recur vs. what's a one-time fee.
  const signupFee = data.membershipPlanSignupFee ?? 0;
  const hasSignupFee = signupFee > 0;
  const chargeTotal = finalPrice + signupFee;
  const paymentAmount = formatPaymentAmount(chargeTotal);
  const recurringAmount = formatPaymentAmount(finalPrice);
  const signupFeeAmount = formatPaymentAmount(signupFee);

  // Free-trial detection — both flags must agree. A paid plan with a coupon
  // that brings price to $0 isn't a trial; it's a discounted plan and we
  // still want to capture card details for the next billing cycle.
  const isFreeTrial = !!data.membershipPlanIsTrial && finalPrice === 0;

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
      // Default account type when switching to ACH
      ...(method === 'ach' && !data.achAccountType && { achAccountType: 'Checking' as const }),
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

  // Card form valid: iframe mode checks iframeValid/iframeCvvValid instead of cardNumber/cardCvc
  const isCardFormValid = paymentMethod === 'card'
    && data.cardholderName
    && (useIframe ? iframeValid : data.cardNumber)
    && data.cardExpiry
    && (useIframe ? iframeCvvValid : data.cardCvc);

  const isAchFormValid = paymentMethod === 'ach'
    && data.achAccountHolder
    && data.achRoutingNumber
    && data.achAccountNumber;

  // Whether the user has started entering payment details. In capture-only mode
  // a card/ACH is optional, so we only require a COMPLETE form once they've begun.
  const hasStartedCardEntry = paymentMethod === 'card'
    && !!(data.cardholderName || data.cardNumber || data.cardExpiry || data.cardCvc || (useIframe && (iframeValid || iframeCvvValid)));
  const hasStartedAchEntry = paymentMethod === 'ach'
    && !!(data.achAccountHolder || data.achRoutingNumber || data.achAccountNumber);
  const hasStartedPaymentEntry = hasStartedCardEntry || hasStartedAchEntry;

  // Free-trial plans bypass the card/ACH validation gate — there's no charge, so
  // no payment data to collect. Capture-only (HOH who skipped membership) may
  // also skip the payment method entirely (#217): Next is enabled when nothing
  // has been entered, but if they start a card/ACH it must be complete.
  const isFormValid = isFreeTrial
    ? true
    : captureOnly
      ? (!hasStartedPaymentEntry || isCardFormValid || isAchFormValid)
      : (isCardFormValid || isAchFormValid);

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
    // Capture-only with no payment details entered → skip the payment method
    // entirely (nothing to tokenize or register). See AddMemberModal, which
    // only calls registerPaymentMethod when a paymentMethod is present.
    if (captureOnly && !hasStartedPaymentEntry) {
      onNextAction();
      return;
    }

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
  }, [useIframe, paymentMethod, onNextAction, onUpdateAction, iframeTokenize, captureOnly, hasStartedPaymentEntry]);

  // Try Again: clear the declined status so the user can re-submit the form
  // without re-entering payment fields. We deliberately do NOT auto-fire the
  // submit — the user reviews their card details (which are preserved) and
  // clicks the primary button explicitly.
  const handleTryAgain = useCallback(() => {
    onUpdateAction({
      paymentStatus: undefined,
      paymentDeclineReason: undefined,
      paymentProcessed: false,
    });
  }, [onUpdateAction]);

  return (
    <div className="space-y-6">
      <div>
        {captureOnly
          ? (
              <>
                <h2 className="text-lg font-semibold">{t('capture_only_title')}</h2>
                <p className="text-sm text-muted-foreground">{t('capture_only_description')}</p>
              </>
            )
          : isFreeTrial
            ? (
                <>
                  <h2 className="text-lg font-semibold">{t('trial_title')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t('trial_disclaimer', { duration: data.membershipPlanContractLength ?? '' })}
                  </p>
                </>
              )
            : (
                <>
                  <h2 className="text-lg font-semibold">
                    {hasCouponApplied
                      ? (
                          <>
                            {hasSignupFee
                              ? t('pay_amount_today', { amount: paymentAmount })
                              : t('pay_amount', { amount: paymentAmount })}
                            {' '}
                            <span className="text-base font-normal text-muted-foreground line-through">
                              {originalAmountText}
                            </span>
                          </>
                        )
                      : hasSignupFee
                        ? t('pay_amount_today', { amount: paymentAmount })
                        : t('pay_amount', { amount: paymentAmount })}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {hasSignupFee
                      ? t('payment_description_with_signup_fee', {
                          plan: planText,
                          recurringAmount,
                          period: periodText,
                          signupFee: signupFeeAmount,
                        })
                      : t('payment_description', {
                          plan: planText,
                          amount: paymentAmount,
                          period: periodText,
                        })}
                  </p>
                </>
              )}
      </div>

      {/* Breakdown panel — only when a signup fee is present. Shows the user
          exactly which portion recurs vs. which is a one-time charge. */}
      {!captureOnly && !isFreeTrial && hasSignupFee && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t('membership_label')}
              {periodText && (
                <span className="ml-1 text-xs text-muted-foreground">
                  (
                  {recurringAmount}
                  /
                  {periodText}
                  )
                </span>
              )}
            </span>
            <span className="font-medium">{recurringAmount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('signup_fee_label')}</span>
            <span className="font-medium">{signupFeeAmount}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-semibold">{t('total_due_today_label')}</span>
            <span className="font-semibold">{paymentAmount}</span>
          </div>
        </div>
      )}

      {/* Capture-only info notice */}
      {captureOnly && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {t('capture_only_notice')}
          </p>
        </div>
      )}

      {/* HOH Billing Notice (only when processing a payment, not capture-only or free trial) */}
      {!captureOnly && !isFreeTrial && memberType === 'head-of-household' && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {tHOH('notice')}
          </p>
        </div>
      )}

      {/* Coupon Selection (hidden in capture-only mode and on free trials) */}
      {!captureOnly && !isFreeTrial && validCoupons.length > 0 && originalPrice > 0 && (
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

      {/* Savings Alert (hidden in capture-only mode and on free trials) */}
      {!captureOnly && !isFreeTrial && hasCouponApplied && (
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

      {/* Billing Type Selection (hidden in capture-only mode and on free trials) */}
      {!captureOnly && !isFreeTrial && isRecurringMembership && originalPrice > 0 && (
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

      {/* Payment Status Alerts (hidden in capture-only mode) */}
      {!captureOnly && paymentStatus === 'approved' && (
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

      {!captureOnly && paymentStatus === 'declined' && (
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

      {!captureOnly && paymentStatus === 'processing' && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {t('payment_processing_message')}
          </p>
        </div>
      )}

      {/* Payment Method Tabs (hidden on free trials — no payment to collect) */}
      {!isFreeTrial && (
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
      )}

      {/* Card Payment Form (hidden on free trials — no payment to collect) */}
      {!isFreeTrial && paymentMethod === 'card' && (
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
                      className={`mt-1 h-9 w-full overflow-hidden rounded-md border border-neutral-600 bg-neutral-100 shadow-xs dark:bg-input/30 [&_iframe]:border-none ${
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
              <label htmlFor={useIframe ? TOKENEX_CVV_CONTAINER_ID : 'cardCvc'} className="block text-sm font-medium">
                {t('card_cvc_label')}
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
                    </>
                  )}
            </div>
          </div>
        </div>
      )}

      {/* ACH Payment Form (hidden on free trials — no payment to collect) */}
      {!isFreeTrial && paymentMethod === 'ach' && (
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
            <label htmlFor="achAccountType" className="block text-sm font-medium">
              {t('ach_account_type_label')}
            </label>
            <Select
              value={data.achAccountType || 'Checking'}
              onValueChange={value => handleInputChange('achAccountType', value)}
              disabled={isLoading}
            >
              <SelectTrigger id="achAccountType" className="mt-1">
                <SelectValue placeholder={t('ach_account_type_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Checking">{t('ach_account_type_checking')}</SelectItem>
                <SelectItem value="Savings">{t('ach_account_type_savings')}</SelectItem>
              </SelectContent>
            </Select>
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
        <div className="flex gap-3">
          {!captureOnly && paymentStatus === 'declined' && (
            <Button
              variant="default"
              onClick={handleTryAgain}
              disabled={isLoading || tokenizing}
              data-testid="payment-try-again-button"
            >
              {t('try_again_button')}
            </Button>
          )}
          <Button
            onClick={handleNextClick}
            disabled={!isFormValid || isLoading || tokenizing}
            variant={paymentStatus === 'declined' ? 'outline' : 'default'}
          >
            {(isLoading || tokenizing)
              ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('processing_button')}
                  </>
                )
              : isFreeTrial
                ? t('continue_button')
                : captureOnly
                  ? (hasStartedPaymentEntry ? t('save_payment_method_button') : t('skip_payment_method_button'))
                  : paymentStatus === 'declined'
                    ? t('continue_without_payment_button')
                    : t('next_button')}
          </Button>
        </div>
      </div>
    </div>
  );
};
