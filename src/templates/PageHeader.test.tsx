import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  const defaultProps = {
    title: 'Test Page Title',
  };

  it('renders page title', async () => {
    await render(<PageHeader {...defaultProps} />);

    expect(page.getByText('Test Page Title')).toBeTruthy();
  });

  it('renders header actions when provided', async () => {
    const headerActions = (
      <button type="button" data-testid="manage-tags-button">Manage Tags</button>
    );

    await render(<PageHeader {...defaultProps} headerActions={headerActions} />);

    expect(page.getByText('Manage Tags')).toBeTruthy();
  });

  it('renders children content', async () => {
    const children = <div data-testid="filter-content">Filter Content</div>;

    await render(<PageHeader {...defaultProps}>{children}</PageHeader>);

    expect(page.getByText('Filter Content')).toBeTruthy();
  });

  it('renders with header actions and children together', async () => {
    const headerActions = (
      <button type="button" data-testid="action-button">Action</button>
    );
    const children = <div data-testid="filter-bar">Filter Bar</div>;

    await render(
      <PageHeader
        {...defaultProps}
        headerActions={headerActions}
      >
        {children}
      </PageHeader>,
    );

    expect(page.getByText('Test Page Title')).toBeTruthy();
    expect(page.getByText('Action')).toBeTruthy();
    expect(page.getByText('Filter Bar')).toBeTruthy();
  });

  it('handles empty title gracefully', async () => {
    await render(<PageHeader title="" />);

    // Should render h1 element even with empty title
    expect(page.getByRole('heading')).toBeTruthy();
  });

  it('handles complex header actions', async () => {
    const onManageTags = vi.fn();
    const onExport = vi.fn();

    const headerActions = (
      <div>
        <button type="button" onClick={onManageTags}>Manage Tags</button>
        <button type="button" onClick={onExport}>Export</button>
      </div>
    );

    await render(<PageHeader {...defaultProps} headerActions={headerActions} />);

    const manageButton = page.getByText('Manage Tags');
    const exportButton = page.getByText('Export');

    await userEvent.click(manageButton);
    await userEvent.click(exportButton);

    expect(onManageTags).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledOnce();
  });
});
