import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { SortableHeader } from './sortable-header';

describe('SortableHeader', () => {
  it('renders its label', async () => {
    await render(
      <SortableHeader field="name" activeField={null} direction="asc" onSort={() => {}}>
        Name
      </SortableHeader>,
    );

    expect(page.getByRole('button', { name: 'Name' })).toBeInTheDocument();
  });

  it('calls onSort with its own field when clicked', async () => {
    const onSort = vi.fn();
    await render(
      <SortableHeader field="email" activeField={null} direction="asc" onSort={onSort}>
        Email
      </SortableHeader>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Email' }).element());

    expect(onSort).toHaveBeenCalledWith('email');
  });

  it('shows no icon when it is not the active sort field', async () => {
    await render(
      <SortableHeader field="name" activeField="email" direction="asc" onSort={() => {}} data-testid="h">
        Name
      </SortableHeader>,
    );

    expect(page.getByTestId('h').element().querySelector('svg')).toBeNull();
  });

  it('shows an icon when it is the active sort field', async () => {
    await render(
      <SortableHeader field="name" activeField="name" direction="asc" onSort={() => {}} data-testid="h">
        Name
      </SortableHeader>,
    );

    expect(page.getByTestId('h').element().querySelector('svg')).not.toBeNull();
  });

  it('shows different icons for ascending and descending', async () => {
    await render(
      <>
        <SortableHeader field="a" activeField="a" direction="asc" onSort={() => {}} data-testid="asc">A</SortableHeader>
        <SortableHeader field="b" activeField="b" direction="desc" onSort={() => {}} data-testid="desc">B</SortableHeader>
      </>,
    );

    const ascIcon = page.getByTestId('asc').element().querySelector('svg')?.outerHTML;
    const descIcon = page.getByTestId('desc').element().querySelector('svg')?.outerHTML;

    expect(ascIcon).not.toBe(descIcon);
  });

  it('uses a different icon set for numeric columns', async () => {
    // Dates and amounts should not get an A–Z glyph, which would misdescribe
    // the ordering. Some tables already made this distinction by hand.
    await render(
      <>
        <SortableHeader field="a" activeField="a" direction="asc" onSort={() => {}} sortIcons="alpha" data-testid="alpha">A</SortableHeader>
        <SortableHeader field="b" activeField="b" direction="asc" onSort={() => {}} sortIcons="numeric" data-testid="numeric">B</SortableHeader>
      </>,
    );

    const alphaIcon = page.getByTestId('alpha').element().querySelector('svg')?.outerHTML;
    const numericIcon = page.getByTestId('numeric').element().querySelector('svg')?.outerHTML;

    expect(alphaIcon).not.toBe(numericIcon);
  });

  it('is a real button, so it is keyboard reachable', async () => {
    // The hand-rolled copies this replaces had no focus ring; being a real
    // <button type="button"> keeps it tabbable and Enter/Space activatable.
    const onSort = vi.fn();
    await render(
      <SortableHeader field="name" activeField={null} direction="asc" onSort={onSort} data-testid="h">
        Name
      </SortableHeader>,
    );

    const el = page.getByTestId('h').element() as HTMLButtonElement;

    expect(el.tagName).toBe('BUTTON');
    expect(el.type).toBe('button');

    el.focus();
    await userEvent.keyboard('{Enter}');

    expect(onSort).toHaveBeenCalledWith('name');
  });
});
