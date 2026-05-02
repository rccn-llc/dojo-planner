import type { Coupon, CouponApplyTo, CouponFormData, CouponStatus, CouponType } from './types';
import type { Coupon as DbCoupon } from '@/hooks/useCouponsCache';

/**
 * Transforms database coupon type to UI display type
 */
function transformDiscountType(discountType: string): CouponType {
  switch (discountType.toLowerCase()) {
    case 'percentage':
      return 'Percentage';
    case 'fixed':
      return 'Fixed Amount';
    case 'free_days':
      return 'Free Trial';
    default:
      return 'Percentage';
  }
}

/**
 * Transforms database applicable_to to UI display format
 */
function transformApplicableTo(applicableTo: string): CouponApplyTo {
  switch (applicableTo.toLowerCase()) {
    case 'membership':
    case 'memberships':
      return 'Memberships';
    case 'event':
    case 'product':
    case 'products':
      return 'Products';
    case 'all':
    case 'both':
      return 'Both';
    default:
      return 'Memberships';
  }
}

/**
 * Transforms database status to UI display format
 */
function transformStatus(status: string): CouponStatus {
  switch (status.toLowerCase()) {
    case 'active':
      return 'Active';
    case 'expired':
      return 'Expired';
    case 'inactive':
      return 'Inactive';
    default:
      return 'Active';
  }
}

/**
 * Formats discount value based on type
 */
function formatAmount(discountType: string, discountValue: number): string {
  switch (discountType.toLowerCase()) {
    case 'percentage':
      return `${discountValue}%`;
    case 'fixed':
      return `$${discountValue}`;
    case 'free_days':
      return `${discountValue} Days`;
    default:
      return String(discountValue);
  }
}

/**
 * Formats usage as "count/limit" string
 */
function formatUsage(usageCount: number, usageLimit: number | null): string {
  if (usageLimit === null) {
    return `${usageCount}/\u221E`;
  }
  return `${usageCount}/${usageLimit}`;
}

/**
 * Formats Date to ISO datetime string
 */
function formatDateTime(date: Date | null): string {
  if (!date) {
    return '';
  }
  return date.toISOString();
}

/**
 * Transforms a database coupon to UI coupon format
 */
export function transformCouponToUi(dbCoupon: DbCoupon): Coupon {
  return {
    id: dbCoupon.id,
    code: dbCoupon.code,
    description: dbCoupon.description || dbCoupon.name,
    type: transformDiscountType(dbCoupon.discountType),
    amount: formatAmount(dbCoupon.discountType, dbCoupon.discountValue),
    applyTo: transformApplicableTo(dbCoupon.applicableTo),
    usage: formatUsage(dbCoupon.usageCount, dbCoupon.usageLimit),
    startDateTime: formatDateTime(dbCoupon.validFrom),
    endDateTime: formatDateTime(dbCoupon.validUntil),
    status: transformStatus(dbCoupon.status),
    perUserLimit: dbCoupon.perUserLimit,
  };
}

/**
 * Transforms an array of database coupons to UI format
 */
export function transformCouponsToUi(dbCoupons: DbCoupon[]): Coupon[] {
  return dbCoupons.map(transformCouponToUi);
}

// ──────────────────────────────────────────────────────────────────────
// Inverse direction: form data → DB-shape payload for create/update
// ──────────────────────────────────────────────────────────────────────

function reverseDiscountType(type: CouponType): 'percentage' | 'fixed' | 'free_days' {
  switch (type) {
    case 'Percentage':
      return 'percentage';
    case 'Fixed Amount':
      return 'fixed';
    case 'Free Trial':
      return 'free_days';
  }
}

function reverseApplyTo(applyTo: CouponApplyTo): 'membership' | 'event' | 'all' {
  switch (applyTo) {
    case 'Memberships':
      return 'membership';
    case 'Products':
      return 'event';
    case 'Both':
      return 'all';
  }
}

function reverseStatus(status: CouponStatus): 'active' | 'expired' | 'inactive' {
  switch (status) {
    case 'Active':
      return 'active';
    case 'Expired':
      return 'expired';
    case 'Inactive':
      return 'inactive';
  }
}

function combineDateTime(date: string, time: string): Date {
  // Time defaults to start-of-day if missing — Zod will coerce.
  const safeTime = time && time.length > 0 ? time : '00:00:00';
  return new Date(`${date}T${safeTime}`);
}

export type CouponDbPayload = {
  code: string;
  name: string;
  description: string | null;
  discountType: 'percentage' | 'fixed' | 'free_days';
  discountValue: number;
  applicableTo: 'membership' | 'event' | 'all';
  usageLimit: number | null;
  perUserLimit: number;
  validFrom: Date;
  validUntil: Date | null;
  status: 'active' | 'expired' | 'inactive';
};

/**
 * Translates the title-case UI form into the lowercase DB payload accepted by
 * `client.coupons.create` / `client.coupons.update`. The UI doesn't have a
 * separate `name` field — derive it from `code` to satisfy the not-null DB
 * column.
 */
export function transformUiCouponFormToDb(formData: CouponFormData): CouponDbPayload {
  const code = formData.code.trim().toUpperCase();
  const description = formData.description.trim();
  const usageLimitRaw = formData.usageLimit.trim();
  const perUserLimitRaw = formData.perUserLimit.trim();

  return {
    code,
    name: code,
    description: description.length > 0 ? description : null,
    discountType: reverseDiscountType(formData.type),
    discountValue: Number.parseFloat(formData.amount),
    applicableTo: reverseApplyTo(formData.applyTo),
    usageLimit: usageLimitRaw === '' ? null : Number.parseInt(usageLimitRaw, 10),
    perUserLimit: perUserLimitRaw === '' ? 1 : Number.parseInt(perUserLimitRaw, 10),
    validFrom: combineDateTime(formData.startDate, formData.startTime),
    validUntil: formData.neverExpires
      ? null
      : combineDateTime(formData.endDate, formData.endTime || '23:59:59'),
    status: reverseStatus(formData.status),
  };
}
