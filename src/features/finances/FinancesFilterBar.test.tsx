import type { TransactionStatus } from './FinancesTable';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { FinancesFilterBar } from './FinancesFilterBar';

const ALL_STATUSES: TransactionStatus[] = ['paid', 'pending', 'declined', 'refunded', 'processing'];

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('FinancesFilterBar', () => {
  describe('Search Input', () => {
    it('should render search input', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={[]}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');

      expect(searchInput).toBeInTheDocument();
    });

    it('should call onFiltersChangeAction when typing in search', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={[]}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'test');

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        search: 'test',
        origin: 'all',
        status: 'all',
      });
    });

    it('should have search icon', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={[]}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const searchInput = page.getByTestId('finances-search-input');

      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('Status Filter', () => {
    it('should render status filter dropdown', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={[]}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const statusFilter = page.getByTestId('finances-status-filter');

      expect(statusFilter).toBeInTheDocument();
    });

    it('should show All Statuses option', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={[]}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const statusFilter = page.getByTestId('finances-status-filter');
      await statusFilter.click();

      expect(page.getByRole('option', { name: 'all_statuses_filter' })).toBeInTheDocument();
    });

    it('should show status options', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={[]}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const statusFilter = page.getByTestId('finances-status-filter');
      await statusFilter.click();

      expect(page.getByRole('option', { name: 'status_paid' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_pending' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_declined' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_refunded' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_processing' })).toBeInTheDocument();
    });

    it('should call onFiltersChangeAction when selecting status', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={[]}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const statusFilter = page.getByTestId('finances-status-filter');
      await statusFilter.click();

      const paidOption = page.getByRole('option', { name: 'status_paid' });
      await paidOption.click();

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        search: '',
        origin: 'all',
        status: 'paid',
      });
    });
  });

  describe('Origin Filter', () => {
    it('should render origin filter dropdown', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={['Membership Dues', 'Merchandise']}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const originFilter = page.getByTestId('finances-origin-filter');

      expect(originFilter).toBeInTheDocument();
    });

    it('should show All Origins option', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={['Membership Dues']}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();

      expect(page.getByRole('option', { name: 'all_origins_filter' })).toBeInTheDocument();
    });

    it('should show available origin options', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={['Membership Dues', 'Merchandise', 'Private Lesson']}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();

      expect(page.getByRole('option', { name: 'Membership Dues' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'Merchandise' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'Private Lesson' })).toBeInTheDocument();
    });

    it('should call onFiltersChangeAction when selecting origin', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={['Membership Dues', 'Merchandise']}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();

      const merchandiseOption = page.getByRole('option', { name: 'Merchandise' });
      await merchandiseOption.click();

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        search: '',
        origin: 'Merchandise',
        status: 'all',
      });
    });
  });

  describe('Combined Filters', () => {
    it('should maintain search when changing origin', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={['Membership Dues', 'Merchandise']}
          availableStatuses={ALL_STATUSES}
        />,
      );

      // Type in search
      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'test');

      // Change origin
      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();
      const merchandiseOption = page.getByRole('option', { name: 'Merchandise' });
      await merchandiseOption.click();

      expect(mockOnFiltersChange).toHaveBeenLastCalledWith({
        search: 'test',
        origin: 'Merchandise',
        status: 'all',
      });
    });

    it('should maintain origin when typing in search', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={['Membership Dues', 'Merchandise']}
          availableStatuses={ALL_STATUSES}
        />,
      );

      // Change origin first
      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();
      const merchandiseOption = page.getByRole('option', { name: 'Merchandise' });
      await merchandiseOption.click();

      // Then type in search
      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'test');

      expect(mockOnFiltersChange).toHaveBeenLastCalledWith({
        search: 'test',
        origin: 'Merchandise',
        status: 'all',
      });
    });

    it('should maintain all filters when changing status', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={['Membership Dues', 'Merchandise']}
          availableStatuses={ALL_STATUSES}
        />,
      );

      // Type in search
      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'test');

      // Change origin
      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();
      const merchandiseOption = page.getByRole('option', { name: 'Merchandise' });
      await merchandiseOption.click();

      // Change status
      const statusFilter = page.getByTestId('finances-status-filter');
      await statusFilter.click();
      const paidOption = page.getByRole('option', { name: 'status_paid' });
      await paidOption.click();

      expect(mockOnFiltersChange).toHaveBeenLastCalledWith({
        search: 'test',
        origin: 'Merchandise',
        status: 'paid',
      });
    });
  });

  describe('Empty State', () => {
    it('should render with empty available origins', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={[]}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const originFilter = page.getByTestId('finances-origin-filter');

      expect(originFilter).toBeInTheDocument();
    });

    it('should only show All Origins when no origins available', async () => {
      const mockOnFiltersChange = vi.fn();

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={[]}
          availableStatuses={ALL_STATUSES}
        />,
      );

      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();

      expect(page.getByRole('option', { name: 'all_origins_filter' })).toBeInTheDocument();
    });
  });

  describe('Dynamic Filter Options', () => {
    it('should only show available statuses in dropdown', async () => {
      const mockOnFiltersChange = vi.fn();
      const limitedStatuses: TransactionStatus[] = ['paid', 'pending'];

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={[]}
          availableStatuses={limitedStatuses}
        />,
      );

      const statusFilter = page.getByTestId('finances-status-filter');
      await statusFilter.click();

      expect(page.getByRole('option', { name: 'status_paid' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_pending' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_declined' }).elements()).toHaveLength(0);
      expect(page.getByRole('option', { name: 'status_refunded' }).elements()).toHaveLength(0);
      expect(page.getByRole('option', { name: 'status_processing' }).elements()).toHaveLength(0);
    });

    it('should show All Statuses even when limited statuses available', async () => {
      const mockOnFiltersChange = vi.fn();
      const limitedStatuses: TransactionStatus[] = ['paid'];

      await render(
        <FinancesFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableOrigins={[]}
          availableStatuses={limitedStatuses}
        />,
      );

      const statusFilter = page.getByTestId('finances-status-filter');
      await statusFilter.click();

      expect(page.getByRole('option', { name: 'all_statuses_filter' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_paid' })).toBeInTheDocument();
    });
  });
});
