'use client';

import type { AddClassWizardData, ItemType } from '@/hooks/useAddClassWizard';
import { BookOpen, Calendar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/Helpers';

type TypeSelectionStepProps = {
  data: AddClassWizardData;
  onUpdate: (updates: Partial<AddClassWizardData>) => void;
  onNext: () => void;
  onCancel: () => void;
  error?: string | null;
};

export const TypeSelectionStep = ({ data, onUpdate, onNext, onCancel, error }: TypeSelectionStepProps) => {
  const t = useTranslations('AddClassWizard.TypeSelectionStep');

  const handleTypeSelect = (type: ItemType) => {
    onUpdate({ itemType: type });
  };

  const handleNext = () => {
    if (data.itemType) {
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Class Option */}
          <Card
            className={cn(
              'cursor-pointer transition-all hover:border-primary/50',
              data.itemType === 'class' && 'border-2 border-primary bg-primary/5',
            )}
            onClick={() => handleTypeSelect('class')}
            data-testid="type-selection-class"
          >
            <CardContent className="flex flex-col items-center p-6 text-center">
              <div className={cn(
                'mb-4 rounded-full p-4',
                data.itemType === 'class' ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
              >
                <BookOpen className="size-8" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{t('class_option')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('class_description')}
              </p>
            </CardContent>
          </Card>

          {/* Event Option */}
          <Card
            className={cn(
              'cursor-pointer transition-all hover:border-primary/50',
              data.itemType === 'event' && 'border-2 border-primary bg-primary/5',
            )}
            onClick={() => handleTypeSelect('event')}
            data-testid="type-selection-event"
          >
            <CardContent className="flex flex-col items-center p-6 text-center">
              <div className={cn(
                'mb-4 rounded-full p-4',
                data.itemType === 'event' ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
              >
                <Calendar className="size-8" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{t('event_option')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('event_description')}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-between gap-3 pt-6">
        <Button variant="outline" onClick={onCancel}>
          {t('cancel_button')}
        </Button>
        <Button onClick={handleNext} disabled={!data.itemType}>
          {t('next_button')}
        </Button>
      </div>
    </div>
  );
};
