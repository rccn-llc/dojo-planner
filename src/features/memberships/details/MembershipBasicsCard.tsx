'use client';

import type { MembershipStatus, MembershipType } from '@/hooks/useAddMembershipWizard';
import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type MembershipBasicsCardProps = {
  membershipName: string;
  status: MembershipStatus;
  membershipType: MembershipType;
  description: string;
  onEdit?: () => void;
};

export function MembershipBasicsCard({
  membershipName,
  status,
  membershipType,
  description,
  onEdit,
}: MembershipBasicsCardProps) {
  const t = useTranslations('MembershipDetailPage.BasicsCard');

  const statusLabel = status === 'active' ? t('status_active') : t('status_inactive');
  const statusVariant = status === 'active' ? 'default' : 'secondary';

  const typeLabel = membershipType === 'trial' ? t('type_trial') : t('type_standard');

  return (
    <Card className="flex flex-col p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>

      <div className="mt-6 flex-1 space-y-4">
        <div>
          <span className="text-sm font-medium text-muted-foreground">{t('name_label')}</span>
          <p className="mt-1 text-foreground">{membershipName}</p>
        </div>

        <div className="flex gap-6">
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('status_label')}</span>
            <div className="mt-1">
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('type_label')}</span>
            <div className="mt-1">
              <Badge variant="outline">{typeLabel}</Badge>
            </div>
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-muted-foreground">{t('description_label')}</span>
          <p className="mt-1 text-sm text-foreground">{description}</p>
        </div>
      </div>

      {onEdit && (
        <div className="mt-6 flex justify-end">
          <Button variant="outline" size="icon" onClick={onEdit}>
            <Edit className="size-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}
