'use client';

import type { TokenizationIframeConfig } from '@/libs/IQPro';
import type { SaasPlanId } from '@/utils/SaasPlans';
import { useOrganization, useUser } from '@clerk/nextjs';
import { ArrowDownAZ, ArrowUpZA, Check, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ButtonGroupItem, ButtonGroupRoot } from '@/components/ui/button-group';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useSubscriptionData } from '@/hooks/useSubscriptionData';
import { useTokenExIframe } from '@/hooks/useTokenExIframe';
import { client } from '@/libs/Orpc';
import { SaasPlanList } from '@/utils/SaasPlans';

const TOKENEX_CONTAINER_ID = 'saasTokenExIframeDiv';

const planOrder: SaasPlanId[] = ['basic', 'growth'];

type SubscriptionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SubscriptionDialog({ open, onOpenChange }: SubscriptionDialogProps) {
  const t = useTranslations('SubscriptionPage');
  const { resolvedTheme } = useTheme();
  const { user } = useUser();
  const { organization } = useOrganization();
  // Only fetch (and refetch) when the dialog is open — avoids unconditional
  // IQPro round-trips on every dashboard load, and refreshes data each open.
  const { currentPlan, billingHistory, loading, error, refetch } = useSubscriptionData(open);

  // A trial is not a paid subscription: the org hasn't subscribed yet, so every
  // plan is a fresh "Subscribe" (nothing is the locked "Current Plan") and the
  // payment form / cancel button follow paid-subscriber state, not trial.
  const isTrial = currentPlan?.status === 'trial';
  const isPaidSubscriber = !!currentPlan?.hasActiveSubscription && !isTrial;

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<SaasPlanId | null>(null);
  const [cardExpiry, setCardExpiry] = useState('');
  const [tokenizationConfig, setTokenizationConfig] = useState<TokenizationIframeConfig | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const itemsPerPage = 10;

  // Whether the payment form is currently mounted in the DOM. The TokenEx
  // container <div id={TOKENEX_CONTAINER_ID}> only renders inside the
  // payment-form card, which itself only renders when a plan has been
  // selected and the user isn't already subscribed (see render block below).
  // Pass `config: null` to the hook until the container exists; otherwise
  // useTokenExIframe's effect runs while the div doesn't exist yet and the
  // iframe never mounts (#160).
  const showPaymentForm = !!selectedPlanId && !isPaidSubscriber;

  const { isLoaded: iframeLoaded, isValid: iframeValid, tokenize } = useTokenExIframe({
    containerId: TOKENEX_CONTAINER_ID,
    config: showPaymentForm ? tokenizationConfig : null,
    theme: resolvedTheme === 'dark' ? 'dark' : 'light',
  });

  // Fetches once and no-ops thereafter: the functional setState lets us skip
  // an already-loaded config without depending on `tokenizationConfig`, which
  // would otherwise re-run the pre-load effect below after its own update.
  const loadTokenizationConfig = useCallback(async () => {
    try {
      const config = await client.saasSubscription.getTokenizationConfig({
        origin: window.location.origin,
      });
      setTokenizationConfig(prev => prev ?? (config as TokenizationIframeConfig));
    } catch {
      // If tokenization config fails, user will use plain card input
    }
  }, []);

  // Pre-load the tokenization config when the dialog opens for a not-yet-
  // subscribed org. By the time the user clicks a plan and the payment form
  // renders, the config is already cached and the iframe can mount without
  // a visible loading delay (#160).
  useEffect(() => {
    if (!open || isPaidSubscriber) {
      return;
    }
    void (async () => {
      await loadTokenizationConfig();
    })();
  }, [open, isPaidSubscriber, loadTokenizationConfig]);

  const handleSubscribe = async (planId: SaasPlanId) => {
    const plan = SaasPlanList[planId];
    if (!plan || plan.isContactUs) {
      return;
    }

    // No paid subscription yet (never subscribed, or only on a trial): collect
    // payment and subscribe rather than attempting a plan change.
    if (!isPaidSubscriber) {
      setSelectedPlanId(planId);
      loadTokenizationConfig();
      return;
    }

    // Change plan (already a paid subscriber)
    setSubscribing(true);
    setActionError(null);
    try {
      const result = await client.saasSubscription.changePlan({
        newPlanId: planId as 'basic' | 'growth',
        newBillingCycle: billingCycle,
      });
      if (!result.success) {
        setActionError(result.error ?? t('change_plan_error'));
      } else {
        await refetch();
      }
    } catch {
      setActionError(t('change_plan_error'));
    } finally {
      setSubscribing(false);
    }
  };

  const handleSubmitSubscription = async () => {
    if (!selectedPlanId || !organization || !user) {
      return;
    }

    setSubscribing(true);
    setActionError(null);

    try {
      let cardToken: string | undefined;
      let cardFirstSix: string | undefined;
      let cardLastFour: string | undefined;

      if (tokenizationConfig) {
        const result = await tokenize();
        cardToken = result.token;
        cardFirstSix = result.firstSix;
        cardLastFour = result.lastFour;
      }

      const subscribeResult = await client.saasSubscription.subscribe({
        orgName: organization.name,
        adminEmail: user.primaryEmailAddress?.emailAddress ?? '',
        planId: selectedPlanId as 'basic' | 'growth',
        billingCycle,
        cardToken,
        cardFirstSix,
        cardLastFour,
        cardExpiry: cardExpiry || undefined,
      });

      if (!subscribeResult.success) {
        setActionError(subscribeResult.error ?? t('subscribe_error'));
      } else {
        setSelectedPlanId(null);
        setCardExpiry('');
        await refetch();
      }
    } catch {
      setActionError(t('subscribe_error'));
    } finally {
      setSubscribing(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setActionError(null);
    try {
      const result = await client.saasSubscription.cancel({ endOfPeriod: true });
      if (!result.success) {
        setActionError(result.error ?? t('cancel_error'));
      } else {
        setCancelDialogOpen(false);
        await refetch();
      }
    } catch {
      setActionError(t('cancel_error'));
    } finally {
      setCancelling(false);
    }
  };

  const handleSort = () => {
    setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
  };

  const sortedHistory = [...billingHistory].sort((a, b) => {
    const aDate = new Date(a.invoiceDate ?? '').getTime();
    const bDate = new Date(b.invoiceDate ?? '').getTime();
    return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
  });

  const totalPages = Math.ceil(sortedHistory.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedHistory = sortedHistory.slice(startIndex, startIndex + itemsPerPage);

  const getPlanButtonProps = (planId: SaasPlanId) => {
    const plan = SaasPlanList[planId];
    if (!plan) {
      return { text: '', disabled: true };
    }

    if (plan.isContactUs) {
      return { text: t('contact_us_button'), disabled: false };
    }

    const isCurrentPlan = isPaidSubscriber
      && currentPlan?.planId === planId
      && currentPlan?.billingCycle === billingCycle;

    if (isCurrentPlan) {
      return { text: t('current_plan_button'), disabled: true };
    }

    // Not a paid subscriber (no subscription, or on a trial) → fresh subscribe.
    if (!isPaidSubscriber) {
      return { text: t('subscribe_button'), disabled: false };
    }

    const currentIdx = planOrder.indexOf(currentPlan?.planId as SaasPlanId);
    const targetIdx = planOrder.indexOf(planId);

    if (targetIdx > currentIdx) {
      return { text: t('upgrade_plan_button'), disabled: false };
    }

    return { text: t('downgrade_plan_button'), disabled: false };
  };

  const formatPrice = (planId: SaasPlanId, cycle: 'monthly' | 'annual') => {
    const plan = SaasPlanList[planId];
    if (!plan) {
      return '';
    }
    if (plan.isContactUs) {
      return t('contact_us_price');
    }
    const price = cycle === 'annual' ? plan.annualPricePerMonth : plan.monthlyPrice;
    return `$${price} ${t('per_month')}`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:max-h-[88vh] sm:min-h-150 sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
          <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:space-y-6 sm:px-6 sm:pb-6">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">{t('loading')}</span>
              </div>
            )}

            {error && !loading && (
              <p className="text-sm text-destructive">{t('error_loading')}</p>
            )}

            {actionError && (
              <p className="text-sm text-destructive">{actionError}</p>
            )}

            {!loading && !error && (
              <>
                {/* Trial notice — a trial is not a paid subscription yet */}
                {isTrial && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
                    {t('trial_notice')}
                  </div>
                )}

                {/* Responsible Academy Owner */}
                <Card className="p-4">
                  <p className="text-sm font-semibold text-foreground">{t('responsible_owner_heading')}</p>
                  {currentPlan?.responsibleOwner
                    ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {currentPlan.responsibleOwner.name ?? t('responsible_owner_unknown_name')}
                          {currentPlan.responsibleOwner.email ? ` · ${currentPlan.responsibleOwner.email}` : ''}
                        </p>
                      )
                    : (
                        <p className="mt-1 text-sm text-muted-foreground">{t('responsible_owner_none')}</p>
                      )}
                </Card>

                {/* Billing Cycle Toggle */}
                <ButtonGroupRoot value={billingCycle} onValueChange={v => setBillingCycle(v as 'monthly' | 'annual')} className="w-full">
                  <ButtonGroupItem value="monthly" className="flex-1">
                    {t('monthly_button')}
                  </ButtonGroupItem>
                  <ButtonGroupItem value="annual" className="flex-1">
                    {t('annual_button')}
                  </ButtonGroupItem>
                </ButtonGroupRoot>

                {/* Pricing Cards */}
                <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                  {planOrder.map((planId) => {
                    const plan = SaasPlanList[planId];
                    if (!plan) {
                      return null;
                    }
                    const isCurrentPlan = isPaidSubscriber && currentPlan?.planId === planId && currentPlan?.billingCycle === billingCycle;
                    // Highlight the plan the user has chosen to subscribe to (before payment).
                    const isSelected = !isCurrentPlan && selectedPlanId === planId;
                    const btnProps = getPlanButtonProps(planId);
                    return (
                      <Card
                        key={planId}
                        className={`flex flex-col p-4 transition-colors ${
                          isCurrentPlan
                            ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
                            : isSelected
                              ? 'border-foreground ring-1 ring-foreground'
                              : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 lg:flex-col lg:items-stretch">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                            <p className="mt-1 text-base font-bold text-foreground">{formatPrice(planId, billingCycle)}</p>
                          </div>
                          <Button
                            className="shrink-0 lg:mt-3 lg:w-full"
                            size="sm"
                            disabled={btnProps.disabled || subscribing}
                            onClick={() => plan.isContactUs ? undefined : handleSubscribe(planId)}
                          >
                            {subscribing ? <Loader2 className="size-4 animate-spin" /> : btnProps.text}
                          </Button>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">{plan.description}</p>

                        <div className="mt-3 space-y-1.5">
                          {plan.features.map(feature => (
                            <div key={feature.name} className="flex items-start gap-2">
                              {feature.included
                                ? <Check className="size-3.5 shrink-0 text-green-600" />
                                : <X className="size-3.5 shrink-0 text-gray-400" />}
                              <span className={`text-xs leading-tight ${feature.included ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                                {feature.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {/* Payment form for first-time subscription (incl. trial → paid) */}
                {showPaymentForm && (
                  <Card className="space-y-4 p-4">
                    <h3 className="text-base font-semibold">{t('payment_section_title')}</h3>

                    {/* TokenEx iframe container */}
                    <div>
                      <label className="mb-1 block text-sm font-medium">{t('card_number_label')}</label>
                      <div
                        id={TOKENEX_CONTAINER_ID}
                        className="h-9 w-full overflow-hidden rounded-md border border-neutral-600 bg-neutral-100 shadow-xs dark:bg-input/30 [&_iframe]:block [&_iframe]:size-full [&_iframe]:border-none [&_iframe]:bg-transparent"
                      />
                      {!iframeLoaded && tokenizationConfig && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <Loader2 className="mr-1 inline size-3 animate-spin" />
                          {t('loading')}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">{t('card_expiry_label')}</label>
                      <Input
                        placeholder={t('card_expiry_placeholder')}
                        value={cardExpiry}
                        onChange={e => setCardExpiry(e.target.value)}
                        maxLength={5}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPlanId(null)}
                      >
                        {t('cancel_cancel_button')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={subscribing || (tokenizationConfig ? (!iframeLoaded || !iframeValid) : false)}
                        onClick={handleSubmitSubscription}
                      >
                        {subscribing ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                        {subscribing ? t('processing') : t('subscribe_button')}
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Billing History Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-foreground">{t('billing_history_heading')}</h2>
                    {billingHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSort}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      >
                        {sortDirection === 'asc' ? <ArrowDownAZ className="size-4" /> : <ArrowUpZA className="size-4" />}
                      </button>
                    )}
                  </div>

                  {billingHistory.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {currentPlan?.isSuperAdmin ? t('complimentary_plan') : t('no_billing_history')}
                    </p>
                  )}

                  {billingHistory.length > 0 && (
                    <div className="max-h-[40vh] space-y-2 overflow-y-auto">
                      {paginatedHistory.map(item => (
                        <Card key={item.invoiceId} className="px-3 py-2">
                          <div className="flex items-center text-sm">
                            <span className="w-1/3 font-medium text-foreground">
                              {item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : '—'}
                            </span>
                            <span className="w-1/3 text-muted-foreground">
                              {item.paymentMethodLast4 ? `Card ending •••${item.paymentMethodLast4}` : '—'}
                            </span>
                            <span className="w-1/3 text-right font-mono text-muted-foreground">
                              {item.invoiceId}
                            </span>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <span className="text-sm text-muted-foreground">
                        {t('page_info', { current: currentPage, total: totalPages })}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="size-4" />
                          {t('previous_button')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          {t('next_button')}
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Action Buttons */}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  {isPaidSubscriber && !currentPlan?.isSuperAdmin && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => setCancelDialogOpen(true)}
                    >
                      {t('cancel_membership_button')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cancel_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('cancel_confirm_message')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              {t('cancel_cancel_button')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {cancelling ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              {t('cancel_confirm_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
