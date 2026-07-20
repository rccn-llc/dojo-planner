import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock database and schemas
vi.mock('@/libs/DB', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  },
}));

vi.mock('@/models/Schema', () => ({
  catalogCategorySchema: { id: 'id', organizationId: 'organizationId', name: 'name' },
  catalogItemCategorySchema: { catalogItemId: 'catalogItemId', categoryId: 'categoryId' },
  catalogItemImageSchema: { id: 'id', catalogItemId: 'catalogItemId' },
  catalogItemSchema: { id: 'id', organizationId: 'organizationId', type: 'type', name: 'name' },
  catalogItemVariantSchema: { id: 'id', catalogItemId: 'catalogItemId' },
}));

const TEST_ORG = 'test-org-123';

/**
 * Build a chainable db.select mock whose terminal `.where(...)` resolves to
 * `rows`, and which also supports the guard shape `.where(...).limit(1)` and
 * `.innerJoin(...).where(...).limit(1)`. Both the awaited `where` and the
 * `limit` resolve to the same `rows`.
 */
function selectChain(rows: any[]): any {
  const whereResult: any = Promise.resolve(rows);
  whereResult.limit = vi.fn().mockResolvedValue(rows);
  const inner: any = {
    where: vi.fn().mockReturnValue(whereResult),
    limit: vi.fn().mockResolvedValue(rows),
  };
  inner.innerJoin = vi.fn().mockReturnValue(inner);
  return {
    from: vi.fn().mockReturnValue(inner),
  };
}

