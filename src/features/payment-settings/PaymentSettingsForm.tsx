'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type IQProConfigFormData = {
  clientId: string;
  clientSecret?: string;
  gatewayId: string;
};

export type IQProConfigInitialData = {
  clientId: string | null;
  gatewayId: string | null;
  hasSecret: boolean;
  source: 'org' | 'env' | 'mixed' | 'platform';
};

type Props = {
  title: string;
  description: string;
  initial: IQProConfigInitialData | null;
  loading: boolean;
  saving: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  onSave: (data: IQProConfigFormData) => Promise<void> | void;
};

export function PaymentSettingsForm({
  title,
  description,
  initial,
  loading,
  saving,
  errorMessage,
  successMessage,
  onSave,
}: Props) {
  // State is seeded from `initial` once. Parents that want the form to reflect
  // a freshly-loaded value (e.g. after refetch) should re-mount via `key`.
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [gatewayId, setGatewayId] = useState(initial?.gatewayId ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSecret = clientSecret.trim();
    await onSave({
      clientId: clientId.trim(),
      gatewayId: gatewayId.trim(),
      ...(trimmedSecret && { clientSecret: trimmedSecret }),
    });
    setClientSecret('');
  };

  const submitDisabled = saving || loading || !clientId.trim() || !gatewayId.trim();

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      {initial && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Currently loaded from:</span>
          <Badge variant={initial.source === 'env' ? 'secondary' : 'default'}>
            {initial.source}
          </Badge>
        </div>
      )}

      {errorMessage && (
        <Alert variant="error" className="mt-4">
          {errorMessage}
        </Alert>
      )}
      {successMessage && (
        <Alert variant="success" className="mt-4">{successMessage}</Alert>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="iqpro-client-id">Client ID</Label>
          <Input
            id="iqpro-client-id"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            disabled={loading || saving}
            placeholder="e.g. abc123-..."
            required
            maxLength={200}
          />
        </div>

        <div>
          <Label htmlFor="iqpro-client-secret">
            Client Secret
            {initial?.hasSecret && (
              <Badge variant="outline" className="ml-2 text-xs">
                Secret configured
              </Badge>
            )}
          </Label>
          <Input
            id="iqpro-client-secret"
            type="password"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            disabled={loading || saving}
            placeholder={initial?.hasSecret ? '••••••••  Leave blank to keep current secret' : 'Enter client secret'}
            maxLength={500}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Leave blank to keep the existing secret unchanged.
          </p>
        </div>

        <div>
          <Label htmlFor="iqpro-gateway-id">Gateway ID</Label>
          <Input
            id="iqpro-gateway-id"
            value={gatewayId}
            onChange={e => setGatewayId(e.target.value)}
            disabled={loading || saving}
            placeholder="IQPro merchant gateway identifier"
            required
            maxLength={100}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={submitDisabled}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
