import type { CatalogCategory, CatalogFilters, CatalogItem } from './types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { CatalogFilterBar } from './CatalogFilterBar';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('CatalogFilterBar', () => {
  const mockOnFiltersChange = vi.fn();

  const mockCategories: CatalogCategory[] = [
    { id: 'cat-1', name: 'Gis', slug: 'gis', description: null, parentId: null, isActive: true },
    { id: 'cat-2', name: 'Belts', slug: 'belts', description: null, parentId: null, isActive: true },
    { id: 'cat-3', name: 'Inactive Category', slug: 'inactive', description: null, parentId: null, isActive: false },
  ];

  const mockItems: CatalogItem[] = [
    {
      id: 'item-1',
      type: 'merchandise',
      name: 'BJJ Gi',
      slug: 'bjj-gi',
      description: null,
      shortDescription: 'Premium gi',
      sku: 'GI-001',
      basePrice: 149.99,
      compareAtPrice: null,
      eventId: null,
      maxPerOrder: 10,
      trackInventory: true,
      lowStockThreshold: 5,
      sortOrder: 0,
      isActive: true,
      isFeatured: false,
      showOnKiosk: true,
      variants: [],
      images: [],
      categories: [mockCategories[0]!],
      totalStock: 25,
    },
    {
      id: 'item-2',
      type: 'event_access',
      name: 'Seminar Access',
      slug: 'seminar-access',
      description: null,
      shortDescription: 'Workshop entry',
      sku: 'SEM-001',
      basePrice: 50,
      compareAtPrice: null,
      eventId: 'event-1',
      maxPerOrder: 1,
      trackInventory: false,
      lowStockThreshold: 0,
      sortOrder: 1,
      isActive: true,
      isFeatured: false,
      showOnKiosk: true,
      variants: [],
      images: [],
      categories: [mockCategories[1]!],
      totalStock: 0,
    },
    {
      id: 'item-3',
      type: 'merchandise',
      name: 'Belt',
      slug: 'belt',
      description: null,
      shortDescription: null,
      sku: 'BELT-001',
      basePrice: 25,
      compareAtPrice: null,
      eventId: null,
      maxPerOrder: 5,
      trackInventory: true,
      lowStockThreshold: 5,
      sortOrder: 2,
      isActive: true,
      isFeatured: false,
      showOnKiosk: true,
      variants: [],
      images: [],
      categories: [mockCategories[1]!],
      totalStock: 0, // Out of stock
    },
  ];

  const defaultFilters: CatalogFilters = {
    search: '',
    type: '',
    category: '',
    stock: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render search input', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');

      await expect.element(searchInput).toBeVisible();
    });

    it('should render type filter dropdown', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      // The trigger will show "type_filter" as placeholder
      await expect.element(page.getByText('type_filter')).toBeVisible();
    });

    it('should render category filter dropdown', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      await expect.element(page.getByText('category_filter')).toBeVisible();
    });

    it('should render stock filter dropdown', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      await expect.element(page.getByText('stock_filter')).toBeVisible();
    });
  });

  describe('Search functionality', () => {
    it('should call onFiltersChange when search input changes', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.type(searchInput, 'BJJ');

      expect(mockOnFiltersChange).toHaveBeenCalled();
    });

    it('should update filter with each keystroke', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.type(searchInput, 'abc');

      expect(mockOnFiltersChange).toHaveBeenCalledTimes(3);
    });

    it('should preserve other filter values when search changes', async () => {
      await render(
        <CatalogFilterBar
          filters={{ ...defaultFilters, type: 'merchandise' }}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.type(searchInput, 'X');

      const lastCall = mockOnFiltersChange.mock.calls.at(-1);

      expect(lastCall?.[0]).toEqual({
        search: 'X',
        type: 'merchandise',
        category: '',
        stock: '',
      });
    });
  });

  describe('Type filter functionality', () => {
    it('should show available types in dropdown', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      // Click to open type filter
      const typeFilters = page.getByText('type_filter');
      await userEvent.click(typeFilters.first());

      // Both merchandise and event_access should be available
      await expect.element(page.getByRole('option', { name: 'type_merchandise' })).toBeVisible();
      await expect.element(page.getByRole('option', { name: 'type_event_access' })).toBeVisible();
    });

    it('should call onFiltersChange when type is selected', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      const typeFilters = page.getByText('type_filter');
      await userEvent.click(typeFilters.first());

      const merchandiseOption = page.getByRole('option', { name: 'type_merchandise' });
      await userEvent.click(merchandiseOption);

      const lastCall = mockOnFiltersChange.mock.calls.at(-1);

      expect(lastCall?.[0].type).toBe('merchandise');
    });

    it('should reset type filter when "All" is selected', async () => {
      await render(
        <CatalogFilterBar
          filters={{ ...defaultFilters, type: 'merchandise' }}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      // First trigger shows selected type_merchandise
      const typeFilters = page.getByText('type_merchandise');
      await userEvent.click(typeFilters);

      const allOption = page.getByRole('option', { name: 'type_filter' });
      await userEvent.click(allOption);

      const lastCall = mockOnFiltersChange.mock.calls.at(-1);

      expect(lastCall?.[0].type).toBe('');
    });
  });

  describe('Category filter functionality', () => {
    it('should only show active categories in dropdown', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      const categoryFilters = page.getByText('category_filter');
      await userEvent.click(categoryFilters.first());

      // Active categories should be visible
      await expect.element(page.getByRole('option', { name: 'Gis' })).toBeVisible();
      await expect.element(page.getByRole('option', { name: 'Belts' })).toBeVisible();

      // Inactive category should not be visible
      await expect.element(page.getByRole('option', { name: 'Inactive Category' })).not.toBeInTheDocument();
    });

    it('should call onFiltersChange when category is selected', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      const categoryFilters = page.getByText('category_filter');
      await userEvent.click(categoryFilters.first());

      const gisOption = page.getByRole('option', { name: 'Gis' });
      await userEvent.click(gisOption);

      const lastCall = mockOnFiltersChange.mock.calls.at(-1);

      expect(lastCall?.[0].category).toBe('cat-1');
    });
  });

  describe('Stock filter functionality', () => {
    it('should show stock options when available', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      const stockFilters = page.getByText('stock_filter');
      await userEvent.click(stockFilters.first());

      await expect.element(page.getByRole('option', { name: 'stock_in_stock' })).toBeVisible();
      await expect.element(page.getByRole('option', { name: 'stock_out_of_stock' })).toBeVisible();
    });

    it('should call onFiltersChange when stock filter is selected', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      const stockFilters = page.getByText('stock_filter');
      await userEvent.click(stockFilters.first());

      const inStockOption = page.getByRole('option', { name: 'stock_in_stock' });
      await userEvent.click(inStockOption);

      const lastCall = mockOnFiltersChange.mock.calls.at(-1);

      expect(lastCall?.[0].stock).toBe('in_stock');
    });
  });

  describe('Filter combinations', () => {
    it('should preserve other filter values when search changes', async () => {
      await render(
        <CatalogFilterBar
          filters={{
            search: 'test',
            type: 'merchandise',
            category: 'cat-1',
            stock: 'in_stock',
          }}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={mockItems}
        />,
      );

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.clear(searchInput);
      await userEvent.type(searchInput, 'new');

      const lastCall = mockOnFiltersChange.mock.calls.at(-1);

      // Check that other filter values are preserved
      expect(lastCall?.[0].type).toBe('merchandise');
      expect(lastCall?.[0].category).toBe('cat-1');
      expect(lastCall?.[0].stock).toBe('in_stock');
    });
  });

  describe('Dynamic filtering based on other selections', () => {
    it('should show only available types based on other filters', async () => {
      // When items are filtered to only event_access, merchandise should not appear
      const eventOnlyItems: CatalogItem[] = [mockItems[1]!];

      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={eventOnlyItems}
        />,
      );

      const typeFilters = page.getByText('type_filter');
      await userEvent.click(typeFilters.first());

      // Only event_access should be available
      await expect.element(page.getByRole('option', { name: 'type_event_access' })).toBeVisible();
      await expect.element(page.getByRole('option', { name: 'type_merchandise' })).not.toBeInTheDocument();
    });

    it('should show only categories that have items', async () => {
      // Create items that only have Gis category
      const gisOnlyItems: CatalogItem[] = [mockItems[0]!];

      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={gisOnlyItems}
        />,
      );

      const categoryFilters = page.getByText('category_filter');
      await userEvent.click(categoryFilters.first());

      // Only Gis should be available
      await expect.element(page.getByRole('option', { name: 'Gis' })).toBeVisible();
      await expect.element(page.getByRole('option', { name: 'Belts' })).not.toBeInTheDocument();
    });
  });

  describe('Empty states', () => {
    it('should render with empty items array', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={mockCategories}
          items={[]}
        />,
      );

      await expect.element(page.getByPlaceholder('search_placeholder')).toBeVisible();
    });

    it('should render with empty categories array', async () => {
      await render(
        <CatalogFilterBar
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          categories={[]}
          items={mockItems}
        />,
      );

      await expect.element(page.getByPlaceholder('search_placeholder')).toBeVisible();
    });
  });
});
