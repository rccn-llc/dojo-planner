'use client';

import type { IQProConfigFormData, IQProConfigInitialData } from '@/features/payment-settings/PaymentSettingsForm';
import { useCallback, useEffect, useState } from 'react';
import { PaymentSettingsForm } from '@/features/payment-settings/PaymentSettingsForm';
import { client } from '@/libs/Orpc';

export function PlatformSettingsPage() {
  const [initial, setInitial] = useState<IQProConfigInitialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await client.platformSettings.getConfig();
      setInitial(data as IQProConfigInitialData);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load platform settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (data: IQProConfigFormData) => {
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await client.platformSettings.updateConfig(data);
      setSuccessMessage('Platform settings saved.');
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save platform settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Platform Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Super-admin only. Configure the IQPro merchant gateway used to bill customer organizations for the dojo-planner SaaS subscription.
        </p>
      </div>

      <PaymentSettingsForm
        key={`${initial?.clientId ?? ''}|${initial?.gatewayId ?? ''}|${initial?.hasSecret ?? false}`}
        title="Platform IQPro Merchant Credentials"
        description="These values are stored encrypted at rest in the platform_config table. Falls back to IQPRO_* env vars when no value is set."
        initial={initial}
        loading={loading}
        saving={saving}
        errorMessage={errorMessage}
        successMessage={successMessage}
        onSave={handleSave}
      />
    </div>
  );
}
