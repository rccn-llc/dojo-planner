'use client';

import type { AddClassWizardData } from '@/hooks/useAddClassWizard';
import type { Tag } from '@/hooks/useTagsCache';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Colors that are already used in the calendar (from classesData)
const USED_CALENDAR_COLORS = ['#22c55e', '#a855f7', '#06b6d4', '#ec4899', '#ef4444', '#6b7280'];

// Available colors for new classes (excluding used ones)
const BASE_AVAILABLE_COLORS = [
  { value: '#000000', label: 'Black' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#f43f5e', label: 'Rose' },
  { value: '#84cc16', label: 'Lime' },
].filter(color => !USED_CALENDAR_COLORS.includes(color.value));

type ClassTagsStepProps = {
  data: AddClassWizardData;
  onUpdate: (updates: Partial<AddClassWizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
  classTags: Tag[];
};

export const ClassTagsStep = ({
  data,
  onUpdate,
  onNext,
  onBack,
  onCancel,
  isLoading,
  error,
  classTags,
}: ClassTagsStepProps) => {
  const t = useTranslations('AddClassWizard.ClassTagsStep');

  // Build available colors from base colors + tag colors
  const allAvailableColors = useMemo(() => {
    const tagColors = classTags.map(tag => tag.color).filter((c): c is string => c !== null);
    return [
      ...BASE_AVAILABLE_COLORS,
      ...tagColors
        .filter(c => !BASE_AVAILABLE_COLORS.some(ac => ac.value === c) && !USED_CALENDAR_COLORS.includes(c))
        .map(c => ({ value: c, label: c })),
    ];
  }, [classTags]);

  const handleTagToggle = (tagId: string) => {
    const currentTags = data.tags;
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter(t => t !== tagId)
      : [...currentTags, tagId];
    onUpdate({ tags: newTags });
  };

  const handleRemoveTag = (tagId: string) => {
    onUpdate({ tags: data.tags.filter(t => t !== tagId) });
  };

  const selectedTagObjects = classTags.filter(tag => data.tags.includes(tag.id));
  const availableTags = classTags.filter(tag => !data.tags.includes(tag.id));

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

        {/* Selected Tags */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">{t('selected_tags_label')}</label>
          <div className="max-h-40 min-h-12 overflow-y-auto rounded-lg border border-border bg-background p-3">
            {selectedTagObjects.length === 0
              ? (
                  <p className="text-sm text-muted-foreground">{t('no_tags_selected')}</p>
                )
              : (
                  <div className="flex flex-wrap gap-2">
                    {selectedTagObjects.map(tag => (
                      <div
                        key={tag.id}
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-white"
                        style={{ backgroundColor: tag.color || '#6b7280' }}
                      >
                        {tag.name}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag.id)}
                          className="ml-1 rounded-full p-0.5 hover:bg-white/20"
                          aria-label={t('remove_tag_aria', { tag: tag.name })}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
          </div>
        </div>

        {/* Available Tags */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">{t('available_tags_label')}</label>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border bg-background p-4">
            {availableTags.length === 0
              ? (
                  <p className="text-sm text-muted-foreground">{t('all_tags_selected')}</p>
                )
              : (
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map(tag => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => handleTagToggle(tag.id)}
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
                      >
                        <div
                          className="size-3 rounded-full"
                          style={{ backgroundColor: tag.color || '#6b7280' }}
                        />
                        {tag.name}
                        <span className="text-xs text-muted-foreground">
                          (
                          {tag.usageCount}
                          )
                        </span>
                      </button>
                    ))}
                  </div>
                )}
          </div>
          <p className="text-xs text-muted-foreground">{t('tags_help')}</p>
        </div>

        {/* Calendar Color */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{t('calendar_color_label')}</label>
          <div className="flex items-center gap-3">
            <div
              className="size-10 rounded border border-border"
              style={{ backgroundColor: data.calendarColor }}
            />
            <Input
              type="text"
              value={data.calendarColor}
              onChange={e => onUpdate({ calendarColor: e.target.value })}
              placeholder="#000000"
              className="w-32"
            />
            <Select
              value={data.calendarColor}
              onValueChange={value => onUpdate({ calendarColor: value })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('calendar_color_select')} />
              </SelectTrigger>
              <SelectContent>
                {allAvailableColors.map(color => (
                  <SelectItem key={color.value} value={color.value}>
                    <div className="flex items-center gap-2">
                      <div
                        className="size-4 rounded"
                        style={{ backgroundColor: color.value }}
                      />
                      {color.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{t('calendar_color_help')}</p>
        </div>
      </div>

      <div className="flex justify-between gap-3 pt-6">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} disabled={isLoading}>
            {t('back_button')}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            {t('cancel_button')}
          </Button>
        </div>
        <Button onClick={onNext} disabled={isLoading}>
          {isLoading ? t('creating_button') : t('finish_button')}
        </Button>
      </div>
    </div>
  );
};
