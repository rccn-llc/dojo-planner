'use client';

import type { Coupon } from './types';
import { Edit, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type CouponCardProps = {
  coupon: Coupon;
  onEdit: (coupon: Coupon) => void;
  onDelete: (couponId: string) => void;
};

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'Active':
      return 'outline';
    case 'Expired':
      return 'destructive';
    case 'Inactive':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getUsagePercentage(usage: string): number {
  const parts = usage.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return 0;
  }

  const used = Number.parseFloat(parts[0]);
  const limit = parts[1];

  if (limit === '\u221E') {
    return 100;
  }

  const limitNum = Number.parseFloat(limit);
  if (Number.isNaN(used) || Number.isNaN(limitNum) || limitNum === 0) {
    return 0;
  }

  return Math.min((used / limitNum) * 100, 100);
}

function formatDateTime(dateTime: string): string {
  if (!dateTime) {
    return 'No Expiry';
  }

  try {
    // Return in format YYYY-MM-DD hh:mm:ss
    const date = new Date(dateTime);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch {
    return dateTime;
  }
}

function getTypeAbbreviation(type: string): string {
  switch (type) {
    case 'Percentage':
      return 'PCT';
    case 'Fixed Amount':
      return 'FXD';
    case 'Free Trial':
      return 'TRY';
    default:
      return type;
  }
}

function canDeleteCoupon(usage: string): boolean {
  const parts = usage.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return true;
  }

  const used = Number.parseFloat(parts[0]);
  const limit = parts[1];

  // Allow delete if usage is 0
  if (used === 0) {
    return true;
  }

  // Allow delete if unlimited usage (infinity symbol)
  if (limit === '\u221E') {
    return false;
  }

  const limitNum = Number.parseFloat(limit);
  if (Number.isNaN(used) || Number.isNaN(limitNum) || limitNum === 0) {
    return true;
  }

  // Allow delete if usage is at 100%
  const percentage = (used / limitNum) * 100;
  return percentage >= 100;
}

export function CouponCard({
  coupon,
  onEdit,
  onDelete,
}: CouponCardProps) {
  const t = useTranslations('MarketingPage');

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Header with Code and Status */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex-1">
            <div className="text-xs font-semibold text-muted-foreground">{t('table_code')}</div>
            <div className="mt-1">
              <p className="text-sm font-medium text-foreground">{coupon.code}</p>
              <p className="text-xs text-muted-foreground">{coupon.description}</p>
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            getStatusVariant(coupon.status) === 'outline'
              ? 'border border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
              : getStatusVariant(coupon.status) === 'destructive'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-secondary text-secondary-foreground'
          }`}
          >
            {coupon.status}
          </span>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs font-semibold text-muted-foreground">{t('table_type')}</span>
            <div className="mt-1 text-sm font-medium text-foreground">{getTypeAbbreviation(coupon.type)}</div>
          </div>

          <div>
            <span className="text-xs font-semibold text-muted-foreground">{t('table_amount')}</span>
            <div className="mt-1 text-sm font-medium text-foreground">{coupon.amount}</div>
          </div>

          <div>
            <span className="text-xs font-semibold text-muted-foreground">{t('table_apply_to')}</span>
            <div className="mt-1 text-sm font-medium text-foreground">{coupon.applyTo}</div>
          </div>

          <div>
            <span className="text-xs font-semibold text-muted-foreground">{t('table_effective')}</span>
            <div className="mt-1 flex flex-col">
              <span className="text-sm font-medium text-foreground">{formatDateTime(coupon.startDateTime)}</span>
              <span className="text-sm text-muted-foreground">{formatDateTime(coupon.endDateTime)}</span>
            </div>
          </div>
        </div>

        {/* Usage */}
        <div>
          <span className="text-xs font-semibold text-muted-foreground">{t('table_usage_limit')}</span>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-foreground">{coupon.usage}</span>
            <div className="relative h-1 flex-1 rounded-full bg-muted">
              <div
                className="h-1 rounded-full bg-blue-500"
                style={{ width: `${getUsagePercentage(coupon.usage)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(coupon)}
            aria-label={`Edit ${coupon.code}`}
            title={`Edit ${coupon.code}`}
          >
            <Edit className="size-4" />
          </Button>
          {canDeleteCoupon(coupon.usage) && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(coupon.id)}
              aria-label={`Delete ${coupon.code}`}
              title={`Delete ${coupon.code}`}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
