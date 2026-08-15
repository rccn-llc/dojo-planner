import { z } from 'zod';

export const ProcessPaymentValidation = z.object({
  memberId: z.string().min(1),
  memberEmail: z.string().email(),
  memberFirstName: z.string().min(1),
  memberLastName: z.string().min(1),
  memberPhone: z.string().optional(),
  memberAddress: z
    .object({
      street: z.string(),
      apartment: z.string().optional(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      country: z.string(),
    })
    .optional(),

  paymentMethod: z.enum(['card', 'ach']),
  billingType: z.enum(['autopay', 'one-time']),
  amount: z.number().min(0),
  // One-time signup fee charged on the FIRST transaction only. Bundled into
  // the initial Sale alongside `amount`, but never carried into the recurring
  // subscription. Coupon discounts apply to `amount` (recurring) only, never
  // to the signup fee.
  signupFee: z.number().min(0).optional().default(0),
  description: z.string().max(500),

  // Card fields
  cardholderName: z.string().optional(),
  cardNumber: z.string().optional(),
  cardToken: z.string().optional(),
  cardFirstSix: z.string().max(6).optional(),
  cardLastFour: z.string().max(4).optional(),
  // Expiry in MM/YY or MM/YYYY form (month 01-12). Optional — only validated when present.
  cardExpiry: z
    .string()
    .regex(/^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/, 'Card expiry must be in MM/YY or MM/YYYY format')
    .optional(),
  cardCvc: z.string().optional(),

  // ACH fields
  achAccountHolder: z.string().optional(),
  // US ABA routing numbers are exactly 9 digits. Optional — only validated when present.
  achRoutingNumber: z
    .string()
    .regex(/^\d{9}$/, 'Routing number must be 9 digits')
    .optional(),
  achAccountNumber: z.string().optional(),
  achAccountType: z.enum(['Checking', 'Savings']).optional(),

  // Membership context
  membershipPlanId: z.string().optional(),
  membershipPlanFrequency: z.string().optional(),
  memberMembershipId: z.string().optional(),

  appliedCoupon: z
    .object({
      id: z.string(),
      code: z.string(),
      type: z.enum(['Percentage', 'Fixed Amount', 'Free Trial']),
      amount: z.string(),
      description: z.string(),
      maxDiscountAmount: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),

  // 'new' (default): create / reuse customer + register a fresh PM from
  // card/ACH fields, then charge.
  // 'saved': charge the member's existing IQPro vaulted payment method —
  // server resolves customerId + paymentMethodId from member.providerCustomerId
  // and the local payment_method table (no IQPro IDs cross the wire).
  paymentMethodSource: z.enum(['new', 'saved']).optional().default('new'),

  // Whether this transaction is taxable. Memberships → false; events /
  // seminars / store → true. Drives the IQPro remit + Tax paymentAdjustment.
  isTaxable: z.boolean().optional().default(false),
})
  // When collecting a NEW payment method, the corresponding card/ACH fields must
  // be present — catch this at the boundary instead of failing deep in IQPro.
  // 'saved' charges carry no card/ACH data (server resolves the vaulted PM).
  .superRefine((val, ctx) => {
    if (val.paymentMethodSource === 'saved') {
      return;
    }
    if (val.paymentMethod === 'card') {
      if (!val.cardToken && !val.cardNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Card payment requires a cardToken (tokenized) or cardNumber.',
          path: ['cardToken'],
        });
      }
    } else if (val.paymentMethod === 'ach') {
      if (!val.achRoutingNumber || !val.achAccountNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ACH payment requires achRoutingNumber and achAccountNumber.',
          path: ['achAccountNumber'],
        });
      }
    }
  });

export const RegisterPaymentMethodValidation = z.object({
  memberId: z.string().min(1),
  memberEmail: z.string().email(),
  memberFirstName: z.string().min(1),
  memberLastName: z.string().min(1),
  memberPhone: z.string().optional(),
  memberAddress: z
    .object({
      street: z.string(),
      apartment: z.string().optional(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      country: z.string(),
    })
    .optional(),

  paymentMethod: z.enum(['card', 'ach']),

  // Card fields
  cardholderName: z.string().optional(),
  cardNumber: z.string().optional(),
  cardToken: z.string().optional(),
  cardFirstSix: z.string().max(6).optional(),
  cardLastFour: z.string().max(4).optional(),
  // Expiry in MM/YY or MM/YYYY form (month 01-12). Optional — only validated when present.
  cardExpiry: z
    .string()
    .regex(/^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/, 'Card expiry must be in MM/YY or MM/YYYY format')
    .optional(),
  cardCvc: z.string().optional(),

  // ACH fields
  achAccountHolder: z.string().optional(),
  // US ABA routing numbers are exactly 9 digits. Optional — only validated when present.
  achRoutingNumber: z
    .string()
    .regex(/^\d{9}$/, 'Routing number must be 9 digits')
    .optional(),
  achAccountNumber: z.string().optional(),
  achAccountType: z.enum(['Checking', 'Savings']).optional(),
});
