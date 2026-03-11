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
import { Input } from '@/components/ui/input';
import { useSubscriptionData } from '@/hooks/useSubscriptionData';
import { useTokenExIframe } from '@/hooks/useTokenExIframe';
import { client } from '@/libs/Orpc';
import { SaasPlanList } from '@/utils/SaasPlans';

const TOKENEX_CONTAINER_ID = 'saasPageTokenExIframeDiv';

const planOrder: SaasPlanId[] = ['basic', 'growth'];

export default function SubscriptionPage() {
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

    if (!currentPlan?.hasActiveSubscription) {
      setSelectedPlanId(planId);
      loadTokenizationConfig();
      return;
    }

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">{t('loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-destructive">{t('error_loading')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
        </div>

        {actionError && (
          <p className="text-sm text-destructive">{actionError}</p>
        )}

        {/* Billing Cycle Toggle */}
        <ButtonGroupRoot value={billingCycle} onValueChange={v => setBillingCycle(v as 'monthly' | 'annual')}>
          <ButtonGroupItem value="monthly">
            {t('monthly_button')}
          </ButtonGroupItem>
          <ButtonGroupItem value="annual">
            {t('annual_button')}
          </ButtonGroupItem>
        </ButtonGroupRoot>

        {/* Pricing Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          {planOrder.map((planId) => {
            const plan = SaasPlanList[planId];
            if (!plan) {
              return null;
            }
            const isCurrentPlan = currentPlan?.planId === planId && currentPlan?.billingCycle === billingCycle;
            const btnProps = getPlanButtonProps(planId);
            return (
              <Card key={planId} className={`flex flex-col p-6 ${isCurrentPlan ? 'border-green-500 bg-green-50 dark:bg-green-950/30' : ''}`}>
                <h3 className="text-2xl font-bold text-foreground">{plan.name}</h3>
                <p className="mt-2 text-2xl font-bold text-foreground">{formatPrice(planId, billingCycle)}</p>
                <p className="mt-4 text-sm text-muted-foreground">{plan.description}</p>

                <div className="mt-6 flex-1 space-y-3">
                  {plan.features.map(feature => (
                    <div key={feature.name} className="flex items-start gap-3">
                      {feature.included
                        ? <Check className="h-5 w-5 shrink-0 text-green-600" />
                        : <X className="h-5 w-5 shrink-0 text-gray-400" />}
                      <span className={`text-sm ${feature.included ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                        {feature.name}
                      </span>
                    </div>
                  ))}
                </div>

                <Button
                  className="mt-6 w-full"
                  disabled={btnProps.disabled || subscribing}
                  onClick={() => plan.isContactUs ? undefined : handleSubscribe(planId)}
                >
                  {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : btnProps.text}
                </Button>
              </Card>
            );
          })}
        </div>

        {/* Payment form for first-time subscription */}
        {selectedPlanId && !currentPlan?.hasActiveSubscription && (
          <Card className="space-y-4 p-6">
            <h3 className="text-lg font-semibold">{t('payment_section_title')}</h3>

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
                onClick={() => setSelectedPlanId(null)}
              >
                {t('cancel_cancel_button')}
              </Button>
              <Button
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
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{t('billing_history_heading')}</h2>
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
            <>
              {/* Desktop Table */}
              <Card className="hidden overflow-hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-secondary">
                        <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                          <button
                            type="button"
                            onClick={handleSort}
                            className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                          >
                            {t('table_date')}
                            {sortDirection === 'asc'
                              ? <ArrowDownAZ className="h-4 w-4" />
                              : <ArrowUpZA className="h-4 w-4" />}
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                          {t('table_method')}
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                          {t('table_payment_id')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedHistory.map(item => (
                        <tr key={item.invoiceId} className="border-b border-border hover:bg-secondary/30">
                          <td className="px-6 py-4 text-sm text-foreground">
                            {item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {item.paymentMethodLast4 ? `Card ending •••${item.paymentMethodLast4}` : '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">{item.invoiceId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Mobile Cards */}
              <div className="space-y-2 lg:hidden">
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
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border pt-4">
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
        <div className="flex justify-end gap-2">
          {currentPlan?.hasActiveSubscription && !currentPlan.isSuperAdmin && (
            <Button
              variant="destructive"
              onClick={() => setCancelDialogOpen(true)}
            >
              {t('cancel_membership_button')}
            </Button>
          )}
        </div>
      </div>

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
