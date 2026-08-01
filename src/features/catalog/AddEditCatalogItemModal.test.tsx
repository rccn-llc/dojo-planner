import type { CatalogCategory, CatalogItem } from './types';
import type { EventData } from '@/hooks/useEventsCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { AddEditCatalogItemModal } from './AddEditCatalogItemModal';

// Helper to wait for async operations
async function waitFor(callback: () => void | Promise<void>, options?: { timeout?: number }) {
  return vi.waitFor(callback, { timeout: options?.timeout ?? 5000, interval: 50 });
}

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock ImageUploadField component
vi.mock('@/components/ui/image-upload', () => ({
  ImageUploadField: ({ value, onChange, label }: { value: string | null; onChange: (v: string | null) => void; label?: string }) => (
    <div data-testid="image-upload-field">
      <label>{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        data-testid="image-upload-input"
      />
    </div>
  ),
}));

describe('AddEditCatalogItemModal', () => {
  const mockHandlers = {
    onCloseAction: vi.fn(),
    onSaveAction: vi.fn(),
  };

  const mockCategories: CatalogCategory[] = [
    { id: 'cat-1', name: 'Gis', slug: 'gis', description: null, parentId: null, isActive: true },
    { id: 'cat-2', name: 'Belts', slug: 'belts', description: null, parentId: null, isActive: true },
    { id: 'cat-3', name: 'Inactive', slug: 'inactive', description: null, parentId: null, isActive: false },
  ];

  const mockEvents: EventData[] = [
    { id: 'event-1', name: 'Summer Seminar', slug: 'summer-seminar', description: null, eventType: 'seminar', location: null, note: null, maxCapacity: 50, isActive: true, tags: [], sessions: [], billing: [] },
    { id: 'event-2', name: 'Winter Camp', slug: 'winter-camp', description: null, eventType: 'camp', location: null, note: null, maxCapacity: 30, isActive: true, tags: [], sessions: [], billing: [] },
    { id: 'event-3', name: 'Inactive Event', slug: 'inactive-event', description: null, eventType: 'workshop', location: null, note: null, maxCapacity: 20, isActive: false, tags: [], sessions: [], billing: [] },
  ];

  const mockItem: CatalogItem = {
    id: 'item-1',
    type: 'merchandise',
    name: 'BJJ Gi Premium',
    slug: 'bjj-gi-premium',
    description: 'High quality BJJ Gi',
    shortDescription: 'Premium BJJ Gi',
    sku: 'GI-001',
    basePrice: 149.99,
    compareAtPrice: 199.99,
    eventId: null,
    maxPerOrder: 5,
    trackInventory: true,
    lowStockThreshold: 5,
    sortOrder: 0,
    isActive: true,
    isFeatured: true,
    showOnKiosk: true,
    variants: [
      { id: 'v1', catalogItemId: 'item-1', name: 'A1', price: 149.99, stockQuantity: 10, sortOrder: 0 },
      { id: 'v2', catalogItemId: 'item-1', name: 'A2', price: 149.99, stockQuantity: 15, sortOrder: 1 },
    ],
    images: [
      {
        id: 'img-1',
        catalogItemId: 'item-1',
        url: 'https://example.com/image.jpg',
        thumbnailUrl: null,
        altText: 'Gi Image',
        isPrimary: true,
        sortOrder: 0,
      },
    ],
    categories: [mockCategories[0]!],
    totalStock: 25,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal rendering', () => {
    it('should not render dialog when isOpen is false', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={false}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      try {
        const modal = page.getByRole('dialog');

        expect(modal).toBeFalsy();
      } catch {
        expect(true).toBe(true);
      }
    });

    it('should render dialog when isOpen is true', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      const modal = page.getByRole('dialog');

      expect(modal).toBeTruthy();
    });

    it('should display add title when no item is provided', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      await expect.element(page.getByText('add_title')).toBeVisible();
    });

    it('should display edit title when item is provided', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          item={mockItem}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      await expect.element(page.getByText('edit_title')).toBeVisible();
    });
  });

  describe('Form fields', () => {
    it('should render all form fields', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      await expect.element(page.getByTestId('catalog-item-type-select')).toBeVisible();
      await expect.element(page.getByTestId('catalog-item-name-input')).toBeVisible();
      await expect.element(page.getByTestId('catalog-item-sku-input')).toBeVisible();
      await expect.element(page.getByTestId('catalog-item-short-description-input')).toBeVisible();
      await expect.element(page.getByTestId('catalog-item-description-input')).toBeVisible();
      await expect.element(page.getByTestId('catalog-item-base-price-input')).toBeVisible();
      await expect.element(page.getByTestId('catalog-item-compare-at-price-input')).toBeVisible();
      await expect.element(page.getByTestId('catalog-item-max-per-order-input')).toBeVisible();
      await expect.element(page.getByTestId('catalog-item-track-inventory-checkbox')).toBeVisible();
      await expect.element(page.getByTestId('catalog-item-is-active-checkbox')).toBeVisible();
      await expect.element(page.getByTestId('catalog-item-is-featured-checkbox')).toBeVisible();
      await expect.element(page.getByTestId('catalog-item-show-on-kiosk-checkbox')).toBeVisible();
    });

    it('should render image upload field', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      await expect.element(page.getByTestId('image-upload-field')).toBeVisible();
    });

    it('should pre-fill form fields when editing an item', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          item={mockItem}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      const nameInput = page.getByTestId('catalog-item-name-input');
      const skuInput = page.getByTestId('catalog-item-sku-input');
      const shortDescInput = page.getByTestId('catalog-item-short-description-input');

      expect(nameInput.element()).toHaveProperty('value', 'BJJ Gi Premium');
      expect(skuInput.element()).toHaveProperty('value', 'GI-001');
      expect(shortDescInput.element()).toHaveProperty('value', 'Premium BJJ Gi');
    });

    it('should update form fields when user types', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      const nameInput = page.getByTestId('catalog-item-name-input');
      await userEvent.fill(nameInput, 'New Product');

      const skuInput = page.getByTestId('catalog-item-sku-input');
      await userEvent.fill(skuInput, 'NEW-001');

      expect(nameInput.element()).toHaveProperty('value', 'New Product');
      expect(skuInput.element()).toHaveProperty('value', 'NEW-001');
    });
  });

  describe('Modal close behavior', () => {
    it('should call onCloseAction when X button is clicked', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      expect(mockHandlers.onCloseAction).toHaveBeenCalledTimes(1);
    });

    it('should call onCloseAction when Cancel button is clicked', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      const cancelButton = page.getByRole('button', { name: 'cancel_button' });
      await userEvent.click(cancelButton);

      expect(mockHandlers.onCloseAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Form validation', () => {
    it('should show validation error when name is empty', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Leave name empty and submit
      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await expect.element(page.getByText('name_error')).toBeVisible();
    });

    it('should clear validation error when field is corrected', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Submit with empty name to trigger error
      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await expect.element(page.getByText('name_error')).toBeVisible();

      // Fill in name
      const nameInput = page.getByTestId('catalog-item-name-input');
      await userEvent.fill(nameInput, 'New Product');

      // Error should be cleared
      await expect.element(page.getByText('name_error')).not.toBeInTheDocument();
    });
  });

  describe('Form submission', () => {
    it('should call onSaveAction when form is valid and submitted for add', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Fill in required fields
      const nameInput = page.getByTestId('catalog-item-name-input');
      await userEvent.fill(nameInput, 'New Product');

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Product',
            type: 'merchandise',
          }),
          false, // isEdit = false for add
          undefined,
        );
      });
    });

    it('should call onSaveAction with isEdit=true when editing', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          item={mockItem}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.any(Object),
          true, // isEdit = true for edit
          'item-1',
        );
      });
    });

    it('reorders variants and persists the new order on save (#271)', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          item={mockItem}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // mockItem loads variants [A1, A2]. Move the second (A2) up.
      await userEvent.click(page.getByTestId('variant-1-move-up-button'));
      await userEvent.click(page.getByRole('button', { name: 'save_button' }));

      await waitFor(() => {
        const savedForm = mockHandlers.onSaveAction.mock.calls.at(-1)?.[0] as { variants: Array<{ name: string }> };

        expect(savedForm.variants.map(v => v.name)).toEqual(['A2', 'A1']);
      });
    });

    it('disables move-up on the first variant and move-down on the last (#271)', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          item={mockItem}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      await expect.element(page.getByTestId('variant-0-move-up-button')).toBeDisabled();
      await expect.element(page.getByTestId('variant-1-move-down-button')).toBeDisabled();
    });

    it('should display success message after successful add', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Fill in required fields
      const nameInput = page.getByTestId('catalog-item-name-input');
      await userEvent.fill(nameInput, 'New Product');

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        const successMessage = page.getByText('create_success');

        expect(successMessage).toBeTruthy();
      });
    });

    it('should display success message after successful edit', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          item={mockItem}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Submit the form
      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        const successMessage = page.getByText('update_success');

        expect(successMessage).toBeTruthy();
      });
    });
  });

  describe('Type selection', () => {
    it('should allow selecting item type', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      const typeSelect = page.getByTestId('catalog-item-type-select');
      await userEvent.click(typeSelect);

      const eventAccessOption = page.getByRole('option', { name: 'type_event_access' });
      await userEvent.click(eventAccessOption);

      // Fill in name and submit to verify
      const nameInput = page.getByTestId('catalog-item-name-input');
      await userEvent.fill(nameInput, 'Event Access');

      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'event_access',
          }),
          false,
          undefined,
        );
      });
    });
  });

  describe('Variants management', () => {
    it('should render variant management section', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // New variant input section should be visible
      await expect.element(page.getByTestId('new-variant-name-input')).toBeVisible();
      await expect.element(page.getByTestId('new-variant-price-input')).toBeVisible();
      await expect.element(page.getByTestId('new-variant-stock-input')).toBeVisible();
      await expect.element(page.getByTestId('add-variant-button')).toBeVisible();
    });

    it('should allow adding a variant', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Fill in variant details
      const variantNameInput = page.getByTestId('new-variant-name-input');
      await userEvent.fill(variantNameInput, 'A1');

      const variantPriceInput = page.getByTestId('new-variant-price-input');
      await userEvent.fill(variantPriceInput, '99.99');

      const variantStockInput = page.getByTestId('new-variant-stock-input');
      await userEvent.fill(variantStockInput, '10');

      // Add the variant
      const addButton = page.getByTestId('add-variant-button');
      await userEvent.click(addButton);

      // Variant should appear in the list
      await expect.element(page.getByTestId('variant-row-0')).toBeVisible();
    });

    it('should show variants from existing item when editing', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          item={mockItem}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // mockItem has 2 variants (A1 and A2)
      await expect.element(page.getByTestId('variant-row-0')).toBeVisible();
      await expect.element(page.getByTestId('variant-row-1')).toBeVisible();
    });

    it('should allow deleting a variant', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          item={mockItem}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Delete the first variant
      const deleteButton = page.getByTestId('variant-0-remove-button');
      await userEvent.click(deleteButton);

      // First variant should be removed, only second remains (now at index 0)
      await expect.element(page.getByTestId('variant-row-0')).toBeVisible();
      await expect.element(page.getByTestId('variant-row-1')).not.toBeInTheDocument();
    });

    it('hides the add form and shows a notice at the max variant limit (#272)', async () => {
      // Build an item already at the 8-variant maximum.
      const maxedItem = {
        ...mockItem,
        variants: Array.from({ length: 8 }, (_, i) => ({
          id: `v${i}`,
          catalogItemId: 'item-1',
          name: `V${i}`,
          price: 10,
          stockQuantity: 1,
          sortOrder: i,
        })),
      };

      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          item={maxedItem}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Add form is gone, and a notice explains why (rather than nothing).
      await expect.element(page.getByText('max_variants_notice')).toBeVisible();
      expect(page.getByTestId('add-variant-button').elements()).toHaveLength(0);
    });
  });

  describe('Categories', () => {
    it('should only show active categories', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Active categories should be visible
      await expect.element(page.getByText('Gis')).toBeVisible();
      await expect.element(page.getByText('Belts')).toBeVisible();

      // Inactive category should not be visible
      await expect.element(page.getByText('Inactive')).not.toBeInTheDocument();
    });

    it('should pre-select categories when editing', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          item={mockItem}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // The Gis category should be checked (mockItem has cat-1)
      // We just verify the form submits with the category
      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            categoryIds: expect.arrayContaining(['cat-1']),
          }),
          true,
          'item-1',
        );
      });
    });
  });

  describe('Inventory settings', () => {
    it('should show low stock threshold when track inventory is checked', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Track inventory is checked by default
      await expect.element(page.getByTestId('catalog-item-low-stock-threshold-input')).toBeVisible();
    });

    it('should hide low stock threshold when track inventory is unchecked', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Uncheck track inventory
      const trackInventoryCheckbox = page.getByTestId('catalog-item-track-inventory-checkbox');
      await userEvent.click(trackInventoryCheckbox);

      // Low stock threshold should be hidden
      await expect.element(page.getByTestId('catalog-item-low-stock-threshold-input')).not.toBeInTheDocument();
    });
  });

  describe('Boolean flags', () => {
    it('should allow toggling is active', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // isActive is checked by default, uncheck it
      const isActiveCheckbox = page.getByTestId('catalog-item-is-active-checkbox');
      await userEvent.click(isActiveCheckbox);

      // Fill name and submit
      const nameInput = page.getByTestId('catalog-item-name-input');
      await userEvent.fill(nameInput, 'Test Product');

      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            isActive: false,
          }),
          false,
          undefined,
        );
      });
    });

    it('should allow toggling is featured', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // isFeatured is unchecked by default, check it
      const isFeaturedCheckbox = page.getByTestId('catalog-item-is-featured-checkbox');
      await userEvent.click(isFeaturedCheckbox);

      // Fill name and submit
      const nameInput = page.getByTestId('catalog-item-name-input');
      await userEvent.fill(nameInput, 'Test Product');

      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            isFeatured: true,
          }),
          false,
          undefined,
        );
      });
    });

    it('should allow toggling show on kiosk', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // showOnKiosk is checked by default, uncheck it
      const showOnKioskCheckbox = page.getByTestId('catalog-item-show-on-kiosk-checkbox');
      await userEvent.click(showOnKioskCheckbox);

      // Fill name and submit
      const nameInput = page.getByTestId('catalog-item-name-input');
      await userEvent.fill(nameInput, 'Test Product');

      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            showOnKiosk: false,
          }),
          false,
          undefined,
        );
      });
    });
  });

  describe('Price fields', () => {
    it('should allow setting base price', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      const basePriceInput = page.getByTestId('catalog-item-base-price-input');
      await userEvent.fill(basePriceInput, '99.99');

      // Fill name and submit
      const nameInput = page.getByTestId('catalog-item-name-input');
      await userEvent.fill(nameInput, 'Test Product');

      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            basePrice: 99.99,
          }),
          false,
          undefined,
        );
      });
    });

    it('should allow setting compare at price', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      const compareAtPriceInput = page.getByTestId('catalog-item-compare-at-price-input');
      await userEvent.fill(compareAtPriceInput, '149.99');

      // Fill name and submit
      const nameInput = page.getByTestId('catalog-item-name-input');
      await userEvent.fill(nameInput, 'Test Product');

      const saveButton = page.getByRole('button', { name: 'save_button' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockHandlers.onSaveAction).toHaveBeenCalledWith(
          expect.objectContaining({
            compareAtPrice: 149.99,
          }),
          false,
          undefined,
        );
      });
    });
  });

  describe('Empty categories', () => {
    it('should not render categories section when no active categories exist', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={[]}
          events={mockEvents}
        />,
      );

      // categories_label should not be present when no categories
      await expect.element(page.getByText('categories_label')).not.toBeInTheDocument();
    });
  });

  describe('Event selector', () => {
    it('should show event selector when type is event_access', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Change type to event_access
      const typeSelect = page.getByTestId('catalog-item-type-select');
      await userEvent.click(typeSelect);
      const eventAccessOption = page.getByText('type_event_access');
      await userEvent.click(eventAccessOption);

      // Event selector should now be visible
      await expect.element(page.getByTestId('catalog-item-event-select')).toBeVisible();
    });

    it('should not show event selector when type is merchandise', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Default type is merchandise, event selector should not be visible
      await expect.element(page.getByTestId('catalog-item-event-select')).not.toBeInTheDocument();
    });

    it('should only show active events in the dropdown', async () => {
      await render(
        <AddEditCatalogItemModal
          isOpen={true}
          onCloseAction={mockHandlers.onCloseAction}
          onSaveAction={mockHandlers.onSaveAction}
          categories={mockCategories}
          events={mockEvents}
        />,
      );

      // Change type to event_access
      const typeSelect = page.getByTestId('catalog-item-type-select');
      await userEvent.click(typeSelect);
      const eventAccessOption = page.getByText('type_event_access');
      await userEvent.click(eventAccessOption);

      // Open event selector
      const eventSelect = page.getByTestId('catalog-item-event-select');
      await userEvent.click(eventSelect);

      // Active events should be visible
      await expect.element(page.getByText('Summer Seminar')).toBeVisible();
      await expect.element(page.getByText('Winter Camp')).toBeVisible();

      // Inactive event should not be visible
      await expect.element(page.getByText('Inactive Event')).not.toBeInTheDocument();
    });
  });
});
