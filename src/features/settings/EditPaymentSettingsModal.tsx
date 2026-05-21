'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export type EditPaymentSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  gatewayId: string;
  hasSecret: boolean;
  onSave: (data: {
    clientId: string;
    clientSecret?: string;
    gatewayId: string;
  }) => void | Promise<void>;
  errorMessage?: string | null;
  title?: string;
};

export function EditPaymentSettingsModal({
  isOpen,
  onClose,
  clientId: initialClientId,
  gatewayId: initialGatewayId,
  hasSecret,
  onSave,
  errorMessage,
  title = 'Edit IQPro Credentials',
}: EditPaymentSettingsModalProps) {
  const [clientId, setClientId] = useState(initialClientId);
  const [clientSecret, setClientSecret] = useState('');
  const [gatewayId, setGatewayId] = useState(initialGatewayId);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const isClientIdInvalid = touched.clientId && !clientId.trim();
  const isGatewayIdInvalid = touched.gatewayId && !gatewayId.trim();
  // A new secret is required only when nothing has ever been saved.
  const isSecretInvalid = touched.clientSecret && !hasSecret && !clientSecret.trim();

  const isFormValid = clientId.trim() !== ''
    && gatewayId.trim() !== ''
    && (hasSecret || clientSecret.trim() !== '');

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const trimmedSecret = clientSecret.trim();
      await onSave({
        clientId: clientId.trim(),
        gatewayId: gatewayId.trim(),
        ...(trimmedSecret && { clientSecret: trimmedSecret }),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setClientId(initialClientId);
    setGatewayId(initialGatewayId);
    setClientSecret('');
    setTouched({});
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      reset();
    } else {
      handleCancel();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
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
              placeholder={hasSecret ? '••••••••  Leave blank to keep current secret' : 'Enter client secret'}
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              onBlur={() => handleInputBlur('clientSecret')}
              error={isSecretInvalid}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {hasSecret
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
