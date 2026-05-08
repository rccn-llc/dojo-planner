'use client';

import { format, isValid, parse } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/Helpers';

export type DateOfBirthInputProps = {
  /** Currently selected date, or undefined when blank. */
  'value': Date | undefined;
  'onChange': (date: Date | undefined) => void;
  /** Called when the user blurs the typed input — used by the parent to flag the field as touched. */
  'onBlur'?: () => void;
  'placeholder'?: string;
  'disabled'?: boolean;
  /** Marks the input as invalid for styling (e.g. when the parent has its own "required" check). */
  'aria-invalid'?: boolean;
  'aria-label'?: string;
  'id'?: string;
  'className'?: string;
  'data-testid'?: string;
};

const DISPLAY_FORMAT = 'MM/dd/yyyy';

function dateToDisplay(date: Date | undefined): string {
  if (!date || !isValid(date)) {
    return '';
  }
  return format(date, DISPLAY_FORMAT);
}

/**
 * Parse an MM/DD/YYYY string. Returns the Date when the string parses cleanly
 * AND round-trips back to the same value (date-fns will accept "02/30/2020"
 * and roll it to March 1, which we want to reject as malformed).
 */
function parseDisplay(text: string): Date | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = parse(trimmed, DISPLAY_FORMAT, new Date());
  if (!isValid(parsed)) {
    return null;
  }
  // Reject roll-over dates (date-fns accepts 02/30/2020 as 03/01/2020).
  if (format(parsed, DISPLAY_FORMAT) !== trimmed) {
    return null;
  }
  return parsed;
}

/**
 * Date-of-birth input that supports BOTH typed and calendar entry.
 *
 * - User can type an MM/DD/YYYY date directly. Invalid strings show inline
 *   error and don't update the parent's value.
 * - The calendar icon button opens a popover with a Shadcn calendar (year/month
 *   dropdowns for fast historical navigation, no native scroll quirks).
 * - When the user picks a date in the calendar, the typed text syncs.
 * - When the parent's `value` prop changes externally, the typed text syncs.
 */
export function DateOfBirthInput({
  value,
  onChange,
  onBlur,
  placeholder = 'MM/DD/YYYY',
  disabled = false,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  id,
  className,
  'data-testid': dataTestId,
}: DateOfBirthInputProps) {
  const [open, setOpen] = React.useState(false);
  // `editingText` holds the in-flight typed string while the input is focused
  // (or right after blur, before the next render). When null, the displayed
  // text is derived from the `value` prop directly — so external value
  // changes (calendar selection, parent reset) flow through without needing
  // a useEffect that mirrors them into state.
  const [editingText, setEditingText] = React.useState<string | null>(null);
  const [parseError, setParseError] = React.useState<boolean>(false);

  const displayedText = editingText ?? dateToDisplay(value);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setEditingText(next);
    // Clear value while user is mid-type and the string is empty or unparseable.
    // Don't propagate `undefined` on every keystroke — only when the typed
    // text is a valid full date.
    const parsed = parseDisplay(next);
    if (parsed) {
      setParseError(false);
      onChange(parsed);
    } else if (next.trim() === '') {
      setParseError(false);
      if (value !== undefined) {
        onChange(undefined);
      }
    } else {
      // Mid-edit — defer error to blur.
      setParseError(false);
    }
  };

  const handleTextBlur = () => {
    const trimmed = (editingText ?? '').trim();
    if (!trimmed) {
      setParseError(false);
      if (value !== undefined) {
        onChange(undefined);
      }
      // Drop back to value-driven display.
      setEditingText(null);
    } else {
      const parsed = parseDisplay(trimmed);
      if (parsed) {
        setParseError(false);
        onChange(parsed);
        setEditingText(null);
      } else {
        // Keep the user's text visible so they can fix it.
        setParseError(true);
      }
    }
    onBlur?.();
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    onChange(date);
    setEditingText(null);
    setParseError(false);
    setOpen(false);
  };

  const isInvalid = ariaInvalid || parseError;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex gap-2">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          placeholder={placeholder}
          value={displayedText}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          disabled={disabled}
          aria-invalid={isInvalid}
          aria-label={ariaLabel}
          data-testid={dataTestId}
          error={isInvalid}
          className="flex-1"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              aria-label="Open calendar"
              data-testid={dataTestId ? `${dataTestId}-calendar-trigger` : undefined}
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={value}
              onSelect={handleCalendarSelect}
              captionLayout="dropdown"
              startMonth={new Date(new Date().getFullYear() - 100, 0)}
              endMonth={new Date()}
              defaultMonth={value ?? new Date(new Date().getFullYear() - 30, 0)}
            />
          </PopoverContent>
        </Popover>
      </div>
      {parseError && (
        <p className="text-xs text-destructive" data-testid={dataTestId ? `${dataTestId}-error` : undefined}>
          Enter date as MM/DD/YYYY.
        </p>
      )}
    </div>
  );
}
