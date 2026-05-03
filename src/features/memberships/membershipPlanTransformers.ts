import type { AddMembershipWizardData } from '@/hooks/useAddMembershipWizard';
import type { CreateMembershipPlanInput } from '@/validations/MembershipPlanValidation';

/**
 * Slugify a plan name. Mirrors the convention used elsewhere (lowercase,
 * non-alphanumerics → underscores, trimmed). The DB enforces uniqueness on
 * (organizationId, slug); collisions surface as a 409 from the server.
 */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function frequencyFromWizard(
  data: AddMembershipWizardData,
): 'Monthly' | 'Annual' | 'Weekly' | 'None' {
  if (data.membershipType === 'punchcard') {
    return 'None';
  }
  switch (data.paymentFrequency) {
    case 'monthly':
      return 'Monthly';
    case 'annually':
      return 'Annual';
    case 'weekly':
      return 'Weekly';
    default:
      return 'Monthly';
  }
}

function contractLengthFromWizard(data: AddMembershipWizardData): string {
  if (data.membershipType === 'punchcard') {
    return `${data.classesIncluded ?? 0} Classes`;
  }
  switch (data.contractLength) {
    case 'month-to-month':
      return 'Month-to-Month';
    case '3-months':
      return '3 Months';
    case '6-months':
      return '6 Months';
    case '12-months':
      return '12 Months';
    default:
      return 'Month-to-Month';
  }
}

function accessLevelFromWizard(data: AddMembershipWizardData): string {
  if (data.membershipType === 'punchcard') {
    return `${data.classesIncluded ?? 0} Classes Total`;
  }
  return 'Unlimited';
}

function priceFromWizard(data: AddMembershipWizardData): number {
  if (data.membershipType === 'punchcard') {
    return data.punchcardPrice ?? 0;
  }
  return data.monthlyFee ?? 0;
}

/**
 * Convert the wizard's UI shape into the DB-shape payload accepted by
 * `client.membershipPlans.create`. Both `program` (legacy text) and
 * `programId` (FK) are populated when an associated program is selected;
 * reads can fall back to the text column when programId is null.
 */
export function transformWizardDataToDb(
  data: AddMembershipWizardData,
): CreateMembershipPlanInput {
  const slug = slugify(data.membershipName);
  const programName = data.associatedProgramName ?? 'Uncategorized';
  return {
    name: data.membershipName,
    slug,
    category: data.associatedProgramName ?? 'Uncategorized',
    program: programName,
    programId: data.associatedProgramId ?? null,
    price: priceFromWizard(data),
    signupFee: data.membershipType === 'punchcard' ? 0 : (data.signUpFee ?? 0),
    frequency: frequencyFromWizard(data),
    contractLength: contractLengthFromWizard(data),
    accessLevel: accessLevelFromWizard(data),
    description: data.description.trim() === '' ? null : data.description.trim(),
    isTrial: data.membershipType === 'trial',
    isActive: data.status === 'active',
  };
}

/**
 * Convert the membership-detail-page UI shape (`MembershipDetailData` from
 * `[membershipId]/page.tsx`) back to the DB shape so partial updates can flow
 * through `client.membershipPlans.update`. The detail page's own translation
 * to UI shape is non-trivial (mapFrequency, mapContractLength, etc.) — this
 * is its inverse.
 */
type MembershipDetailLikeData = {
  id: string;
  membershipName: string;
  status: 'active' | 'inactive';
  membershipType: 'standard' | 'trial' | 'punchcard';
  description: string;
  category: string;
  associatedProgramId: string | null;
  associatedProgramName: string | null;
  signUpFee: number | null;
  monthlyFee: number | null;
  paymentFrequency: 'monthly' | 'weekly' | 'annually';
  contractLength: 'month-to-month' | '3-months' | '6-months' | '12-months';
};

function frequencyFromDetail(
  data: MembershipDetailLikeData,
): 'Monthly' | 'Annual' | 'Weekly' | 'None' {
  if (data.membershipType === 'punchcard') {
    return 'None';
  }
  switch (data.paymentFrequency) {
    case 'monthly':
      return 'Monthly';
    case 'annually':
      return 'Annual';
    case 'weekly':
      return 'Weekly';
    default:
      return 'Monthly';
  }
}

function contractLengthFromDetail(data: MembershipDetailLikeData): string {
  if (data.membershipType === 'punchcard') {
    // Punchcard "contract length" is the class count; we don't have it on
    // the detail shape, so leave the existing DB value alone (caller will
    // pass the original plan's contractLength).
    return '';
  }
  switch (data.contractLength) {
    case 'month-to-month':
      return 'Month-to-Month';
    case '3-months':
      return '3 Months';
    case '6-months':
      return '6 Months';
    case '12-months':
      return '12 Months';
    default:
      return 'Month-to-Month';
  }
}

export type DetailUpdatePayload = {
  name: string;
  slug: string;
  category: string;
  program: string;
  programId: string | null;
  price: number;
  signupFee: number;
  frequency: 'Monthly' | 'Annual' | 'Weekly' | 'None';
  contractLength: string;
  accessLevel: string;
  description: string | null;
  isTrial: boolean;
  isActive: boolean;
};

export function transformDetailDataToDb(
  data: MembershipDetailLikeData,
  fallbackContractLength: string,
  fallbackAccessLevel: string,
): DetailUpdatePayload {
  const slug = slugify(data.membershipName);
  const programName = data.associatedProgramName ?? data.category ?? 'Uncategorized';
  const contractLength = data.membershipType === 'punchcard'
    ? fallbackContractLength
    : (contractLengthFromDetail(data) || fallbackContractLength);
  return {
    name: data.membershipName,
    slug,
    category: data.category,
    program: programName,
    programId: data.associatedProgramId,
    price: data.monthlyFee ?? 0,
    signupFee: data.signUpFee ?? 0,
    frequency: frequencyFromDetail(data),
    contractLength,
    accessLevel: fallbackAccessLevel,
    description: data.description.trim() === '' ? null : data.description.trim(),
    isTrial: data.membershipType === 'trial',
    isActive: data.status === 'active',
  };
}

export { slugify };
