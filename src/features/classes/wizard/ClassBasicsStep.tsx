'use client';

import type { AddClassWizardData } from '@/hooks/useAddClassWizard';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { client } from '@/libs/Orpc';

type ClassBasicsStepProps = {
  data: AddClassWizardData;
  onUpdate: (updates: Partial<AddClassWizardData>) => void;
  onNext: () => void;
  onCancel: () => void;
  error?: string | null;
};

type ProgramOption = {
  id: string;
  name: string;
};

const MAX_DESCRIPTION_LENGTH = 2000;

export const ClassBasicsStep = ({ data, onUpdate, onNext, onCancel, error }: ClassBasicsStepProps) => {
  const t = useTranslations('AddClassWizard.ClassBasicsStep');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        setProgramsLoading(true);
        const result = await client.programs.list();
        const options: ProgramOption[] = (result.programs || [])
          .filter(program => program.isActive)
          .map(program => ({ id: program.id, name: program.name }));
        setProgramOptions(options);
      } catch {
        setProgramOptions([]);
      } finally {
        setProgramsLoading(false);
      }
    };

    fetchPrograms();
  }, []);

  const handleInputChange = (field: keyof AddClassWizardData, value: string | number | null) => {
    onUpdate({ [field]: value });
  };

  const handleProgramChange = (programId: string) => {
    const selectedProgram = programOptions.find(p => p.id === programId);
    onUpdate({
      program: programId,
      programName: selectedProgram?.name ?? '',
    });
  };

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const isFormValid
    = data.className.trim() !== ''
      && data.program !== ''
      && data.description.trim() !== '';

  // Validation helpers for touched fields
  const isClassNameInvalid = touched.className && !data.className.trim();
  const isProgramInvalid = touched.program && !data.program;
  const isDescriptionInvalid = touched.description && !data.description.trim();

  const characterCount = data.description.length;

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

        {/* Class Name and Program */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('class_name_label')}</label>
            <Input
              placeholder={t('class_name_placeholder')}
              value={data.className}
              onChange={e => handleInputChange('className', e.target.value)}
              onBlur={() => handleInputBlur('className')}
              error={isClassNameInvalid}
            />
            {isClassNameInvalid && (
              <p className="text-xs text-destructive">{t('class_name_error')}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('program_label')}</label>
            <Select
              value={data.program}
              onValueChange={handleProgramChange}
              disabled={programsLoading}
            >
              <SelectTrigger
                aria-invalid={isProgramInvalid}
                onBlur={() => handleInputBlur('program')}
                className="w-full truncate"
              >
                <SelectValue placeholder={programsLoading ? t('program_loading') : t('program_placeholder')} className="truncate" />
              </SelectTrigger>
              <SelectContent>
                {programOptions.map(program => (
                  <SelectItem key={program.id} value={program.id}>
                    {program.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isProgramInvalid && (
              <p className="text-xs text-destructive">{t('program_error')}</p>
            )}
          </div>
        </div>

        {/* Maximum Capacity, Minimum Age, Allow Walk-ins */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('max_capacity_label')}</label>
            <Input
              type="number"
              placeholder={t('max_capacity_placeholder')}
              value={data.maximumCapacity ?? ''}
              onChange={e => handleInputChange('maximumCapacity', e.target.value ? Number.parseInt(e.target.value, 10) : null)}
              min={1}
            />
            <p className="text-xs text-muted-foreground">{t('max_capacity_help')}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('min_age_label')}</label>
            <Input
              type="number"
              placeholder={t('min_age_placeholder')}
              value={data.minimumAge ?? ''}
              onChange={e => handleInputChange('minimumAge', e.target.value ? Number.parseInt(e.target.value, 10) : null)}
              min={0}
            />
            <p className="text-xs text-muted-foreground">{t('min_age_help')}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('allow_walkins_label')}</label>
            <Select
              value={data.allowWalkIns}
              onValueChange={value => handleInputChange('allowWalkIns', value as 'Yes' | 'No')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Yes">{t('allow_walkins_yes')}</SelectItem>
                <SelectItem value="No">{t('allow_walkins_no')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{t('description_label')}</label>
          <Textarea
            placeholder={t('description_placeholder')}
            value={data.description}
            onChange={e => handleInputChange('description', e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
            onBlur={() => handleInputBlur('description')}
            error={isDescriptionInvalid}
            rows={5}
          />
          <div className="flex justify-between">
            {isDescriptionInvalid
              ? (
                  <p className="text-xs text-destructive">{t('description_error')}</p>
                )
              : (
                  <span />
                )}
            <p className="text-xs text-muted-foreground">
              {t('description_character_count', { count: characterCount, max: MAX_DESCRIPTION_LENGTH })}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-between gap-3 pt-6">
        <Button variant="outline" onClick={onCancel}>
          {t('cancel_button')}
        </Button>
        <Button onClick={onNext} disabled={!isFormValid}>
          {t('next_button')}
        </Button>
      </div>
    </div>
  );
};
