export type CouponType = 'Percentage' | 'Fixed Amount' | 'Free Trial';
export type CouponApplyTo = 'Memberships' | 'Products' | 'Both';
export type CouponStatus = 'Active' | 'Expired' | 'Inactive';

export type Coupon = {
  id: string;
  code: string;
  description: string;
  type: CouponType;
  amount: string;
  applyTo: CouponApplyTo;
  usage: string;
  startDateTime: string;
  endDateTime: string;
  status: CouponStatus;
  perUserLimit?: number;
};

export type CouponFormData = {
  code: string;
  description: string;
  type: CouponType;
  amount: string;
  applyTo: CouponApplyTo;
  usageLimit: string;
  perUserLimit: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  neverExpires: boolean;
  status: CouponStatus;
};

/**
 * Checks if a coupon is valid for use (active, not expired, has remaining usage)
 */
function isCouponValidForUse(coupon: Coupon): boolean {
  // Must be active
  if (coupon.status !== 'Active') {
    return false;
  }

  // Check if not expired based on endDateTime
  if (coupon.endDateTime) {
    const endDate = new Date(coupon.endDateTime);
    if (endDate < new Date()) {
      return false;
    }
  }

  // Check if has remaining usage
  const parts = coupon.usage.split('/');
  if (parts.length === 2 && parts[0] && parts[1]) {
    const used = Number.parseFloat(parts[0]);
    const limit = parts[1];
    // Unlimited usage (∞) is always valid
    if (limit !== '\u221E') {
      const limitNum = Number.parseFloat(limit);
      if (!Number.isNaN(used) && !Number.isNaN(limitNum) && used >= limitNum) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Checks if a coupon applies to memberships
 */
function couponAppliesToMemberships(coupon: Coupon): boolean {
  return coupon.applyTo === 'Memberships' || coupon.applyTo === 'Both';
}

/**
 * Calculates the discount amount for a given original price
 */
export function calculateCouponDiscount(
  coupon: Coupon,
  originalPrice: number,
): { discountAmount: number; finalPrice: number } {
  if (originalPrice <= 0) {
    return { discountAmount: 0, finalPrice: 0 };
  }

  let discountAmount = 0;

  switch (coupon.type) {
    case 'Percentage': {
      // Parse percentage from amount string (e.g., "15%" -> 15)
      const percentageMatch = coupon.amount.match(/(\d+(?:\.\d+)?)/);
      if (percentageMatch && percentageMatch[1]) {
        const percentage = Number.parseFloat(percentageMatch[1]);
        discountAmount = (originalPrice * percentage) / 100;
      }
      break;
    }
    case 'Fixed Amount': {
      // Parse fixed amount from amount string (e.g., "$50" -> 50)
      const fixedMatch = coupon.amount.match(/(\d+(?:\.\d+)?)/);
      if (fixedMatch && fixedMatch[1]) {
        discountAmount = Number.parseFloat(fixedMatch[1]);
      }
      break;
    }
    case 'Free Trial': {
      // Free trial makes the payment $0
      discountAmount = originalPrice;
      break;
    }
  }

  // Ensure discount doesn't exceed original price
  discountAmount = Math.min(discountAmount, originalPrice);

  return {
    discountAmount,
    finalPrice: originalPrice - discountAmount,
  };
}

/**
 * Gets valid membership coupons from a list of coupons
 */
export function getValidMembershipCoupons(coupons: Coupon[]): Coupon[] {
  return coupons.filter(
    coupon => isCouponValidForUse(coupon) && couponAppliesToMemberships(coupon),
  );
}
