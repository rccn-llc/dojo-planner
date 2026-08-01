'use client';

import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type MembershipAssociatedProgramCardProps = {
  associatedProgramId: string | null;
  associatedProgramName: string | null;
  associatedWaiverId: string | null;
  associatedWaiverName: string | null;
  onEdit?: () => void;
};

export function MembershipAssociatedProgramCard({
  associatedProgramId,
  associatedProgramName,
  associatedWaiverId,
  associatedWaiverName,
  onEdit,
}: MembershipAssociatedProgramCardProps) {
  const t = useTranslations('MembershipDetailPage.AssociatedProgramCard');

  return (
    <Card className="flex flex-col p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>

      <div className="mt-6 flex-1 space-y-4">
        <div>
          <span className="text-sm font-medium text-muted-foreground">{t('program_label')}</span>
          <p className="mt-1 text-foreground">
            {associatedProgramId && associatedProgramName
              ? associatedProgramName
              : t('no_program')}
          </p>
        </div>
        <div>
          <span className="text-sm font-medium text-muted-foreground">{t('waiver_label')}</span>
          <p className="mt-1 text-foreground">
            {associatedWaiverId && associatedWaiverName
              ? associatedWaiverName
              : t('no_waiver')}
          </p>
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
