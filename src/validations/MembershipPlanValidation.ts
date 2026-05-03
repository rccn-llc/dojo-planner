import * as z from 'zod';

const NAME_MAX = 128;
const SLUG_MAX = 160;
const CATEGORY_MAX = 128;
const PROGRAM_MAX = 128;
const CONTRACT_LENGTH_MAX = 64;
const ACCESS_LEVEL_MAX = 128;
const DESCRIPTION_MAX = 500;

export const MembershipPlanFrequency = z.enum(['Monthly', 'Annual', 'Weekly', 'None']);

const MembershipPlanShape = z.object({
  name: z.string().min(1).max(NAME_MAX),
  slug: z.string().min(1).max(SLUG_MAX),
  category: z.string().min(1).max(CATEGORY_MAX),
  // Legacy text column. Kept in sync with `programId` going forward; reads
  // fall back to this when `programId` is null.
  program: z.string().min(1).max(PROGRAM_MAX),
  programId: z.string().nullable().optional(),
  price: z.number().min(0),
  signupFee: z.number().min(0),
  frequency: MembershipPlanFrequency,
  contractLength: z.string().min(1).max(CONTRACT_LENGTH_MAX),
  accessLevel: z.string().min(1).max(ACCESS_LEVEL_MAX),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  isTrial: z.boolean(),
  isActive: z.boolean(),
});

export const CreateMembershipPlanValidation = MembershipPlanShape;

export const UpdateMembershipPlanValidation = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(NAME_MAX),
  slug: z.string().min(1).max(SLUG_MAX),
  category: z.string().min(1).max(CATEGORY_MAX),
  program: z.string().min(1).max(PROGRAM_MAX),
  programId: z.string().nullable().optional(),
  price: z.number().min(0),
  signupFee: z.number().min(0),
  frequency: MembershipPlanFrequency,
  contractLength: z.string().min(1).max(CONTRACT_LENGTH_MAX),
  accessLevel: z.string().min(1).max(ACCESS_LEVEL_MAX),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  isTrial: z.boolean(),
  isActive: z.boolean(),
});

export const DeleteMembershipPlanValidation = z.object({
  id: z.string().min(1),
});

export type CreateMembershipPlanInput = z.infer<typeof CreateMembershipPlanValidation>;
export type UpdateMembershipPlanInput = z.infer<typeof UpdateMembershipPlanValidation>;
