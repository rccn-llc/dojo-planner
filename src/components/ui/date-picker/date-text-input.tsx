'use client';

import type { Matcher } from 'react-day-picker';
import { CalendarIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DATE_DISPLAY_PLACEHOLDER, dateToDisplay, parseDisplay } from '@/utils/DateHelpers';
import { cn } from '@/utils/Helpers';

export type DateTextInputProps = {
  /** Currently selected date, or undefined when blank. */
  'value': Date | undefined;
  'onChange': (date: Date | undefined) => void;
  /** Called when the user blurs the typed input — lets the parent flag the field as touched. */
  'onBlur'?: () => void;
  'placeholder'?: string;
  'disabled'?: boolean;
  /** Earliest selectable day (inclusive). Disables earlier days in the calendar. */
  'minDate'?: Date;
  /** Latest selectable day (inclusive). Disables later days in the calendar. */
  'maxDate'?: Date;
  /** Marks the input invalid for styling (e.g. the parent's own "required" check). */
  'aria-invalid'?: boolean;
  'aria-label'?: string;
  'id'?: string;
  'className'?: string;
  'data-testid'?: string;
  /**
   * Calendar navigation. `dropdown` (default) shows month + year selects.
   * `startMonth`/`endMonth` bound them; they default to a window around the
   * selectable range, or a wide span when unbounded.
   */
  'startMonth'?: Date;
  'endMonth'?: Date;
  'defaultMonth'?: Date;
  /** Autocomplete hint. `bday` for a date of birth, otherwise usually omitted. */
  'autoComplete'?: string;
  /** Inline message shown when the typed text cannot be parsed. */
  'parseErrorMessage'?: string;
  /**
   * Inline message shown when the typed text parses but falls outside
   * `minDate`/`maxDate`. Defaults to a message naming the allowed range.
   */
  'rangeErrorMessage'?: string;
};

/** Midnight local, so two dates compare as calendar days. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Default inline message naming whichever bounds are configured. */
function buildRangeErrorMessage(minDate?: Date, maxDate?: Date): string {
  if (minDate && maxDate) {
    return `Enter a date between ${dateToDisplay(minDate)} and ${dateToDisplay(maxDate)}.`;
  }
  if (minDate) {
    return `Enter a date on or after ${dateToDisplay(minDate)}.`;
  }
  if (maxDate) {
    return `Enter a date on or before ${dateToDisplay(maxDate)}.`;
  }
  return 'Enter a date within the allowed range.';
}

/**
 * The app's single date-entry control: a typeable MM/DD/YYYY field with a
 * calendar icon button on its right that opens a month/year-navigable
 * calendar.
 *
 * ── Why typed entry is mandatory ────────────────────────────────────────────
 *
 * This shape is an ACCESSIBILITY REQUIREMENT, not a preference. A
 * calendar-only picker forces a keyboard or screen-reader user to arrow
 * through a grid to reach a date, and forces anyone entering a far-off date
 * (a birth date, a year-out deadline) through dozens of interactions. A plain
 * text field that accepts a typed date is the accessible path; the calendar is
 * the convenience layer on top.
 *
 * So: never add a date control that is calendar-only, and never replace this
 * with a bare `<input type="date">` — the native control's appearance and
 * keyboard behaviour vary by browser and OS, and it cannot be themed (its
 * indicator renders dark-on-dark in dark mode).
 *
 * Behaviour:
 * - Typing a valid MM/DD/YYYY updates the parent immediately.
 * - An unparseable string shows an inline error on BLUR, not mid-keystroke,
 *   and never propagates an invalid Date to the parent.
 * - Roll-over dates (02/30/2020) are rejected rather than silently shifted.
 * - A parseable date outside `minDate`/`maxDate` is rejected too. The bounds
 *   must be enforced on the TYPED path and not only by the calendar's
 *   disabled-day matcher: a calendar-only check is no check at all, since the
 *   text field can submit any day the user types.
 * - Picking from the calendar syncs the typed text, and an external `value`
 *   change flows through without a mirroring effect.
 */
