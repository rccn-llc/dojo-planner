'use client';

import type { DayOfWeek, ScheduleException, ScheduleInstance } from '@/hooks/useAddClassWizard';
import { useOrganization } from '@clerk/nextjs';
import { Calendar, Trash2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInstructorsCache } from '@/hooks/useInstructorsCache';
import { cn } from '@/utils/Helpers';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = [0, 15, 30, 45];
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

function generateExceptionId(): string {
  return `exception-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

type EditMode = 'this-instance' | 'this-and-future';

type EditScheduleInstanceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  scheduleInstance: ScheduleInstance;
  selectedDate: string;
  onSaveException: (exception: ScheduleException) => void;
  onDeleteException: (exception: ScheduleException) => void;
  existingException?: ScheduleException;
};

function EditScheduleInstanceModalContent({
  scheduleInstance,
  selectedDate,
  onSaveException,
  onDeleteException,
  onClose,
  existingException,
}: Omit<EditScheduleInstanceModalProps, 'isOpen'>) {
  const t = useTranslations('ClassDetailPage.EditInstanceModal');
  const { organization } = useOrganization();
  const { instructors, loading: instructorsLoading } = useInstructorsCache(organization?.id);

  const dayLabels: Record<DayOfWeek, string> = {
    Monday: t('day_monday'),
    Tuesday: t('day_tuesday'),
    Wednesday: t('day_wednesday'),
    Thursday: t('day_thursday'),
    Friday: t('day_friday'),
    Saturday: t('day_saturday'),
    Sunday: t('day_sunday'),
  };

  const [editMode, setEditMode] = useState<EditMode>('this-instance');
  const [isLoading, setIsLoading] = useState(false);

  const initialOverrides = existingException?.overrides ?? {};
  const [timeHour, setTimeHour] = useState(initialOverrides.timeHour ?? scheduleInstance.timeHour);
  const [timeMinute, setTimeMinute] = useState(initialOverrides.timeMinute ?? scheduleInstance.timeMinute);
  const [timeAmPm, setTimeAmPm] = useState<'AM' | 'PM'>(initialOverrides.timeAmPm ?? scheduleInstance.timeAmPm);
  const [durationHours, setDurationHours] = useState(initialOverrides.durationHours ?? scheduleInstance.durationHours);
  const [durationMinutes, setDurationMinutes] = useState(initialOverrides.durationMinutes ?? scheduleInstance.durationMinutes);
  const [staffMember, setStaffMember] = useState(initialOverrides.staffMember ?? scheduleInstance.staffMember);
  const [assistantStaff, setAssistantStaff] = useState(initialOverrides.assistantStaff ?? scheduleInstance.assistantStaff);
  const [note, setNote] = useState(existingException?.note ?? '');

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const hasChanges = (): boolean => {
    return (
      timeHour !== scheduleInstance.timeHour
      || timeMinute !== scheduleInstance.timeMinute
      || timeAmPm !== scheduleInstance.timeAmPm
      || durationHours !== scheduleInstance.durationHours
      || durationMinutes !== scheduleInstance.durationMinutes
      || staffMember !== scheduleInstance.staffMember
      || assistantStaff !== scheduleInstance.assistantStaff
    );
  };

  const handleSave = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));

    const exception: ScheduleException = {
      id: existingException?.id ?? generateExceptionId(),
      scheduleInstanceId: scheduleInstance.id,
      date: selectedDate,
      type: editMode === 'this-instance' ? 'modified' : 'modified-forward',
      overrides: {
        timeHour,
        timeMinute,
        timeAmPm,
        durationHours,
        durationMinutes,
        staffMember,
        assistantStaff,
      },
      effectiveFromDate: editMode === 'this-and-future' ? selectedDate : undefined,
      note: note || undefined,
      createdAt: existingException?.createdAt ?? new Date().toISOString(),
    };

    onSaveException(exception);
    setIsLoading(false);
    onClose();
  };

  const handleDelete = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));

    const exception: ScheduleException = {
      id: existingException?.id ?? generateExceptionId(),
      scheduleInstanceId: scheduleInstance.id,
      date: selectedDate,
      type: 'deleted',
      note: note || undefined,
      createdAt: existingException?.createdAt ?? new Date().toISOString(),
    };

    onDeleteException(exception);
    setIsLoading(false);
    onClose();
  };

  return (
    <div className="flex max-h-[calc(85vh-2rem)] flex-col">
      <DialogHeader className="shrink-0">
        <DialogTitle>{t('title')}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-1 flex-col space-y-4 overflow-y-auto py-4">
        <div className="rounded-lg border border-border bg-secondary/30 p-4">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="size-4 text-muted-foreground" />
            <span className="font-medium">{dayLabels[scheduleInstance.dayOfWeek]}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{formatDate(selectedDate)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('edit_mode_label')}</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setEditMode('this-instance')}
              className={cn(
                'flex flex-col items-start rounded-lg border-2 p-3 text-left transition-colors',
                editMode === 'this-instance'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/50',
              )}
              data-testid="edit-mode-this-instance"
            >
              <span className="text-sm font-medium">{t('edit_mode_this_instance')}</span>
              <p className="mt-1 text-xs text-muted-foreground">{t('edit_mode_this_instance_desc')}</p>
            </button>
            <button
              type="button"
              onClick={() => setEditMode('this-and-future')}
              className={cn(
                'flex flex-col items-start rounded-lg border-2 p-3 text-left transition-colors',
                editMode === 'this-and-future'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/50',
              )}
              data-testid="edit-mode-this-and-future"
            >
              <span className="text-sm font-medium">{t('edit_mode_this_and_future')}</span>
              <p className="mt-1 text-xs text-muted-foreground">{t('edit_mode_this_and_future_desc')}</p>
            </button>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border p-4">
          <h4 className="text-sm font-semibold">{t('instance_details_title')}</h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('time_label')}</Label>
              <div className="flex gap-1">
                <Select
                  value={timeHour.toString()}
                  onValueChange={value => setTimeHour(Number.parseInt(value, 10))}
                >
                  <SelectTrigger className="h-9 w-full text-sm" data-testid="time-hour-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map(hour => (
                      <SelectItem key={hour} value={hour.toString()} className="text-sm">
                        {hour.toString().padStart(2, '0')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={timeMinute.toString()}
                  onValueChange={value => setTimeMinute(Number.parseInt(value, 10))}
                >
                  <SelectTrigger className="h-9 w-full text-sm" data-testid="time-minute-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MINUTES.map(minute => (
                      <SelectItem key={minute} value={minute.toString()} className="text-sm">
                        {minute.toString().padStart(2, '0')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={timeAmPm}
                  onValueChange={value => setTimeAmPm(value as 'AM' | 'PM')}
                >
                  <SelectTrigger className="h-9 w-full text-sm" data-testid="time-ampm-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM" className="text-sm">AM</SelectItem>
                    <SelectItem value="PM" className="text-sm">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('duration_label')}</Label>
              <Select
                value={`${durationHours}-${durationMinutes}`}
                onValueChange={(value) => {
                  const option = DURATION_OPTIONS.find(o => o.value === value);
                  if (option) {
                    setDurationHours(option.hours);
                    setDurationMinutes(option.minutes);
                  }
                }}
              >
                <SelectTrigger className="h-9 w-full text-sm" data-testid="duration-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value} className="text-sm">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('instructor_label')}</Label>
              <Select
                value={staffMember || 'none'}
                onValueChange={value => setStaffMember(value === 'none' ? '' : value)}
                disabled={instructorsLoading}
              >
                <SelectTrigger className="h-9 w-full text-sm" data-testid="instructor-select">
                  <SelectValue placeholder={t('instructor_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-sm">{t('instructor_none')}</SelectItem>
                  {instructors.map(instructor => (
                    <SelectItem key={instructor.id} value={instructor.id} className="text-sm">
                      {instructor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('assistant_label')}</Label>
              <Select
                value={assistantStaff || 'none'}
                onValueChange={value => setAssistantStaff(value === 'none' ? '' : value)}
                disabled={instructorsLoading}
              >
                <SelectTrigger className="h-9 w-full text-sm" data-testid="assistant-select">
                  <SelectValue placeholder={t('assistant_none')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-sm">{t('assistant_none')}</SelectItem>
                  {instructors.map(instructor => (
                    <SelectItem key={instructor.id} value={instructor.id} className="text-sm">
                      {instructor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('note_label')}</Label>
            <Input
              placeholder={t('note_placeholder')}
              value={note}
              onChange={e => setNote(e.target.value)}
              data-testid="exception-note-input"
            />
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t border-border pt-4">
          <div className="flex justify-between gap-3">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              {t('cancel_button')}
            </Button>
            <div className="flex gap-3">
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading}
                data-testid="delete-instance-button"
              >
                <Trash2 className="mr-2 size-4" />
                {t('delete_instance_button')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={isLoading || !hasChanges()}
                data-testid="save-exception-button"
              >
                {isLoading ? t('saving_button') : t('save_button')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EditScheduleInstanceModal({
  isOpen,
  onClose,
  scheduleInstance,
  selectedDate,
  onSaveException,
  onDeleteException,
  existingException,
}: EditScheduleInstanceModalProps) {
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
      <DialogContent className="max-h-[85vh] max-w-md overflow-hidden" data-testid="edit-schedule-instance-modal">
        {isOpen && (
          <EditScheduleInstanceModalContent
            key={openKey}
            scheduleInstance={scheduleInstance}
            selectedDate={selectedDate}
            onSaveException={onSaveException}
            onDeleteException={onDeleteException}
            onClose={onClose}
            existingException={existingException}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
