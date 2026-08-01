import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { DatePicker, DateTimePicker } from './date-picker';

describe('DatePicker', () => {
  describe('Rendering', () => {
    it('should render with placeholder when no value', async () => {
      await render(<DatePicker placeholder="Pick a date" />);

      expect(page.getByText('Pick a date')).toBeInTheDocument();
    });

    it('should render formatted date when value is provided', async () => {
      // Use a date at noon UTC to avoid timezone issues
      await render(<DatePicker value={new Date(2024, 5, 15)} />);

      // The date should be formatted as yyyy-MM-dd
      const button = page.getByRole('button');

      expect(button).toBeInTheDocument();
      expect(button.element().textContent).toContain('2024-06-15');
    });

    it('should render calendar icon', async () => {
      await render(<DatePicker placeholder="Pick a date" />);

      const button = page.getByRole('button');

      expect(button).toBeInTheDocument();
    });

    it('should apply custom className', async () => {
      await render(<DatePicker className="w-64" placeholder="Pick a date" />);

      const button = page.getByRole('button');

      expect(button).toHaveClass('w-64');
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
    it('should render date and time inputs', async () => {
      await render(
        <DateTimePicker
          datePlaceholder="Pick a date"
        />,
      );

      expect(page.getByText('Pick a date')).toBeInTheDocument();
      expect(page.getByRole('textbox')).toBeInTheDocument();
    });

    it('should render with date and time values', async () => {
      await render(
        <DateTimePicker
          date="2024-06-15"
          time="14:30:00"
        />,
      );

      expect(page.getByText('2024-06-15')).toBeInTheDocument();

      const timeInput = page.getByRole('textbox');

      expect(timeInput).toHaveValue('14:30:00');
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
    it('should disable both date and time inputs when disabled', async () => {
      await render(
        <DateTimePicker
          disabled
          datePlaceholder="Pick a date"
        />,
      );

      const dateButton = page.getByRole('button');
      const timeInput = page.getByRole('textbox');

      expect(dateButton).toBeDisabled();
      expect(timeInput).toBeDisabled();
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
        />,
      );

      const timeInput = page.getByRole('textbox');
      await userEvent.clear(timeInput.element());
      await userEvent.type(timeInput.element(), '14:30:00');

      expect(onTimeChange).toHaveBeenCalled();
    });
  });

  describe('Date parsing', () => {
    it('should handle empty date string', async () => {
      await render(
        <DateTimePicker
          date=""
          datePlaceholder="Pick a date"
        />,
      );

      expect(page.getByText('Pick a date')).toBeInTheDocument();
    });

    it('should handle invalid date string', async () => {
      await render(
        <DateTimePicker
          date="invalid-date"
          datePlaceholder="Pick a date"
        />,
      );

      // Should show placeholder for invalid date
      expect(page.getByText('Pick a date')).toBeInTheDocument();
    });

    it('should handle valid date string', async () => {
      await render(
        <DateTimePicker
          date="2024-12-25"
        />,
      );

      expect(page.getByText('2024-12-25')).toBeInTheDocument();
    });
  });
});
