'use client';

import type { ClassLevel, ClassStyle, ClassType } from '@/app/[locale]/(auth)/dashboard/classes/[classId]/page';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

const MAX_DESCRIPTION_LENGTH = 2000;

const LEVELS: ClassLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'All Levels'];
const TYPES: ClassType[] = ['Adults', 'Kids', 'Women', 'Open', 'Competition'];
const STYLES: ClassStyle[] = ['Gi', 'No Gi'];

type EditClassBasicsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  program: string;
  description: string;
  level: ClassLevel;
  type: ClassType;
  style: ClassStyle;
  onSave: (data: {
    className: string;
    program: string;
    description: string;
    level: ClassLevel;
    type: ClassType;
    style: ClassStyle;
  }) => void | Promise<void>;
};

export function EditClassBasicsModal({
  isOpen,
  onClose,
  className: initialClassName,
  program: initialProgram,
  description: initialDescription,
  level: initialLevel,
  type: initialType,
  style: initialStyle,
  onSave,
}: EditClassBasicsModalProps) {
  const t = useTranslations('ClassDetailPage.EditBasicsModal');

  const [className, setClassName] = useState(initialClassName);
  const [program, setProgram] = useState(initialProgram);
  const [description, setDescription] = useState(initialDescription);
  const [level, setLevel] = useState<ClassLevel>(initialLevel);
  const [type, setType] = useState<ClassType>(initialType);
  const [style, setStyle] = useState<ClassStyle>(initialStyle);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [programOptions, setProgramOptions] = useState<string[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const fetchPrograms = async () => {
      try {
        setProgramsLoading(true);
        const result = await client.programs.list();
        const names = (result.programs || [])
          .filter(program => program.isActive)
          .map(program => program.name);
        setProgramOptions(names);
      } catch {
        setProgramOptions([]);
      } finally {
        setProgramsLoading(false);
      }
    };

    fetchPrograms();
  }, [isOpen]);

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const isNameInvalid = touched.className && !className.trim();
  const isProgramInvalid = touched.program && !program;
  const isDescriptionInvalid = touched.description && !description.trim();

  const isFormValid = className.trim() !== '' && program !== '' && description.trim() !== '';

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      await onSave({
        className,
        program,
        description,
        level,
        type,
        style,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setClassName(initialClassName);
    setProgram(initialProgram);
    setDescription(initialDescription);
    setLevel(initialLevel);
    setType(initialType);
    setStyle(initialStyle);
    setTouched({});
    onClose();
  };

  // Reset state when modal opens with new data
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setClassName(initialClassName);
      setProgram(initialProgram);
      setDescription(initialDescription);
      setLevel(initialLevel);
      setType(initialType);
      setStyle(initialStyle);
      setTouched({});
    } else {
      handleCancel();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Class Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('name_label')}</label>
            <Input
              placeholder={t('name_placeholder')}
              value={className}
              onChange={e => setClassName(e.target.value)}
              onBlur={() => handleInputBlur('className')}
              error={isNameInvalid}
            />
            {isNameInvalid && (
              <p className="text-xs text-destructive">{t('name_error')}</p>
            )}
          </div>

          {/* Program */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('program_label')}</label>
            <Select
              value={program}
              onValueChange={setProgram}
              disabled={programsLoading}
            >
              <SelectTrigger
                aria-invalid={isProgramInvalid}
                onBlur={() => handleInputBlur('program')}
              >
                <SelectValue placeholder={programsLoading ? t('program_loading') : t('program_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {(program && !programOptions.includes(program) ? [program, ...programOptions] : programOptions).map(name => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isProgramInvalid && (
              <p className="text-xs text-destructive">{t('program_error')}</p>
            )}
          </div>

          {/* Level, Type, Style */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('level_label')}</label>
              <Select value={level} onValueChange={value => setLevel(value as ClassLevel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map(l => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('type_label')}</label>
              <Select value={type} onValueChange={value => setType(value as ClassType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('style_label')}</label>
              <Select value={style} onValueChange={value => setStyle(value as ClassStyle)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('description_label')}</label>
            <Textarea
              placeholder={t('description_placeholder')}
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
              onBlur={() => handleInputBlur('description')}
              error={isDescriptionInvalid}
              rows={4}
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
                {t('description_character_count', { count: description.length, max: MAX_DESCRIPTION_LENGTH })}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              {t('cancel_button')}
            </Button>
            <Button onClick={handleSubmit} disabled={!isFormValid || isLoading}>
              {isLoading ? t('saving_button') : t('save_button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
