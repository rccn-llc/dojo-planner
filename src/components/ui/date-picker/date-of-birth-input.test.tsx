import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { DateOfBirthInput } from './date-of-birth-input';

describe('DateOfBirthInput', () => {
  describe('Rendering', () => {
    it('renders an empty input when no value provided', () => {
      render(<DateOfBirthInput value={undefined} onChange={() => {}} />);

      const input = page.getByPlaceholder('MM/DD/YYYY');

      expect(input).toBeInTheDocument();
      expect((input.element() as HTMLInputElement).value).toBe('');
    });

    it('renders the value formatted as MM/DD/YYYY', () => {
      render(<DateOfBirthInput value={new Date(1990, 5, 15)} onChange={() => {}} />);

      const input = page.getByPlaceholder('MM/DD/YYYY');

      expect((input.element() as HTMLInputElement).value).toBe('06/15/1990');
    });

    it('renders a calendar icon button next to the input', () => {
      render(<DateOfBirthInput value={undefined} onChange={() => {}} />);

      expect(page.getByRole('button', { name: 'Open calendar' })).toBeInTheDocument();
    });
  });

  describe('Typed input', () => {
    it('calls onChange with a parsed Date when a valid MM/DD/YYYY is typed', async () => {
      const onChange = vi.fn();
      render(<DateOfBirthInput value={undefined} onChange={onChange} />);

      const input = page.getByPlaceholder('MM/DD/YYYY');
      await userEvent.type(input.element(), '03/14/1985');

      // The last call should be with a Date matching March 14, 1985
      const calls = onChange.mock.calls;
      const lastDate = calls[calls.length - 1]![0] as Date;

      expect(lastDate).toBeInstanceOf(Date);
      expect(lastDate.getFullYear()).toBe(1985);
      expect(lastDate.getMonth()).toBe(2);
      expect(lastDate.getDate()).toBe(14);
    });

    it('does not show an error while the user is mid-type', async () => {
      render(<DateOfBirthInput value={undefined} onChange={() => {}} data-testid="dob" />);

      const input = page.getByTestId('dob');
      await userEvent.type(input.element(), '03/');

      // Mid-type — no error yet
      expect(page.getByTestId('dob-error').elements()).toHaveLength(0);
    });

    it('shows a validation error on blur when the typed date is malformed', async () => {
      const onChange = vi.fn();
      render(<DateOfBirthInput value={undefined} onChange={onChange} data-testid="dob" />);

      const input = page.getByTestId('dob');
      await userEvent.type(input.element(), '13/40/2020');
      await userEvent.tab(); // blur

      expect(page.getByTestId('dob-error')).toBeInTheDocument();

      // Parent never receives an invalid Date
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
      const lastValue = lastCall ? lastCall[0] : undefined;

      expect(lastValue).not.toBeInstanceOf(Date);
    });

    it('rejects rolled-over dates like 02/30/2020', async () => {
      const onChange = vi.fn();
      render(<DateOfBirthInput value={undefined} onChange={onChange} data-testid="dob" />);

      const input = page.getByTestId('dob');
      await userEvent.type(input.element(), '02/30/2020');
      await userEvent.tab();

      expect(page.getByTestId('dob-error')).toBeInTheDocument();

      // Should NOT have accepted 02/30 as 03/01
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
      const lastValue = lastCall ? lastCall[0] : undefined;

      expect(lastValue).not.toBeInstanceOf(Date);
    });

    it('clears the value when the input is emptied', async () => {
      const onChange = vi.fn();
      render(<DateOfBirthInput value={new Date(1990, 5, 15)} onChange={onChange} />);

      const input = page.getByPlaceholder('MM/DD/YYYY');
      await userEvent.clear(input.element());
      await userEvent.tab();

      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];

      expect(lastCall).toBeDefined();
      expect(lastCall![0]).toBeUndefined();
    });

    it('calls onBlur when the input is blurred', async () => {
      const onBlur = vi.fn();
      render(
        <DateOfBirthInput value={undefined} onChange={() => {}} onBlur={onBlur} />,
      );

      const input = page.getByPlaceholder('MM/DD/YYYY');
      await userEvent.click(input.element());
      await userEvent.tab();

      expect(onBlur).toHaveBeenCalled();
    });
  });

  describe('Calendar popover', () => {
    it('opens the calendar when the icon button is clicked', async () => {
      render(<DateOfBirthInput value={undefined} onChange={() => {}} />);

      const calendarButton = page.getByRole('button', { name: 'Open calendar' });
      await userEvent.click(calendarButton.element());

      expect(page.getByRole('grid')).toBeInTheDocument();
    });

    it('updates the typed input when a date is selected from the calendar', async () => {
      const onChange = vi.fn();
      // Default month is 30 years ago — pick a known starting point.
      render(
        <DateOfBirthInput value={new Date(1990, 5, 1)} onChange={onChange} />,
      );

      const calendarButton = page.getByRole('button', { name: 'Open calendar' });
      await userEvent.click(calendarButton.element());

      const dayButton = page.getByRole('gridcell', { name: '15' });
      await userEvent.click(dayButton.element());

      expect(onChange).toHaveBeenCalled();

      const lastDate = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as Date;

      expect(lastDate).toBeInstanceOf(Date);
      expect(lastDate.getDate()).toBe(15);
    });
  });

  describe('External value sync', () => {
    it('updates the displayed text when a date is picked from the calendar', async () => {
      // Drive the component through its onChange so we exercise the
      // value-prop sync path without needing rerender.
      function Harness() {
        const [value, setValue] = React.useState<Date | undefined>(() => new Date(1990, 5, 1));
        return <DateOfBirthInput value={value} onChange={setValue} />;
      }
      render(<Harness />);

      const input = page.getByPlaceholder('MM/DD/YYYY');

      expect((input.element() as HTMLInputElement).value).toBe('06/01/1990');

      const calendarButton = page.getByRole('button', { name: 'Open calendar' });
      await userEvent.click(calendarButton.element());

      const dayButton = page.getByRole('gridcell', { name: '20' });
      await userEvent.click(dayButton.element());

      expect((input.element() as HTMLInputElement).value).toBe('06/20/1990');
    });
  });

  describe('Disabled state', () => {
    it('disables both the input and the calendar trigger', () => {
      render(<DateOfBirthInput value={undefined} onChange={() => {}} disabled />);

      const input = page.getByPlaceholder('MM/DD/YYYY');
      const calendarButton = page.getByRole('button', { name: 'Open calendar' });

      expect((input.element() as HTMLInputElement).disabled).toBe(true);
      expect(calendarButton).toBeDisabled();
    });
  });
});
