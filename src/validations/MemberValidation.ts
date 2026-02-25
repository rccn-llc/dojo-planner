import * as z from 'zod';

export const MemberValidation = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  dateOfBirth: z.coerce.date(),
  memberType: z.enum(['individual', 'family-member', 'head-of-household']).optional(),
  membershipPlanId: z.string().optional(),
  address: z.object({
    street: z.string(),
    apartment: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string(),
  }).optional(),
  photoUrl: z.string().optional(),
  status: z.enum(['active', 'hold', 'trial', 'cancelled', 'past due']).optional(),
});

export const EditMemberValidation = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().nullable().optional(),
});

export const DeleteMemberValidation = z.object({
  id: z.string(),
});

export const UpdateMemberContactInfoValidation = z.object({
  id: z.string(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  address: z.object({
    street: z.string(),
    apartment: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string(),
  }).optional(),
});

export const MemberPaymentMethodsValidation = z.object({
  memberId: z.string().min(1),
});

export const MemberTransactionsValidation = z.object({
  memberId: z.string().min(1),
  limit: z.number().min(1).max(200).optional(),
});
