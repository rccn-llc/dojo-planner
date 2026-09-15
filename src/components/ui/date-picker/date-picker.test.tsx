import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { DatePicker, DateTimePicker } from './date-picker';

describe('DatePicker', () => {
  describe('Rendering', () => {
    it('should show the MM/DD/YYYY format hint as the placeholder', async () => {
      // The typed format must be discoverable — it is the accessible entry
      // path, so the field advertises it rather than saying "Pick a date".
      await render(<DatePicker data-testid="dp" />);

      expect((page.getByTestId('dp').element() as HTMLInputElement).placeholder).toBe('MM/DD/YYYY');
    });

    it('should render the value as typed text, not button text', async () => {
      await render(<DatePicker value={new Date(2024, 5, 15)} data-testid="dp" />);

      expect((page.getByTestId('dp').element() as HTMLInputElement).value).toBe('06/15/2024');
    });

    it('should be a text input the user can type into', async () => {
      await render(<DatePicker data-testid="dp" />);

      const el = page.getByTestId('dp').element() as HTMLInputElement;

      expect(el.tagName).toBe('INPUT');
      expect(el.type).toBe('text');
    });

    it('should render calendar icon', async () => {
      await render(<DatePicker placeholder="Pick a date" />);

      const button = page.getByRole('button');

      expect(button).toBeInTheDocument();
    });

    it('should apply custom className to the field wrapper', async () => {
      await render(<DatePicker className="w-64" data-testid="dp" />);

      // className now lands on the wrapper holding input + calendar button.
      const wrapper = page.getByTestId('dp').element().closest('.w-64');

      expect(wrapper).not.toBeNull();
    });

    it('should apply data-testid', async () => {
      await render(<DatePicker data-testid="test-date-picker" placeholder="Pick a date" />);

      expect(page.getByTestId('test-date-picker')).toBeInTheDocument();
    });
  });

  describe('Disabled state', () => {
    it('should render as disabled when disabled prop is true', async () => {
      await render(<DatePicker disabled placeholder="Pick a date" />);

      const button = page.getByRole('button');

      expect(button).toBeDisabled();
    });

    it('should not open popover when disabled', async () => {
      await render(<DatePicker disabled placeholder="Pick a date" />);

      const button = page.getByRole('button');

      // Verify button is disabled - this prevents clicking
      expect(button).toBeDisabled();

      // Calendar should not appear
      expect(page.getByRole('grid').elements()).toHaveLength(0);
    });
  });

  describe('Interaction', () => {
    it('should open calendar popover when clicked', async () => {
      await render(<DatePicker placeholder="Pick a date" />);

      const button = page.getByRole('button');
      await userEvent.click(button.element());

      // Calendar grid should be visible
      expect(page.getByRole('grid')).toBeInTheDocument();
    });

    it('should close calendar after selecting a date', async () => {
      const onChange = vi.fn();
      await render(<DatePicker onChange={onChange} placeholder="Pick a date" />);

      const button = page.getByRole('button');
      await userEvent.click(button.element());

      // Click on a date cell (day 15)
      const dayButton = page.getByRole('gridcell', { name: '15' });
      await userEvent.click(dayButton.element());

      // Calendar should be closed
      expect(page.getByRole('grid').elements()).toHaveLength(0);
    });

    it('should call onChange when date is selected', async () => {
      const onChange = vi.fn();
      await render(<DatePicker onChange={onChange} placeholder="Pick a date" />);

      const button = page.getByRole('button');
      await userEvent.click(button.element());

      // Click on a date cell
      const dayButton = page.getByRole('gridcell', { name: '15' });
      await userEvent.click(dayButton.element());

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(expect.any(Date));
    });
  });
});

