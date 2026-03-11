'use client';

import type { TokenizationIframeConfig } from '@/libs/IQPro';
import type { SaasPlanId } from '@/utils/SaasPlans';
import { useOrganization, useUser } from '@clerk/nextjs';
import { ArrowDownAZ, ArrowUpZA, Check, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useState } from 'react';
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
  const { currentPlan, billingHistory, loading, error, refetch } = useSubscriptionData();

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

  const { isLoaded: iframeLoaded, isValid: iframeValid, tokenize } = useTokenExIframe({
    containerId: TOKENEX_CONTAINER_ID,
    config: tokenizationConfig,
    theme: resolvedTheme === 'dark' ? 'dark' : 'light',
  });

  const loadTokenizationConfig = useCallback(async () => {
    if (tokenizationConfig) {
      return;
    }
    try {
      const config = await client.saasSubscription.getTokenizationConfig({
        origin: window.location.origin,
      });
      setTokenizationConfig(config as TokenizationIframeConfig);
    } catch {
      // If tokenization config fails, user will use plain card input
    }
  }, [tokenizationConfig]);

  const handleSubscribe = async (planId: SaasPlanId) => {
    const plan = SaasPlanList[planId];
    if (!plan || plan.isContactUs) {
      return;
    }

    // If no existing subscription, we need payment info
    if (!currentPlan?.hasActiveSubscription) {
      setSelectedPlanId(planId);
      loadTokenizationConfig();
      return;
    }

    // Change plan (already subscribed)
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

    const isCurrentPlan = currentPlan?.planId === planId
      && currentPlan?.billingCycle === billingCycle;

    if (isCurrentPlan) {
      return { text: t('current_plan_button'), disabled: true };
    }

    if (!currentPlan?.hasActiveSubscription) {
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
        <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
          <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:space-y-6 sm:px-6 sm:pb-6">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
                    const isCurrentPlan = currentPlan?.planId === planId && currentPlan?.billingCycle === billingCycle;
                    const btnProps = getPlanButtonProps(planId);
                    return (
                      <Card key={planId} className={`flex flex-col p-4 ${isCurrentPlan ? 'border-green-500 bg-green-50 dark:bg-green-950/30' : ''}`}>
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
                            {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : btnProps.text}
                          </Button>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">{plan.description}</p>

                        <div className="mt-3 space-y-1.5">
                          {plan.features.map(feature => (
                            <div key={feature.name} className="flex items-start gap-2">
                              {feature.included
                                ? <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                                : <X className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
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

                {/* Payment form for first-time subscription */}
                {selectedPlanId && !currentPlan?.hasActiveSubscription && (
                  <Card className="space-y-4 p-4">
                    <h3 className="text-base font-semibold">{t('payment_section_title')}</h3>

                    {/* TokenEx iframe container */}
                    <div>
                      <label className="mb-1 block text-sm font-medium">{t('card_number_label')}</label>
                      <div
                        id={TOKENEX_CONTAINER_ID}
                        className="h-10 rounded-md border border-input bg-background"
                      />
                      {!iframeLoaded && tokenizationConfig && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
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
                        {subscribing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
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
                        {sortDirection === 'asc' ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpZA className="h-4 w-4" />}
                      </button>
                    )}
                  </div>

                  {billingHistory.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {currentPlan?.isSuperAdmin ? t('complimentary_plan') : t('no_billing_history')}
                    </p>
                  )}

                  {billingHistory.length > 0 && (
                    <div className="space-y-2">
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
                          <ChevronLeft className="h-4 w-4" />
                          {t('previous_button')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          {t('next_button')}
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Action Buttons */}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  {currentPlan?.hasActiveSubscription && !currentPlan.isSuperAdmin && (
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
              {cancelling ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {t('cancel_confirm_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
