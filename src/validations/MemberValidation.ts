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
  dateOfBirth: z.coerce.date().optional(),
  address: z.object({
    street: z.string(),
    apartment: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string(),
  }).optional(),
});

export const UpdateMemberPhotoValidation = z.object({
  id: z.string().min(1),
  // null clears the photo. When set, must be a base64 data URL of a supported
  // image type, capped at ~300KB so the request payload stays manageable.
  photoUrl: z
    .string()
    .max(300_000, 'Photo data URL must be 300KB or less')
    .regex(/^data:image\/(jpeg|png|gif);base64,/, 'photoUrl must be a data URL for an image (jpeg, png, gif)')
    .nullable(),
});

export const MemberPaymentMethodsValidation = z.object({
  memberId: z.string().min(1),
});

export const MemberTransactionsValidation = z.object({
  memberId: z.string().min(1),
  limit: z.number().min(1).max(200).optional(),
});

export const SearchHOHValidation = z.object({
  query: z.string().optional(),
});

export const LinkFamilyMemberValidation = z.object({
  memberId: z.string().min(1),
  hohMemberId: z.string().min(1),
  relationship: z.string().min(1),
});

export const ListFamilyMembersValidation = z.object({
  memberId: z.string().min(1),
});

export const GetHOHPaymentMethodsValidation = z.object({
  hohMemberId: z.string().min(1),
});

export const UpdateMemberTypeValidation = z.object({
  id: z.string(),
  memberType: z.enum(['individual', 'family-member', 'head-of-household']),
});

export const UnlinkFamilyMemberValidation = z.object({
  memberId: z.string().min(1),
  hohMemberId: z.string().min(1),
});

export const GetHOHForMemberValidation = z.object({
  memberId: z.string().min(1),
});

export const SendConfirmationEmailValidation = z.object({
  memberId: z.string().min(1),
  memberEmail: z.string().email(),
  memberName: z.string().min(1),
  membershipPlanName: z.string().optional(),
  membershipPlanPrice: z.number().optional(),
  membershipPlanFrequency: z.string().optional(),
  memberType: z.enum(['individual', 'family-member', 'head-of-household']).optional(),
  hohName: z.string().optional(),
  waiverPdfData: z.object({
    organizationName: z.string().min(1),
    waiverName: z.string().min(1),
    waiverVersion: z.number(),
    renderedContent: z.string().min(1),
    memberFirstName: z.string().min(1),
    memberLastName: z.string().min(1),
    memberEmail: z.string().email(),
    signatureDataUrl: z.string().min(1),
    signedByName: z.string().min(1),
    signedByRelationship: z.string().optional(),
    signedAt: z.coerce.date(),
    membershipPlanName: z.string().optional(),
    membershipPlanPrice: z.number().optional(),
    membershipPlanFrequency: z.string().optional(),
    membershipPlanContractLength: z.string().optional(),
    membershipPlanSignupFee: z.number().optional(),
    membershipPlanIsTrial: z.boolean().optional(),
    couponCode: z.string().optional(),
    couponType: z.string().optional(),
    couponAmount: z.string().optional(),
    couponDiscountedPrice: z.number().optional(),
  }).optional(),
});
