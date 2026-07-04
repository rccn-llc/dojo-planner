'use client';

import type { AddClassWizardData } from '@/hooks/useAddClassWizard';
import type { Tag } from '@/hooks/useTagsCache';
import { useOrganization } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useInstructorsCache } from '@/hooks/useInstructorsCache';

type ClassSuccessStepProps = {
  data: AddClassWizardData;
  onDone: () => void;
  classTags: Tag[];
};

export const ClassSuccessStep = ({ data, onDone, classTags }: ClassSuccessStepProps) => {
  const t = useTranslations('AddClassWizard.ClassSuccessStep');
  const { organization } = useOrganization();
  const { instructorLookup } = useInstructorsCache(organization?.id);

  const selectedTags = classTags.filter(tag => data.tags.includes(tag.id));
  const programName = data.programName || data.program;

  // Get unique instructors from all schedule instances
  const getUniqueInstructors = () => {
    const staffIds = [...new Set(data.schedule.instances.flatMap(i => [i.staffMember, i.assistantStaff].filter(Boolean)))];
    return staffIds.map(id => instructorLookup.get(id)?.name || id).filter(Boolean);
  };

  const formatScheduleSummary = () => {
    const instances = data.schedule.instances;
    if (instances.length === 0) {
      return 'No schedule set';
    }
    const days = [...new Set(instances.map(i => i.dayOfWeek))];
    return `${days.join(', ')} (${instances.length} time slot${instances.length > 1 ? 's' : ''})`;
  };

  const formatDurationRange = () => {
    const instances = data.schedule.instances;
    if (instances.length === 0) {
      return 'N/A';
    }
    const durations = instances.map((i) => {
      const hours = i.durationHours;
      const minutes = i.durationMinutes;
      if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
      }
      if (hours > 0) {
        return `${hours}h`;
      }
      return `${minutes}m`;
    });
    const uniqueDurations = [...new Set(durations)];
    return uniqueDurations.join(', ');
  };

  const instructors = getUniqueInstructors();

  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="rounded-full bg-green-100 p-4 dark:bg-green-950">
          <svg className="h-12 w-12 text-green-600 dark:text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {t('description', { name: data.className })}
        </p>
      </div>

      {/* Class Summary */}
      <div className="rounded-lg border border-border bg-secondary/30 p-4 text-left">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{t('summary_title')}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('summary_class_name')}</span>
            <span className="font-medium text-foreground">{data.className}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('summary_program')}</span>
            <span className="font-medium text-foreground">{programName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('summary_schedule')}</span>
            <span className="font-medium text-foreground">
              {formatScheduleSummary()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('summary_duration')}</span>
            <span className="font-medium text-foreground">{formatDurationRange()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('summary_instructor')}</span>
            <span className="font-medium text-foreground">
              {instructors.length > 0 ? instructors.join(', ') : 'Not assigned'}
            </span>
          </div>
          {selectedTags.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('summary_tags')}</span>
              <div className="flex flex-wrap gap-1">
                {selectedTags.map(tag => (
                  <span
                    key={tag.id}
                    className="rounded-full px-2 py-0.5 text-xs text-white"
                    style={{ backgroundColor: tag.color || '#6b7280' }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('summary_calendar_color')}</span>
            <div className="flex items-center gap-2">
              <div
                className="size-4 rounded"
                style={{ backgroundColor: data.calendarColor }}
              />
              <span className="font-medium text-foreground">{data.calendarColor}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6">
        <Button onClick={onDone} className="w-full">
          {t('done_button')}
        </Button>
      </div>
    </div>
  );
};
