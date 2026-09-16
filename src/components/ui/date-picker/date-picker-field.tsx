'use client';

import * as React from 'react';

import { formatDateOnlyLocal, parseDateOnlyLocal } from '@/utils/DateHelpers';
import { DateTextInput } from './date-text-input';

export type DatePickerFieldProps = {
  /** The current value as `yyyy-MM-dd`, or `''` when unset. */
  'value': string;
  /** Called with the new `yyyy-MM-dd` value, or `''` when cleared. */
  'onChange': (value: string) => void;
  'placeholder'?: string;
  'disabled'?: boolean;
  /** Earliest selectable day as `yyyy-MM-dd`. Replaces a native `min`. */
  'minDate'?: string;
  /** Latest selectable day as `yyyy-MM-dd`. Replaces a native `max`. */
  'maxDate'?: string;
  'className'?: string;
  'data-testid'?: string;
};

/**
 * A `yyyy-MM-dd`-string date field backed by the shared `DateTextInput`.
 *
 * Most forms in this app hold dates as `yyyy-MM-dd` strings (that is what a
 * native `<input type="date">` gives you), while `DateTextInput` speaks
 * `Date`. This adapter exists so that conversion is written once instead of at
 * every call site — the duplicated-conversion problem is what produced the
 * off-by-one bugs these pickers replaced.
 *
 * Note the two formats in play, deliberately: the USER types and reads
 * MM/DD/YYYY, while the form STATE and the wire stay `yyyy-MM-dd`. Only this
 * adapter knows both.
 *
 * The strings are parsed as LOCAL days on purpose: the calendar shows the user
 * their own days, so "2026-03-14" must mean March 14 where they are sitting.
 * Values crossing the API boundary are converted with the UTC-anchored helpers
 * at the point of submission, not here.
 */
function DatePickerField({
  value,
  onChange,
  placeholder,
  disabled,
  minDate,
  maxDate,
  className,
  'data-testid': dataTestId,
}: DatePickerFieldProps) {
  const parsed = React.useMemo(() => parseDateOnlyLocal(value), [value]);
  const parsedMin = React.useMemo(() => parseDateOnlyLocal(minDate), [minDate]);
  const parsedMax = React.useMemo(() => parseDateOnlyLocal(maxDate), [maxDate]);

  const handleChange = React.useCallback(
    (date: Date | undefined) => {
      onChange(date ? formatDateOnlyLocal(date) : '');
    },
    [onChange],
  );

  return (
    <DateTextInput
      value={parsed}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      minDate={parsedMin}
      maxDate={parsedMax}
      className={className}
      data-testid={dataTestId}
    />
  );
}

export { DatePickerField };
