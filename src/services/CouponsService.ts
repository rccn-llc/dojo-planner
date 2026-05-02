import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { couponSchema, couponUsageSchema } from '@/models/Schema';

// =============================================================================
// TYPES
// =============================================================================

export type Coupon = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  applicableTo: string;
  usageLimit: number | null;
  usageCount: number;
  perUserLimit: number;
  status: string;
  validFrom: Date;
  validUntil: Date | null;
  createdAt: Date;
};

export type CouponInput = {
  code: string;
  name: string;
  description?: string | null;
  discountType: 'percentage' | 'fixed' | 'free_days';
  discountValue: number;
  applicableTo: 'membership' | 'event' | 'all';
  usageLimit: number | null;
  perUserLimit: number;
  validFrom: Date;
  validUntil: Date | null;
  status: 'active' | 'expired' | 'inactive';
};

export class CouponCodeAlreadyExistsError extends Error {
  constructor(code: string) {
    super(`A coupon with code "${code}" already exists.`);
    this.name = 'CouponCodeAlreadyExistsError';
  }
}

export class CouponHasUsagesError extends Error {
  constructor(code: string, usageCount: number) {
    super(`Cannot delete coupon "${code}": it has been redeemed ${usageCount} time(s). Set its status to inactive instead.`);
    this.name = 'CouponHasUsagesError';
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Compute a coupon's *effective* status based on its stored status, expiry
 * date, and usage limit. We compute this at read time rather than persisting
 * the transition so the DB never goes out of sync with reality.
 */
function effectiveStatus(c: {
  status: string;
  validUntil: Date | null;
  usageCount: number | null;
  usageLimit: number | null;
}): string {
  if (c.status === 'inactive') {
    return 'inactive';
  }
  if (c.validUntil && c.validUntil < new Date()) {
    return 'expired';
  }
  const used = c.usageCount ?? 0;
  if (c.usageLimit !== null && used >= c.usageLimit) {
    return 'expired';
  }
  return c.status;
}

/**
 * Maps a Postgres unique-violation (23505) into our typed error so the router
 * can return a 409 to the client.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code: string }).code === '23505'
  );
}

type CouponRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  applicableTo: string;
  usageLimit: number | null;
  usageCount: number | null;
  perUserLimit: number | null;
  status: string;
  validFrom: Date;
  validUntil: Date | null;
  createdAt: Date;
};

function toCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    discountType: row.discountType,
    discountValue: row.discountValue,
    applicableTo: row.applicableTo,
    usageLimit: row.usageLimit,
    usageCount: row.usageCount ?? 0,
    perUserLimit: row.perUserLimit ?? 1,
    status: effectiveStatus(row),
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    createdAt: row.createdAt,
  };
}

// =============================================================================
// SERVICE FUNCTIONS — READS
// =============================================================================

/**
 * Get all coupons for an organization. Status reflects effective state
 * (auto-expired by date or usage even when stored status is `active`).
 */
export async function getOrganizationCoupons(organizationId: string): Promise<Coupon[]> {
  const coupons = await db
    .select()
    .from(couponSchema)
    .where(eq(couponSchema.organizationId, organizationId));

  return coupons.map(toCoupon);
}

/**
 * Get a single coupon by ID, scoped to the organization.
 */
export async function getCouponById(couponId: string, organizationId: string): Promise<Coupon | null> {
  const coupons = await db
    .select()
    .from(couponSchema)
    .where(and(eq(couponSchema.id, couponId), eq(couponSchema.organizationId, organizationId)))
    .limit(1);

  const coupon = coupons[0];
  if (!coupon) {
    return null;
  }
  return toCoupon(coupon);
}

/**
 * Get effectively-active coupons for an organization (drops auto-expired ones).
 */
export async function getActiveCoupons(organizationId: string): Promise<Coupon[]> {
  const coupons = await getOrganizationCoupons(organizationId);
  return coupons.filter(c => c.status === 'active');
}

// =============================================================================
// SERVICE FUNCTIONS — WRITES
// =============================================================================

/**
 * Create a new coupon. Throws CouponCodeAlreadyExistsError if `(orgId, code)`
 * collides with the unique index.
 */
export async function createCoupon(input: CouponInput, organizationId: string): Promise<Coupon> {
  const id = randomUUID();
  try {
    const inserted = await db
      .insert(couponSchema)
      .values({
        id,
        organizationId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        applicableTo: input.applicableTo,
        usageLimit: input.usageLimit,
        perUserLimit: input.perUserLimit,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        status: input.status,
      })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new Error('Failed to insert coupon');
    }
    return toCoupon(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CouponCodeAlreadyExistsError(input.code);
    }
    throw error;
  }
}

/**
 * Update a coupon by id within the org. Returns the updated coupon, or null if
 * not found in this org. Throws CouponCodeAlreadyExistsError on code collision.
 */
export async function updateCoupon(
  couponId: string,
  input: CouponInput,
  organizationId: string,
): Promise<Coupon | null> {
  // Confirm tenant ownership before mutating
  const existing = await db
    .select()
    .from(couponSchema)
    .where(and(eq(couponSchema.id, couponId), eq(couponSchema.organizationId, organizationId)))
    .limit(1);
  if (existing.length === 0) {
    return null;
  }

  try {
    const updated = await db
      .update(couponSchema)
      .set({
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        applicableTo: input.applicableTo,
        usageLimit: input.usageLimit,
        perUserLimit: input.perUserLimit,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        status: input.status,
      })
      .where(and(eq(couponSchema.id, couponId), eq(couponSchema.organizationId, organizationId)))
      .returning();
    const row = updated[0];
    if (!row) {
      return null;
    }
    return toCoupon(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CouponCodeAlreadyExistsError(input.code);
    }
    throw error;
  }
}

/**
 * Delete a coupon by id within the org. Refuses (CouponHasUsagesError) when
 * any `coupon_usage` rows reference it — operators should mark such coupons
 * inactive instead so historical redemption records stay intact.
 *
 * Returns false when the coupon doesn't belong to the org.
 */
export async function deleteCoupon(couponId: string, organizationId: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(couponSchema)
    .where(and(eq(couponSchema.id, couponId), eq(couponSchema.organizationId, organizationId)))
    .limit(1);
  const coupon = existing[0];
  if (!coupon) {
    return false;
  }

  const usages = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(couponUsageSchema)
    .where(eq(couponUsageSchema.couponId, couponId));
  const usageCount = usages[0]?.count ?? 0;
  if (usageCount > 0) {
    throw new CouponHasUsagesError(coupon.code, usageCount);
  }

  await db
    .delete(couponSchema)
    .where(and(eq(couponSchema.id, couponId), eq(couponSchema.organizationId, organizationId)));
  return true;
}
