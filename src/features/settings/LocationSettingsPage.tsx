'use client';

import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganizationLocation } from '@/hooks/useOrganizationLocation';
import { client } from '@/libs/Orpc';
import { ORG_ROLE } from '@/types/Auth';
import { EditLocationModal } from './EditLocationModal';
import { EditPaymentSettingsModal } from './EditPaymentSettingsModal';

// Roles that can VIEW the IQPro payment-gateway card. Admin is included
// because it sits above academy_owner in the role hierarchy.
const PAYMENT_VIEW_ROLES = new Set<string>([ORG_ROLE.ADMIN, ORG_ROLE.ACADEMY_OWNER]);
// Roles that can EDIT (open the modal + save). Stricter than view.
const PAYMENT_EDIT_ROLES = new Set<string>([ORG_ROLE.ADMIN]);

type LocationFormData = {
  address: string;
  phone: string;
  email: string;
  taxRate: number;
};

type PaymentConfigState = {
  clientId: string | null;
  gatewayId: string | null;
  hasSecret: boolean;
  source: 'org' | 'env' | 'mixed' | 'platform';
};

export type LocationSettingsPageProps = {
  /**
   * The current user's Clerk org role (e.g. `org:admin`, `org:academy_owner`).
   * Drives client-side gating of the IQPro card. Server-side `guardRole` on
   * the ORPC endpoints is the authoritative check — this only hides the UI.
   */
  userRole?: string;
};

export function LocationSettingsPage({ userRole }: LocationSettingsPageProps = {}) {
  const t = useTranslations('LocationSettings');
  const { location, loading, error, refetch } = useOrganizationLocation();
  const canViewPayment = !!userRole && PAYMENT_VIEW_ROLES.has(userRole);
  const canEditPayment = !!userRole && PAYMENT_EDIT_ROLES.has(userRole);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigState | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentSaveError, setPaymentSaveError] = useState<string | null>(null);

  const loadPaymentConfig = useCallback(async () => {
    if (!canViewPayment) {
      return;
    }
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const data = await client.paymentSettings.getConfig();
      setPaymentConfig(data as PaymentConfigState);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Failed to load payment settings');
    } finally {
      setPaymentLoading(false);
    }
  }, [canViewPayment]);

  useEffect(() => {
    loadPaymentConfig();
  }, [loadPaymentConfig]);

  const handleSaveLocation = async (data: LocationFormData) => {
    setSaveError(null);
    try {
      await client.organization.updateLocation(data);
      await refetch();
      setIsEditModalOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save location');
    }
  };

  const handleSavePaymentConfig = async (data: {
    clientId: string;
    clientSecret?: string;
    gatewayId: string;
  }) => {
    setPaymentSaveError(null);
    try {
      await client.paymentSettings.updateConfig(data);
      await loadPaymentConfig();
      setIsPaymentModalOpen(false);
    } catch (err) {
      setPaymentSaveError(err instanceof Error ? err.message : 'Failed to save payment settings');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
      </div>

      <Card className="relative p-6">
        <h3 className="text-lg font-semibold text-foreground">{t('location_title')}</h3>
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">{t('address_label')}</label>
            {loading
              ? <Skeleton className="mt-1 h-5 w-64" />
              : <p className="mt-1 text-foreground">{location.address || '-'}</p>}
          </div>
          <div>
            <label className="text-sm text-muted-foreground">{t('phone_label')}</label>
            {loading
              ? <Skeleton className="mt-1 h-5 w-40" />
              : <p className="mt-1 text-foreground">{location.phone || '-'}</p>}
          </div>
          <div>
            <label className="text-sm text-muted-foreground">{t('email_label')}</label>
            {loading
              ? <Skeleton className="mt-1 h-5 w-56" />
              : <p className="mt-1 text-foreground">{location.email || '-'}</p>}
          </div>
          <div>
            <label className="text-sm text-muted-foreground">{t('tax_rate_label')}</label>
            {loading
              ? <Skeleton className="mt-1 h-5 w-20" />
              : <p className="mt-1 text-foreground">{`${(location.taxRate ?? 0).toFixed(2)}%`}</p>}
          </div>
          <div>
            <label className="text-sm text-muted-foreground">{t('status_label')}</label>
            <p className="mt-1">
              <Badge>{t('active_status')}</Badge>
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditModalOpen(true)}
            aria-label="Edit location information"
            title="Edit location information"
            disabled={loading}
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {canViewPayment && (
        <Card className="relative p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">IQPro Payment Gateway</h3>
            {paymentConfig && (
              <Badge variant={paymentConfig.source === 'env' ? 'secondary' : 'default'}>
                {paymentConfig.source === 'env' ? 'Using env fallback' : `Source: ${paymentConfig.source}`}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Merchant credentials used to process member payments. Stored encrypted at rest.
          </p>
          {paymentError && (
            <p className="mt-2 text-sm text-destructive">{paymentError}</p>
          )}
          <div className="mt-4 space-y-4">
            <div>
              <span className="text-sm text-muted-foreground">Client ID</span>
              {paymentLoading
                ? <Skeleton className="mt-1 h-5 w-64" />
                : <p className="mt-1 text-foreground">{paymentConfig?.clientId || '-'}</p>}
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Client Secret</span>
              {paymentLoading
                ? <Skeleton className="mt-1 h-5 w-40" />
                : (
                    <p className="mt-1">
                      {paymentConfig?.hasSecret
                        ? <Badge>Configured</Badge>
                        : <span className="text-muted-foreground">Not set</span>}
                    </p>
                  )}
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Gateway ID</span>
              {paymentLoading
                ? <Skeleton className="mt-1 h-5 w-56" />
                : <p className="mt-1 text-foreground">{paymentConfig?.gatewayId || '-'}</p>}
            </div>
          </div>

          {canEditPayment && (
            <div className="mt-6 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPaymentModalOpen(true)}
                aria-label="Edit IQPro credentials"
                title="Edit IQPro credentials"
                disabled={paymentLoading}
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>
      )}

      <EditLocationModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSaveError(null);
        }}
        address={location.address ?? ''}
        phone={location.phone ?? ''}
        email={location.email ?? ''}
        taxRate={location.taxRate ?? 0}
        onSave={handleSaveLocation}
        errorMessage={saveError}
      />

      {canEditPayment && (
        <EditPaymentSettingsModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setPaymentSaveError(null);
          }}
          clientId={paymentConfig?.clientId ?? ''}
          gatewayId={paymentConfig?.gatewayId ?? ''}
          hasSecret={paymentConfig?.hasSecret ?? false}
          onSave={handleSavePaymentConfig}
          errorMessage={paymentSaveError}
        />
      )}
    </div>
  );
}
