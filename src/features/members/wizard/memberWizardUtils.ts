import type { AppliedCoupon, WizardStepData } from '@/hooks/useAddMemberWizard';

/**
 * Apply a coupon discount to a recurring plan price.
 *
 * - `Percentage` / `Fixed Amount`: parse the leading number out of the coupon's
 *   `amount` string and subtract it (clamped at 0). A non-numeric amount returns
 *   the original price unchanged.
 * - `Free Trial`: price becomes 0.
 *
 * The discount applies to the recurring price only — never to signup fees.
 * Shared by the Add Member, Add Family Members, and Convert Member wizards.
 */
export function computeDiscountedPrice(price: number | undefined, coupon: AppliedCoupon): number | undefined {
  if (price === undefined || price <= 0) {
    return price;
  }
  switch (coupon.type) {
    case 'Percentage': {
      const percentageMatch = coupon.amount.match(/(\d+(?:\.\d+)?)/);
      const pct = percentageMatch?.[1] ? Number.parseFloat(percentageMatch[1]) : Number.NaN;
      return Number.isNaN(pct) ? price : Math.max(0, price - (price * pct / 100));
    }
    case 'Fixed Amount': {
      const fixedMatch = coupon.amount.match(/(\d+(?:\.\d+)?)/);
      const fixed = fixedMatch?.[1] ? Number.parseFloat(fixedMatch[1]) : Number.NaN;
      return Number.isNaN(fixed) ? price : Math.max(0, price - fixed);
    }
    case 'Free Trial':
      return 0;
  }
}

/**
 * Read a File into a base64 data URL. Used to inline a member's photo before
 * sending it to the member.updatePhoto endpoint. Rejects if the read fails.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Whole-years age for a given date of birth, as of `asOf` (defaults to now).
 * Used to capture the member's age at the moment a waiver is signed.
 */
export function calculateAge(dateOfBirth: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = asOf.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Optional waiver fields with explicit names — `buildSignedWaiverPayload` reads
 * everything else off `WizardStepData`, but the member's identity may be passed
 * separately (e.g. Convert flow derives first/last name from a single field).
 */
type SignedWaiverIdentity = {
  firstName: string;
  lastName: string;
  email: string;
};

/**
 * Build the `client.waivers.createSignedWaiver` request payload from wizard data.
 * Centralizes the field mapping (member identity, age-at-signing, plan snapshot,
 * coupon snapshot) shared by the Add Member, Add Family Members, and Convert
 * flows. Only includes optional keys when their source value is present, matching
 * the original inline objects exactly.
 */
export function buildSignedWaiverPayload(
  data: WizardStepData,
  memberId: string,
  identity?: Partial<SignedWaiverIdentity>,
) {
  const firstName = identity?.firstName ?? data.firstName;
  const lastName = identity?.lastName ?? data.lastName;
  const email = identity?.email ?? data.email;
  const memberAgeAtSigning = data.dateOfBirth ? calculateAge(data.dateOfBirth) : undefined;

  return {
    waiverTemplateId: data.waiverTemplateId as string,
    memberId,
    signatureDataUrl: data.waiverSignatureDataUrl as string,
    signedByName: data.waiverSignedByName || firstName,
    signedByRelationship: data.waiverSignedByRelationship || 'self',
    ...(data.waiverGuardianEmail && { signedByEmail: data.waiverGuardianEmail }),
    memberFirstName: firstName,
    memberLastName: lastName,
    memberEmail: email,
    ...(data.dateOfBirth && { memberDateOfBirth: data.dateOfBirth }),
    ...(memberAgeAtSigning !== undefined && { memberAgeAtSigning }),
    renderedContent: data.waiverRenderedContent as string,
    ...(data.membershipPlanName && { membershipPlanName: data.membershipPlanName }),
    ...(data.membershipPlanPrice !== undefined && { membershipPlanPrice: data.membershipPlanPrice }),
    ...(data.membershipPlanFrequency && { membershipPlanFrequency: data.membershipPlanFrequency }),
    ...(data.membershipPlanContractLength && { membershipPlanContractLength: data.membershipPlanContractLength }),
    ...(data.membershipPlanSignupFee !== undefined && { membershipPlanSignupFee: data.membershipPlanSignupFee }),
    ...(data.membershipPlanIsTrial !== undefined && { membershipPlanIsTrial: data.membershipPlanIsTrial }),
    ...(data.appliedCoupon && {
      couponCode: data.appliedCoupon.code,
      couponType: data.appliedCoupon.type,
      couponAmount: data.appliedCoupon.amount,
      couponDiscountedPrice: computeDiscountedPrice(data.membershipPlanPrice, data.appliedCoupon),
    }),
  };
}
