import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { DateTextInput } from './date-text-input';

describe('DateTextInput', () => {
  describe('Accessibility contract', () => {
    it('renders a typeable text input, not a calendar-only button', async () => {
      // The typed field is the accessible entry path; a calendar-only control
      // forces keyboard/screen-reader users through a date grid.
      await render(<DateTextInput value={undefined} onChange={() => {}} data-testid="d" />);

      const el = page.getByTestId('d').element() as HTMLInputElement;

      expect(el.tagName).toBe('INPUT');
      expect(el.type).toBe('text');
    });

    it('advertises the expected format via the placeholder', async () => {
      await render(<DateTextInput value={undefined} onChange={() => {}} data-testid="d" />);

      expect((page.getByTestId('d').element() as HTMLInputElement).placeholder).toBe('MM/DD/YYYY');
    });

    it('exposes the calendar trigger with an accessible name', async () => {
      await render(<DateTextInput value={undefined} onChange={() => {}} />);

      expect(page.getByRole('button', { name: 'Open calendar' })).toBeInTheDocument();
    });

    it('places the calendar trigger after the input in DOM order', async () => {
      // "Icon on the right" must hold in the accessibility tree too, so tab
      // order reaches the field first.
      await render(<DateTextInput value={undefined} onChange={() => {}} data-testid="d" />);

      const input = page.getByTestId('d').element();
      const trigger = page.getByTestId('d-calendar-trigger').element();

      expect(input.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sets inputMode=numeric so mobile shows a number pad', async () => {
      await render(<DateTextInput value={undefined} onChange={() => {}} data-testid="d" />);

      expect(page.getByTestId('d').element().getAttribute('inputmode')).toBe('numeric');
    });
  });

  describe('Typed entry', () => {
    it('reports a valid typed date to the parent', async () => {
      const onChange = vi.fn();
      await render(<DateTextInput value={undefined} onChange={onChange} data-testid="d" />);

      await userEvent.type(page.getByTestId('d').element(), '03/14/1985');

      const last = onChange.mock.calls.at(-1)?.[0] as Date;

      expect(last).toBeInstanceOf(Date);
      expect(last.getFullYear()).toBe(1985);
      expect(last.getMonth()).toBe(2);
      expect(last.getDate()).toBe(14);
    });

    it('does not show an error mid-type', async () => {
      await render(<DateTextInput value={undefined} onChange={() => {}} data-testid="d" />);

      await userEvent.type(page.getByTestId('d').element(), '03/');

      expect(page.getByTestId('d-error').elements()).toHaveLength(0);
    });

    it('shows an error on blur for malformed input and never emits an invalid Date', async () => {
      const onChange = vi.fn();
      await render(<DateTextInput value={undefined} onChange={onChange} data-testid="d" />);

      await userEvent.type(page.getByTestId('d').element(), '13/40/2020');
      await userEvent.tab();

      expect(page.getByTestId('d-error')).toBeInTheDocument();
      expect(onChange.mock.calls.at(-1)?.[0]).not.toBeInstanceOf(Date);
    });

    it('rejects a rolled-over date rather than silently shifting it', async () => {
      const onChange = vi.fn();
      await render(<DateTextInput value={undefined} onChange={onChange} data-testid="d" />);

      // date-fns would turn 02/30/2020 into March 1.
      await userEvent.type(page.getByTestId('d').element(), '02/30/2020');
      await userEvent.tab();

      expect(page.getByTestId('d-error')).toBeInTheDocument();
      expect(onChange.mock.calls.at(-1)?.[0]).not.toBeInstanceOf(Date);
    });

    it('clears the value when emptied', async () => {
      const onChange = vi.fn();
      await render(<DateTextInput value={new Date(1990, 5, 15)} onChange={onChange} data-testid="d" />);

      await userEvent.clear(page.getByTestId('d').element());
      await userEvent.tab();

      expect(onChange.mock.calls.at(-1)?.[0]).toBeUndefined();
    });

    it('calls onBlur', async () => {
      const onBlur = vi.fn();
      await render(<DateTextInput value={undefined} onChange={() => {}} onBlur={onBlur} data-testid="d" />);

      await userEvent.click(page.getByTestId('d').element());
      await userEvent.tab();

      expect(onBlur).toHaveBeenCalled();
    });
  });

  describe('Calendar entry', () => {
    it('opens from the icon button and syncs the typed text on select', async () => {
      function Harness() {
        const [v, setV] = React.useState<Date | undefined>(() => new Date(2026, 5, 1));
        return <DateTextInput value={v} onChange={setV} data-testid="d" />;
      }
      await render(<Harness />);

      expect((page.getByTestId('d').element() as HTMLInputElement).value).toBe('06/01/2026');

      await userEvent.click(page.getByTestId('d-calendar-trigger').element());
      await userEvent.click(document.querySelector('[data-day="2026-06-20"] button')!);

      expect((page.getByTestId('d').element() as HTMLInputElement).value).toBe('06/20/2026');
    });

    it('disables days outside minDate/maxDate', async () => {
      await render(
        <DateTextInput
          value={new Date(2026, 5, 15)}
          onChange={() => {}}
          minDate={new Date(2026, 5, 10)}
          maxDate={new Date(2026, 5, 20)}
          data-testid="d"
        />,
      );

      await userEvent.click(page.getByTestId('d-calendar-trigger').element());

      expect(document.querySelector('[data-day="2026-06-09"] button')?.hasAttribute('disabled')).toBe(true);
      expect(document.querySelector('[data-day="2026-06-21"] button')?.hasAttribute('disabled')).toBe(true);
      expect(document.querySelector('[data-day="2026-06-15"] button')?.hasAttribute('disabled')).toBe(false);
    });

    it('offers month and year dropdowns', async () => {
      await render(<DateTextInput value={new Date(2026, 5, 15)} onChange={() => {}} data-testid="d" />);

      await userEvent.click(page.getByTestId('d-calendar-trigger').element());

      expect(page.getByRole('combobox').elements().length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Disabled state', () => {
    it('disables both the input and the calendar trigger', async () => {
      await render(<DateTextInput value={undefined} onChange={() => {}} disabled data-testid="d" />);

      expect(page.getByTestId('d')).toBeDisabled();
      expect(page.getByTestId('d-calendar-trigger')).toBeDisabled();
    });
  });
});
