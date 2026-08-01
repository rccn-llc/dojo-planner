import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { CouponFilterBar } from './CouponFilterBar';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('CouponFilterBar', () => {
  const mockOnFiltersChange = vi.fn();
  const mockAvailableStatuses = ['Active', 'Expired', 'Inactive'];
  const mockAvailableTypes = ['Percentage', 'Fixed Amount', 'Free Trial'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render search input and filter dropdowns', async () => {
      await render(
        <CouponFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableStatuses={mockAvailableStatuses}
          availableTypes={mockAvailableTypes}
        />,
      );

      await expect.element(page.getByTestId('coupon-search-input')).toBeVisible();
      await expect.element(page.getByTestId('coupon-status-filter')).toBeVisible();
      await expect.element(page.getByTestId('coupon-type-filter')).toBeVisible();
    });

    it('should show placeholder text in search input', async () => {
      await render(
        <CouponFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableStatuses={mockAvailableStatuses}
          availableTypes={mockAvailableTypes}
        />,
      );

      const searchInput = page.getByTestId('coupon-search-input');

      await expect.element(searchInput).toHaveAttribute('placeholder', 'search_placeholder');
    });
  });

  describe('Search functionality', () => {
    it('should call onFiltersChangeAction when search input changes', async () => {
      await render(
        <CouponFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableStatuses={mockAvailableStatuses}
          availableTypes={mockAvailableTypes}
        />,
      );

      const searchInput = page.getByTestId('coupon-search-input');
      await userEvent.type(searchInput, 'SUMMER');

      expect(mockOnFiltersChange).toHaveBeenCalled();

      const lastCall = mockOnFiltersChange.mock.calls.at(-1);

      expect(lastCall?.[0].search).toBe('SUMMER');
    });

    it('should update filter with each keystroke', async () => {
      await render(
        <CouponFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableStatuses={mockAvailableStatuses}
          availableTypes={mockAvailableTypes}
        />,
      );

      const searchInput = page.getByTestId('coupon-search-input');
      await userEvent.type(searchInput, 'abc');

      expect(mockOnFiltersChange).toHaveBeenCalledTimes(3);
    });

    it('should include all filter values when search changes', async () => {
      await render(
        <CouponFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableStatuses={mockAvailableStatuses}
          availableTypes={mockAvailableTypes}
        />,
      );

      const searchInput = page.getByTestId('coupon-search-input');
      await userEvent.type(searchInput, 'TEST');

      const lastCall = mockOnFiltersChange.mock.calls.at(-1);

      expect(lastCall?.[0]).toEqual({
        search: 'TEST',
        status: 'all',
        type: 'all',
      });
    });
  });

  describe('Status filter functionality', () => {
    it('should call onFiltersChangeAction when status is changed', async () => {
      await render(
        <CouponFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableStatuses={mockAvailableStatuses}
          availableTypes={mockAvailableTypes}
        />,
      );

      const statusFilter = page.getByTestId('coupon-status-filter');
      await userEvent.click(statusFilter);

      const expiredOption = page.getByRole('option', { name: 'Expired' });
      await userEvent.click(expiredOption);

      const lastCall = mockOnFiltersChange.mock.calls.at(-1);

      expect(lastCall?.[0].status).toBe('Expired');
    });
  });

  describe('Type filter functionality', () => {
    it('should call onFiltersChangeAction when type is changed', async () => {
      await render(
        <CouponFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableStatuses={mockAvailableStatuses}
          availableTypes={mockAvailableTypes}
        />,
      );

      const typeFilter = page.getByTestId('coupon-type-filter');
      await userEvent.click(typeFilter);

      const percentageOption = page.getByRole('option', { name: 'Percentage' });
      await userEvent.click(percentageOption);

      const lastCall = mockOnFiltersChange.mock.calls.at(-1);

      expect(lastCall?.[0].type).toBe('Percentage');
    });
  });

  describe('Filter combinations', () => {
    it('should preserve other filter values when one filter changes', async () => {
      await render(
        <CouponFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableStatuses={mockAvailableStatuses}
          availableTypes={mockAvailableTypes}
        />,
      );

      // Set search first
      const searchInput = page.getByTestId('coupon-search-input');
      await userEvent.type(searchInput, 'TEST');

      // Then change status
      const statusFilter = page.getByTestId('coupon-status-filter');
      await userEvent.click(statusFilter);

      const expiredOption = page.getByRole('option', { name: 'Expired' });
      await userEvent.click(expiredOption);

      const lastCall = mockOnFiltersChange.mock.calls.at(-1);

      expect(lastCall?.[0]).toEqual({
        search: 'TEST',
        status: 'Expired',
        type: 'all',
      });
    });
  });

  describe('Empty available options', () => {
    it('should render filter dropdowns even with empty options', async () => {
      await render(
        <CouponFilterBar
          onFiltersChangeAction={mockOnFiltersChange}
          availableStatuses={[]}
          availableTypes={[]}
        />,
      );

      await expect.element(page.getByTestId('coupon-status-filter')).toBeVisible();
      await expect.element(page.getByTestId('coupon-type-filter')).toBeVisible();
    });
  });
});
