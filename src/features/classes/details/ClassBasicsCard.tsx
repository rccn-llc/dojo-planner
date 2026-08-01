'use client';

import type { ClassLevel, ClassStyle, ClassType } from '@/app/[locale]/(auth)/dashboard/classes/[classId]/page';
import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type ClassBasicsCardProps = {
  className: string;
  program: string;
  description: string;
  level: ClassLevel;
  type: ClassType;
  style: ClassStyle;
  onEdit?: () => void;
};

const PROGRAM_LABELS: Record<string, string> = {
  'adult-bjj': 'Adult Brazilian Jiu-Jitsu',
  'kids-bjj': 'Kids Brazilian Jiu-Jitsu',
  'womens-bjj': 'Women\'s Brazilian Jiu-Jitsu',
  'competition': 'Competition Team',
  'judo': 'Judo',
  'wrestling': 'Wrestling',
};

function getLevelVariant(level: ClassLevel): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (level) {
    case 'Beginner':
      return 'default';
    case 'Intermediate':
      return 'secondary';
    case 'Advanced':
      return 'destructive';
    case 'All Levels':
      return 'outline';
    default:
      return 'outline';
  }
}

export function ClassBasicsCard({
  className,
  program,
  description,
  level,
  type,
  style,
  onEdit,
}: ClassBasicsCardProps) {
  const t = useTranslations('ClassDetailPage.BasicsCard');

  const programLabel = PROGRAM_LABELS[program] || program;

  return (
    <Card className="flex flex-col p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>

      <div className="mt-6 flex-1 space-y-4">
        <div>
          <span className="text-sm font-medium text-muted-foreground">{t('name_label')}</span>
          <p className="mt-1 text-foreground">{className}</p>
        </div>

        <div>
          <span className="text-sm font-medium text-muted-foreground">{t('program_label')}</span>
          <p className="mt-1 text-foreground">{programLabel}</p>
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('level_label')}</span>
            <div className="mt-1">
              <Badge variant={getLevelVariant(level)}>{level}</Badge>
            </div>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('type_label')}</span>
            <div className="mt-1">
              <Badge variant="outline">{type}</Badge>
            </div>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('style_label')}</span>
            <div className="mt-1">
              <Badge variant="outline">{style}</Badge>
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
