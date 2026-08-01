'use client';

import type { CatalogFilters, CatalogItem, CatalogItemFormData } from './types';
import { Package, Plus, Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination/Pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCatalogCache, useCatalogCategoriesCache } from '@/hooks/useCatalogCache';
import { useEventsCache } from '@/hooks/useEventsCache';
import { client } from '@/libs/Orpc';
import { StatsCards } from '@/templates/StatsCards';
import { AddEditCatalogItemModal } from './AddEditCatalogItemModal';
import { CatalogCategoriesManagement } from './CatalogCategoriesManagement';
import { CatalogFilterBar } from './CatalogFilterBar';
import { CatalogItemCard } from './CatalogItemCard';
import { DeleteCatalogItemAlertDialog } from './DeleteCatalogItemAlertDialog';
import { getPrimaryImage } from './types';

type CatalogPageProps = {
  organizationId: string;
};

// Page-size options for the catalog grid. Bounds how many CatalogItemCards
// (each carrying a base64 image) are rendered at once.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    </div>
  );
}

export function CatalogPage({ organizationId }: CatalogPageProps) {
  const t = useTranslations('CatalogPage');
  const { items, loading, revalidating, error, revalidate } = useCatalogCache(organizationId);
  const {
    categories,
    loading: categoriesLoading,
    revalidate: revalidateCategories,
  } = useCatalogCategoriesCache(organizationId);
  const {
    events,
    loading: eventsLoading,
  } = useEventsCache(organizationId);

  // State
  const [filters, setFilters] = useState<CatalogFilters>({
    search: '',
    type: '',
    category: '',
    stock: '',
  });
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  // Reset to the first page whenever the filters change — otherwise a filtered
  // result could leave you on an out-of-range page.
  const handleFiltersChange = useCallback((newFilters: CatalogFilters) => {
    setFilters(newFilters);
    setCurrentPage(0);
  }, []);

  const handlePageSizeChange = useCallback((value: string) => {
    const size = Number.parseInt(value, 10);
    if (!Number.isNaN(size)) {
      setPageSize(size);
      setCurrentPage(0);
    }
  }, []);

  // Computed values
  const stats = useMemo(() => {
    const total = items.length;
    const merchandise = items.filter(i => i.type === 'merchandise').length;
    const eventAccess = items.filter(i => i.type === 'event_access').length;
    const outOfStock = items.filter(i => i.trackInventory && i.totalStock === 0).length;
    return { total, merchandise, eventAccess, outOfStock };
  }, [items]);

  const statsData = useMemo(() => [
    { id: 'total', label: t('total_items_label'), value: stats.total },
    { id: 'merchandise', label: t('merchandise_label'), value: stats.merchandise },
    { id: 'eventAccess', label: t('event_access_label'), value: stats.eventAccess },
    { id: 'outOfStock', label: t('out_of_stock_label'), value: stats.outOfStock },
  ], [stats, t]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch
          = item.name.toLowerCase().includes(searchLower)
            || item.sku?.toLowerCase().includes(searchLower)
            || item.shortDescription?.toLowerCase().includes(searchLower);
        if (!matchesSearch) {
          return false;
        }
      }

      if (filters.type && item.type !== filters.type) {
        return false;
      }

      if (filters.category) {
        const hasCategory = item.categories.some(c => c.id === filters.category);
        if (!hasCategory) {
          return false;
        }
      }

      if (filters.stock) {
        const isInStock = !item.trackInventory || item.totalStock > 0;
        if (filters.stock === 'in_stock' && !isInStock) {
          return false;
        }
        if (filters.stock === 'out_of_stock' && isInStock) {
          return false;
        }
      }

      return true;
    });
  }, [items, filters]);

  const totalPages = Math.ceil(filteredItems.length / pageSize);
  const paginatedItems = filteredItems.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );

  const deleteItem = items.find(i => i.id === deleteItemId);

  // Handlers
  const handleAddItem = useCallback(() => {
    setEditingItem(null);
    setIsAddEditModalOpen(true);
  }, []);

  const handleEditItem = useCallback((item: CatalogItem) => {
    setEditingItem(item);
    setIsAddEditModalOpen(true);
  }, []);

  const handleDeleteItem = useCallback((itemId: string) => {
    setDeleteItemId(itemId);
  }, []);

  const handleSaveItem = useCallback(async (formData: CatalogItemFormData, isEdit: boolean, itemId?: string) => {
    try {
      let savedItemId: string | undefined;

      if (isEdit && itemId) {
        // Update existing item
        await client.catalog.update({
          id: itemId,
          ...formData,
          description: formData.description || null,
          shortDescription: formData.shortDescription || null,
          sku: formData.sku || null,
        });

        // Handle image updates
        const existingItem = items.find(i => i.id === itemId);
        const existingImage = existingItem ? getPrimaryImage(existingItem) : null;

        // Check if image changed - either new data URL or removed
        const isNewDataUrl = formData.imageDataUrl?.startsWith('data:');
        const imageRemoved = !formData.imageDataUrl && existingImage;
        const imageChanged = isNewDataUrl || imageRemoved;

        if (imageChanged) {
          // Delete existing primary image if there is one
          if (existingImage) {
            await client.catalog.imageRemove({ id: existingImage.id });
          }

          // Create new image if data URL is provided
          if (formData.imageDataUrl && isNewDataUrl) {
            await client.catalog.imageCreate({
              catalogItemId: itemId,
              url: formData.imageDataUrl,
              thumbnailUrl: null,
              isPrimary: true,
            });
          }
        }
      } else {
        // Create new item
        const result = await client.catalog.create({
          ...formData,
          description: formData.description || undefined,
          shortDescription: formData.shortDescription || undefined,
          sku: formData.sku || undefined,
        });
        savedItemId = result.item.id;

        // Create image if data URL is provided
        if (formData.imageDataUrl && savedItemId) {
          await client.catalog.imageCreate({
            catalogItemId: savedItemId,
            url: formData.imageDataUrl,
            thumbnailUrl: null,
            isPrimary: true,
          });
        }
      }
      revalidate();
    } catch (err) {
      console.error('Failed to save catalog item:', err);
    }
  }, [revalidate, items]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteItemId) {
      return;
    }
    try {
      await client.catalog.remove({ id: deleteItemId });
      revalidate();
    } catch (err) {
      console.error('Failed to delete catalog item:', err);
    }
    setDeleteItemId(null);
  }, [deleteItemId, revalidate]);

  const handleCreateCategory = useCallback(async (data: { name: string; description?: string }) => {
    try {
      await client.catalog.categoryCreate({
        name: data.name,
        description: data.description,
      });
      revalidateCategories();
    } catch (err) {
      console.error('Failed to create category:', err);
    }
  }, [revalidateCategories]);

  const handleUpdateCategory = useCallback(async (id: string, data: { name: string; description?: string }) => {
    try {
      await client.catalog.categoryUpdate({
        id,
        name: data.name,
        description: data.description || null,
      });
      revalidateCategories();
    } catch (err) {
      console.error('Failed to update category:', err);
    }
  }, [revalidateCategories]);

  const handleDeleteCategory = useCallback(async (id: string) => {
    try {
      await client.catalog.categoryRemove({ id });
      revalidateCategories();
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
  }, [revalidateCategories]);

  // Only show skeleton on initial load, not during revalidation
  // This prevents modals from being unmounted during background data refresh
  const isInitialLoading = (loading && !revalidating) || categoriesLoading || eventsLoading;

  if (isInitialLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="error">
        {error}
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <StatsCards stats={statsData} columns={4} />

      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
        <Button variant="outline" onClick={() => setIsCategoriesModalOpen(true)}>
          <Tags className="mr-1 size-4" />
          {t('manage_categories_button')}
        </Button>
      </div>

      {/* Filter Bar and Add Button */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {/* Filter Bar */}
          <div className="flex-1">
            <CatalogFilterBar
              filters={filters}
              onFiltersChange={handleFiltersChange}
              categories={categories}
              items={items}
            />
          </div>

          {/* Add Item Button */}
          <Button onClick={handleAddItem}>
            <Plus className="size-4" />
            <span className="ml-1 hidden sm:inline">{t('add_item_button')}</span>
          </Button>
        </div>
      </div>

      {/* Content */}
      {filteredItems.length === 0
        ? (
            <div className="py-12 text-center">
              <Package className="mx-auto size-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">
                {items.length === 0 ? t('no_items_found') : t('no_results_found')}
              </p>
            </div>
          )
        : (
            <>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {paginatedItems.map(item => (
                  <CatalogItemCard
                    key={item.id}
                    item={item}
                    onEdit={handleEditItem}
                    onDelete={handleDeleteItem}
                  />
                ))}
              </div>

              {/* Pagination + page-size selector */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rows per page</span>
                  <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                    <SelectTrigger size="sm" className="w-20" aria-label="Rows per page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map(size => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredItems.length}
                  itemsPerPage={pageSize}
                  onPageChangeAction={setCurrentPage}
                />
              </div>
            </>
          )}

      {/* Modals */}
      <AddEditCatalogItemModal
        isOpen={isAddEditModalOpen}
        onCloseAction={() => setIsAddEditModalOpen(false)}
        item={editingItem}
        categories={categories}
        events={events}
        onSaveAction={handleSaveItem}
      />

      <DeleteCatalogItemAlertDialog
        isOpen={!!deleteItemId}
        itemName={deleteItem?.name || ''}
        onCloseAction={() => setDeleteItemId(null)}
        onConfirmAction={handleConfirmDelete}
      />

      <CatalogCategoriesManagement
        open={isCategoriesModalOpen}
        onOpenChange={setIsCategoriesModalOpen}
        categories={categories}
        loading={categoriesLoading}
        onCreateAction={handleCreateCategory}
        onUpdateAction={handleUpdateCategory}
        onDeleteAction={handleDeleteCategory}
      />
    </div>
  );
}
