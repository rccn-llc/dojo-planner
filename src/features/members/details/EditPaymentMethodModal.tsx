'use client';

import type { TokenizationIframeConfig } from '@/libs/IQPro';
import { CreditCard, Landmark, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';
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
import { useTokenExIframe } from '@/hooks/useTokenExIframe';
import { client } from '@/libs/Orpc';

const TOKENEX_CONTAINER_ID = 'editPmTokenExIframeDiv';
const TOKENEX_CVV_CONTAINER_ID = 'editPmTokenExCvvIframeDiv';

type EditPaymentMethodModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  /**
   * Identifies the member whose payment method is being edited. Required for
   * the registerPaymentMethod RPC call.
   */
  memberId: string;
  memberEmail: string;
  memberFirstName: string;
  memberLastName: string;
  /** Optional but improves IQPro customer record completeness. */
  memberPhone?: string;
  /**
   * Called after a successful save so the parent can refetch the saved
   *  payment-method list and show the new last-4.
   */
  onSavedAction?: () => void;
};

/**
 * Edit / add a payment method on an existing member's detail page (#134/#137).
 *
 * Mirrors the card-tokenization pattern used by the AddMember wizard's
 * PaymentStep — TokenEx iframe captures the card client-side, returning a
 * token + BIN/last4 that the server uses to register the payment method on
 * the IQPro customer. ACH uses server-side tokenization via
 * `client.payment.registerPaymentMethod` (which calls into IQPro's Vault API
 * for ACH internally).
 *
 * No charge is processed — this only saves the payment method on file. To
 * charge, the operator continues with the membership/transaction flow
 * elsewhere.
 */