describe('DateTimePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render a typed date field and a time input', async () => {
      await render(
        <DateTimePicker data-testid-date="dtp-date" data-testid-time="dtp-time" />,
      );

      const dateInput = page.getByTestId('dtp-date').element() as HTMLInputElement;

      // The date half is a typed text field, not a button.
      expect(dateInput.tagName).toBe('INPUT');
      expect(dateInput.placeholder).toBe('MM/DD/YYYY');
      expect(page.getByTestId('dtp-time')).toBeInTheDocument();
    });

    it('should render with date and time values', async () => {
      await render(
        <DateTimePicker
          date="2024-06-15"
          time="14:30:00"
          data-testid-date="dtp-date"
          data-testid-time="dtp-time"
        />,
      );

      // State stays yyyy-MM-dd; the USER sees MM/DD/YYYY.
      expect((page.getByTestId('dtp-date').element() as HTMLInputElement).value).toBe('06/15/2024');
      expect(page.getByTestId('dtp-time')).toHaveValue('14:30:00');
    });

    it('should render labels when provided', async () => {
      await render(
        <DateTimePicker
          dateLabel="Start Date"
          timeLabel="Start Time"
        />,
      );

      expect(page.getByText('Start Date')).toBeInTheDocument();
      expect(page.getByText('Start Time')).toBeInTheDocument();
    });

    it('should apply custom className', async () => {
      await render(
        <DateTimePicker className="gap-8" data-testid-date="date-btn" />,
      );

      // The wrapper should have the gap-8 class
      const dateBtn = page.getByTestId('date-btn');

      // The parent element should have the custom class
      expect(dateBtn).toBeInTheDocument();
    });

    it('should apply data-testid attributes', async () => {
      await render(
        <DateTimePicker
          data-testid-date="date-input"
          data-testid-time="time-input"
        />,
      );

      expect(page.getByTestId('date-input')).toBeInTheDocument();
      expect(page.getByTestId('time-input')).toBeInTheDocument();
    });
  });

  describe('Disabled state', () => {
    it('should disable the date field, its calendar trigger and the time input', async () => {
      await render(
        <DateTimePicker disabled data-testid-date="dtp-date" data-testid-time="dtp-time" />,
      );

      expect(page.getByTestId('dtp-date')).toBeDisabled();
      expect(page.getByTestId('dtp-date-calendar-trigger')).toBeDisabled();
      expect(page.getByTestId('dtp-time')).toBeDisabled();
    });
  });

  describe('Interaction', () => {
    it('should open calendar when date button is clicked', async () => {
      await render(
        <DateTimePicker
          datePlaceholder="Pick a date"
        />,
      );

      const dateButton = page.getByRole('button');
      await userEvent.click(dateButton.element());

      expect(page.getByRole('grid')).toBeInTheDocument();
    });

    it('should call onDateChange when date is selected', async () => {
      const onDateChange = vi.fn();
      await render(
        <DateTimePicker
          onDateChange={onDateChange}
          datePlaceholder="Pick a date"
        />,
      );

      const dateButton = page.getByRole('button');
      await userEvent.click(dateButton.element());

      const dayButton = page.getByRole('gridcell', { name: '15' });
      await userEvent.click(dayButton.element());

      expect(onDateChange).toHaveBeenCalledTimes(1);
      expect(onDateChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-15$/));
    });

    it('should handle selecting a different date', async () => {
      const onDateChange = vi.fn();
      await render(
        <DateTimePicker
          date=""
          onDateChange={onDateChange}
          datePlaceholder="Pick a date"
        />,
      );

      const dateButton = page.getByRole('button');
      await userEvent.click(dateButton.element());

      // Click on a date in the current month
      const dayButton = page.getByRole('gridcell', { name: '10' });
      await userEvent.click(dayButton.element());

      expect(onDateChange).toHaveBeenCalled();
    });

    it('should call onTimeChange when time is changed', async () => {
      const onTimeChange = vi.fn();
      await render(
        <DateTimePicker
          time="12:00:00"
          onTimeChange={onTimeChange}
          data-testid-time="dtp-time"
        />,
      );

      const timeInput = page.getByTestId('dtp-time');
      await userEvent.clear(timeInput.element());
      await userEvent.type(timeInput.element(), '14:30:00');

      expect(onTimeChange).toHaveBeenCalled();
    });
  });

  describe('Date parsing', () => {
    it('should handle empty date string', async () => {
      await render(<DateTimePicker date="" data-testid-date="dtp-date" />);

      expect((page.getByTestId('dtp-date').element() as HTMLInputElement).value).toBe('');
    });

    it('should handle invalid date string', async () => {
      await render(<DateTimePicker date="invalid-date" data-testid-date="dtp-date" />);

      // An unparseable incoming value renders blank rather than echoing junk.
      expect((page.getByTestId('dtp-date').element() as HTMLInputElement).value).toBe('');
    });

    it('should handle valid date string', async () => {
      await render(<DateTimePicker date="2024-12-25" data-testid-date="dtp-date" />);

      // yyyy-MM-dd in, MM/DD/YYYY shown to the user.
      expect((page.getByTestId('dtp-date').element() as HTMLInputElement).value).toBe('12/25/2024');
    });
  });
});

