import * as z from 'zod';

const NAME_MAX = 128;
const SLUG_MAX = 160;
const CATEGORY_MAX = 128;
const PROGRAM_MAX = 128;
const CONTRACT_LENGTH_MAX = 64;
const ACCESS_LEVEL_MAX = 128;
const DESCRIPTION_MAX = 500;

// Recurring payment cadences. `null` (in the DB) means "no payment frequency"
// (one-time / punchcard / trial). Legacy 'None' kept for backwards compatibility
// with rows that pre-date the nullable column.
export const MembershipPlanFrequency = z.enum(['Weekly', 'Monthly', 'Semi-Annual', 'Annual', 'None']);

// Hold-fee cadence. `null` => no hold fee charged. `'one-time'` => single charge
// at the moment the member is placed on hold. Recurring values bill repeatedly
// for as long as the membership remains on hold.
export const HoldFeeFrequency = z.enum(['one-time', 'Weekly', 'Monthly', 'Semi-Annual', 'Annual']);

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
  cancellationFee: z.number().min(0).default(0),
  holdFeeAmount: z.number().min(0).default(0),
  holdFeeFrequency: HoldFeeFrequency.nullable().optional(),
  holdLimitPerYear: z.number().int().min(0).nullable().optional(),
  frequency: MembershipPlanFrequency.nullable(),
  contractLength: z.string().min(1).max(CONTRACT_LENGTH_MAX),
  accessLevel: z.string().min(1).max(ACCESS_LEVEL_MAX),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  isTrial: z.boolean(),
  isActive: z.boolean(),
});

export const CreateMembershipPlanValidation = MembershipPlanShape;

export const UpdateMembershipPlanValidation = MembershipPlanShape.extend({
  id: z.string().min(1),
});

export const DeleteMembershipPlanValidation = z.object({
  id: z.string().min(1),
});

export type CreateMembershipPlanInput = z.infer<typeof CreateMembershipPlanValidation>;
export type UpdateMembershipPlanInput = z.infer<typeof UpdateMembershipPlanValidation>;