export function DateTextInput({
  value,
  onChange,
  onBlur,
  placeholder = DATE_DISPLAY_PLACEHOLDER,
  disabled = false,
  minDate,
  maxDate,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  id,
  className,
  'data-testid': dataTestId,
  startMonth,
  endMonth,
  defaultMonth,
  autoComplete,
  parseErrorMessage = 'Enter date as MM/DD/YYYY.',
  rangeErrorMessage,
}: DateTextInputProps) {
  const [open, setOpen] = React.useState(false);
  // `editingText` holds the in-flight typed string while the input is focused
  // (or right after blur, before the next render). When null, the displayed
  // text derives from the `value` prop — so external changes (calendar pick,
  // parent reset) flow through with no mirroring useEffect.
  const [editingText, setEditingText] = React.useState<string | null>(null);
  const [parseError, setParseError] = React.useState<boolean>(false);
  const [rangeError, setRangeError] = React.useState<boolean>(false);

  const displayedText = editingText ?? dateToDisplay(value);

  // Compare on the calendar DAY, not the instant: `minDate`/`maxDate` are
  // inclusive bounds, and a bound carrying a time component would otherwise
  // reject the bound day itself.
  const isOutOfRange = React.useCallback(
    (date: Date) => {
      const day = startOfDay(date);
      if (minDate && day < startOfDay(minDate)) {
        return true;
      }
      return Boolean(maxDate && day > startOfDay(maxDate));
    },
    [minDate, maxDate],
  );

  const resolvedRangeErrorMessage
    = rangeErrorMessage ?? buildRangeErrorMessage(minDate, maxDate);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setEditingText(next);
    const parsed = parseDisplay(next);
    if (parsed) {
      setParseError(false);
      if (isOutOfRange(parsed)) {
        // Do not propagate an out-of-range day to the parent. The error waits
        // for blur like the parse error does, so it can't flash while the user
        // is still typing the year.
        setRangeError(false);
        return;
      }
      setRangeError(false);
      onChange(parsed);
    } else if (next.trim() === '') {
      setParseError(false);
      setRangeError(false);
      if (value !== undefined) {
        onChange(undefined);
      }
    } else {
      // Mid-edit — defer the error to blur so it doesn't flash per keystroke.
      setParseError(false);
      setRangeError(false);
    }
  };

  const handleTextBlur = () => {
    const trimmed = (editingText ?? '').trim();
    if (!trimmed) {
      setParseError(false);
      setRangeError(false);
      if (value !== undefined) {
        onChange(undefined);
      }
      setEditingText(null);
    } else {
      const parsed = parseDisplay(trimmed);
      if (parsed && isOutOfRange(parsed)) {
        // Parseable but outside the allowed window. Keep the text visible so
        // the user can correct it, and leave `value` untouched.
        setParseError(false);
        setRangeError(true);
      } else if (parsed) {
        setParseError(false);
        setRangeError(false);
        onChange(parsed);
        setEditingText(null);
      } else {
        // Keep the user's text visible so they can correct it.
        setRangeError(false);
        setParseError(true);
      }
    }
    onBlur?.();
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    onChange(date);
    setEditingText(null);
    setParseError(false);
    setRangeError(false);
    setOpen(false);
  };

  const isInvalid = ariaInvalid || parseError || rangeError;

  // Days outside [minDate, maxDate] are disabled. `{ before }` and `{ after }`
  // are separate matchers because DateInterval requires both bounds.
  const disabledDays = React.useMemo(() => {
    const matchers: Matcher[] = [];
    if (minDate) {
      matchers.push({ before: minDate });
    }
    if (maxDate) {
      matchers.push({ after: maxDate });
    }
    return matchers.length > 0 ? matchers : undefined;
  }, [minDate, maxDate]);

  const currentYear = new Date().getFullYear();
  const resolvedStartMonth = startMonth ?? minDate ?? new Date(currentYear - 5, 0);
  const resolvedEndMonth = endMonth ?? maxDate ?? new Date(currentYear + 10, 11);

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex gap-2">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete={autoComplete}
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
              <CalendarIcon className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={value}
              onSelect={handleCalendarSelect}
              disabled={disabledDays}
              captionLayout="dropdown"
              startMonth={resolvedStartMonth}
              endMonth={resolvedEndMonth}
              defaultMonth={defaultMonth ?? value ?? minDate}
            />
          </PopoverContent>
        </Popover>
      </div>
      {(parseError || rangeError) && (
        <p className="text-xs text-destructive" data-testid={dataTestId ? `${dataTestId}-error` : undefined}>
          {parseError ? parseErrorMessage : resolvedRangeErrorMessage}
        </p>
      )}
    </div>
  );
}
