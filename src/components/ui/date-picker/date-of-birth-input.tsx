'use client';

import { DateTextInput } from './date-text-input';

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

/**
 * Date-of-birth input: a typed MM/DD/YYYY field with a calendar icon button.
 *
 * This is `DateTextInput` with the date-of-birth specifics applied — a
 * 100-year backward range, no future dates, a default month ~30 years back so
 * the year dropdown opens near a plausible value, and `autoComplete="bday"`.
 * The shared component owns the typing, parsing and calendar behaviour so
 * every date field in the app behaves identically.
 */
export function DateOfBirthInput({
  value,
  onChange,
  onBlur,
  placeholder,
  disabled = false,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  id,
  className,
  'data-testid': dataTestId,
}: DateOfBirthInputProps) {
  // Recomputed per render rather than memoised: `new Date()` is cheap and a
  // stale "today" bound would reject a birthday entered just after midnight.
  const now = new Date();

  return (
    <DateTextInput
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      maxDate={now}
      startMonth={new Date(now.getFullYear() - 100, 0)}
      endMonth={now}
      defaultMonth={value ?? new Date(now.getFullYear() - 30, 0)}
      autoComplete="bday"
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      id={id}
      className={className}
      data-testid={dataTestId}
    />
  );
}