describe('DatePicker date bounds', () => {
  it('disables days before minDate', async () => {
    await render(
      <DatePicker
        value={new Date(2026, 5, 15)}
        minDate={new Date(2026, 5, 10)}
        data-testid="bounded"
      />,
    );

    await userEvent.click(page.getByTestId('bounded-calendar-trigger').element());

    // The 9th is before the bound; the 11th is inside it.
    const before = document.querySelector('[data-day="2026-06-09"] button');
    const inside = document.querySelector('[data-day="2026-06-11"] button');

    expect(before?.hasAttribute('disabled')).toBe(true);
    expect(inside?.hasAttribute('disabled')).toBe(false);
  });

  it('disables days after maxDate', async () => {
    await render(
      <DatePicker
        value={new Date(2026, 5, 15)}
        maxDate={new Date(2026, 5, 20)}
        data-testid="bounded"
      />,
    );

    await userEvent.click(page.getByTestId('bounded-calendar-trigger').element());

    const after = document.querySelector('[data-day="2026-06-21"] button');
    const inside = document.querySelector('[data-day="2026-06-19"] button');

    expect(after?.hasAttribute('disabled')).toBe(true);
    expect(inside?.hasAttribute('disabled')).toBe(false);
  });

  it('leaves every day selectable when unbounded', async () => {
    await render(
      <DatePicker value={new Date(2026, 5, 15)} data-testid="unbounded" />,
    );

    await userEvent.click(page.getByTestId('unbounded-calendar-trigger').element());

    const first = document.querySelector('[data-day="2026-06-01"] button');

    expect(first?.hasAttribute('disabled')).toBe(false);
  });

  it('offers month and year dropdowns for fast navigation', async () => {
    // Regression: the default `label` caption showed only prev/next arrows, so
    // a date years out took dozens of clicks.
    await render(
      <DatePicker value={new Date(2026, 5, 15)} data-testid="nav" />,
    );

    await userEvent.click(page.getByTestId('nav-calendar-trigger').element());

    expect(page.getByRole('combobox').elements().length).toBeGreaterThanOrEqual(2);
  });
});

describe('DateTimePicker date bounds', () => {
  it('disables days outside the yyyy-MM-dd bounds', async () => {
    await render(
      <DateTimePicker
        date="2026-06-15"
        minDate="2026-06-10"
        maxDate="2026-06-20"
        data-testid-date="dtp"
      />,
    );

    await userEvent.click(page.getByTestId('dtp-calendar-trigger').element());

    const below = document.querySelector('[data-day="2026-06-09"] button');
    const above = document.querySelector('[data-day="2026-06-21"] button');
    const inside = document.querySelector('[data-day="2026-06-15"] button');

    expect(below?.hasAttribute('disabled')).toBe(true);
    expect(above?.hasAttribute('disabled')).toBe(true);
    expect(inside?.hasAttribute('disabled')).toBe(false);
  });

  it('ignores a malformed bound instead of breaking the picker', async () => {
    await render(
      <DateTimePicker
        date="2026-06-15"
        minDate="not-a-date"
        data-testid-date="dtp"
      />,
    );

    await userEvent.click(page.getByTestId('dtp-calendar-trigger').element());

    const day = document.querySelector('[data-day="2026-06-03"] button');

    expect(day?.hasAttribute('disabled')).toBe(false);
  });
});
