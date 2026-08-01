'use client';

import type { CatalogItem } from './types';
import { Edit, Package, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPrice, getCatalogItemStatus, getPrimaryImage } from './types';

type CatalogItemCardProps = {
  item: CatalogItem;
  onEdit: (item: CatalogItem) => void;
  onDelete: (itemId: string) => void;
};

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'Active':
      return 'outline';
    case 'Inactive':
      return 'secondary';
    case 'Out of Stock':
      return 'destructive';
    case 'Low Stock':
      return 'default';
    default:
      return 'outline';
  }
}

export function CatalogItemCard({
  item,
  onEdit,
  onDelete,
}: CatalogItemCardProps) {
  const t = useTranslations('CatalogItemCard');
  const tPage = useTranslations('CatalogPage');
  const status = getCatalogItemStatus(item);
  const primaryImage = getPrimaryImage(item);

  return (
    <Card className="relative p-6">
      <div className="space-y-4">
        {/* Header with Title, Image Thumbnail, and Badges */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {/* Small Image Thumbnail */}
            <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
              {primaryImage
                ? (
                    <Image
                      src={primaryImage.thumbnailUrl || primaryImage.url}
                      alt={primaryImage.altText || item.name}
                      width={48}
                      height={48}
                      className="size-full object-cover"
                      unoptimized
                    />
                  )
                : (
                    <div className="flex size-full items-center justify-center">
                      <Package className="size-6 text-muted-foreground" />
                    </div>
                  )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">{item.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-bold">
                  {item.type === 'merchandise' ? tPage('type_merchandise') : tPage('type_event_access')}
                </span>
                {item.sku && (
                  <>
                    {' · '}
                    {item.sku}
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge
              variant={getStatusVariant(status)}
              className={
                status === 'Active'
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : status === 'Low Stock'
                    ? 'bg-amber-500 text-gray-900 hover:bg-amber-600'
                    : status === 'Out of Stock'
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : undefined
              }
            >
              {status === 'Active' && tPage('status_active')}
              {status === 'Inactive' && tPage('status_inactive')}
              {status === 'Out of Stock' && tPage('status_out_of_stock')}
              {status === 'Low Stock' && t('low_stock', { count: item.totalStock })}
            </Badge>
            {item.isFeatured && (
              <Badge className="bg-yellow-500 text-gray-900 hover:bg-yellow-600">
                <Star className="mr-1 size-3" />
                {t('featured_badge')}
              </Badge>
            )}
            {item.showOnKiosk && (
              <Badge variant="secondary">
                {t('kiosk_badge')}
              </Badge>
            )}
          </div>
        </div>

        {/* Description */}
        {item.shortDescription && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {item.shortDescription}
          </p>
        )}

        {/* Price */}
        <div>
          <p className="text-2xl font-bold text-foreground">{formatPrice(item.basePrice)}</p>
          {item.compareAtPrice && item.compareAtPrice > item.basePrice && (
            <p className="text-sm text-muted-foreground line-through">
              {formatPrice(item.compareAtPrice)}
            </p>
          )}
        </div>

        {/* Details Grid */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">
              {tPage('table_stock')}
            </span>
            <span className="text-sm font-medium text-foreground">
              {item.trackInventory ? item.totalStock : t('in_stock')}
            </span>
          </div>
          {item.variants.length > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                {t('variants_label')}
              </span>
              <span className="text-sm font-medium text-foreground">
                {item.variants.map(v => v.name).join(', ')}
              </span>
            </div>
          )}
          {item.maxPerOrder && item.maxPerOrder < 10 && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                {t('max_per_order_label')}
              </span>
              <span className="text-sm font-medium text-foreground">
                {item.maxPerOrder}
              </span>
            </div>
          )}
        </div>

        {/* Categories */}
        {item.categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.categories.map(category => (
              <Badge key={category.id} variant="outline" className="text-xs">
                {category.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Footer with Actions */}
        <div className="flex items-end justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(item)}
            aria-label={t('edit_button_aria_label')}
            title={t('edit_button_aria_label')}
          >
            <Edit className="size-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(item.id)}
            aria-label={t('delete_button_aria_label')}
            title={t('delete_button_aria_label')}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
