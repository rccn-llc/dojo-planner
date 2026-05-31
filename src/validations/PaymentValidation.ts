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
  description: z.string(),

  // Card fields
  cardholderName: z.string().optional(),
  cardNumber: z.string().optional(),
  cardToken: z.string().optional(),
  cardFirstSix: z.string().max(6).optional(),
  cardLastFour: z.string().max(4).optional(),
  cardExpiry: z.string().optional(),
  cardCvc: z.string().optional(),

  // ACH fields
  achAccountHolder: z.string().optional(),
  achRoutingNumber: z.string().optional(),
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
    })
    .nullable()
    .optional(),

  // 'new' (default): create / reuse customer + register a fresh PM from
  // card/ACH fields, then charge.
  // 'saved': charge the member's existing IQPro vaulted payment method —
  // server resolves customerId + paymentMethodId from member.iqproCustomerId
  // and the local payment_method table (no IQPro IDs cross the wire).
  paymentMethodSource: z.enum(['new', 'saved']).optional().default('new'),

  // Whether this transaction is taxable. Memberships → false; events /
  // seminars / store → true. Drives the IQPro remit + Tax paymentAdjustment.
  isTaxable: z.boolean().optional().default(false),
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
  cardExpiry: z.string().optional(),
  cardCvc: z.string().optional(),

  // ACH fields
  achAccountHolder: z.string().optional(),
  achRoutingNumber: z.string().optional(),
  achAccountNumber: z.string().optional(),
  achAccountType: z.enum(['Checking', 'Savings']).optional(),
});
