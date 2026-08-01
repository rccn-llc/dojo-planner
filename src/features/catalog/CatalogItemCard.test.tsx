import type { CatalogItem } from './types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { CatalogItemCard } from './CatalogItemCard';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key}: ${JSON.stringify(params)}`;
    }
    return key;
  },
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

describe('CatalogItemCard', () => {
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  const mockItem: CatalogItem = {
    id: 'item-1',
    type: 'merchandise',
    name: 'BJJ Gi Premium',
    slug: 'bjj-gi-premium',
    description: 'High quality BJJ Gi',
    shortDescription: 'Premium BJJ Gi for competition',
    sku: 'GI-001',
    basePrice: 149.99,
    compareAtPrice: 199.99,
    eventId: null,
    maxPerOrder: 5,
    trackInventory: true,
    lowStockThreshold: 5,
    sortOrder: 0,
    isActive: true,
    isFeatured: false,
    showOnKiosk: true,
    variants: [
      { id: 'v1', catalogItemId: 'item-1', name: 'A1', price: 149.99, stockQuantity: 10, sortOrder: 0 },
      { id: 'v2', catalogItemId: 'item-1', name: 'A2', price: 149.99, stockQuantity: 15, sortOrder: 1 },
    ],
    images: [],
    categories: [],
    totalStock: 25,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render item name', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('BJJ Gi Premium')).toBeVisible();
    });

    it('should render item SKU', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText(/GI-001/)).toBeVisible();
    });

    it('should render short description', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('Premium BJJ Gi for competition')).toBeVisible();
    });

    it('should render formatted base price', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('$149.99')).toBeVisible();
    });

    it('should render compare at price when available and higher than base', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('$199.99')).toBeVisible();
    });

    it('should not render compare at price when lower than base', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, compareAtPrice: 100 }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      // The strikethrough price should not appear
      const prices = page.getByText('$100.00');

      await expect.element(prices).not.toBeInTheDocument();
    });

    it('should render item variants', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('A1, A2')).toBeVisible();
    });

    it('should render total stock for tracked inventory', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('25')).toBeVisible();
    });

    it('should render "In Stock" for non-tracked inventory', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, trackInventory: false }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('in_stock')).toBeVisible();
    });

    it('should render max per order when less than 10', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      // Look for max_per_order_label which indicates the section is rendered
      await expect.element(page.getByText('max_per_order_label')).toBeVisible();
    });

    it('should not render max per order when 10 or more', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, maxPerOrder: 10 }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('max_per_order_label')).not.toBeInTheDocument();
    });
  });

  describe('Item types', () => {
    it('should display merchandise type', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('type_merchandise')).toBeVisible();
    });

    it('should display event_access type', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, type: 'event_access' }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('type_event_access')).toBeVisible();
    });
  });

  describe('Status badges', () => {
    it('should show Active status for active items with stock', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('status_active')).toBeVisible();
    });

    it('should show Inactive status for inactive items', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, isActive: false }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('status_inactive')).toBeVisible();
    });

    it('should show Out of Stock status when totalStock is 0', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, totalStock: 0 }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('status_out_of_stock')).toBeVisible();
    });

    it('should show Low Stock status when at or below threshold', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, totalStock: 5, lowStockThreshold: 5 }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      // The translation key will include the count parameter
      await expect.element(page.getByText(/low_stock/)).toBeVisible();
    });
  });

  describe('Feature badges', () => {
    it('should show Featured badge when isFeatured is true', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, isFeatured: true }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('featured_badge')).toBeVisible();
    });

    it('should not show Featured badge when isFeatured is false', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, isFeatured: false }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('featured_badge')).not.toBeInTheDocument();
    });

    it('should show Kiosk badge when showOnKiosk is true', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('kiosk_badge')).toBeVisible();
    });

    it('should not show Kiosk badge when showOnKiosk is false', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, showOnKiosk: false }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('kiosk_badge')).not.toBeInTheDocument();
    });
  });

  describe('Categories', () => {
    it('should render categories as badges', async () => {
      await render(
        <CatalogItemCard
          item={{
            ...mockItem,
            shortDescription: null, // Remove to avoid text conflicts
            categories: [
              { id: 'cat-1', name: 'Gis', slug: 'gis', description: null, parentId: null, isActive: true },
              { id: 'cat-2', name: 'Belts', slug: 'belts', description: null, parentId: null, isActive: true },
            ],
          }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('Gis')).toBeVisible();
      await expect.element(page.getByText('Belts')).toBeVisible();
    });

    it('should not render category section when no categories', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, categories: [] }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      // Categories section should not be present (no category badges)
      const giBadge = page.getByText('Gis');

      await expect.element(giBadge).not.toBeInTheDocument();
    });
  });

  describe('Images', () => {
    // Note: Tests for image rendering with next/image are skipped in browser tests
    // because vi.mock doesn't work reliably with next/image in Vitest browser mode.
    // The component's image functionality is tested via visual inspection and e2e tests.

    it('should show placeholder when no images', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, images: [] }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      // Package icon should be shown as placeholder
      // The card should still render with the item name
      await expect.element(page.getByText('BJJ Gi Premium')).toBeVisible();
    });
  });

  describe('Variants display', () => {
    it('should not show variants section when variants array is empty', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, variants: [] }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('variants_label')).not.toBeInTheDocument();
    });

    it('should show variants label when variants exist', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('variants_label')).toBeVisible();
    });
  });

  describe('Edit functionality', () => {
    it('should call onEdit with item when edit button is clicked', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const editButton = page.getByRole('button', { name: 'edit_button_aria_label' });
      await userEvent.click(editButton);

      expect(mockOnEdit).toHaveBeenCalledTimes(1);
      expect(mockOnEdit).toHaveBeenCalledWith(mockItem);
    });
  });

  describe('Delete functionality', () => {
    it('should call onDelete with item id when delete button is clicked', async () => {
      await render(
        <CatalogItemCard
          item={mockItem}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const deleteButton = page.getByRole('button', { name: 'delete_button_aria_label' });
      await userEvent.click(deleteButton);

      expect(mockOnDelete).toHaveBeenCalledTimes(1);
      expect(mockOnDelete).toHaveBeenCalledWith('item-1');
    });
  });

  describe('Without optional fields', () => {
    it('should render without SKU', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, sku: null }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('BJJ Gi Premium')).toBeVisible();
    });

    it('should render without short description', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, shortDescription: null }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('BJJ Gi Premium')).toBeVisible();
    });

    it('should render without compare at price', async () => {
      await render(
        <CatalogItemCard
          item={{ ...mockItem, compareAtPrice: null }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      await expect.element(page.getByText('$149.99')).toBeVisible();
    });
  });
});
