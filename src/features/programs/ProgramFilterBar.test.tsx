import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { ProgramFilterBar } from './ProgramFilterBar';

describe('ProgramFilterBar', () => {
  it('renders search input', async () => {
    const onFiltersChange = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramFilterBar onFiltersChangeAction={onFiltersChange} />
      </I18nWrapper>,
    );

    const searchInput = page.getByPlaceholder(/Search programs/i);

    expect(searchInput).toBeInTheDocument();
  });

  it('renders status filter dropdown', async () => {
    const onFiltersChange = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramFilterBar onFiltersChangeAction={onFiltersChange} />
      </I18nWrapper>,
    );

    const statusSelect = page.getByRole('combobox');

    expect(statusSelect).toBeInTheDocument();
  });

  it('calls onFiltersChangeAction when search input changes', async () => {
    const onFiltersChange = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramFilterBar onFiltersChangeAction={onFiltersChange} />
      </I18nWrapper>,
    );

    const searchInput = page.getByPlaceholder(/Search programs/i);
    await userEvent.type(searchInput, 'test');

    expect(onFiltersChange).toHaveBeenCalled();
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      search: 'test',
      status: 'all',
    });
  });

  it('calls onFiltersChangeAction when status filter changes', async () => {
    const onFiltersChange = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramFilterBar onFiltersChangeAction={onFiltersChange} />
      </I18nWrapper>,
    );

    const statusSelect = page.getByRole('combobox');
    await userEvent.click(statusSelect);

    const activeOption = page.getByRole('option', { name: 'Active', exact: true });
    await userEvent.click(activeOption);

    expect(onFiltersChange).toHaveBeenLastCalledWith({
      search: '',
      status: 'Active',
    });
  });

  it('displays all status options when dropdown is opened', async () => {
    const onFiltersChange = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramFilterBar onFiltersChangeAction={onFiltersChange} />
      </I18nWrapper>,
    );

    const statusSelect = page.getByRole('combobox');
    await userEvent.click(statusSelect);

    const allStatusesOption = page.getByRole('option', { name: /All Statuses/i });
    const activeOption = page.getByRole('option', { name: 'Active', exact: true });
    const inactiveOption = page.getByRole('option', { name: 'Inactive', exact: true });

    expect(allStatusesOption).toBeInTheDocument();
    expect(activeOption).toBeInTheDocument();
    expect(inactiveOption).toBeInTheDocument();
  });

  it('updates search value when typing', async () => {
    const onFiltersChange = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramFilterBar onFiltersChangeAction={onFiltersChange} />
      </I18nWrapper>,
    );

    const searchInput = page.getByPlaceholder(/Search programs/i);
    await userEvent.type(searchInput, 'BJJ');

    expect(searchInput).toHaveValue('BJJ');
  });

  it('selects inactive status from dropdown', async () => {
    const onFiltersChange = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramFilterBar onFiltersChangeAction={onFiltersChange} />
      </I18nWrapper>,
    );

    const statusSelect = page.getByRole('combobox');
    await userEvent.click(statusSelect);

    const inactiveOption = page.getByRole('option', { name: 'Inactive', exact: true });
    await userEvent.click(inactiveOption);

    expect(onFiltersChange).toHaveBeenLastCalledWith({
      search: '',
      status: 'Inactive',
    });
  });

  it('maintains search value when status changes', async () => {
    const onFiltersChange = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramFilterBar onFiltersChangeAction={onFiltersChange} />
      </I18nWrapper>,
    );

    const searchInput = page.getByPlaceholder(/Search programs/i);
    await userEvent.type(searchInput, 'test');

    const statusSelect = page.getByRole('combobox');
    await userEvent.click(statusSelect);

    const activeOption = page.getByRole('option', { name: 'Active', exact: true });
    await userEvent.click(activeOption);

    expect(onFiltersChange).toHaveBeenLastCalledWith({
      search: 'test',
      status: 'Active',
    });
  });
});
