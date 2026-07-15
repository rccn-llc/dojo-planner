import * as z from 'zod';

// Base64 data URLs inflate the raw byte size by ~33%. The client compresses
// avatars to ≤200KB (see compressImageForStorage), so ≤400KB of base64 leaves
// comfortable headroom while still keeping the request payload manageable.
const PHOTO_DATA_URL_MAX = 400_000;
const PHOTO_DATA_URL_REGEX = /^data:image\/(jpeg|png|gif);base64,/;

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
  // Optional avatar as a base64 image data URL, capped so the create payload
  // stays manageable (same limit as UpdateMemberPhotoValidation).
  photoUrl: z
    .string()
    .max(PHOTO_DATA_URL_MAX, 'Photo data URL must be 400KB or less')
    .regex(PHOTO_DATA_URL_REGEX, 'photoUrl must be a data URL for an image (jpeg, png, gif)')
    .optional(),
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

export const RemoveFullyMemberValidation = z.object({
  id: z.string().min(1),
});

export const UpdateMemberContactInfoValidation = z.object({
  id: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
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
  // image type, capped so the request payload stays manageable.
  photoUrl: z
    .string()
    .max(PHOTO_DATA_URL_MAX, 'Photo data URL must be 400KB or less')
    .regex(PHOTO_DATA_URL_REGEX, 'photoUrl must be a data URL for an image (jpeg, png, gif)')
    .nullable(),
});

export const MemberPaymentMethodsValidation = z.object({
  memberId: z.string().min(1),
});

export const PaymentMethodMutationValidation = z.object({
  memberId: z.string().min(1),
  paymentMethodId: z.string().min(1),
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

// =============================================================================
// MEMBERSHIP LIFECYCLE: CANCEL / HOLD / REACTIVATE
// =============================================================================

/**
 * Cancel a specific membership. Charges the plan's cancellation fee (if any)
 * via IQPro using the saved payment method, then cancels the IQPro
 * subscription, then updates the DB. `waiveFee=true` lets staff skip the fee.
 */
export const CancelMembershipValidation = z.object({
  memberId: z.string().min(1),
  memberMembershipId: z.string().min(1),
  waiveFee: z.boolean().optional().default(false),
});

/**
 * Place a member's membership on hold. Charges the plan's hold fee
 * one-time (if `holdFeeFrequency === 'one-time'`) or creates a recurring
 * hold-fee subscription, then pauses the original membership subscription.
 */
export const HoldMembershipValidation = z.object({
  memberId: z.string().min(1),
  memberMembershipId: z.string().min(1),
});

/**
 * Reactivate a held membership. Cancels the hold-fee subscription (if any)
 * and resumes the original membership subscription.
 */
export const ReactivateMembershipValidation = z.object({
  memberId: z.string().min(1),
  memberMembershipId: z.string().min(1),
});
