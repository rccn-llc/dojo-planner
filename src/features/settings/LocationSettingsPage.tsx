'use client';

import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganizationLocation } from '@/hooks/useOrganizationLocation';
import { client } from '@/libs/Orpc';
import { EditLocationModal } from './EditLocationModal';

type LocationFormData = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

export function LocationSettingsPage() {
  const t = useTranslations('LocationSettings');
  const { location, loading, error, refetch } = useOrganizationLocation();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

      <EditLocationModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSaveError(null);
        }}
        name={location.name ?? ''}
        address={location.address ?? ''}
        phone={location.phone ?? ''}
        email={location.email ?? ''}
        onSave={handleSaveLocation}
        errorMessage={saveError}
      />
    </div>
  );
}
