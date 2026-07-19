'use client';

import type { CatalogCategory, CatalogItem, CatalogItemFormData, CatalogItemType, VariantInput } from './types';
import type { EventData } from '@/hooks/useEventsCache';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImageUploadField } from '@/components/ui/image-upload';
import { Input } from '@/components/ui/input/input';
import { Label } from '@/components/ui/label/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/select';
import { Textarea } from '@/components/ui/textarea';
import { getPrimaryImage, MAX_VARIANTS_PER_ITEM } from './types';

type AddEditCatalogItemModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  item?: CatalogItem | null;
  categories: CatalogCategory[];
  events: EventData[];
  onSaveAction: (formData: CatalogItemFormData, isEdit: boolean, itemId?: string) => Promise<void>;
};

function getInitialFormData(item?: CatalogItem | null): CatalogItemFormData {
  if (item) {
    const primaryImage = getPrimaryImage(item);
    return {
      type: item.type,
      name: item.name,
      description: item.description || '',
      shortDescription: item.shortDescription || '',
      sku: item.sku || '',
      basePrice: item.basePrice,
      compareAtPrice: item.compareAtPrice,
      eventId: item.eventId,
      maxPerOrder: item.maxPerOrder,
      trackInventory: item.trackInventory,
      lowStockThreshold: item.lowStockThreshold,
      isActive: item.isActive,
      isFeatured: item.isFeatured,
      showOnKiosk: item.showOnKiosk,
      variants: item.variants.map(v => ({ tempId: v.id || crypto.randomUUID(), name: v.name, price: v.price, stockQuantity: v.stockQuantity })),
      categoryIds: item.categories.map(c => c.id),
      imageDataUrl: primaryImage?.url || null,
    };
  }

  return {
    type: 'merchandise',
    name: '',
    description: '',
    shortDescription: '',
    sku: '',
    basePrice: 0,
    compareAtPrice: null,
    eventId: null,
    maxPerOrder: 10,
    trackInventory: true,
    lowStockThreshold: 5,
    isActive: true,
    isFeatured: false,
    showOnKiosk: true,
    variants: [],
    categoryIds: [],
    imageDataUrl: null,
  };
}

type CatalogItemFormContentProps = {
  item?: CatalogItem | null;
  categories: CatalogCategory[];
  events: EventData[];
  onCloseAction: () => void;
  onSaveAction: (formData: CatalogItemFormData, isEdit: boolean, itemId?: string) => Promise<void>;
};