export function EditPaymentMethodModal({
  isOpen,
  onCloseAction,
  memberId,
  memberEmail,
  memberFirstName,
  memberLastName,
  memberPhone,
  onSavedAction,
}: EditPaymentMethodModalProps) {
  const t = useTranslations('AddMemberWizard.PaymentStep');
  const tEdit = useTranslations('EditPaymentMethodModal');
  const { resolvedTheme } = useTheme();

  const [tokenizationConfig, setTokenizationConfig] = useState<TokenizationIframeConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Single form-state object so reopening the modal triggers exactly one
  // re-sync (during render) instead of an 8-call useEffect cascade. Same
  // pattern as EditEventModal — see React docs on "deriving state from
  // props".
  type FormState = {
    paymentMethod: 'card' | 'ach';
    cardholderName: string;
    cardExpiry: string;
    achAccountHolder: string;
    achRoutingNumber: string;
    achAccountNumber: string;
    achAccountType: 'Checking' | 'Savings';
    error: string | null;
    syncedFor: boolean; // tracks the open state we last synced from
  };
  const buildEmptyForm = (forOpen: boolean): FormState => ({
    paymentMethod: 'card',
    cardholderName: '',
    cardExpiry: '',
    achAccountHolder: '',
    achRoutingNumber: '',
    achAccountNumber: '',
    achAccountType: 'Checking',
    error: null,
    syncedFor: forOpen,
  });

  const [form, setForm] = useState<FormState>(() => buildEmptyForm(isOpen));

  // Re-sync during render when the modal opens. React explicitly supports
  // calling setState during render to derive state from changing props.
  if (isOpen && !form.syncedFor) {
    setForm(buildEmptyForm(true));
  } else if (!isOpen && form.syncedFor) {
    setForm(buildEmptyForm(false));
  }

  // Fetch tokenization config when the modal opens. Returns null when IQPro
  // isn't configured — in that case we fall back to a plain card-number
  // input (local dev only).
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    client.payment.getTokenizationConfig({ origin: window.location.origin })
      .then(config => setTokenizationConfig(config ?? null))
      .catch(() => setTokenizationConfig(null));
  }, [isOpen]);

  const useIframe = !!tokenizationConfig && form.paymentMethod === 'card';

  const {
    isLoaded: iframeLoaded,
    isValid: iframeValid,
    isCvvValid: iframeCvvValid,
    error: iframeError,
    tokenize: iframeTokenize,
  } = useTokenExIframe({
    containerId: TOKENEX_CONTAINER_ID,
    cvvContainerId: TOKENEX_CVV_CONTAINER_ID,
    config: useIframe ? tokenizationConfig : null,
    theme: resolvedTheme === 'dark' ? 'dark' : 'light',
  });

  const isCardFormValid = form.paymentMethod === 'card'
    && form.cardholderName.trim().length > 0
    && form.cardExpiry.trim().length > 0
    && (useIframe ? iframeValid && iframeCvvValid : true);

  const isAchFormValid = form.paymentMethod === 'ach'
    && form.achAccountHolder.trim().length > 0
    && form.achRoutingNumber.trim().length > 0
    && form.achAccountNumber.trim().length > 0;

  const isFormValid = isCardFormValid || isAchFormValid;

  const handleSubmit = useCallback(async () => {
    setIsSaving(true);
    setForm(prev => ({ ...prev, error: null }));

    try {
      let cardToken: string | undefined;
      let cardFirstSix: string | undefined;
      let cardLastFour: string | undefined;

      if (form.paymentMethod === 'card' && useIframe) {
        const result = await iframeTokenize();
        cardToken = result.token;
        cardFirstSix = result.firstSix;
        cardLastFour = result.lastFour;
      }

      const response = await client.payment.registerPaymentMethod({
        memberId,
        memberEmail,
        memberFirstName,
        memberLastName,
        ...(memberPhone && { memberPhone }),
        paymentMethod: form.paymentMethod,
        ...(form.paymentMethod === 'card' && {
          cardholderName: form.cardholderName,
          cardExpiry: form.cardExpiry,
          ...(cardToken && { cardToken }),
          ...(cardFirstSix && { cardFirstSix }),
          ...(cardLastFour && { cardLastFour }),
        }),
        ...(form.paymentMethod === 'ach' && {
          achAccountHolder: form.achAccountHolder,
          achRoutingNumber: form.achRoutingNumber,
          achAccountNumber: form.achAccountNumber,
          achAccountType: form.achAccountType,
        }),
      });

      if (!response.success) {
        setForm(prev => ({ ...prev, error: response.error || tEdit('save_error') }));
        return;
      }

      if (onSavedAction) {
        onSavedAction();
      }
      onCloseAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : tEdit('save_error');
      setForm(prev => ({ ...prev, error: message }));
    } finally {
      setIsSaving(false);
    }
  }, [
    form,
    useIframe,
    iframeTokenize,
    memberId,
    memberEmail,
    memberFirstName,
    memberLastName,
    memberPhone,
    onSavedAction,
    onCloseAction,
    tEdit,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCloseAction()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tEdit('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Payment method tabs */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, paymentMethod: 'card' }))}
              disabled={isSaving}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 transition-all ${
                form.paymentMethod === 'card'
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background hover:border-primary/50 hover:bg-accent/50'
              } ${isSaving ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <CreditCard className="h-5 w-5" />
              <span className="font-medium">{t('card_tab_label')}</span>
            </button>
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, paymentMethod: 'ach' }))}
              disabled={isSaving}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 transition-all ${
                form.paymentMethod === 'ach'
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background hover:border-primary/50 hover:bg-accent/50'
              } ${isSaving ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <Landmark className="h-5 w-5" />
              <span className="font-medium">{t('ach_tab_label')}</span>
            </button>
          </div>

          {form.paymentMethod === 'card' && (
            <div className="space-y-3">
              <div>
                <label htmlFor="edit-pm-cardholder" className="block text-sm font-medium">
                  {t('cardholder_name_label')}
                </label>
                <Input
                  id="edit-pm-cardholder"
                  value={form.cardholderName}
                  onChange={e => setForm(prev => ({ ...prev, cardholderName: e.target.value }))}
                  placeholder={t('cardholder_name_placeholder')}
                  disabled={isSaving}
                  className="mt-1"
                />
              </div>

              <div>
                <label htmlFor={useIframe ? TOKENEX_CONTAINER_ID : 'edit-pm-cardnumber'} className="block text-sm font-medium">
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
                            isSaving ? 'pointer-events-none opacity-50' : ''
                          } ${!iframeLoaded && !iframeError ? 'hidden' : ''}`}
                        />
                      </div>
                    )
                  : (
                      <p className="mt-1 text-xs text-muted-foreground">{tEdit('card_iframe_unavailable')}</p>
                    )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-pm-expiry" className="block text-sm font-medium">
                    {t('card_expiry_label')}
                  </label>
                  <Input
                    id="edit-pm-expiry"
                    value={form.cardExpiry}
                    onChange={e => setForm(prev => ({ ...prev, cardExpiry: e.target.value }))}
                    placeholder={t('card_expiry_placeholder')}
                    disabled={isSaving}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label htmlFor={useIframe ? TOKENEX_CVV_CONTAINER_ID : 'edit-pm-cvc'} className="block text-sm font-medium">
                    {t('card_cvc_label')}
                  </label>
                  {useIframe
                    ? (
                        <div
                          id={TOKENEX_CVV_CONTAINER_ID}
                          className={`mt-1 h-9 w-full overflow-hidden rounded-md border border-neutral-600 bg-neutral-100 shadow-xs dark:bg-input/30 [&_iframe]:border-none ${
                            isSaving ? 'pointer-events-none opacity-50' : ''
                          } ${!iframeLoaded && !iframeError ? 'hidden' : ''}`}
                        />
                      )
                    : (
                        <p className="mt-1 text-xs text-muted-foreground">{tEdit('card_iframe_unavailable')}</p>
                      )}
                </div>
              </div>
            </div>
          )}

          {form.paymentMethod === 'ach' && (
            <div className="space-y-3">
              <div>
                <label htmlFor="edit-pm-ach-holder" className="block text-sm font-medium">
                  {t('ach_account_holder_label')}
                </label>
                <Input
                  id="edit-pm-ach-holder"
                  value={form.achAccountHolder}
                  onChange={e => setForm(prev => ({ ...prev, achAccountHolder: e.target.value }))}
                  placeholder={t('ach_account_holder_placeholder')}
                  disabled={isSaving}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="edit-pm-ach-type" className="block text-sm font-medium">
                  {t('ach_account_type_label')}
                </label>
                <Select
                  value={form.achAccountType}
                  onValueChange={value => setForm(prev => ({ ...prev, achAccountType: value as 'Checking' | 'Savings' }))}
                  disabled={isSaving}
                >
                  <SelectTrigger id="edit-pm-ach-type" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Checking">{t('ach_account_type_checking')}</SelectItem>
                    <SelectItem value="Savings">{t('ach_account_type_savings')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="edit-pm-ach-routing" className="block text-sm font-medium">
                  {t('ach_routing_number_label')}
                </label>
                <Input
                  id="edit-pm-ach-routing"
                  value={form.achRoutingNumber}
                  onChange={e => setForm(prev => ({ ...prev, achRoutingNumber: e.target.value }))}
                  placeholder={t('ach_routing_number_placeholder')}
                  disabled={isSaving}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="edit-pm-ach-account" className="block text-sm font-medium">
                  {t('ach_account_number_label')}
                </label>
                <Input
                  id="edit-pm-ach-account"
                  value={form.achAccountNumber}
                  onChange={e => setForm(prev => ({ ...prev, achAccountNumber: e.target.value }))}
                  placeholder={t('ach_account_number_placeholder')}
                  disabled={isSaving}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {form.error && (
            <p className="text-sm text-destructive">{form.error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onCloseAction} disabled={isSaving}>
              {tEdit('cancel_button')}
            </Button>
            <Button onClick={handleSubmit} disabled={!isFormValid || isSaving}>
              {isSaving
                ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {tEdit('saving_button')}
                    </>
                  )
                : tEdit('save_button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
