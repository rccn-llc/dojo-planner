import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  catalogCategorySchema,
  catalogItemCategorySchema,
  catalogItemImageSchema,
  catalogItemSchema,
  catalogItemVariantSchema,
} from '@/models/Schema';

// =============================================================================
// TYPES
// =============================================================================

export type CatalogItemType = 'merchandise' | 'event_access';

// Maximum number of variants allowed per catalog item
export const MAX_VARIANTS_PER_ITEM = 8;

export type CatalogVariant = {
  id: string;
  catalogItemId: string;
  name: string;
  price: number;
  stockQuantity: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CatalogItemImage = {
  id: string;
  catalogItemId: string;
  url: string;
  thumbnailUrl: string | null;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: Date;
};

export type CatalogCategory = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
};

export type CatalogItem = {
  id: string;
  organizationId: string;
  type: CatalogItemType;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  sku: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  eventId: string | null;
  maxPerOrder: number;
  trackInventory: boolean;
  lowStockThreshold: number;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  showOnKiosk: boolean;
  createdAt: Date;
  updatedAt: Date;
  variants: CatalogVariant[];
  images: CatalogItemImage[];
  categories: CatalogCategory[];
  totalStock: number;
};

type CreateCatalogItemInput = {
  id?: string;
  type: CatalogItemType;
  name: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  sku?: string;
  basePrice: number;
  compareAtPrice?: number | null;
  eventId?: string | null;
  maxPerOrder?: number;
  trackInventory?: boolean;
  lowStockThreshold?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  showOnKiosk?: boolean;
  categoryIds?: string[];
  variants?: Array<{ name: string; price: number; stockQuantity: number }>;
};

type UpdateCatalogItemInput = {
  id: string;
  type?: CatalogItemType;
  name?: string;
  slug?: string;
  description?: string | null;
  shortDescription?: string | null;
  sku?: string | null;
  basePrice?: number;
  compareAtPrice?: number | null;
  eventId?: string | null;
  maxPerOrder?: number;
  trackInventory?: boolean;
  lowStockThreshold?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  showOnKiosk?: boolean;
  categoryIds?: string[];
  variants?: Array<{ name: string; price: number; stockQuantity: number }>;
};

type CreateVariantInput = {
  id?: string;
  catalogItemId: string;
  name: string;
  price: number;
  stockQuantity?: number;
};

type UpdateVariantInput = {
  id: string;
  name?: string;
  price?: number;
  stockQuantity?: number;
};

type CreateCategoryInput = {
  id?: string;
  name: string;
  slug?: string;
  description?: string;
  parentId?: string | null;
  isActive?: boolean;
};

type UpdateCategoryInput = {
  id: string;
  name?: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
  isActive?: boolean;
};

type CreateImageInput = {
  id?: string;
  catalogItemId: string;
  url: string;
  thumbnailUrl?: string | null;
  altText?: string;
  isPrimary?: boolean;
};

/**
 * Thrown when a catalog variant/image/item cannot be resolved within the
 * caller's organization. Routers map this to a 404 so a cross-tenant probe is
 * indistinguishable from a genuinely missing row.
 */