describe('CatalogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Constants', () => {
    it('should export MAX_VARIANTS_PER_ITEM as 8', async () => {
      const { MAX_VARIANTS_PER_ITEM } = await import('./CatalogService');

      expect(MAX_VARIANTS_PER_ITEM).toBe(8);
    });
  });

  describe('getOrganizationCatalogItems', () => {
    it('should return empty array when no items exist', async () => {
      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getOrganizationCatalogItems } = await import('./CatalogService');
      const result = await getOrganizationCatalogItems('test-org-123');

      expect(result).toEqual([]);
    });

    it('should return items with related data', async () => {
      const { db } = await import('@/libs/DB');
      const mockItem = {
        id: 'item-1',
        organizationId: 'test-org-123',
        type: 'merchandise',
        name: 'Test Product',
        slug: 'test-product',
        description: 'A test product',
        shortDescription: 'Test',
        sku: 'TEST-001',
        basePrice: 29.99,
        compareAtPrice: null,
        eventId: null,
        maxPerOrder: 10,
        trackInventory: true,
        lowStockThreshold: 5,
        sortOrder: 0,
        isActive: true,
        isFeatured: false,
        showOnKiosk: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockVariant = {
        id: 'variant-1',
        catalogItemId: 'item-1',
        name: 'Medium',
        price: 29.99,
        stockQuantity: 10,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockImage = {
        id: 'img-1',
        catalogItemId: 'item-1',
        url: 'https://example.com/image.jpg',
        thumbnailUrl: null,
        altText: 'Product image',
        isPrimary: true,
        sortOrder: 0,
        createdAt: new Date(),
      };

      const mockCategory = {
        id: 'cat-1',
        organizationId: 'test-org-123',
        name: 'Apparel',
        slug: 'apparel',
        description: null,
        parentId: null,
        sortOrder: 0,
        isActive: true,
        createdAt: new Date(),
      };

      const mockItemCategory = {
        catalogItemId: 'item-1',
        categoryId: 'cat-1',
      };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            // First call: items, Second: variants, Third: images, Fourth: item categories, Fifth: all categories
            if (callCount === 1) {
              return Promise.resolve([mockItem]);
            }
            if (callCount === 2) {
              return Promise.resolve([mockVariant]);
            }
            if (callCount === 3) {
              return Promise.resolve([mockImage]);
            }
            if (callCount === 4) {
              return Promise.resolve([mockItemCategory]);
            }
            if (callCount === 5) {
              return Promise.resolve([mockCategory]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getOrganizationCatalogItems } = await import('./CatalogService');
      const result = await getOrganizationCatalogItems('test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Test Product');
      expect(result[0]?.variants).toHaveLength(1);
      expect(result[0]?.images).toHaveLength(1);
      expect(result[0]?.categories).toHaveLength(1);
      expect(result[0]?.totalStock).toBe(10);
    });

    it('should handle items with null optional fields', async () => {
      const { db } = await import('@/libs/DB');
      const mockItem = {
        id: 'item-1',
        organizationId: 'test-org-123',
        type: 'merchandise',
        name: 'Test Product',
        slug: 'test-product',
        description: null,
        shortDescription: null,
        sku: null,
        basePrice: 0,
        compareAtPrice: null,
        eventId: null,
        maxPerOrder: null,
        trackInventory: null,
        lowStockThreshold: null,
        sortOrder: null,
        isActive: null,
        isFeatured: null,
        showOnKiosk: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockItem]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getOrganizationCatalogItems } = await import('./CatalogService');
      const result = await getOrganizationCatalogItems('test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.maxPerOrder).toBe(10);
      expect(result[0]?.trackInventory).toBe(true);
      expect(result[0]?.lowStockThreshold).toBe(5);
      expect(result[0]?.isActive).toBe(true);
      expect(result[0]?.isFeatured).toBe(false);
      expect(result[0]?.showOnKiosk).toBe(true);
    });
  });

  describe('getCatalogItemById', () => {
    it('should return null when item not found', async () => {
      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getCatalogItemById } = await import('./CatalogService');
      const result = await getCatalogItemById('nonexistent', 'test-org-123');

      expect(result).toBeNull();
    });

    it('should return item when found', async () => {
      const { db } = await import('@/libs/DB');
      const mockItem = {
        id: 'item-1',
        organizationId: 'test-org-123',
        type: 'merchandise',
        name: 'Test Product',
        slug: 'test-product',
        description: null,
        shortDescription: null,
        sku: null,
        basePrice: 29.99,
        compareAtPrice: null,
        eventId: null,
        maxPerOrder: 10,
        trackInventory: true,
        lowStockThreshold: 5,
        sortOrder: 0,
        isActive: true,
        isFeatured: false,
        showOnKiosk: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockItem]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getCatalogItemById } = await import('./CatalogService');
      const result = await getCatalogItemById('item-1', 'test-org-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('item-1');
      expect(result?.name).toBe('Test Product');
    });
  });

  describe('getCatalogItemsByType', () => {
    it('should filter items by merchandise type', async () => {
      const { db } = await import('@/libs/DB');
      const mockItems = [
        {
          id: 'item-1',
          organizationId: 'test-org-123',
          type: 'merchandise',
          name: 'Product 1',
          slug: 'product-1',
          basePrice: 29.99,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'item-2',
          organizationId: 'test-org-123',
          type: 'event_access',
          name: 'Event 1',
          slug: 'event-1',
          basePrice: 49.99,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockItems);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getCatalogItemsByType } = await import('./CatalogService');
      const result = await getCatalogItemsByType('test-org-123', 'merchandise');

      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe('merchandise');
    });
  });

  describe('getKioskCatalogItems', () => {
    it('should filter items that are active and showOnKiosk', async () => {
      const { db } = await import('@/libs/DB');
      const mockItems = [
        {
          id: 'item-1',
          organizationId: 'test-org-123',
          type: 'merchandise',
          name: 'Kiosk Product',
          slug: 'kiosk-product',
          basePrice: 29.99,
          isActive: true,
          showOnKiosk: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'item-2',
          organizationId: 'test-org-123',
          type: 'merchandise',
          name: 'Hidden Product',
          slug: 'hidden-product',
          basePrice: 39.99,
          isActive: true,
          showOnKiosk: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'item-3',
          organizationId: 'test-org-123',
          type: 'merchandise',
          name: 'Inactive Product',
          slug: 'inactive-product',
          basePrice: 19.99,
          isActive: false,
          showOnKiosk: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockItems);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getKioskCatalogItems } = await import('./CatalogService');
      const result = await getKioskCatalogItems('test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Kiosk Product');
    });
  });

  describe('createCatalogItem', () => {
    it('should throw error when item creation fails', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { createCatalogItem } = await import('./CatalogService');

      await expect(
        createCatalogItem({ type: 'merchandise', name: 'Test', basePrice: 10 }, 'test-org-123'),
      ).rejects.toThrow('Failed to create catalog item');
    });
  });

  describe('updateCatalogItem', () => {
    it('should update an item', async () => {
      const { db } = await import('@/libs/DB');
      const mockUpdatedItem = {
        id: 'item-1',
        organizationId: 'test-org-123',
        type: 'merchandise',
        name: 'Updated Product',
        slug: 'updated-product',
        basePrice: 39.99,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedItem]),
          }),
        }),
      } as any);

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockUpdatedItem]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { updateCatalogItem } = await import('./CatalogService');
      const result = await updateCatalogItem(
        { id: 'item-1', name: 'Updated Product', basePrice: 39.99 },
        'test-org-123',
      );

      expect(result.name).toBe('Updated Product');
      expect(db.update).toHaveBeenCalled();
    });

    it('should update categories when provided', async () => {
      const { db } = await import('@/libs/DB');
      const mockUpdatedItem = {
        id: 'item-1',
        organizationId: 'test-org-123',
        type: 'merchandise',
        name: 'Product',
        slug: 'product',
        basePrice: 29.99,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedItem]),
          }),
        }),
      } as any);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockUpdatedItem]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { updateCatalogItem } = await import('./CatalogService');
      const result = await updateCatalogItem(
        { id: 'item-1', categoryIds: ['cat-1', 'cat-2'] },
        'test-org-123',
      );

      expect(result.name).toBe('Product');
      expect(db.delete).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });

    it('should throw error when item not found', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { updateCatalogItem } = await import('./CatalogService');

      await expect(
        updateCatalogItem({ id: 'nonexistent' }, 'test-org-123'),
      ).rejects.toThrow('Catalog item not found');
    });
  });

  describe('deleteCatalogItem', () => {
    it('should delete an item and its associations', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      const { deleteCatalogItem } = await import('./CatalogService');
      await deleteCatalogItem('item-1', 'test-org-123');

      // Should delete categories, images, variants, and the item itself (4 calls)
      expect(db.delete).toHaveBeenCalledTimes(4);
    });
  });

  describe('createCatalogVariant', () => {
    it('should create a variant', async () => {
      const { db } = await import('@/libs/DB');
      const mockVariant = {
        id: 'variant-1',
        catalogItemId: 'item-1',
        name: 'Medium',
        price: 29.99,
        stockQuantity: 10,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.select)
        // guard: assertItemInOrg → non-empty item row
        .mockReturnValueOnce(selectChain([{ id: 'item-1' }]))
        // original variant-count select → no existing variants
        .mockReturnValueOnce(selectChain([]));

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockVariant]),
        }),
      } as any);

      const { createCatalogVariant } = await import('./CatalogService');
      const result = await createCatalogVariant({
        catalogItemId: 'item-1',
        name: 'Medium',
        price: 29.99,
        stockQuantity: 10,
      }, TEST_ORG);

      expect(result.name).toBe('Medium');
      expect(result.price).toBe(29.99);
      expect(result.stockQuantity).toBe(10);
    });

    it('should throw error when max variants exceeded', async () => {
      const { db } = await import('@/libs/DB');

      // Mock 8 existing variants
      const existingVariants = Array.from({ length: 8 }, (_, i) => ({
        id: `variant-${i}`,
        catalogItemId: 'item-1',
        name: `Variant ${i}`,
        price: 25,
        stockQuantity: 5,
        sortOrder: i,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      vi.mocked(db.select)
        // guard passes
        .mockReturnValueOnce(selectChain([{ id: 'item-1' }]))
        // count select returns 8 existing variants
        .mockReturnValueOnce(selectChain(existingVariants));

      const { createCatalogVariant } = await import('./CatalogService');

      await expect(
        createCatalogVariant({ catalogItemId: 'item-1', name: 'New', price: 30 }, TEST_ORG),
      ).rejects.toThrow('Maximum 8 variants allowed per item');
    });

    it('should throw error when creation fails', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select)
        .mockReturnValueOnce(selectChain([{ id: 'item-1' }]))
        .mockReturnValueOnce(selectChain([]));

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { createCatalogVariant } = await import('./CatalogService');

      await expect(
        createCatalogVariant({ catalogItemId: 'item-1', name: 'Medium', price: 29.99 }, TEST_ORG),
      ).rejects.toThrow('Failed to create variant');
    });

    it('should reject cross-tenant item with CatalogNotFoundError', async () => {
      const { db } = await import('@/libs/DB');

      // guard select returns empty → not in caller's org
      vi.mocked(db.select).mockReturnValueOnce(selectChain([]));

      const { createCatalogVariant, CatalogNotFoundError } = await import('./CatalogService');

      await expect(
        createCatalogVariant({ catalogItemId: 'item-x', name: 'Medium', price: 29.99 }, TEST_ORG),
      ).rejects.toThrow(CatalogNotFoundError);
    });
  });

  describe('updateCatalogVariant', () => {
    it('should update a variant', async () => {
      const { db } = await import('@/libs/DB');
      const mockVariant = {
        id: 'variant-1',
        catalogItemId: 'item-1',
        name: 'Large',
        price: 34.99,
        stockQuantity: 15,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.select).mockReturnValueOnce(selectChain([{ catalogItemId: 'item-1' }]));

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockVariant]),
          }),
        }),
      } as any);

      const { updateCatalogVariant } = await import('./CatalogService');
      const result = await updateCatalogVariant({ id: 'variant-1', name: 'Large', price: 34.99, stockQuantity: 15 }, TEST_ORG);

      expect(result.name).toBe('Large');
      expect(result.price).toBe(34.99);
      expect(result.stockQuantity).toBe(15);
    });

    it('should throw error when variant not found', async () => {
      const { db } = await import('@/libs/DB');

      // guard passes (variant belongs to org), but the update returns nothing
      vi.mocked(db.select).mockReturnValueOnce(selectChain([{ catalogItemId: 'item-1' }]));

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const { updateCatalogVariant } = await import('./CatalogService');

      await expect(
        updateCatalogVariant({ id: 'nonexistent' }, TEST_ORG),
      ).rejects.toThrow('Variant not found');
    });

    it('should reject cross-tenant variant with CatalogNotFoundError', async () => {
      const { db } = await import('@/libs/DB');

      // guard select returns empty → variant not in caller's org
      vi.mocked(db.select).mockReturnValueOnce(selectChain([]));

      const { updateCatalogVariant, CatalogNotFoundError } = await import('./CatalogService');

      await expect(
        updateCatalogVariant({ id: 'variant-x', name: 'X' }, TEST_ORG),
      ).rejects.toThrow(CatalogNotFoundError);
    });
  });

  describe('deleteCatalogVariant', () => {
    it('should delete a variant', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValueOnce(selectChain([{ catalogItemId: 'item-1' }]));

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      const { deleteCatalogVariant } = await import('./CatalogService');
      await deleteCatalogVariant('variant-1', TEST_ORG);

      expect(db.delete).toHaveBeenCalled();
    });

    it('should reject cross-tenant variant with CatalogNotFoundError', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValueOnce(selectChain([]));

      const { deleteCatalogVariant, CatalogNotFoundError } = await import('./CatalogService');

      await expect(deleteCatalogVariant('variant-x', TEST_ORG)).rejects.toThrow(CatalogNotFoundError);
    });
  });

  describe('adjustVariantStock', () => {
    it('should increase stock by positive adjustment', async () => {
      const { db } = await import('@/libs/DB');
      const mockVariant = {
        id: 'variant-1',
        catalogItemId: 'item-1',
        name: 'Medium',
        price: 29.99,
        stockQuantity: 10,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdatedVariant = { ...mockVariant, stockQuantity: 15 };

      vi.mocked(db.select)
        .mockReturnValueOnce(selectChain([{ catalogItemId: 'item-1' }]))
        .mockReturnValueOnce(selectChain([mockVariant]));

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedVariant]),
          }),
        }),
      } as any);

      const { adjustVariantStock } = await import('./CatalogService');
      const result = await adjustVariantStock('variant-1', 5, TEST_ORG);

      expect(result.stockQuantity).toBe(15);
    });

    it('should decrease stock by negative adjustment', async () => {
      const { db } = await import('@/libs/DB');
      const mockVariant = {
        id: 'variant-1',
        catalogItemId: 'item-1',
        name: 'Medium',
        price: 29.99,
        stockQuantity: 10,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdatedVariant = { ...mockVariant, stockQuantity: 5 };

      vi.mocked(db.select)
        .mockReturnValueOnce(selectChain([{ catalogItemId: 'item-1' }]))
        .mockReturnValueOnce(selectChain([mockVariant]));

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedVariant]),
          }),
        }),
      } as any);

      const { adjustVariantStock } = await import('./CatalogService');
      const result = await adjustVariantStock('variant-1', -5, TEST_ORG);

      expect(result.stockQuantity).toBe(5);
    });

    it('should not allow stock to go below zero', async () => {
      const { db } = await import('@/libs/DB');
      const mockVariant = {
        id: 'variant-1',
        catalogItemId: 'item-1',
        name: 'Medium',
        price: 29.99,
        stockQuantity: 5,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdatedVariant = { ...mockVariant, stockQuantity: 0 };

      vi.mocked(db.select)
        .mockReturnValueOnce(selectChain([{ catalogItemId: 'item-1' }]))
        .mockReturnValueOnce(selectChain([mockVariant]));

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedVariant]),
          }),
        }),
      } as any);

      const { adjustVariantStock } = await import('./CatalogService');
      const result = await adjustVariantStock('variant-1', -10, TEST_ORG);

      expect(result.stockQuantity).toBe(0);
    });

    it('should throw error when variant not found', async () => {
      const { db } = await import('@/libs/DB');

      // guard passes, but the stock-lookup select returns nothing
      vi.mocked(db.select)
        .mockReturnValueOnce(selectChain([{ catalogItemId: 'item-1' }]))
        .mockReturnValueOnce(selectChain([]));

      const { adjustVariantStock } = await import('./CatalogService');

      await expect(adjustVariantStock('nonexistent', 5, TEST_ORG)).rejects.toThrow('Variant not found');
    });

    it('should reject cross-tenant variant with CatalogNotFoundError', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValueOnce(selectChain([]));

      const { adjustVariantStock, CatalogNotFoundError } = await import('./CatalogService');

      await expect(adjustVariantStock('variant-x', 5, TEST_ORG)).rejects.toThrow(CatalogNotFoundError);
    });

    it('should throw error when update fails', async () => {
      const { db } = await import('@/libs/DB');
      const mockVariant = {
        id: 'variant-1',
        catalogItemId: 'item-1',
        name: 'Medium',
        price: 29.99,
        stockQuantity: 10,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(selectChain([{ catalogItemId: 'item-1' }]))
        .mockReturnValueOnce(selectChain([mockVariant]));

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const { adjustVariantStock } = await import('./CatalogService');

      await expect(adjustVariantStock('variant-1', 5, TEST_ORG)).rejects.toThrow('Failed to update stock');
    });
  });

  describe('getOrganizationCategories', () => {
    it('should return categories for an organization', async () => {
      const { db } = await import('@/libs/DB');
      const mockCategories = [
        {
          id: 'cat-1',
          organizationId: 'test-org-123',
          name: 'Apparel',
          slug: 'apparel',
          description: null,
          parentId: null,
          sortOrder: 0,
          isActive: true,
          createdAt: new Date(),
        },
        {
          id: 'cat-2',
          organizationId: 'test-org-123',
          name: 'Equipment',
          slug: 'equipment',
          description: 'Training equipment',
          parentId: null,
          sortOrder: 1,
          isActive: true,
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockCategories),
        }),
      } as any);

      const { getOrganizationCategories } = await import('./CatalogService');
      const result = await getOrganizationCategories('test-org-123');

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('Apparel');
      expect(result[1]?.name).toBe('Equipment');
    });

    it('should handle null optional fields', async () => {
      const { db } = await import('@/libs/DB');
      const mockCategories = [
        {
          id: 'cat-1',
          organizationId: 'test-org-123',
          name: 'Test',
          slug: 'test',
          description: null,
          parentId: null,
          sortOrder: null,
          isActive: null,
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockCategories),
        }),
      } as any);

      const { getOrganizationCategories } = await import('./CatalogService');
      const result = await getOrganizationCategories('test-org-123');

      expect(result[0]?.sortOrder).toBe(0);
      expect(result[0]?.isActive).toBe(true);
    });
  });

  describe('createCategory', () => {
    it('should create a category', async () => {
      const { db } = await import('@/libs/DB');
      const mockCategory = {
        id: 'cat-1',
        organizationId: 'test-org-123',
        name: 'New Category',
        slug: 'new-category',
        description: null,
        parentId: null,
        sortOrder: 0,
        isActive: true,
        createdAt: new Date(),
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCategory]),
        }),
      } as any);

      const { createCategory } = await import('./CatalogService');
      const result = await createCategory({ name: 'New Category' }, 'test-org-123');

      expect(result.name).toBe('New Category');
      expect(result.slug).toBe('new-category');
    });

    it('should throw error when creation fails', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { createCategory } = await import('./CatalogService');

      await expect(
        createCategory({ name: 'Test' }, 'test-org-123'),
      ).rejects.toThrow('Failed to create category');
    });
  });

  describe('updateCategory', () => {
    it('should update a category', async () => {
      const { db } = await import('@/libs/DB');
      const mockCategory = {
        id: 'cat-1',
        organizationId: 'test-org-123',
        name: 'Updated Category',
        slug: 'updated-category',
        description: 'New description',
        parentId: null,
        sortOrder: 0,
        isActive: true,
        createdAt: new Date(),
      };

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockCategory]),
          }),
        }),
      } as any);

      const { updateCategory } = await import('./CatalogService');
      const result = await updateCategory(
        { id: 'cat-1', name: 'Updated Category', description: 'New description' },
        'test-org-123',
      );

      expect(result.name).toBe('Updated Category');
      expect(result.description).toBe('New description');
    });

    it('should throw error when category not found', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const { updateCategory } = await import('./CatalogService');

      await expect(
        updateCategory({ id: 'nonexistent' }, 'test-org-123'),
      ).rejects.toThrow('Category not found');
    });
  });

  describe('deleteCategory', () => {
    it('should delete a category that is not in use', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      const { deleteCategory } = await import('./CatalogService');
      await deleteCategory('cat-1', 'test-org-123');

      expect(db.delete).toHaveBeenCalled();
    });

    it('should throw error when category is in use', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ catalogItemId: 'item-1', categoryId: 'cat-1' }]),
        }),
      } as any);

      const { deleteCategory } = await import('./CatalogService');

      await expect(
        deleteCategory('cat-1', 'test-org-123'),
      ).rejects.toThrow('Cannot delete category that is in use by catalog items');
    });
  });

  describe('createCatalogImage', () => {
    it('should create an image', async () => {
      const { db } = await import('@/libs/DB');
      const mockImage = {
        id: 'img-1',
        catalogItemId: 'item-1',
        url: 'https://example.com/image.jpg',
        thumbnailUrl: null,
        altText: 'Product image',
        isPrimary: false,
        sortOrder: 0,
        createdAt: new Date(),
      };

      vi.mocked(db.select).mockReturnValueOnce(selectChain([{ id: 'item-1' }]));

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockImage]),
        }),
      } as any);

      const { createCatalogImage } = await import('./CatalogService');
      const result = await createCatalogImage({
        catalogItemId: 'item-1',
        url: 'https://example.com/image.jpg',
        altText: 'Product image',
      }, TEST_ORG);

      expect(result.url).toBe('https://example.com/image.jpg');
      expect(result.isPrimary).toBe(false);
    });

    it('should unset other primary images when creating a primary image', async () => {
      const { db } = await import('@/libs/DB');
      const mockImage = {
        id: 'img-1',
        catalogItemId: 'item-1',
        url: 'https://example.com/image.jpg',
        thumbnailUrl: null,
        altText: null,
        isPrimary: true,
        sortOrder: 0,
        createdAt: new Date(),
      };

      vi.mocked(db.select).mockReturnValueOnce(selectChain([{ id: 'item-1' }]));

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockImage]),
        }),
      } as any);

      const { createCatalogImage } = await import('./CatalogService');
      const result = await createCatalogImage({
        catalogItemId: 'item-1',
        url: 'https://example.com/image.jpg',
        isPrimary: true,
      }, TEST_ORG);

      expect(result.isPrimary).toBe(true);
      expect(db.update).toHaveBeenCalled();
    });

    it('should throw error when creation fails', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValueOnce(selectChain([{ id: 'item-1' }]));

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { createCatalogImage } = await import('./CatalogService');

      await expect(
        createCatalogImage({ catalogItemId: 'item-1', url: 'https://example.com/image.jpg' }, TEST_ORG),
      ).rejects.toThrow('Failed to create image');
    });

    it('should reject cross-tenant item with CatalogNotFoundError', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValueOnce(selectChain([]));

      const { createCatalogImage, CatalogNotFoundError } = await import('./CatalogService');

      await expect(
        createCatalogImage({ catalogItemId: 'item-x', url: 'https://example.com/image.jpg' }, TEST_ORG),
      ).rejects.toThrow(CatalogNotFoundError);
    });
  });

  describe('deleteCatalogImage', () => {
    it('should delete an image', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValueOnce(selectChain([{ id: 'img-1' }]));

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      const { deleteCatalogImage } = await import('./CatalogService');
      await deleteCatalogImage('img-1', TEST_ORG);

      expect(db.delete).toHaveBeenCalled();
    });

    it('should reject cross-tenant image with CatalogNotFoundError', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValueOnce(selectChain([]));

      const { deleteCatalogImage, CatalogNotFoundError } = await import('./CatalogService');

      await expect(deleteCatalogImage('img-x', TEST_ORG)).rejects.toThrow(CatalogNotFoundError);
    });
  });
});