function CatalogItemFormContent({
  item,
  categories,
  events,
  onCloseAction,
  onSaveAction,
}: CatalogItemFormContentProps) {
  const t = useTranslations('AddEditCatalogItemModal');
  const [formData, setFormData] = useState<CatalogItemFormData>(() => getInitialFormData(item));
  const [errors, setErrors] = useState<Partial<Record<keyof CatalogItemFormData, string>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New variant form state
  const [newVariantName, setNewVariantName] = useState('');
  const [newVariantPrice, setNewVariantPrice] = useState(0);
  const [newVariantStock, setNewVariantStock] = useState(0);
  const [variantError, setVariantError] = useState<string | null>(null);

  const isEditMode = !!item?.id;

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof CatalogItemFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('name_error');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      await onSaveAction(formData, isEditMode, item?.id);
      setSuccessMessage(isEditMode ? t('update_success') : t('create_success'));

      setTimeout(() => {
        onCloseAction();
      }, 1500);
    } catch (error) {
      console.error('Failed to save catalog item:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = <K extends keyof CatalogItemFormData>(
    field: K,
    value: CatalogItemFormData[K],
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleCategoryToggle = (categoryId: string) => {
    setFormData((prev) => {
      const isSelected = prev.categoryIds.includes(categoryId);
      return {
        ...prev,
        categoryIds: isSelected
          ? prev.categoryIds.filter(id => id !== categoryId)
          : [...prev.categoryIds, categoryId],
      };
    });
  };

  // Variant management functions
  const handleAddVariant = () => {
    setVariantError(null);

    if (!newVariantName.trim()) {
      setVariantError(t('variant_name_required'));
      return;
    }

    if (formData.variants.length >= MAX_VARIANTS_PER_ITEM) {
      setVariantError(t('max_variants_reached', { max: MAX_VARIANTS_PER_ITEM }));
      return;
    }

    // Check for duplicate names
    if (formData.variants.some(v => v.name.toLowerCase() === newVariantName.trim().toLowerCase())) {
      setVariantError(t('variant_name_duplicate'));
      return;
    }

    const newVariant: VariantInput = {
      tempId: crypto.randomUUID(),
      name: newVariantName.trim(),
      price: newVariantPrice,
      stockQuantity: newVariantStock,
    };

    setFormData(prev => ({
      ...prev,
      variants: [...prev.variants, newVariant],
    }));

    // Reset form
    setNewVariantName('');
    setNewVariantPrice(0);
    setNewVariantStock(0);
  };

  const handleRemoveVariant = (index: number) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateVariant = (index: number, field: keyof VariantInput, value: string | number) => {
    setFormData((prev) => {
      const updatedVariants = [...prev.variants];
      const existing = updatedVariants[index];
      if (existing) {
        updatedVariants[index] = { ...existing, [field]: value };
      }
      return { ...prev, variants: updatedVariants };
    });
  };

  // Reorder a variant up/down (#271). Variant order is persisted from the array
  // order on save — `updateCatalogItem`/`createCatalogItem` write each variant's
  // `sortOrder` from its index — so reordering the array here is all that's
  // needed. A keyboard-accessible move avoids adding a drag-and-drop dependency.
  const handleMoveVariant = (index: number, direction: 'up' | 'down') => {
    setFormData((prev) => {
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.variants.length) {
        return prev;
      }
      const updatedVariants = [...prev.variants];
      const [moved] = updatedVariants.splice(index, 1);
      updatedVariants.splice(target, 0, moved!);
      return { ...prev, variants: updatedVariants };
    });
  };

  const itemTypes: CatalogItemType[] = ['merchandise', 'event_access'];
  const activeCategories = categories.filter(c => c.isActive);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEditMode ? t('edit_title') : t('add_title')}
        </DialogTitle>
      </DialogHeader>

      <div className="max-h-[60vh] overflow-y-auto py-4">
        {successMessage
          ? (
              <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950/30">
                <p className="text-sm text-green-900 dark:text-green-200">
                  {successMessage}
                </p>
              </div>
            )
          : (
              <div className="space-y-4">
                {/* Item Type */}
                <div className="space-y-2">
                  <Label htmlFor="item-type">{t('type_label')}</Label>
                  <Select
                    value={formData.type}
                    onValueChange={value => handleInputChange('type', value as CatalogItemType)}
                  >
                    <SelectTrigger id="item-type" data-testid="catalog-item-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {itemTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          {type === 'merchandise' ? t('type_merchandise') : t('type_event_access')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Linked Event (only for event_access type) */}
                {formData.type === 'event_access' && (
                  <div className="space-y-2">
                    <Label htmlFor="item-event">{t('event_label')}</Label>
                    <Select
                      value={formData.eventId || ''}
                      onValueChange={value => handleInputChange('eventId', value || null)}
                    >
                      <SelectTrigger id="item-event" data-testid="catalog-item-event-select">
                        <SelectValue placeholder={t('event_placeholder')} />
                      </SelectTrigger>
                      <SelectContent align="start">
                        {events.filter(e => e.isActive).map(event => (
                          <SelectItem key={event.id} value={event.id}>
                            {event.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t('event_help')}</p>
                  </div>
                )}

                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="item-name">{t('name_label')}</Label>
                  <Input
                    id="item-name"
                    value={formData.name}
                    onChange={e => handleInputChange('name', e.target.value)}
                    placeholder={t('name_placeholder')}
                    data-testid="catalog-item-name-input"
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>

                {/* SKU */}
                <div className="space-y-2">
                  <Label htmlFor="item-sku">{t('sku_label')}</Label>
                  <Input
                    id="item-sku"
                    value={formData.sku}
                    onChange={e => handleInputChange('sku', e.target.value)}
                    placeholder={t('sku_placeholder')}
                    data-testid="catalog-item-sku-input"
                  />
                </div>

                {/* Short Description */}
                <div className="space-y-2">
                  <Label htmlFor="item-short-description">{t('short_description_label')}</Label>
                  <Input
                    id="item-short-description"
                    value={formData.shortDescription}
                    onChange={e => handleInputChange('shortDescription', e.target.value)}
                    placeholder={t('short_description_placeholder')}
                    data-testid="catalog-item-short-description-input"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="item-description">{t('description_label')}</Label>
                  <Textarea
                    id="item-description"
                    value={formData.description}
                    onChange={e => handleInputChange('description', e.target.value)}
                    placeholder={t('description_placeholder')}
                    rows={3}
                    data-testid="catalog-item-description-input"
                  />
                </div>

                {/* Product Image */}
                <ImageUploadField
                  value={formData.imageDataUrl}
                  onChange={value => handleInputChange('imageDataUrl', value)}
                  label={t('product_image_label')}
                  helpText={t('product_image_help')}
                  previewSize="lg"
                />

                {/* Price Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="item-base-price">{t('base_price_label')}</Label>
                    <Input
                      id="item-base-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.basePrice}
                      onChange={e => handleInputChange('basePrice', Number.parseFloat(e.target.value) || 0)}
                      data-testid="catalog-item-base-price-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="item-compare-at-price">{t('compare_at_price_label')}</Label>
                    <Input
                      id="item-compare-at-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.compareAtPrice ?? ''}
                      onChange={e => handleInputChange(
                        'compareAtPrice',
                        e.target.value ? Number.parseFloat(e.target.value) : null,
                      )}
                      data-testid="catalog-item-compare-at-price-input"
                    />
                    <p className="text-xs text-muted-foreground">{t('compare_at_price_help')}</p>
                  </div>
                </div>

                {/* Max Per Order */}
                <div className="space-y-2">
                  <Label htmlFor="item-max-per-order">{t('max_per_order_label')}</Label>
                  <Input
                    id="item-max-per-order"
                    type="number"
                    min="1"
                    max="100"
                    value={formData.maxPerOrder}
                    onChange={e => handleInputChange('maxPerOrder', Number.parseInt(e.target.value, 10) || 1)}
                    data-testid="catalog-item-max-per-order-input"
                  />
                </div>

                {/* Categories */}
                {activeCategories.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t('categories_label')}</Label>
                    <div className="flex flex-wrap gap-2 rounded-md border p-3">
                      {activeCategories.map(category => (
                        <label
                          key={category.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
                        >
                          <Checkbox
                            checked={formData.categoryIds.includes(category.id)}
                            onCheckedChange={() => handleCategoryToggle(category.id)}
                          />
                          {category.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Variants Section */}
                <div className="space-y-3 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <Label>{t('variants_label')}</Label>
                    <span className="text-xs text-muted-foreground">
                      {formData.variants.length}
                      /
                      {MAX_VARIANTS_PER_ITEM}
                    </span>
                  </div>

                  {/* Existing Variants List */}
                  {formData.variants.length > 0 && (
                    <div className="space-y-2">
                      {formData.variants.map((variant, index) => (
                        <div
                          key={variant.tempId}
                          className="flex items-center gap-2 rounded-md border bg-muted/30 p-2"
                          data-testid={`variant-row-${index}`}
                        >
                          <Input
                            value={variant.name}
                            onChange={e => handleUpdateVariant(index, 'name', e.target.value)}
                            className="flex-1"
                            placeholder={t('variant_name_placeholder')}
                            data-testid={`variant-${index}-name-input`}
                          />
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">$</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={variant.price}
                              onChange={e => handleUpdateVariant(index, 'price', Number.parseFloat(e.target.value) || 0)}
                              className="w-28"
                              data-testid={`variant-${index}-price-input`}
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">{t('variant_stock_label')}</span>
                            <Input
                              type="number"
                              min="0"
                              value={variant.stockQuantity}
                              onChange={e => handleUpdateVariant(index, 'stockQuantity', Number.parseInt(e.target.value, 10) || 0)}
                              className="w-16"
                              data-testid={`variant-${index}-stock-input`}
                            />
                          </div>
                          <div className="flex flex-col">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleMoveVariant(index, 'up')}
                              disabled={index === 0}
                              className="size-5"
                              aria-label={t('move_variant_up')}
                              data-testid={`variant-${index}-move-up-button`}
                            >
                              <ChevronUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleMoveVariant(index, 'down')}
                              disabled={index === formData.variants.length - 1}
                              className="size-5"
                              aria-label={t('move_variant_down')}
                              data-testid={`variant-${index}-move-down-button`}
                            >
                              <ChevronDown className="size-4" />
                            </Button>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveVariant(index)}
                            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            data-testid={`variant-${index}-remove-button`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add New Variant Form */}
                  {formData.variants.length < MAX_VARIANTS_PER_ITEM && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-sm font-medium">{t('add_variant_title')}</p>
                      <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-1">
                          <Label htmlFor="new-variant-name" className="text-xs">
                            {t('variant_name_label')}
                          </Label>
                          <Input
                            id="new-variant-name"
                            value={newVariantName}
                            onChange={e => setNewVariantName(e.target.value)}
                            placeholder={t('variant_name_placeholder')}
                            data-testid="new-variant-name-input"
                          />
                        </div>
                        <div className="w-24 space-y-1">
                          <Label htmlFor="new-variant-price" className="text-xs">
                            {t('variant_price_label')}
                          </Label>
                          <Input
                            id="new-variant-price"
                            type="number"
                            min="0"
                            step="0.01"
                            value={newVariantPrice}
                            onChange={e => setNewVariantPrice(Number.parseFloat(e.target.value) || 0)}
                            data-testid="new-variant-price-input"
                          />
                        </div>
                        <div className="w-20 space-y-1">
                          <Label htmlFor="new-variant-stock" className="text-xs">
                            {t('variant_stock_label')}
                          </Label>
                          <Input
                            id="new-variant-stock"
                            type="number"
                            min="0"
                            value={newVariantStock}
                            onChange={e => setNewVariantStock(Number.parseInt(e.target.value, 10) || 0)}
                            data-testid="new-variant-stock-input"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleAddVariant}
                          data-testid="add-variant-button"
                        >
                          {t('add_variant_button')}
                        </Button>
                      </div>
                      {variantError && (
                        <p className="text-sm text-destructive">{variantError}</p>
                      )}
                    </div>
                  )}

                  {/* At the limit, explain why the add form is gone instead of
                      silently hiding it (#272). */}
                  {formData.variants.length >= MAX_VARIANTS_PER_ITEM && (
                    <p className="border-t pt-3 text-sm text-muted-foreground">
                      {t('max_variants_notice', { max: MAX_VARIANTS_PER_ITEM })}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">{t('variants_help')}</p>
                </div>

                {/* Inventory Settings */}
                <div className="space-y-3 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="item-track-inventory"
                      checked={formData.trackInventory}
                      onCheckedChange={checked => handleInputChange('trackInventory', !!checked)}
                      data-testid="catalog-item-track-inventory-checkbox"
                    />
                    <Label htmlFor="item-track-inventory" className="cursor-pointer font-medium">
                      {t('track_inventory_label')}
                    </Label>
                  </div>

                  {formData.trackInventory && (
                    <div className="space-y-2 pl-6">
                      <Label htmlFor="item-low-stock-threshold">{t('low_stock_threshold_label')}</Label>
                      <Input
                        id="item-low-stock-threshold"
                        type="number"
                        min="0"
                        value={formData.lowStockThreshold}
                        onChange={e => handleInputChange('lowStockThreshold', Number.parseInt(e.target.value, 10) || 0)}
                        className="max-w-[150px]"
                        data-testid="catalog-item-low-stock-threshold-input"
                      />
                    </div>
                  )}
                </div>

                {/* Boolean Flags */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="item-is-active"
                      checked={formData.isActive}
                      onCheckedChange={checked => handleInputChange('isActive', !!checked)}
                      data-testid="catalog-item-is-active-checkbox"
                    />
                    <Label htmlFor="item-is-active" className="cursor-pointer">
                      {t('is_active_label')}
                    </Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="item-is-featured"
                      checked={formData.isFeatured}
                      onCheckedChange={checked => handleInputChange('isFeatured', !!checked)}
                      data-testid="catalog-item-is-featured-checkbox"
                    />
                    <Label htmlFor="item-is-featured" className="cursor-pointer">
                      {t('is_featured_label')}
                    </Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="item-show-on-kiosk"
                      checked={formData.showOnKiosk}
                      onCheckedChange={checked => handleInputChange('showOnKiosk', !!checked)}
                      data-testid="catalog-item-show-on-kiosk-checkbox"
                    />
                    <Label htmlFor="item-show-on-kiosk" className="cursor-pointer">
                      {t('show_on_kiosk_label')}
                    </Label>
                  </div>
                </div>
              </div>
            )}
      </div>

      {!successMessage && (
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCloseAction}
            disabled={isLoading}
          >
            {t('cancel_button')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? t('saving_button') : t('save_button')}
          </Button>
        </DialogFooter>
      )}
    </>
  );
}

export function AddEditCatalogItemModal({
  isOpen,
  onCloseAction,
  item,
  categories,
  events,
  onSaveAction,
}: AddEditCatalogItemModalProps) {
  const formKey = item?.id ?? 'new';

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCloseAction()}>
      <DialogContent className="sm:max-w-3xl">
        {isOpen && (
          <CatalogItemFormContent
            key={formKey}
            item={item}
            categories={categories}
            events={events}
            onCloseAction={onCloseAction}
            onSaveAction={onSaveAction}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
