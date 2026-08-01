'use client';

import type { CatalogCategory, CatalogFilters, CatalogItem } from './types';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CatalogFilterBarProps = {
  filters: CatalogFilters;
  onFiltersChange: (filters: CatalogFilters) => void;
  categories: CatalogCategory[];
  items: CatalogItem[];
};

export function CatalogFilterBar({
  filters,
  onFiltersChange,
  categories,
  items,
}: CatalogFilterBarProps) {
  const t = useTranslations('CatalogPage');

  const updateFilters = useCallback((newFilters: Partial<CatalogFilters>) => {
    const updated = { ...filters, ...newFilters };
    onFiltersChange(updated);
  }, [filters, onFiltersChange]);

  // Compute available filter options based on currently filtered items
  const availableOptions = useMemo(() => {
    // Apply filters to get the current filtered set (excluding the filter we're computing options for)
    const getFilteredItems = (excludeFilter: keyof CatalogFilters) => {
      return items.filter((item) => {
        if (excludeFilter !== 'search' && filters.search) {
          const searchLower = filters.search.toLowerCase();
          const matchesSearch
            = item.name.toLowerCase().includes(searchLower)
              || item.sku?.toLowerCase().includes(searchLower)
              || item.shortDescription?.toLowerCase().includes(searchLower);
          if (!matchesSearch) {
            return false;
          }
        }
        if (excludeFilter !== 'type' && filters.type) {
          if (item.type !== filters.type) {
            return false;
          }
        }
        if (excludeFilter !== 'category' && filters.category) {
          const hasCategory = item.categories.some(c => c.id === filters.category);
          if (!hasCategory) {
            return false;
          }
        }
        if (excludeFilter !== 'stock' && filters.stock) {
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
    };

    // Get available types from items filtered by other criteria
    const itemsForTypes = getFilteredItems('type');
    const availableTypes = new Set(itemsForTypes.map(i => i.type));

    // Get available categories from items filtered by other criteria
    const itemsForCategories = getFilteredItems('category');
    const availableCategoryIds = new Set(
      itemsForCategories.flatMap(i => i.categories.map(c => c.id)),
    );

    // Get available stock options from items filtered by other criteria
    const itemsForStock = getFilteredItems('stock');
    const hasInStock = itemsForStock.some(i => !i.trackInventory || i.totalStock > 0);
    const hasOutOfStock = itemsForStock.some(i => i.trackInventory && i.totalStock === 0);

    return {
      types: availableTypes,
      categoryIds: availableCategoryIds,
      hasInStock,
      hasOutOfStock,
    };
  }, [items, filters]);

  const activeCategories = categories.filter(c => c.isActive);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Search Input */}
      <div className="relative min-w-0 flex-1 sm:max-w-72">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('search_placeholder')}
          value={filters.search}
          onChange={e => updateFilters({ search: e.target.value })}
          className="pl-9"
        />
      </div>

      {/* Type Filter */}
      <Select
        value={filters.type || '_all'}
        onValueChange={value => updateFilters({ type: value === '_all' ? '' : value })}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder={t('type_filter')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">{t('type_filter')}</SelectItem>
          {availableOptions.types.has('merchandise') && (
            <SelectItem value="merchandise">{t('type_merchandise')}</SelectItem>
          )}
          {availableOptions.types.has('event_access') && (
            <SelectItem value="event_access">{t('type_event_access')}</SelectItem>
          )}
        </SelectContent>
      </Select>

      {/* Category Filter */}
      <Select
        value={filters.category || '_all'}
        onValueChange={value => updateFilters({ category: value === '_all' ? '' : value })}
      >
        <SelectTrigger className="w-45">
          <SelectValue placeholder={t('category_filter')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">{t('category_filter')}</SelectItem>
          {activeCategories
            .filter(category => availableOptions.categoryIds.has(category.id))
            .map(category => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {/* Stock Filter */}
      <Select
        value={filters.stock || '_all'}
        onValueChange={value => updateFilters({ stock: value === '_all' ? '' : value })}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder={t('stock_filter')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">{t('stock_filter')}</SelectItem>
          {availableOptions.hasInStock && (
            <SelectItem value="in_stock">{t('stock_in_stock')}</SelectItem>
          )}
          {availableOptions.hasOutOfStock && (
            <SelectItem value="out_of_stock">{t('stock_out_of_stock')}</SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export type { CatalogFilters };
