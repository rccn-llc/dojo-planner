'use client';

import type { AddClassWizardData, EventSchedule, EventSession } from '@/hooks/useAddClassWizard';
import { useOrganization } from '@clerk/nextjs';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInstructorsCache } from '@/hooks/useInstructorsCache';

type EventScheduleStepProps = {
  data: AddClassWizardData;
  onUpdate: (updates: Partial<AddClassWizardData>) => void;
  onUpdateEventSchedule: (updates: Partial<EventSchedule>) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  error?: string | null;
};

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

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const EventScheduleStep = ({
  data,
  onUpdate: _onUpdate,
  onUpdateEventSchedule,
  onNext,
  onBack,
  onCancel,
  error,
}: EventScheduleStepProps) => {
  const t = useTranslations('AddClassWizard.EventScheduleStep');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const { organization } = useOrganization();
  const { instructors, loading: instructorsLoading } = useInstructorsCache(organization?.id);

  const handleMultiDayChange = (value: string) => {
    const isMultiDay = value === 'multi';
    onUpdateEventSchedule({
      isMultiDay,
      // Reset end date to start date if switching to single day
      endDate: isMultiDay ? data.eventSchedule.endDate : data.eventSchedule.startDate,
    });
  };

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    if (field === 'startDate') {
      onUpdateEventSchedule({
        startDate: value,
        // If single day, keep end date in sync
        endDate: data.eventSchedule.isMultiDay ? data.eventSchedule.endDate : value,
      });
    } else {
      onUpdateEventSchedule({ endDate: value });
    }
  };

  const handleAddSession = () => {
    const newSession: EventSession = {
      id: generateSessionId(),
      date: data.eventSchedule.startDate || '',
      timeHour: 10,
      timeMinute: 0,
      timeAmPm: 'AM',
      durationHours: 2,
      durationMinutes: 0,
      staffMember: '',
      assistantStaff: '',
    };
    onUpdateEventSchedule({
      sessions: [...data.eventSchedule.sessions, newSession],
    });
  };

  const handleRemoveSession = (sessionId: string) => {
    onUpdateEventSchedule({
      sessions: data.eventSchedule.sessions.filter(s => s.id !== sessionId),
    });
  };

  const handleUpdateSession = (sessionId: string, updates: Partial<EventSession>) => {
    onUpdateEventSchedule({
      sessions: data.eventSchedule.sessions.map(s =>
        s.id === sessionId ? { ...s, ...updates } : s,
      ),
    });
  };

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  // Check if we can add new sessions
  const canAddNewSession = data.eventSchedule.sessions.every(
    session => session.staffMember !== '',
  );

  // Validation
  const isFormValid
    = data.eventSchedule.startDate !== ''
      && data.eventSchedule.sessions.length > 0
      && data.eventSchedule.sessions.every(
        session =>
          session.staffMember !== ''
          && session.date !== ''
          && (session.durationHours > 0 || session.durationMinutes > 0),
      );

  const isSessionsInvalid = touched.sessions && data.eventSchedule.sessions.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col space-y-4">
        {error && (
          <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Event Date Type Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">{t('date_range_label')}</label>
          <RadioGroup
            value={data.eventSchedule.isMultiDay ? 'multi' : 'single'}
            onValueChange={handleMultiDayChange}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="single" id="single-day" />
              <Label htmlFor="single-day">{t('single_day_label')}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="multi" id="multi-day" />
              <Label htmlFor="multi-day">{t('multi_day_label')}</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Date Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('start_date_label')}</label>
            <Input
              type="date"
              value={data.eventSchedule.startDate}
              onChange={e => handleDateChange('startDate', e.target.value)}
              onBlur={() => handleBlur('startDate')}
            />
          </div>
          {data.eventSchedule.isMultiDay && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('end_date_label')}</label>
              <Input
                type="date"
                value={data.eventSchedule.endDate}
                onChange={e => handleDateChange('endDate', e.target.value)}
                onBlur={() => handleBlur('endDate')}
                min={data.eventSchedule.startDate}
              />
            </div>
          )}
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{t('location_label')}</label>
          <Input
            placeholder={t('location_placeholder')}
            value={data.eventSchedule.location}
            onChange={e => onUpdateEventSchedule({ location: e.target.value })}
          />
        </div>

        {/* Sessions - Scrollable Area */}
        <div className="flex min-h-0 flex-1 flex-col space-y-2">
          <label className="shrink-0 text-sm font-medium text-foreground">{t('sessions_label')}</label>

          {data.eventSchedule.sessions.length > 0
            ? (
                <div className="max-h-75 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border p-3">
                  <div className="space-y-3">
                    {data.eventSchedule.sessions.map((session, index) => (
                      <div
                        key={session.id}
                        className="rounded-lg border border-border bg-secondary/30 p-3"
                        data-testid={`event-session-row-${session.id}`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">
                            {t('session_number', { number: index + 1 })}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveSession(session.id)}
                            aria-label={t('remove_session_aria')}
                            data-testid={`remove-session-${session.id}`}
                            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {/* Row 1: Date and Time */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                              <label className="text-[10px] text-muted-foreground">{t('column_date')}</label>
                              <Input
                                type="date"
                                value={session.date}
                                onChange={e => handleUpdateSession(session.id, { date: e.target.value })}
                                min={data.eventSchedule.startDate}
                                max={data.eventSchedule.endDate || data.eventSchedule.startDate}
                                className="h-8 text-xs"
                              />
                            </div>

                            <div className="space-y-0.5">
                              <label className="text-[10px] text-muted-foreground">{t('column_time')}</label>
                              <div className="flex gap-1">
                                <Select
                                  value={session.timeHour.toString()}
                                  onValueChange={value => handleUpdateSession(session.id, { timeHour: Number.parseInt(value, 10) })}
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
                                  value={session.timeMinute.toString()}
                                  onValueChange={value => handleUpdateSession(session.id, { timeMinute: Number.parseInt(value, 10) })}
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
                                  value={session.timeAmPm}
                                  onValueChange={value => handleUpdateSession(session.id, { timeAmPm: value as 'AM' | 'PM' })}
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
                              value={`${session.durationHours}-${session.durationMinutes}`}
                              onValueChange={(value) => {
                                const option = DURATION_OPTIONS.find(o => o.value === value);
                                if (option) {
                                  handleUpdateSession(session.id, {
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
                                value={session.staffMember || 'none'}
                                onValueChange={value => handleUpdateSession(session.id, { staffMember: value === 'none' ? '' : value })}
                                disabled={instructorsLoading}
                              >
                                <SelectTrigger className="h-8 w-full text-xs" data-testid={`staff-select-${session.id}`}>
                                  <SelectValue placeholder={t('staff_member_placeholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none" className="text-xs">{t('staff_member_placeholder')}</SelectItem>
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
                                value={session.assistantStaff || 'none'}
                                onValueChange={value => handleUpdateSession(session.id, { assistantStaff: value === 'none' ? '' : value })}
                                disabled={instructorsLoading}
                              >
                                <SelectTrigger className="h-8 w-full text-xs">
                                  <SelectValue placeholder={t('assistant_staff_none')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none" className="text-xs">{t('assistant_staff_none')}</SelectItem>
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
                        onClick={handleAddSession}
                        disabled={!canAddNewSession}
                        aria-label={t('add_session_button')}
                        data-testid="add-event-session"
                        className="size-7"
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            : (
                <div
                  className="rounded-md border border-dashed p-8 text-center"
                  onBlur={() => handleBlur('sessions')}
                >
                  <p className="text-sm text-muted-foreground">{t('no_sessions_message')}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddSession}
                    className="mt-4"
                    disabled={!data.eventSchedule.startDate}
                  >
                    <Plus className="mr-1 size-4" />
                    {t('add_first_session_button')}
                  </Button>
                </div>
              )}
          {isSessionsInvalid && (
            <p className="text-xs text-destructive">{t('sessions_error')}</p>
          )}
        </div>

        {/* Fixed bottom section */}
        <div className="shrink-0 border-t border-border pt-4">
          <div className="flex justify-between gap-3">
            <div className="flex gap-3">
              <Button variant="outline" onClick={onBack}>
                {t('back_button')}
              </Button>
              <Button variant="outline" onClick={onCancel}>
                {t('cancel_button')}
              </Button>
            </div>
            <Button onClick={onNext} disabled={!isFormValid}>
              {t('next_button')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
