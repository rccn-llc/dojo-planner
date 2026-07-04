'use client';

import type { DayOfWeek, ScheduleInstance } from '@/hooks/useAddClassWizard';
import { useOrganization } from '@clerk/nextjs';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
import { useInstructorsCache } from '@/hooks/useInstructorsCache';

const DAYS_OF_WEEK: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = [0, 15, 30, 45];
// Duration options from 30 minutes to 6 hours in 30-minute increments
const DURATION_OPTIONS = [
  { value: '0-30', hours: 0, minutes: 30, label: '30m' },
  { value: '1-0', hours: 1, minutes: 0, label: '1h' },
  { value: '1-30', hours: 1, minutes: 30, label: '1h 30m' },
  { value: '2-0', hours: 2, minutes: 0, label: '2h' },
  { value: '2-30', hours: 2, minutes: 30, label: '2h 30m' },
  { value: '3-0', hours: 3, minutes: 0, label: '3h' },
  { value: '3-30', hours: 3, minutes: 30, label: '3h 30m' },
  { value: '4-0', hours: 4, minutes: 0, label: '4h' },
  { value: '4-30', hours: 4, minutes: 30, label: '4h 30m' },
  { value: '5-0', hours: 5, minutes: 0, label: '5h' },
  { value: '5-30', hours: 5, minutes: 30, label: '5h 30m' },
  { value: '6-0', hours: 6, minutes: 0, label: '6h' },
];