export class CatalogNotFoundError extends Error {
  constructor(message = 'Catalog resource not found') {
    super(message);
    this.name = 'CatalogNotFoundError';
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Verify a catalog item belongs to the given organization. Throws
 * CatalogNotFoundError (→ 404) on miss so a caller in org A cannot mutate
 * org B's item by supplying its id.
 */
async function assertItemInOrg(catalogItemId: string, organizationId: string): Promise<void> {
  const rows = await db
    .select({ id: catalogItemSchema.id })
    .from(catalogItemSchema)
    .where(and(eq(catalogItemSchema.id, catalogItemId), eq(catalogItemSchema.organizationId, organizationId)))
    .limit(1);

  if (rows.length === 0) {
    throw new CatalogNotFoundError('Catalog item not found');
  }
}

/**
 * Resolve a variant's parent catalog item id, but only if the variant's item
 * belongs to the given organization. Returns the parent item id, or throws
 * CatalogNotFoundError (→ 404) when the variant is missing or cross-tenant.
 */
async function resolveVariantItemInOrg(variantId: string, organizationId: string): Promise<string> {
  const rows = await db
    .select({ catalogItemId: catalogItemVariantSchema.catalogItemId })
    .from(catalogItemVariantSchema)
    .innerJoin(catalogItemSchema, eq(catalogItemVariantSchema.catalogItemId, catalogItemSchema.id))
    .where(and(eq(catalogItemVariantSchema.id, variantId), eq(catalogItemSchema.organizationId, organizationId)))
    .limit(1);

  const parentId = rows[0]?.catalogItemId;
  if (!parentId) {
    throw new CatalogNotFoundError('Variant not found');
  }
  return parentId;
}

/**
 * Verify an image belongs to a catalog item within the given organization.
 * Throws CatalogNotFoundError (→ 404) when the image is missing or cross-tenant.
 */
async function assertImageInOrg(imageId: string, organizationId: string): Promise<void> {
  const rows = await db
    .select({ id: catalogItemImageSchema.id })
    .from(catalogItemImageSchema)
    .innerJoin(catalogItemSchema, eq(catalogItemImageSchema.catalogItemId, catalogItemSchema.id))
    .where(and(eq(catalogItemImageSchema.id, imageId), eq(catalogItemSchema.organizationId, organizationId)))
    .limit(1);

  if (rows.length === 0) {
    throw new CatalogNotFoundError('Image not found');
  }
}

// =============================================================================
// CATALOG ITEM SERVICE FUNCTIONS
// =============================================================================

/**
 * Get all catalog items for an organization with variants, images, and categories
 */
export async function getOrganizationCatalogItems(organizationId: string): Promise<CatalogItem[]> {
  const items = await db
    .select()
    .from(catalogItemSchema)
    .where(eq(catalogItemSchema.organizationId, organizationId));

  if (items.length === 0) {
    return [];
  }

  const itemIds = items.map(item => item.id);

  // Fetch all related data in parallel
  const [variants, images, itemCategories, allCategories] = await Promise.all([
    db.select().from(catalogItemVariantSchema).where(inArray(catalogItemVariantSchema.catalogItemId, itemIds)),
    db.select().from(catalogItemImageSchema).where(inArray(catalogItemImageSchema.catalogItemId, itemIds)),
    db.select().from(catalogItemCategorySchema).where(inArray(catalogItemCategorySchema.catalogItemId, itemIds)),
    db.select().from(catalogCategorySchema).where(eq(catalogCategorySchema.organizationId, organizationId)),
  ]);

  // Create lookup maps
  const categoryMap = new Map<string, CatalogCategory>();
  allCategories.forEach((cat) => {
    categoryMap.set(cat.id, {
      id: cat.id,
      organizationId: cat.organizationId,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      parentId: cat.parentId,
      sortOrder: cat.sortOrder ?? 0,
      isActive: cat.isActive ?? true,
      createdAt: cat.createdAt,
    });
  });

  // Group variants by item
  const variantsByItem = new Map<string, CatalogVariant[]>();
  variants.forEach((v) => {
    const existing = variantsByItem.get(v.catalogItemId) || [];
    existing.push({
      id: v.id,
      catalogItemId: v.catalogItemId,
      name: v.name,
      price: v.price,
      stockQuantity: v.stockQuantity ?? 0,
      sortOrder: v.sortOrder ?? 0,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    });
    variantsByItem.set(v.catalogItemId, existing);
  });

  // Group images by item
  const imagesByItem = new Map<string, CatalogItemImage[]>();
  images.forEach((img) => {
    const existing = imagesByItem.get(img.catalogItemId) || [];
    existing.push({
      id: img.id,
      catalogItemId: img.catalogItemId,
      url: img.url,
      thumbnailUrl: img.thumbnailUrl,
      altText: img.altText,
      isPrimary: img.isPrimary ?? false,
      sortOrder: img.sortOrder ?? 0,
      createdAt: img.createdAt,
    });
    imagesByItem.set(img.catalogItemId, existing);
  });

  // Group categories by item
  const categoriesByItem = new Map<string, CatalogCategory[]>();
  itemCategories.forEach((ic) => {
    const category = categoryMap.get(ic.categoryId);
    if (category) {
      const existing = categoriesByItem.get(ic.catalogItemId) || [];
      existing.push(category);
      categoriesByItem.set(ic.catalogItemId, existing);
    }
  });

  return items.map((item) => {
    const itemVariants = variantsByItem.get(item.id) || [];
    const totalStock = itemVariants.reduce((sum, v) => sum + v.stockQuantity, 0);

    return {
      id: item.id,
      organizationId: item.organizationId,
      type: item.type as CatalogItemType,
      name: item.name,
      slug: item.slug,
      description: item.description,
      shortDescription: item.shortDescription,
      sku: item.sku,
      basePrice: item.basePrice,
      compareAtPrice: item.compareAtPrice,
      eventId: item.eventId,
      maxPerOrder: item.maxPerOrder ?? 10,
      trackInventory: item.trackInventory ?? true,
      lowStockThreshold: item.lowStockThreshold ?? 5,
      sortOrder: item.sortOrder ?? 0,
      isActive: item.isActive ?? true,
      isFeatured: item.isFeatured ?? false,
      showOnKiosk: item.showOnKiosk ?? true,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      variants: itemVariants.sort((a, b) => a.sortOrder - b.sortOrder),
      images: (imagesByItem.get(item.id) || []).sort((a, b) => a.sortOrder - b.sortOrder),
      categories: categoriesByItem.get(item.id) || [],
      totalStock,
    };
  });
}

/**
 * Get a single catalog item by ID
 */
export async function getCatalogItemById(itemId: string, organizationId: string): Promise<CatalogItem | null> {
  const items = await getOrganizationCatalogItems(organizationId);
  return items.find(item => item.id === itemId) || null;
}

/**
 * Get catalog items by type
 */
export async function getCatalogItemsByType(organizationId: string, type: CatalogItemType): Promise<CatalogItem[]> {
  const items = await getOrganizationCatalogItems(organizationId);
  return items.filter(item => item.type === type);
}

/**
 * Get catalog items visible on kiosk
 */
export async function getKioskCatalogItems(organizationId: string): Promise<CatalogItem[]> {
  const items = await getOrganizationCatalogItems(organizationId);
  return items.filter(item => item.showOnKiosk && item.isActive);
}

/**
 * Create a new catalog item
 */
export async function createCatalogItem(input: CreateCatalogItemInput, organizationId: string): Promise<CatalogItem> {
  const { categoryIds, variants, ...itemData } = input;
  const itemId = itemData.id || randomUUID();
  const slug = itemData.slug || generateSlug(itemData.name);

  // Validate variant count
  if (variants && variants.length > MAX_VARIANTS_PER_ITEM) {
    throw new Error(`Maximum ${MAX_VARIANTS_PER_ITEM} variants allowed per item`);
  }

  await db.insert(catalogItemSchema).values({
    id: itemId,
    organizationId,
    type: itemData.type,
    name: itemData.name,
    slug,
    description: itemData.description,
    shortDescription: itemData.shortDescription,
    sku: itemData.sku,
    basePrice: itemData.basePrice,
    compareAtPrice: itemData.compareAtPrice,
    eventId: itemData.eventId,
    maxPerOrder: itemData.maxPerOrder ?? 10,
    trackInventory: itemData.trackInventory ?? true,
    lowStockThreshold: itemData.lowStockThreshold ?? 5,
    isActive: itemData.isActive ?? true,
    isFeatured: itemData.isFeatured ?? false,
    showOnKiosk: itemData.showOnKiosk ?? true,
  });

  // Add category associations
  if (categoryIds && categoryIds.length > 0) {
    await db.insert(catalogItemCategorySchema).values(
      categoryIds.map(categoryId => ({
        catalogItemId: itemId,
        categoryId,
      })),
    );
  }

  // Add variants if provided
  if (variants && variants.length > 0) {
    await db.insert(catalogItemVariantSchema).values(
      variants.map((variant, index) => ({
        id: randomUUID(),
        catalogItemId: itemId,
        name: variant.name,
        price: variant.price,
        stockQuantity: variant.stockQuantity,
        sortOrder: index,
      })),
    );
  }

  const item = await getCatalogItemById(itemId, organizationId);
  if (!item) {
    throw new Error('Failed to create catalog item');
  }
  return item;
}

/**
 * Update an existing catalog item
 */
export async function updateCatalogItem(input: UpdateCatalogItemInput, organizationId: string): Promise<CatalogItem> {
  const { id, categoryIds, variants, ...updateData } = input;

  // Validate variant count
  if (variants && variants.length > MAX_VARIANTS_PER_ITEM) {
    throw new Error(`Maximum ${MAX_VARIANTS_PER_ITEM} variants allowed per item`);
  }

  // Generate slug if name is being updated and slug is not provided
  const dataToUpdate: Record<string, unknown> = { ...updateData };
  if (updateData.name && !updateData.slug) {
    dataToUpdate.slug = generateSlug(updateData.name);
  }

  await db
    .update(catalogItemSchema)
    .set(dataToUpdate)
    .where(and(eq(catalogItemSchema.id, id), eq(catalogItemSchema.organizationId, organizationId)));

  // Update category associations if provided
  if (categoryIds !== undefined) {
    // Remove existing associations
    await db.delete(catalogItemCategorySchema).where(eq(catalogItemCategorySchema.catalogItemId, id));

    // Add new associations
    if (categoryIds.length > 0) {
      await db.insert(catalogItemCategorySchema).values(
        categoryIds.map(categoryId => ({
          catalogItemId: id,
          categoryId,
        })),
      );
    }
  }

  // Update variants if provided
  if (variants !== undefined) {
    // Remove existing variants
    await db.delete(catalogItemVariantSchema).where(eq(catalogItemVariantSchema.catalogItemId, id));

    // Add new variants
    if (variants.length > 0) {
      await db.insert(catalogItemVariantSchema).values(
        variants.map((variant, index) => ({
          id: randomUUID(),
          catalogItemId: id,
          name: variant.name,
          price: variant.price,
          stockQuantity: variant.stockQuantity,
          sortOrder: index,
        })),
      );
    }
  }

  const item = await getCatalogItemById(id, organizationId);
  if (!item) {
    throw new Error('Catalog item not found');
  }
  return item;
}

/**
 * Delete a catalog item (and all associated variants, images, category associations)
 */
export async function deleteCatalogItem(itemId: string, organizationId: string): Promise<void> {
  // Delete associated data first
  await db.delete(catalogItemCategorySchema).where(eq(catalogItemCategorySchema.catalogItemId, itemId));
  await db.delete(catalogItemImageSchema).where(eq(catalogItemImageSchema.catalogItemId, itemId));
  await db.delete(catalogItemVariantSchema).where(eq(catalogItemVariantSchema.catalogItemId, itemId));

  // Delete the item itself
  await db
    .delete(catalogItemSchema)
    .where(and(eq(catalogItemSchema.id, itemId), eq(catalogItemSchema.organizationId, organizationId)));
}

// =============================================================================
// VARIANT SERVICE FUNCTIONS
// =============================================================================

/**
 * Create a variant for a catalog item
 */
export async function createCatalogVariant(input: CreateVariantInput, organizationId: string): Promise<CatalogVariant> {
  const variantId = input.id || randomUUID();

  // Org-scope: the target item must belong to the caller's organization.
  await assertItemInOrg(input.catalogItemId, organizationId);

  // Check variant count for the item
  const existingVariants = await db
    .select()
    .from(catalogItemVariantSchema)
    .where(eq(catalogItemVariantSchema.catalogItemId, input.catalogItemId));

  if (existingVariants.length >= MAX_VARIANTS_PER_ITEM) {
    throw new Error(`Maximum ${MAX_VARIANTS_PER_ITEM} variants allowed per item`);
  }

  const result = await db
    .insert(catalogItemVariantSchema)
    .values({
      id: variantId,
      catalogItemId: input.catalogItemId,
      name: input.name,
      price: input.price,
      stockQuantity: input.stockQuantity ?? 0,
      sortOrder: existingVariants.length,
    })
    .returning();

  const variant = result[0];
  if (!variant) {
    throw new Error('Failed to create variant');
  }

  return {
    id: variant.id,
    catalogItemId: variant.catalogItemId,
    name: variant.name,
    price: variant.price,
    stockQuantity: variant.stockQuantity ?? 0,
    sortOrder: variant.sortOrder ?? 0,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };
}

/**
 * Update a variant
 */
export async function updateCatalogVariant(input: UpdateVariantInput, organizationId: string): Promise<CatalogVariant> {
  const { id, ...updateData } = input;

  // Org-scope: reject a cross-tenant variant id before mutating.
  await resolveVariantItemInOrg(id, organizationId);

  const result = await db
    .update(catalogItemVariantSchema)
    .set(updateData)
    .where(eq(catalogItemVariantSchema.id, id))
    .returning();

  const variant = result[0];
  if (!variant) {
    throw new Error('Variant not found');
  }

  return {
    id: variant.id,
    catalogItemId: variant.catalogItemId,
    name: variant.name,
    price: variant.price,
    stockQuantity: variant.stockQuantity ?? 0,
    sortOrder: variant.sortOrder ?? 0,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };
}

/**
 * Delete a variant
 */
export async function deleteCatalogVariant(variantId: string, organizationId: string): Promise<void> {
  // Org-scope: reject a cross-tenant variant id before deleting.
  await resolveVariantItemInOrg(variantId, organizationId);

  await db.delete(catalogItemVariantSchema).where(eq(catalogItemVariantSchema.id, variantId));
}

/**
 * Adjust variant stock quantity
 */
export async function adjustVariantStock(variantId: string, adjustment: number, organizationId: string): Promise<CatalogVariant> {
  // Org-scope: reject a cross-tenant variant id before mutating stock.
  await resolveVariantItemInOrg(variantId, organizationId);

  // Get current stock
  const variants = await db
    .select()
    .from(catalogItemVariantSchema)
    .where(eq(catalogItemVariantSchema.id, variantId));

  const variant = variants[0];
  if (!variant) {
    throw new Error('Variant not found');
  }

  const newStock = Math.max(0, (variant.stockQuantity ?? 0) + adjustment);

  const result = await db
    .update(catalogItemVariantSchema)
    .set({ stockQuantity: newStock })
    .where(eq(catalogItemVariantSchema.id, variantId))
    .returning();

  const updated = result[0];
  if (!updated) {
    throw new Error('Failed to update stock');
  }

  return {
    id: updated.id,
    catalogItemId: updated.catalogItemId,
    name: updated.name,
    price: updated.price,
    stockQuantity: updated.stockQuantity ?? 0,
    sortOrder: updated.sortOrder ?? 0,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

// =============================================================================
// CATEGORY SERVICE FUNCTIONS
// =============================================================================

/**
 * Get all categories for an organization
 */
export async function getOrganizationCategories(organizationId: string): Promise<CatalogCategory[]> {
  const categories = await db
    .select()
    .from(catalogCategorySchema)
    .where(eq(catalogCategorySchema.organizationId, organizationId));

  return categories.map(cat => ({
    id: cat.id,
    organizationId: cat.organizationId,
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    parentId: cat.parentId,
    sortOrder: cat.sortOrder ?? 0,
    isActive: cat.isActive ?? true,
    createdAt: cat.createdAt,
  }));
}

/**
 * Create a category
 */
export async function createCategory(input: CreateCategoryInput, organizationId: string): Promise<CatalogCategory> {
  const categoryId = input.id || randomUUID();
  const slug = input.slug || generateSlug(input.name);

  const result = await db
    .insert(catalogCategorySchema)
    .values({
      id: categoryId,
      organizationId,
      name: input.name,
      slug,
      description: input.description,
      parentId: input.parentId,
      isActive: input.isActive ?? true,
    })
    .returning();

  const category = result[0];
  if (!category) {
    throw new Error('Failed to create category');
  }

  return {
    id: category.id,
    organizationId: category.organizationId,
    name: category.name,
    slug: category.slug,
    description: category.description,
    parentId: category.parentId,
    sortOrder: category.sortOrder ?? 0,
    isActive: category.isActive ?? true,
    createdAt: category.createdAt,
  };
}

/**
 * Update a category
 */
export async function updateCategory(input: UpdateCategoryInput, organizationId: string): Promise<CatalogCategory> {
  const { id, ...updateData } = input;

  // Generate slug if name is being updated and slug is not provided
  const dataToUpdate: Record<string, unknown> = { ...updateData };
  if (updateData.name && !updateData.slug) {
    dataToUpdate.slug = generateSlug(updateData.name);
  }

  const result = await db
    .update(catalogCategorySchema)
    .set(dataToUpdate)
    .where(and(eq(catalogCategorySchema.id, id), eq(catalogCategorySchema.organizationId, organizationId)))
    .returning();

  const category = result[0];
  if (!category) {
    throw new Error('Category not found');
  }

  return {
    id: category.id,
    organizationId: category.organizationId,
    name: category.name,
    slug: category.slug,
    description: category.description,
    parentId: category.parentId,
    sortOrder: category.sortOrder ?? 0,
    isActive: category.isActive ?? true,
    createdAt: category.createdAt,
  };
}

/**
 * Delete a category (only if not in use)
 */
export async function deleteCategory(categoryId: string, organizationId: string): Promise<void> {
  // Check if category is in use
  const usages = await db
    .select()
    .from(catalogItemCategorySchema)
    .where(eq(catalogItemCategorySchema.categoryId, categoryId));

  if (usages.length > 0) {
    throw new Error('Cannot delete category that is in use by catalog items');
  }

  await db
    .delete(catalogCategorySchema)
    .where(and(eq(catalogCategorySchema.id, categoryId), eq(catalogCategorySchema.organizationId, organizationId)));
}

// =============================================================================
// IMAGE SERVICE FUNCTIONS
// =============================================================================

/**
 * Add an image to a catalog item
 */
export async function createCatalogImage(input: CreateImageInput, organizationId: string): Promise<CatalogItemImage> {
  const imageId = input.id || randomUUID();

  // Org-scope: the target item must belong to the caller's organization.
  await assertItemInOrg(input.catalogItemId, organizationId);

  // If this is marked as primary, unset other primary images for this item
  if (input.isPrimary) {
    await db
      .update(catalogItemImageSchema)
      .set({ isPrimary: false })
      .where(eq(catalogItemImageSchema.catalogItemId, input.catalogItemId));
  }

  const result = await db
    .insert(catalogItemImageSchema)
    .values({
      id: imageId,
      catalogItemId: input.catalogItemId,
      url: input.url,
      thumbnailUrl: input.thumbnailUrl,
      altText: input.altText,
      isPrimary: input.isPrimary ?? false,
    })
    .returning();

  const image = result[0];
  if (!image) {
    throw new Error('Failed to create image');
  }

  return {
    id: image.id,
    catalogItemId: image.catalogItemId,
    url: image.url,
    thumbnailUrl: image.thumbnailUrl,
    altText: image.altText,
    isPrimary: image.isPrimary ?? false,
    sortOrder: image.sortOrder ?? 0,
    createdAt: image.createdAt,
  };
}

/**
 * Delete an image
 */
export async function deleteCatalogImage(imageId: string, organizationId: string): Promise<void> {
  // Org-scope: reject a cross-tenant image id before deleting.
  await assertImageInOrg(imageId, organizationId);

  await db.delete(catalogItemImageSchema).where(eq(catalogItemImageSchema.id, imageId));
}
