'use client';

import type { PaymentProvider } from '@/types/PaymentProvider';
import type { UpdatePaymentProviderConfigInput } from '@/validations/PaymentSettingsValidation';
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
  title = 'Edit Payment Credentials',
}: EditPaymentSettingsModalProps) {
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-1.5">
            <label htmlFor="payment-provider" className="text-sm font-medium text-foreground">Payment Provider</label>
            <Select value={provider} onValueChange={value => setProvider(value as PaymentProvider)}>
              <SelectTrigger id="payment-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PAYMENT_PROVIDER.IQPRO}>IQPro</SelectItem>
                <SelectItem value={PAYMENT_PROVIDER.SQUARE}>Square</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Determines which merchant account receives this organization&apos;s member payments.
              {' '}
              Square accepts cards only — bank transfers are unavailable on Square.
            </p>
          </div>

          {isSquare
            ? (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="square-application-id" className="text-sm font-medium text-foreground">Application ID</label>
                    <Input
                      id="square-application-id"
                      placeholder="e.g. sandbox-sq0idb-..."
                      value={applicationId}
                      onChange={e => setApplicationId(e.target.value)}
                      onBlur={() => handleInputBlur('applicationId')}
                      error={isApplicationInvalid}
                      maxLength={200}
                    />
                    {isApplicationInvalid && (
                      <p className="text-xs text-destructive">Application ID is required.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="square-location-id" className="text-sm font-medium text-foreground">Location ID</label>
                    <Input
                      id="square-location-id"
                      placeholder="Square location identifier"
                      value={locationId}
                      onChange={e => setLocationId(e.target.value)}
                      onBlur={() => handleInputBlur('locationId')}
                      error={isLocationInvalid}
                      maxLength={100}
                    />
                    {isLocationInvalid && (
                      <p className="text-xs text-destructive">Location ID is required.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="square-environment" className="text-sm font-medium text-foreground">Environment</label>
                    <Select value={environment} onValueChange={value => setEnvironment(value as 'sandbox' | 'production')}>
                      <SelectTrigger id="square-environment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandbox">Sandbox</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="square-access-token" className="text-sm font-medium text-foreground">Access Token</label>
                    <Input
                      id="square-access-token"
                      type="password"
                      placeholder={square.hasAccessToken ? '••••••••  Leave blank to keep current token' : 'Enter access token'}
                      value={accessToken}
                      onChange={e => setAccessToken(e.target.value)}
                      onBlur={() => handleInputBlur('accessToken')}
                      error={isTokenInvalid}
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                      {square.hasAccessToken
                        ? 'Leave blank to keep the existing token unchanged.'
                        : 'An access token has not been saved yet.'}
                    </p>
                    {isTokenInvalid && (
                      <p className="text-xs text-destructive">Access Token is required.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="square-webhook-key" className="text-sm font-medium text-foreground">Webhook Signature Key</label>
                    <Input
                      id="square-webhook-key"
                      type="password"
                      placeholder={square.hasWebhookKey ? '••••••••  Leave blank to keep current key' : 'Enter webhook signature key'}
                      value={webhookSignatureKey}
                      onChange={e => setWebhookSignatureKey(e.target.value)}
                      onBlur={() => handleInputBlur('webhookSignatureKey')}
                      error={isWebhookInvalid}
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                      Used to verify that incoming Square webhooks are genuine.
                    </p>
                    {isWebhookInvalid && (
                      <p className="text-xs text-destructive">Webhook Signature Key is required.</p>
                    )}
                  </div>
                </>
              )
            : (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="iqpro-client-id" className="text-sm font-medium text-foreground">Client ID</label>
                    <Input
                      id="iqpro-client-id"
                      placeholder="e.g. abc123-..."
                      value={clientId}
                      onChange={e => setClientId(e.target.value)}
                      onBlur={() => handleInputBlur('clientId')}
                      error={isClientIdInvalid}
                      maxLength={200}
                    />
                    {isClientIdInvalid && (
                      <p className="text-xs text-destructive">Client ID is required.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="iqpro-client-secret" className="text-sm font-medium text-foreground">Client Secret</label>
                    <Input
                      id="iqpro-client-secret"
                      type="password"
                      placeholder={iqpro.hasSecret ? '••••••••  Leave blank to keep current secret' : 'Enter client secret'}
                      value={clientSecret}
                      onChange={e => setClientSecret(e.target.value)}
                      onBlur={() => handleInputBlur('clientSecret')}
                      error={isSecretInvalid}
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                      {iqpro.hasSecret
                        ? 'Leave blank to keep the existing secret unchanged.'
                        : 'A client secret has not been saved yet.'}
                    </p>
                    {isSecretInvalid && (
                      <p className="text-xs text-destructive">Client Secret is required.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="iqpro-gateway-id" className="text-sm font-medium text-foreground">Gateway ID</label>
                    <Input
                      id="iqpro-gateway-id"
                      placeholder="IQPro merchant gateway identifier"
                      value={gatewayId}
                      onChange={e => setGatewayId(e.target.value)}
                      onBlur={() => handleInputBlur('gatewayId')}
                      error={isGatewayIdInvalid}
                      maxLength={100}
                    />
                    {isGatewayIdInvalid && (
                      <p className="text-xs text-destructive">Gateway ID is required.</p>
                    )}
                  </div>
                </>
              )}

          {provider !== initialProvider && (
            <p className="text-xs text-muted-foreground">
              Switching providers is refused if this organization already has saved payment methods —
              {' '}
              provider ids do not transfer between processors.
            </p>
          )}

          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!isFormValid || isLoading}>
              {isLoading ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
