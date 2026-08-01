'use client';

import { format, isValid, parse } from 'date-fns';
import { CalendarIcon, ClockIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input/input';
import { Label } from '@/components/ui/label/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/Helpers';

export type DatePickerProps = {
  'value'?: Date;
  'onChange'?: (date: Date | undefined) => void;
  'placeholder'?: string;
  'disabled'?: boolean;
  'className'?: string;
  'data-testid'?: string;
};

function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled = false,
  className,
  'data-testid': dataTestId,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (date: Date | undefined) => {
    onChange?.(date);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          data-testid={dataTestId}
          className={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value ? format(value, 'yyyy-MM-dd') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
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
  datePlaceholder = 'Pick a date',
  disabled = false,
  className,
  dateLabel,
  timeLabel,
  'data-testid-date': dataTestIdDate,
  'data-testid-time': dataTestIdTime,
}: DateTimePickerProps) {
  const [dateOpen, setDateOpen] = React.useState(false);

  const parsedDate = React.useMemo(() => {
    if (!date) {
      return undefined;
    }
    const parsed = parse(date, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : undefined;
  }, [date]);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onDateChange?.(format(selectedDate, 'yyyy-MM-dd'));
    } else {
      onDateChange?.('');
    }
    setDateOpen(false);
  };

  return (
    <div className={cn('grid grid-cols-2 gap-4', className)}>
      <div className="space-y-2">
        {dateLabel && <Label>{dateLabel}</Label>}
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              disabled={disabled}
              data-testid={dataTestIdDate}
              className={cn(
                'w-full justify-start text-left font-normal',
                !parsedDate && 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="mr-2 size-4" />
              {parsedDate ? format(parsedDate, 'yyyy-MM-dd') : <span>{datePlaceholder}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={parsedDate}
              onSelect={handleDateSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>
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
