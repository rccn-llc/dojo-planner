'use client';

import type { DayOfWeek, ScheduleException, ScheduleInstance } from '@/hooks/useAddClassWizard';
import { useOrganization } from '@clerk/nextjs';
import { AlertCircle, Calendar, Edit, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useInstructorsCache } from '@/hooks/useInstructorsCache';

type ClassScheduleCardProps = {
  scheduleInstances: ScheduleInstance[];
  scheduleExceptions?: ScheduleException[];
  location: string;
  calendarColor: string;
  onEdit?: () => void;
  onEditInstance?: (instance: ScheduleInstance, date: string, existingException?: ScheduleException) => void;
};

const EMPTY_EXCEPTIONS: ScheduleException[] = [];

export function ClassScheduleCard({
  scheduleInstances,
  scheduleExceptions = EMPTY_EXCEPTIONS,
  location,
  calendarColor,
  onEdit,
  onEditInstance,
}: ClassScheduleCardProps) {
  const t = useTranslations('ClassDetailPage.ScheduleCard');
  const { organization } = useOrganization();
  const { instructorLookup } = useInstructorsCache(organization?.id);
  const [datePickerOpen, setDatePickerOpen] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');

  const getNextDateForDay = (dayOfWeek: DayOfWeek): string => {
    const dayMap: Record<DayOfWeek, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    const today = new Date();
    const targetDay = dayMap[dayOfWeek];
    const currentDay = today.getDay();
    let daysUntilTarget = targetDay - currentDay;
    if (daysUntilTarget <= 0) {
      daysUntilTarget += 7;
    }
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntilTarget);
    return nextDate.toISOString().split('T')[0] ?? '';
  };

  const handleOpenDatePicker = (instanceId: string, dayOfWeek: DayOfWeek) => {
    setSelectedDate(getNextDateForDay(dayOfWeek));
    setDatePickerOpen(instanceId);
  };

  const handleDateConfirm = (instance: ScheduleInstance) => {
    if (selectedDate && onEditInstance) {
      onEditInstance(instance, selectedDate);
      setDatePickerOpen(null);
      setSelectedDate('');
    }
  };

  const formatTime = (hour: number, minute: number, amPm: 'AM' | 'PM'): string => {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${amPm}`;
  };

  const formatDuration = (hours: number, minutes: number): string => {
    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    return parts.join(' ') || '0m';
  };

  const getDayAbbreviation = (day: DayOfWeek): string => {
    const abbreviations: Record<DayOfWeek, string> = {
      Monday: 'Mon',
      Tuesday: 'Tue',
      Wednesday: 'Wed',
      Thursday: 'Thu',
      Friday: 'Fri',
      Saturday: 'Sat',
      Sunday: 'Sun',
    };
    return abbreviations[day];
  };

  const getStaffName = (staffValue: string): string => {
    return instructorLookup.get(staffValue)?.name || staffValue;
  };

  const formatExceptionDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getExceptionTypeLabel = (type: ScheduleException['type']): string => {
    switch (type) {
      case 'deleted':
        return t('exception_type_deleted');
      case 'modified':
        return t('exception_type_modified');
      case 'modified-forward':
        return t('exception_type_modified_forward');
      default:
        return type;
    }
  };

  const getExceptionTypeIcon = (type: ScheduleException['type']) => {
    switch (type) {
      case 'deleted':
        return <Trash2 className="h-3.5 w-3.5 text-destructive" />;
      case 'modified':
        return <Pencil className="h-3.5 w-3.5 text-amber-500" />;
      case 'modified-forward':
        return <Calendar className="h-3.5 w-3.5 text-blue-500" />;
      default:
        return <AlertCircle className="h-3.5 w-3.5" />;
    }
  };

  const getInstanceForException = (exception: ScheduleException): ScheduleInstance | undefined => {
    return scheduleInstances.find(i => i.id === exception.scheduleInstanceId);
  };

  const hasExceptions = scheduleExceptions.length > 0;

  return (
    <TooltipProvider>
      <Card className="flex h-full flex-col p-6">
        <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>

        <div className="mt-6 flex-1 space-y-4">
          {/* Schedule Instances Table */}
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('schedule_label')}</span>
            {scheduleInstances.length > 0
              ? (
                  <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-background">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-secondary">
                          <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('column_day')}</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('column_time')}</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('column_duration')}</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('column_instructor')}</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('column_assistant')}</th>
                          {onEditInstance && (
                            <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">{t('column_actions')}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleInstances.map(instance => (
                          <tr key={instance.id} className="border-b border-border last:border-b-0" data-testid={`schedule-instance-${instance.id}`}>
                            <td className="px-4 py-3 font-medium text-foreground">
                              {getDayAbbreviation(instance.dayOfWeek)}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {formatTime(instance.timeHour, instance.timeMinute, instance.timeAmPm)}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {formatDuration(instance.durationHours, instance.durationMinutes)}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {instance.staffMember ? getStaffName(instance.staffMember) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {instance.assistantStaff ? getStaffName(instance.assistantStaff) : '-'}
                            </td>
                            {onEditInstance && (
                              <td className="px-4 py-3 text-right">
                                <Popover
                                  open={datePickerOpen === instance.id}
                                  onOpenChange={(open) => {
                                    if (open) {
                                      handleOpenDatePicker(instance.id, instance.dayOfWeek);
                                    } else {
                                      setDatePickerOpen(null);
                                    }
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      aria-label={t('add_exception_aria')}
                                      data-testid={`add-exception-${instance.id}`}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent align="end" className="w-64">
                                    <div className="space-y-4">
                                      <div className="space-y-2">
                                        <h4 className="text-sm font-medium">{t('add_exception_title')}</h4>
                                        <p className="text-xs text-muted-foreground">
                                          {t('add_exception_description', { day: getDayAbbreviation(instance.dayOfWeek) })}
                                        </p>
                                      </div>
                                      <div className="space-y-2">
                                        <Label htmlFor={`date-${instance.id}`}>{t('select_date_label')}</Label>
                                        <Input
                                          id={`date-${instance.id}`}
                                          type="date"
                                          value={selectedDate}
                                          onChange={e => setSelectedDate(e.target.value)}
                                          data-testid={`date-input-${instance.id}`}
                                        />
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setDatePickerOpen(null)}
                                        >
                                          {t('cancel_button')}
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => handleDateConfirm(instance)}
                                          disabled={!selectedDate}
                                          data-testid={`confirm-date-${instance.id}`}
                                        >
                                          {t('continue_button')}
                                        </Button>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              : (
                  <p className="mt-1 text-foreground">{t('no_schedule')}</p>
                )}
          </div>

          {/* Schedule Exceptions Section */}
          {hasExceptions && (
            <div data-testid="schedule-exceptions-section">
              <span className="text-sm font-medium text-muted-foreground">{t('exceptions_label')}</span>
              <div className="mt-2 space-y-2">
                {scheduleExceptions.map((exception) => {
                  const instance = getInstanceForException(exception);
                  const isDeleted = exception.type === 'deleted';
                  const isModifiedForward = exception.type === 'modified-forward';

                  return (
                    <div
                      key={exception.id}
                      className={`flex items-center justify-between rounded-lg border p-3 ${
                        isDeleted
                          ? 'border-destructive/30 bg-destructive/5'
                          : isModifiedForward
                            ? 'border-blue-500/30 bg-blue-500/5'
                            : 'border-amber-500/30 bg-amber-500/5'
                      }`}
                      data-testid={`schedule-exception-${exception.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-center">
                              {getExceptionTypeIcon(exception.type)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {getExceptionTypeLabel(exception.type)}
                          </TooltipContent>
                        </Tooltip>

                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {instance ? getDayAbbreviation(instance.dayOfWeek) : t('unknown_instance')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatExceptionDate(exception.date)}
                              {isModifiedForward && (
                                <span className="ml-1 font-medium text-blue-600">
                                  {t('and_onwards')}
                                </span>
                              )}
                            </span>
                          </div>

                          {exception.overrides && !isDeleted && (
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              {exception.overrides.staffMember && instance?.staffMember !== exception.overrides.staffMember && (
                                <span className="rounded bg-secondary px-1.5 py-0.5">
                                  {t('instructor_changed')}
                                  :
                                  {getStaffName(exception.overrides.staffMember)}
                                </span>
                              )}
                              {(exception.overrides.timeHour !== undefined || exception.overrides.timeMinute !== undefined) && (
                                <span className="rounded bg-secondary px-1.5 py-0.5">
                                  {t('time_changed')}
                                  :
                                  {formatTime(
                                    exception.overrides.timeHour ?? instance?.timeHour ?? 0,
                                    exception.overrides.timeMinute ?? instance?.timeMinute ?? 0,
                                    exception.overrides.timeAmPm ?? instance?.timeAmPm ?? 'AM',
                                  )}
                                </span>
                              )}
                            </div>
                          )}

                          {exception.note && (
                            <span className="text-xs text-muted-foreground italic">
                              {exception.note}
                            </span>
                          )}
                        </div>
                      </div>

                      {onEditInstance && instance && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onEditInstance(instance, exception.date, exception)}
                          aria-label={t('edit_exception_aria')}
                          data-testid={`edit-exception-${exception.id}`}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('location_label')}</span>
            <p className="mt-1 text-foreground">{location || t('no_location')}</p>
          </div>

          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('calendar_color_label')}</span>
            <div className="mt-1 flex items-center gap-2">
              <div
                className="size-6 rounded border border-border"
                style={{ backgroundColor: calendarColor }}
              />
              <span className="text-sm text-foreground">{calendarColor}</span>
            </div>
          </div>
        </div>

        {onEdit && (
          <div className="mt-6 flex justify-end">
            <Button variant="outline" size="icon" onClick={onEdit} data-testid="edit-schedule-button">
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Card>
    </TooltipProvider>
  );
}
