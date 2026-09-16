'use client';

import type { PaymentProvider } from '@/types/PaymentProvider';
import type { UpdatePaymentProviderConfigInput } from '@/validations/PaymentSettingsValidation';
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
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';

export type EditPaymentSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  provider: PaymentProvider;
  iqpro: { clientId: string; gatewayId: string; hasSecret: boolean };
  square: {
    locationId: string;
    applicationId: string;
    environment: 'sandbox' | 'production';
    hasAccessToken: boolean;
    hasWebhookKey: boolean;
  };
  onSave: (data: UpdatePaymentProviderConfigInput) => void | Promise<void>;
  errorMessage?: string | null;
  title?: string;
};

export function EditPaymentSettingsModal({
  isOpen,
  onClose,
  provider: initialProvider,
  iqpro,
  square,
  onSave,
  errorMessage,
  title,
}: EditPaymentSettingsModalProps) {
  const t = useTranslations('LocationSettings.EditPaymentSettingsModal');
  const [provider, setProvider] = useState<PaymentProvider>(initialProvider);
  const [clientId, setClientId] = useState(iqpro.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [gatewayId, setGatewayId] = useState(iqpro.gatewayId);
  const [locationId, setLocationId] = useState(square.locationId);
  const [applicationId, setApplicationId] = useState(square.applicationId);
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>(square.environment);
  const [accessToken, setAccessToken] = useState('');
  const [webhookSignatureKey, setWebhookSignatureKey] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Re-seed the form from the incoming props each time the modal transitions
  // to open. The `useState` initializers only run on mount, and Radix's
  // `onOpenChange` does not fire when the parent flips `isOpen`
  // programmatically — so without this re-seed the form keeps whatever (often
  // empty, still-loading) values it captured at mount time and the edit dialog
  // appears blank. This is the React "adjust state during render" pattern
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders),
  // which avoids a state-syncing effect.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    reseed();
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  function reseed() {
    setProvider(initialProvider);
    setClientId(iqpro.clientId);
    setGatewayId(iqpro.gatewayId);
    setClientSecret('');
    setLocationId(square.locationId);
    setApplicationId(square.applicationId);
    setEnvironment(square.environment);
    setAccessToken('');
    setWebhookSignatureKey('');
    setTouched({});
  }

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  // Secrets are required only when nothing has ever been saved for that
  // provider — they are never sent back to the browser, so a blank field means
  // "keep the stored one".
  const isSquare = provider === PAYMENT_PROVIDER.SQUARE;

  const isClientIdInvalid = touched.clientId && !clientId.trim();
  const isGatewayIdInvalid = touched.gatewayId && !gatewayId.trim();
  const isSecretInvalid = touched.clientSecret && !iqpro.hasSecret && !clientSecret.trim();
  const isLocationInvalid = touched.locationId && !locationId.trim();
  const isApplicationInvalid = touched.applicationId && !applicationId.trim();
  const isTokenInvalid = touched.accessToken && !square.hasAccessToken && !accessToken.trim();
  const isWebhookInvalid = touched.webhookSignatureKey && !square.hasWebhookKey && !webhookSignatureKey.trim();

  const isFormValid = isSquare
    ? locationId.trim() !== ''
    && applicationId.trim() !== ''
    && (square.hasAccessToken || accessToken.trim() !== '')
    && (square.hasWebhookKey || webhookSignatureKey.trim() !== '')
    : clientId.trim() !== ''
      && gatewayId.trim() !== ''
      && (iqpro.hasSecret || clientSecret.trim() !== '');

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      if (isSquare) {
        const token = accessToken.trim();
        const webhook = webhookSignatureKey.trim();
        await onSave({
          provider: PAYMENT_PROVIDER.SQUARE,
          locationId: locationId.trim(),
          applicationId: applicationId.trim(),
          environment,
          ...(token && { accessToken: token }),
          ...(webhook && { webhookSignatureKey: webhook }),
        });
      } else {
        const trimmedSecret = clientSecret.trim();
        await onSave({
          provider: PAYMENT_PROVIDER.IQPRO,
          clientId: clientId.trim(),
          gatewayId: gatewayId.trim(),
          ...(trimmedSecret && { clientSecret: trimmedSecret }),
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    reseed();
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      reseed();
    } else {
      handleCancel();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-1.5">
            <label htmlFor="payment-provider" className="text-sm font-medium text-foreground">{t('provider_label')}</label>
            <Select value={provider} onValueChange={value => setProvider(value as PaymentProvider)}>
              <SelectTrigger id="payment-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PAYMENT_PROVIDER.IQPRO}>{t('provider_iqpro')}</SelectItem>
                <SelectItem value={PAYMENT_PROVIDER.SQUARE}>{t('provider_square')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('provider_description')}
            </p>
          </div>

          {isSquare
            ? (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="square-application-id" className="text-sm font-medium text-foreground">{t('application_id_label')}</label>
                    <Input
                      id="square-application-id"
                      placeholder={t('application_id_placeholder')}
                      value={applicationId}
                      onChange={e => setApplicationId(e.target.value)}
                      onBlur={() => handleInputBlur('applicationId')}
                      error={isApplicationInvalid}
                      maxLength={200}
                    />
                    {isApplicationInvalid && (
                      <p className="text-xs text-destructive">{t('application_id_error')}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="square-location-id" className="text-sm font-medium text-foreground">{t('location_id_label')}</label>
                    <Input
                      id="square-location-id"
                      placeholder={t('location_id_placeholder')}
                      value={locationId}
                      onChange={e => setLocationId(e.target.value)}
                      onBlur={() => handleInputBlur('locationId')}
                      error={isLocationInvalid}
                      maxLength={100}
                    />
                    {isLocationInvalid && (
                      <p className="text-xs text-destructive">{t('location_id_error')}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="square-environment" className="text-sm font-medium text-foreground">{t('environment_label')}</label>
                    <Select value={environment} onValueChange={value => setEnvironment(value as 'sandbox' | 'production')}>
                      <SelectTrigger id="square-environment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandbox">{t('environment_sandbox')}</SelectItem>
                        <SelectItem value="production">{t('environment_production')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="square-access-token" className="text-sm font-medium text-foreground">{t('access_token_label')}</label>
                    <Input
                      id="square-access-token"
                      type="password"
                      placeholder={square.hasAccessToken ? t('access_token_placeholder_existing') : t('access_token_placeholder_new')}
                      value={accessToken}
                      onChange={e => setAccessToken(e.target.value)}
                      onBlur={() => handleInputBlur('accessToken')}
                      error={isTokenInvalid}
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                      {square.hasAccessToken
                        ? t('access_token_hint_existing')
                        : t('access_token_hint_new')}
                    </p>
                    {isTokenInvalid && (
                      <p className="text-xs text-destructive">{t('access_token_error')}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="square-webhook-key" className="text-sm font-medium text-foreground">{t('webhook_key_label')}</label>
                    <Input
                      id="square-webhook-key"
                      type="password"
                      placeholder={square.hasWebhookKey ? t('webhook_key_placeholder_existing') : t('webhook_key_placeholder_new')}
                      value={webhookSignatureKey}
                      onChange={e => setWebhookSignatureKey(e.target.value)}
                      onBlur={() => handleInputBlur('webhookSignatureKey')}
                      error={isWebhookInvalid}
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('webhook_key_hint')}
                    </p>
                    {isWebhookInvalid && (
                      <p className="text-xs text-destructive">{t('webhook_key_error')}</p>
                    )}
                  </div>
                </>
              )
            : (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="iqpro-client-id" className="text-sm font-medium text-foreground">{t('client_id_label')}</label>
                    <Input
                      id="iqpro-client-id"
                      placeholder={t('client_id_placeholder')}
                      value={clientId}
                      onChange={e => setClientId(e.target.value)}
                      onBlur={() => handleInputBlur('clientId')}
                      error={isClientIdInvalid}
                      maxLength={200}
                    />
                    {isClientIdInvalid && (
                      <p className="text-xs text-destructive">{t('client_id_error')}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="iqpro-client-secret" className="text-sm font-medium text-foreground">{t('client_secret_label')}</label>
                    <Input
                      id="iqpro-client-secret"
                      type="password"
                      placeholder={iqpro.hasSecret ? t('client_secret_placeholder_existing') : t('client_secret_placeholder_new')}
                      value={clientSecret}
                      onChange={e => setClientSecret(e.target.value)}
                      onBlur={() => handleInputBlur('clientSecret')}
                      error={isSecretInvalid}
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                      {iqpro.hasSecret
                        ? t('client_secret_hint_existing')
                        : t('client_secret_hint_new')}
                    </p>
                    {isSecretInvalid && (
                      <p className="text-xs text-destructive">{t('client_secret_error')}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="iqpro-gateway-id" className="text-sm font-medium text-foreground">{t('gateway_id_label')}</label>
                    <Input
                      id="iqpro-gateway-id"
                      placeholder={t('gateway_id_placeholder')}
                      value={gatewayId}
                      onChange={e => setGatewayId(e.target.value)}
                      onBlur={() => handleInputBlur('gatewayId')}
                      error={isGatewayIdInvalid}
                      maxLength={100}
                    />
                    {isGatewayIdInvalid && (
                      <p className="text-xs text-destructive">{t('gateway_id_error')}</p>
                    )}
                  </div>
                </>
              )}

          {provider !== initialProvider && (
            <p className="text-xs text-muted-foreground">
              {t('provider_switch_warning')}
            </p>
          )}

          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}

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
