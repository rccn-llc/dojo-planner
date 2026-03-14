'use client';

import type { AllowWalkIns } from '@/app/[locale]/(auth)/dashboard/classes/[classId]/page';
import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type ClassSettingsCardProps = {
  maximumCapacity: number | null;
  minimumAge: number | null;
  allowWalkIns: AllowWalkIns;
  onEdit?: () => void;
};

export function ClassSettingsCard({
  maximumCapacity,
  minimumAge,
  allowWalkIns,
  onEdit,
}: ClassSettingsCardProps) {
  const t = useTranslations('ClassDetailPage.SettingsCard');

  return (
    <Card className="flex flex-col p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>

      <div className="mt-6 flex-1 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('max_capacity_label')}</span>
            <p className="mt-1 text-foreground">
              {maximumCapacity !== null ? maximumCapacity : t('no_limit')}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('min_age_label')}</span>
            <p className="mt-1 text-foreground">
              {minimumAge !== null ? t('age_years', { age: minimumAge }) : t('no_minimum')}
            </p>
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-muted-foreground">{t('allow_walkins_label')}</span>
          <div className="mt-1">
            <Badge variant={allowWalkIns === 'Yes' ? 'default' : 'secondary'}>
              {allowWalkIns === 'Yes' ? t('walkins_yes') : t('walkins_no')}
            </Badge>
          </div>
        </div>
      </div>

      {onEdit && (
        <div className="mt-6 flex justify-end">
          <Button variant="outline" size="icon" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}
