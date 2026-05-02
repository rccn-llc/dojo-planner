import * as z from 'zod';

const CODE_MAX = 64;
const NAME_MAX = 128;
const DESCRIPTION_MAX = 500;

export const CouponDiscountType = z.enum(['percentage', 'fixed', 'free_days']);
export const CouponApplicableTo = z.enum(['membership', 'event', 'all']);
export const CouponStatus = z.enum(['active', 'expired', 'inactive']);

const CouponShape = z
  .object({
    code: z.string().min(1).max(CODE_MAX),
    name: z.string().min(1).max(NAME_MAX),
    description: z.string().max(DESCRIPTION_MAX).optional().nullable(),
    discountType: CouponDiscountType,
    discountValue: z.number().positive(),
    applicableTo: CouponApplicableTo,
    usageLimit: z.number().int().positive().nullable(),
    perUserLimit: z.number().int().positive(),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date().nullable(),
    status: CouponStatus,
  })
  .refine(
    data => data.validUntil === null || data.validUntil > data.validFrom,
    { message: 'validUntil must be after validFrom', path: ['validUntil'] },
  )
  .refine(
    data => data.discountType !== 'percentage' || data.discountValue <= 100,
    { message: 'Percentage discount must be 100 or less', path: ['discountValue'] },
  );

export const CreateCouponValidation = CouponShape;

export const UpdateCouponValidation = z.object({
  id: z.string().min(1),
  code: z.string().min(1).max(CODE_MAX),
  name: z.string().min(1).max(NAME_MAX),
  description: z.string().max(DESCRIPTION_MAX).optional().nullable(),
  discountType: CouponDiscountType,
  discountValue: z.number().positive(),
  applicableTo: CouponApplicableTo,
  usageLimit: z.number().int().positive().nullable(),
  perUserLimit: z.number().int().positive(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().nullable(),
  status: CouponStatus,
}).refine(
  data => data.validUntil === null || data.validUntil > data.validFrom,
  { message: 'validUntil must be after validFrom', path: ['validUntil'] },
).refine(
  data => data.discountType !== 'percentage' || data.discountValue <= 100,
  { message: 'Percentage discount must be 100 or less', path: ['discountValue'] },
);

export const DeleteCouponValidation = z.object({
  id: z.string().min(1),
});

export type CreateCouponInput = z.infer<typeof CreateCouponValidation>;
export type UpdateCouponInput = z.infer<typeof UpdateCouponValidation>;
