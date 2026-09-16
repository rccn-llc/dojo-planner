'use client';

import { format, isValid, parse } from 'date-fns';
import { ClockIcon } from 'lucide-react';
import * as React from 'react';

import { Input } from '@/components/ui/input/input';
import { Label } from '@/components/ui/label/label';
import { cn } from '@/utils/Helpers';
import { DateTextInput } from './date-text-input';

export type DatePickerProps = {
  'value'?: Date;
  'onChange'?: (date: Date | undefined) => void;
  'placeholder'?: string;
  'disabled'?: boolean;
  /** Earliest selectable day (inclusive). Replaces a native input's `min`. */
  'minDate'?: Date;
  /** Latest selectable day (inclusive). Replaces a native input's `max`. */
  'maxDate'?: Date;
  'className'?: string;
  'data-testid'?: string;
};

// Parse a `yyyy-MM-dd` bound. Invalid/empty means "unbounded" rather than
// throwing, so a half-typed constraint never makes the picker unusable.
function parseBound(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(parsed) ? parsed : undefined;
}

/**
 * Date field taking a `Date`. A thin alias for `DateTextInput`, kept so
 * existing imports of `DatePicker` keep working.
 *
 * ⚠️ There is deliberately NO calendar-only date control in this app. A
 * button-that-opens-a-calendar cannot be operated efficiently by keyboard or
 * screen-reader users, so every date field must accept a typed MM/DD/YYYY
 * value with the calendar as an optional convenience. See `DateTextInput`.
 */
function DatePicker({
  value,
  onChange,
  placeholder,
  disabled = false,
  minDate,
  maxDate,
  className,
  'data-testid': dataTestId,
}: DatePickerProps) {
  return (
    <DateTextInput
      value={value}
      onChange={date => onChange?.(date)}
      placeholder={placeholder}
      disabled={disabled}
      minDate={minDate}
      maxDate={maxDate}
      className={className}
      data-testid={dataTestId}
    />
  );
}

export type TimePickerProps = {
  'value'?: string;
  'onChange'?: (time: string) => void;
  'disabled'?: boolean;
  'className'?: string;
  'data-testid'?: string;
};

function TimePicker({
  value = '',
  onChange,
  disabled = false,
  className,
  'data-testid': dataTestId,
}: TimePickerProps) {
  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
  };

  return (
    <div className={cn('relative', className)}>
      <ClockIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="time"
        step="1"
        value={value}
        onChange={handleTimeChange}
        disabled={disabled}
        data-testid={dataTestId}
        className="appearance-none bg-background pl-9 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
      />
    </div>
  );
}

export type DateTimePickerProps = {
  'date'?: string;
  'time'?: string;
  'onDateChange'?: (date: string) => void;
  'onTimeChange'?: (time: string) => void;
  'datePlaceholder'?: string;
  'disabled'?: boolean;
  /** Earliest selectable day, as `yyyy-MM-dd`. Replaces a native `min`. */
  'minDate'?: string;
  /** Latest selectable day, as `yyyy-MM-dd`. Replaces a native `max`. */
  'maxDate'?: string;
  'className'?: string;
  'dateLabel'?: string;
  'timeLabel'?: string;
  'data-testid-date'?: string;
  'data-testid-time'?: string;
};

function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  datePlaceholder,
  disabled = false,
  minDate,
  maxDate,
  className,
  dateLabel,
  timeLabel,
  'data-testid-date': dataTestIdDate,
  'data-testid-time': dataTestIdTime,
}: DateTimePickerProps) {
  const parsedDate = React.useMemo(() => {
    if (!date) {
      return undefined;
    }
    const parsed = parse(date, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : undefined;
  }, [date]);

  const parsedMin = React.useMemo(() => parseBound(minDate), [minDate]);
  const parsedMax = React.useMemo(() => parseBound(maxDate), [maxDate]);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onDateChange?.(format(selectedDate, 'yyyy-MM-dd'));
    } else {
      onDateChange?.('');
    }
  };

  return (
    <div className={cn('grid grid-cols-2 gap-4', className)}>
      <div className="space-y-2">
        {dateLabel && <Label>{dateLabel}</Label>}
        <DateTextInput
          value={parsedDate}
          onChange={handleDateSelect}
          placeholder={datePlaceholder}
          disabled={disabled}
          minDate={parsedMin}
          maxDate={parsedMax}
          data-testid={dataTestIdDate}
        />
      </div>

      <div className="space-y-2">
        {timeLabel && <Label>{timeLabel}</Label>}
        <TimePicker
          value={time}
          onChange={onTimeChange}
          disabled={disabled}
          data-testid={dataTestIdTime}
        />
      </div>
    </div>
  );
}

export { DatePicker, DateTimePicker, TimePicker };
