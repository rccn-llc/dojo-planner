'use client';

import { Edit, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type ProgramStatus = 'Active' | 'Inactive';

export type ProgramCardProps = {
  id: string;
  name: string;
  description: string;
  classCount: number;
  classNames: string;
  status: ProgramStatus;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
};

function StatusBadge({ status }: { status: ProgramStatus }) {
  const t = useTranslations('ProgramCard');

  if (status === 'Active') {
    return (
      <Badge className="bg-green-500 text-white hover:bg-green-600">
        {t('status_active')}
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500 text-white hover:bg-red-600">
      {t('status_inactive')}
    </Badge>
  );
}

export function ProgramCard({
  id,
  name,
  description,
  classCount,
  classNames,
  status,
  onEdit,
  onDelete,
}: ProgramCardProps) {
  const t = useTranslations('ProgramCard');

  return (
    <Card className="relative p-6">
      <div className="space-y-4">
        {/* Header with Title and Status Badge */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="shrink-0">
            <StatusBadge status={status} />
          </div>
        </div>

        {/* Classes Info */}
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">{classCount}</span>
            <span className="text-sm text-muted-foreground">{t('classes_label')}</span>
          </div>
          <p className="text-sm text-muted-foreground">{classNames}</p>
        </div>

        {/* Footer with Actions */}
        <div className="flex items-end justify-end gap-2 border-t border-border pt-4">
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(id)}
              aria-label={t('edit_button_aria_label')}
              title={t('edit_button_aria_label')}
            >
              <Edit className="size-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(id)}
              aria-label={t('delete_button_aria_label')}
              title={t('delete_button_aria_label')}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
