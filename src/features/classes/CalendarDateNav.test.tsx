import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { CalendarDateNav } from './CalendarDateNav';

const translationKeys: Record<string, string> = {
  open_picker_aria: 'Open date picker',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translationKeys[key] ?? key,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CalendarDateNav', () => {
  const defaultProps = {
    currentDate: new Date('2026-03-15T00:00:00Z'),
    display: 'March 15 - 21',
  };

  it('renders the display heading inside a popover trigger', async () => {
    await render(
      <CalendarDateNav
        {...defaultProps}
        onDateChangeAction={vi.fn()}
      />,
    );

    const trigger = page.getByRole('button', { name: 'Open date picker' });

    expect(trigger).toBeTruthy();
    expect(trigger.element().textContent).toContain('March 15 - 21');
  });

  it('opens the popover Calendar when the heading button is clicked', async () => {
    await render(
      <CalendarDateNav
        {...defaultProps}
        onDateChangeAction={vi.fn()}
      />,
    );

    await userEvent.click(page.getByRole('button', { name: 'Open date picker' }));

    // The Shadcn Calendar renders a grid of dates. After opening, day cells
    // should be present.
    const dayCells = document.querySelectorAll('[role="gridcell"]');

    expect(dayCells.length).toBeGreaterThan(0);
  });

  it('calls onDateChangeAction when a date is selected from the popover', async () => {
    const onChange = vi.fn();
    await render(
      <CalendarDateNav
        {...defaultProps}
        onDateChangeAction={onChange}
      />,
    );

    await userEvent.click(page.getByRole('button', { name: 'Open date picker' }));

    // Pick the first available day in the grid (a date in the current month).
    const firstSelectableDay = Array.from(document.querySelectorAll('[role="gridcell"] button'))
      .find(btn => !(btn as HTMLButtonElement).disabled) as HTMLButtonElement | undefined;

    expect(firstSelectableDay).toBeDefined();

    if (firstSelectableDay) {
      await userEvent.click(firstSelectableDay);
    }

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toBeInstanceOf(Date);
  });

  it('closes the popover after picking a date', async () => {
    await render(
      <CalendarDateNav
        {...defaultProps}
        onDateChangeAction={vi.fn()}
      />,
    );

    await userEvent.click(page.getByRole('button', { name: 'Open date picker' }));

    const firstSelectableDay = Array.from(document.querySelectorAll('[role="gridcell"] button'))
      .find(btn => !(btn as HTMLButtonElement).disabled) as HTMLButtonElement | undefined;
    if (firstSelectableDay) {
      await userEvent.click(firstSelectableDay);
    }

    // After selection, the calendar grid is removed from the DOM (popover closes).
    await new Promise(r => setTimeout(r, 100));

    expect(document.querySelectorAll('[role="gridcell"]').length).toBe(0);
  });
});
