import * as z from 'zod';

// =============================================================================
// WAIVER TEMPLATE VALIDATIONS
// =============================================================================

export const CreateWaiverTemplateValidation = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  content: z.string().min(100, 'Waiver content must be at least 100 characters').max(50000, 'Waiver content must be 50,000 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  requiresGuardian: z.boolean().default(true),
  guardianAgeThreshold: z.number().min(13, 'Minimum age threshold is 13').max(21, 'Maximum age threshold is 21').default(16),
});

export const UpdateWaiverTemplateValidation = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  content: z.string()
    .min(100, 'Waiver content must be at least 100 characters')
    .max(50000, 'Waiver content must be 50,000 characters or less')
    .optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  requiresGuardian: z.boolean().optional(),
  guardianAgeThreshold: z.number().min(13, 'Minimum age threshold is 13').max(21, 'Maximum age threshold is 21').optional(),
});

export const DeleteWaiverTemplateValidation = z.object({
  id: z.string(),
});

export const GetWaiverTemplateValidation = z.object({
  id: z.string(),
});

// =============================================================================
// SIGNED WAIVER VALIDATIONS
// =============================================================================

export const CreateSignedWaiverValidation = z.object({
  waiverTemplateId: z.string(),
  memberId: z.string(),
  memberMembershipId: z.string().optional(),
  signatureDataUrl: z.string().min(1, 'Signature is required'),
  signedByName: z.string().min(1, 'Signer name is required').max(100),
  signedByEmail: z.string().email().optional(),
  signedByRelationship: z.enum(['self', 'parent', 'guardian', 'legal_guardian']).optional(),
  // Minor member's own signature, captured alongside the guardian's (#268).
  memberSignatureDataUrl: z.string().min(1).optional(),
  memberSignedByName: z.string().min(1).max(100).optional(),
  memberFirstName: z.string().min(1),
  memberLastName: z.string().min(1),
  memberEmail: z.string().email(),
  memberDateOfBirth: z.coerce.date().optional(),
  memberAgeAtSigning: z.number().optional(),
  renderedContent: z.string().min(1, 'Rendered waiver content is required'),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  membershipPlanName: z.string().max(200).optional(),
  membershipPlanPrice: z.number().min(0).optional(),
  membershipPlanFrequency: z.string().max(50).optional(),
  membershipPlanContractLength: z.string().max(50).optional(),
  membershipPlanSignupFee: z.number().min(0).optional(),
  membershipPlanIsTrial: z.boolean().optional(),
  couponCode: z.string().max(50).optional(),
  couponType: z.enum(['Percentage', 'Fixed Amount', 'Free Trial']).optional(),
  couponAmount: z.string().max(100).optional(),
  couponDiscountedPrice: z.number().min(0).optional(),
});

export const GetSignedWaiverValidation = z.object({
  id: z.string(),
});

export const ListMemberSignedWaiversValidation = z.object({
  memberId: z.string(),
});

// =============================================================================
// MEMBERSHIP-WAIVER ASSOCIATION VALIDATIONS
// =============================================================================

export const GetWaiversForMembershipValidation = z.object({
  membershipPlanId: z.string(),
});

export const SetMembershipWaiversValidation = z.object({
  membershipPlanId: z.string(),
  waiverTemplateIds: z.array(z.string()),
});

// Inverse of SetMembershipWaiversValidation — set the membership plans for a
// given waiver template (waiver detail page "Associated Memberships" card, #267).
export const SetWaiverMembershipsValidation = z.object({
  waiverTemplateId: z.string().min(1),
  membershipPlanIds: z.array(z.string()),
});

export const AddWaiverToMembershipValidation = z.object({
  membershipPlanId: z.string(),
  waiverTemplateId: z.string(),
  isRequired: z.boolean().default(true),
});

export const RemoveWaiverFromMembershipValidation = z.object({
  membershipPlanId: z.string(),
  waiverTemplateId: z.string(),
});

// =============================================================================
// PLACEHOLDER RESOLUTION VALIDATION
// =============================================================================

export const ResolveWaiverPlaceholdersValidation = z.object({
  templateId: z.string(),
  overrides: z.record(z.string(), z.string()).optional(),
});

// =============================================================================
// VERSION HISTORY VALIDATIONS
// =============================================================================

export const ListTemplateVersionsValidation = z.object({
  id: z.string(),
});

export const GetTemplateVersionValidation = z.object({
  id: z.string(),
});

// =============================================================================
// MERGE FIELD VALIDATIONS
// =============================================================================

export const CreateMergeFieldValidation = z.object({
  key: z.string()
    .min(1, 'Key is required')
    .max(50, 'Key must be 50 characters or less')
    .regex(/^[a-z][a-z0-9_]*$/, 'Key must start with a letter and contain only lowercase letters, numbers, and underscores'),
  label: z.string().min(1, 'Label is required').max(100, 'Label must be 100 characters or less'),
  defaultValue: z.string().min(1, 'Default value is required').max(500, 'Default value must be 500 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

export const UpdateMergeFieldValidation = z.object({
  id: z.string(),
  label: z.string().min(1).max(100).optional(),
  defaultValue: z.string().min(1, 'Default value is required').max(500, 'Default value must be 500 characters or less').optional(),
  description: z.string().max(500).nullable().optional(),
});

export const DeleteMergeFieldValidation = z.object({
  id: z.string(),
});