const AVAILABLE_COLORS = [
  { value: '#22c55e', label: 'Green' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#ef4444', label: 'Red' },
  { value: '#6b7280', label: 'Gray' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#14b8a6', label: 'Teal' },
];

function generateInstanceId(): string {
  return `instance-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

type EditClassScheduleModalProps = {
  isOpen: boolean;
  onClose: () => void;
  scheduleInstances: ScheduleInstance[];
  location: string;
  calendarColor: string;
  onSave: (data: {
    scheduleInstances: ScheduleInstance[];
    location: string;
    calendarColor: string;
  }) => void | Promise<void>;
};

// Separate inner component to allow key-based remounting
function EditClassScheduleModalContent({
  initialScheduleInstances,
  initialLocation,
  initialCalendarColor,
  onSave,
  onClose,
}: {
  initialScheduleInstances: ScheduleInstance[];
  initialLocation: string;
  initialCalendarColor: string;
  onSave: EditClassScheduleModalProps['onSave'];
  onClose: () => void;
}) {
  const t = useTranslations('ClassDetailPage.EditScheduleModal');
  const { organization } = useOrganization();
  const { instructors, loading: instructorsLoading } = useInstructorsCache(organization?.id);

  const [scheduleInstances, setScheduleInstances] = useState<ScheduleInstance[]>(initialScheduleInstances);
  const [location, setLocation] = useState(initialLocation);
  const [calendarColor, setCalendarColor] = useState(initialCalendarColor);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleAddInstance = () => {
    const newInstance: ScheduleInstance = {
      id: generateInstanceId(),
      dayOfWeek: 'Monday',
      timeHour: 6,
      timeMinute: 0,
      timeAmPm: 'AM',
      durationHours: 1,
      durationMinutes: 0,
      staffMember: '',
      assistantStaff: '',
    };
    setScheduleInstances(prev => [...prev, newInstance]);
  };

  // Check if all existing instances have required fields filled
  const canAddNewInstance = scheduleInstances.every(
    instance => instance.staffMember !== '',
  );

  const handleRemoveInstance = (instanceId: string) => {
    setScheduleInstances(prev => prev.filter(i => i.id !== instanceId));
  };

  const handleUpdateInstance = (instanceId: string, updates: Partial<ScheduleInstance>) => {
    setScheduleInstances(prev =>
      prev.map(i => (i.id === instanceId ? { ...i, ...updates } : i)),
    );
  };

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const isInstancesInvalid = touched.instances && scheduleInstances.length === 0;

  const isFormValid
    = scheduleInstances.length > 0
      && scheduleInstances.every(
        instance => instance.durationHours > 0 || instance.durationMinutes > 0,
      );

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      await onSave({
        scheduleInstances,
        location,
        calendarColor,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setScheduleInstances(initialScheduleInstances);
    setLocation(initialLocation);
    setCalendarColor(initialCalendarColor);
    setTouched({});
    onClose();
  };

  const dayLabels: Record<DayOfWeek, string> = {
    Monday: t('day_monday'),
    Tuesday: t('day_tuesday'),
    Wednesday: t('day_wednesday'),
    Thursday: t('day_thursday'),
    Friday: t('day_friday'),
    Saturday: t('day_saturday'),
    Sunday: t('day_sunday'),
  };

  return (
    <div className="flex max-h-[calc(85vh-2rem)] flex-col">
      <DialogHeader className="shrink-0">
        <DialogTitle>{t('title')}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-1 flex-col space-y-4 py-4">
        {/* Schedule Instances - Scrollable Area */}
        <div className="flex min-h-0 flex-1 flex-col space-y-2">
          <label className="shrink-0 text-sm font-medium text-foreground">{t('schedule_instances_label')}</label>

          {scheduleInstances.length > 0
            ? (
                <div className="max-h-[360px] min-h-0 flex-1 overflow-y-auto rounded-lg border border-border p-3">
                  <div className="space-y-3">
                    {scheduleInstances.map((instance, index) => (
                      <div
                        key={instance.id}
                        className="rounded-lg border border-border bg-secondary/30 p-3"
                        data-testid={`schedule-row-${instance.id}`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">
                            {t('instance_number', { number: index + 1 })}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveInstance(instance.id)}
                            aria-label={t('remove_instance_aria')}
                            data-testid={`remove-instance-${instance.id}`}
                            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {/* Row 1: Day and Time */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                              <label className="text-[10px] text-muted-foreground">{t('column_day')}</label>
                              <Select
                                value={instance.dayOfWeek}
                                onValueChange={value => handleUpdateInstance(instance.id, { dayOfWeek: value as DayOfWeek })}
                              >
                                <SelectTrigger className="h-8 w-full text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {DAYS_OF_WEEK.map(day => (
                                    <SelectItem key={day} value={day} className="text-xs">
                                      {dayLabels[day]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-0.5">
                              <label className="text-[10px] text-muted-foreground">{t('column_time')}</label>
                              <div className="flex gap-1">
                                <Select
                                  value={instance.timeHour.toString()}
                                  onValueChange={value => handleUpdateInstance(instance.id, { timeHour: Number.parseInt(value, 10) })}
                                >
                                  <SelectTrigger className="h-8 w-full text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {HOURS.map(hour => (
                                      <SelectItem key={hour} value={hour.toString()} className="text-xs">
                                        {hour.toString().padStart(2, '0')}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={instance.timeMinute.toString()}
                                  onValueChange={value => handleUpdateInstance(instance.id, { timeMinute: Number.parseInt(value, 10) })}
                                >
                                  <SelectTrigger className="h-8 w-full text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {MINUTES.map(minute => (
                                      <SelectItem key={minute} value={minute.toString()} className="text-xs">
                                        {minute.toString().padStart(2, '0')}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={instance.timeAmPm}
                                  onValueChange={value => handleUpdateInstance(instance.id, { timeAmPm: value as 'AM' | 'PM' })}
                                >
                                  <SelectTrigger className="h-8 w-full text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="AM" className="text-xs">AM</SelectItem>
                                    <SelectItem value="PM" className="text-xs">PM</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>

                          {/* Row 2: Duration */}
                          <div className="space-y-0.5">
                            <label className="text-[10px] text-muted-foreground">{t('column_duration')}</label>
                            <Select
                              value={`${instance.durationHours}-${instance.durationMinutes}`}
                              onValueChange={(value) => {
                                const option = DURATION_OPTIONS.find(o => o.value === value);
                                if (option) {
                                  handleUpdateInstance(instance.id, {
                                    durationHours: option.hours,
                                    durationMinutes: option.minutes,
                                  });
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 w-full text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DURATION_OPTIONS.map(option => (
                                  <SelectItem key={option.value} value={option.value} className="text-xs">
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Row 3: Instructor and Assistant */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                              <label className="text-[10px] text-muted-foreground">{t('column_instructor')}</label>
                              <Select
                                value={instance.staffMember || 'none'}
                                onValueChange={value => handleUpdateInstance(instance.id, { staffMember: value === 'none' ? '' : value })}
                                disabled={instructorsLoading}
                              >
                                <SelectTrigger className="h-8 w-full text-xs">
                                  <SelectValue placeholder={t('staff_placeholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none" className="text-xs">{t('staff_placeholder')}</SelectItem>
                                  {instructors.map(instructor => (
                                    <SelectItem key={instructor.id} value={instructor.id} className="text-xs">
                                      {instructor.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-0.5">
                              <label className="text-[10px] text-muted-foreground">{t('column_assistant')}</label>
                              <Select
                                value={instance.assistantStaff || 'none'}
                                onValueChange={value => handleUpdateInstance(instance.id, { assistantStaff: value === 'none' ? '' : value })}
                                disabled={instructorsLoading}
                              >
                                <SelectTrigger className="h-8 w-full text-xs">
                                  <SelectValue placeholder={t('assistant_none')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none" className="text-xs">{t('assistant_none')}</SelectItem>
                                  {instructors.map(instructor => (
                                    <SelectItem key={instructor.id} value={instructor.id} className="text-xs">
                                      {instructor.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleAddInstance}
                        disabled={!canAddNewInstance}
                        aria-label={t('add_instance_button')}
                        data-testid="add-schedule-instance"
                        className="size-7"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            : (
                <div
                  className="rounded-md border border-dashed p-8 text-center"
                  onBlur={() => handleBlur('instances')}
                >
                  <p className="text-sm text-muted-foreground">{t('no_instances_message')}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddInstance}
                    className="mt-4"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {t('add_first_instance_button')}
                  </Button>
                </div>
              )}
          {isInstancesInvalid && (
            <p className="text-xs text-destructive">{t('instances_error')}</p>
          )}
        </div>

        {/* Fixed bottom section */}
        <div className="shrink-0 space-y-4 border-t border-border pt-4">
          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('location_label')}</label>
            <Input
              placeholder={t('location_placeholder')}
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>

          {/* Calendar Color */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('calendar_color_label')}</label>
            <div className="flex items-center gap-3">
              <div
                className="size-10 rounded border border-border"
                style={{ backgroundColor: calendarColor }}
              />
              <Input
                type="text"
                value={calendarColor}
                onChange={e => setCalendarColor(e.target.value)}
                placeholder="#000000"
                className="w-32"
              />
              <Select
                value={calendarColor}
                onValueChange={setCalendarColor}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t('calendar_color_select')} />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_COLORS.map(color => (
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
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              {t('cancel_button')}
            </Button>
            <Button onClick={handleSubmit} disabled={!isFormValid || isLoading}>
              {isLoading ? t('saving_button') : t('save_button')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Exported wrapper component that remounts content when modal opens
export function EditClassScheduleModal({
  isOpen,
  onClose,
  scheduleInstances,
  location,
  calendarColor,
  onSave,
}: EditClassScheduleModalProps) {
  // Use a key that changes when modal opens to reset inner state
  const [openKey, setOpenKey] = useState(0);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setOpenKey(prev => prev + 1);
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden">
        {isOpen && (
          <EditClassScheduleModalContent
            key={openKey}
            initialScheduleInstances={scheduleInstances}
            initialLocation={location}
            initialCalendarColor={calendarColor}
            onSave={onSave}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
