'use client';

import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type WaiverStatus = 'Active' | 'Inactive' | 'Draft';

export type WaiverCardProps = {
  id: string;
  name: string;
  description: string | null;
  status: WaiverStatus;
  version: number;
  isDefault: boolean;
  requiresGuardian: boolean;
  guardianAgeThreshold: number;
  signedCount: number;
  membershipCount: number;
  lastUpdated: string;
  onEdit?: (id: string) => void;
};

function StatusBadge({ status }: { status: WaiverStatus }) {
  const t = useTranslations('WaiverCard');

  if (status === 'Active') {
    return (
      <Badge className="bg-green-500 text-white hover:bg-green-600">
        {t('status_active')}
      </Badge>
    );
  }
  if (status === 'Inactive') {
    return (
      <Badge className="bg-red-500 text-white hover:bg-red-600">
        {t('status_inactive')}
      </Badge>
    );
  }
  return (
    <Badge className="bg-gray-500 text-white hover:bg-gray-600">
      {t('status_draft')}
    </Badge>
  );
}

function DefaultBadge() {
  const t = useTranslations('WaiverCard');

  return (
    <Badge className="bg-blue-500 text-white hover:bg-blue-600">
      {t('default_badge')}
    </Badge>
  );
}

function GuardianRequiredBadge({ ageThreshold }: { ageThreshold: number }) {
  const t = useTranslations('WaiverCard');

  return (
    <Badge className="bg-amber-500 text-gray-900 hover:bg-amber-600">
      {t('guardian_required_badge', { age: ageThreshold })}
    </Badge>
  );
}

export function WaiverCard({
  id,
  name,
  description,
  status,
  version,
  isDefault,
  requiresGuardian,
  guardianAgeThreshold,
  signedCount,
  membershipCount,
  lastUpdated,
  onEdit,
}: WaiverCardProps) {
  const t = useTranslations('WaiverCard');

  return (
    <Card className="relative p-6">
      <div className="space-y-4">
        {/* Header with Title and Badges */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-foreground">{name}</h3>
            {description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusBadge status={status} />
            {isDefault && <DefaultBadge />}
          </div>
        </div>

        {/* Guardian Requirement Badge */}
        {requiresGuardian && (
          <div>
            <GuardianRequiredBadge ageThreshold={guardianAgeThreshold} />
          </div>
        )}

        {/* Details Grid */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">
              {t('version_label')}
            </span>
            <span className="text-sm font-medium text-foreground">
              v
              {version}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">
              {t('last_updated_label')}
            </span>
            <span className="text-sm font-medium text-foreground">
              {lastUpdated}
            </span>
          </div>
        </div>

        {/* Stats Section */}
        <div className="flex gap-6 rounded-lg bg-muted/50 p-3">
          <div>
            <p className="text-sm font-medium text-foreground">{signedCount}</p>
            <p className="text-xs text-muted-foreground">{t('signed_count_label')}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{membershipCount}</p>
            <p className="text-xs text-muted-foreground">{t('membership_count_label')}</p>
          </div>
        </div>

        {/* Footer with Edit Button */}
        <div className="flex items-center justify-end border-t border-border pt-4">
          {onEdit && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => onEdit(id)}
              aria-label={t('edit_button_aria_label')}
              title={t('edit_button_aria_label')}
            >
              <Edit className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
