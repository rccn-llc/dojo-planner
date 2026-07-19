import type { AppliedCoupon, WizardStepData } from '@/hooks/useAddMemberWizard';
import { describe, expect, it, vi } from 'vitest';
import { buildSignedWaiverPayload, calculateAge, computeDiscountedPrice, fileToDataUrl } from './memberWizardUtils';

function coupon(type: AppliedCoupon['type'], amount: string): AppliedCoupon {
  return {
    id: 'test-coupon-1',
    code: 'TEST',
    type,
    amount,
    description: 'Test coupon',
  };
}

describe('computeDiscountedPrice', () => {
  it('returns the price unchanged when price is undefined', () => {
    expect(computeDiscountedPrice(undefined, coupon('Percentage', '10%'))).toBeUndefined();
  });

  it('returns the price unchanged when price is zero or negative', () => {
    expect(computeDiscountedPrice(0, coupon('Percentage', '10%'))).toBe(0);
    expect(computeDiscountedPrice(-5, coupon('Fixed Amount', '$2'))).toBe(-5);
  });

  it('applies a percentage discount', () => {
    expect(computeDiscountedPrice(100, coupon('Percentage', '20%'))).toBe(80);
    expect(computeDiscountedPrice(100, coupon('Percentage', '12.5%'))).toBe(87.5);
  });

  it('applies a fixed-amount discount and clamps at zero', () => {
    expect(computeDiscountedPrice(100, coupon('Fixed Amount', '$30'))).toBe(70);
    expect(computeDiscountedPrice(20, coupon('Fixed Amount', '$50'))).toBe(0);
  });

  it('returns 0 for a free trial', () => {
    expect(computeDiscountedPrice(99, coupon('Free Trial', '30 days'))).toBe(0);
  });

  it('returns the original price when the amount is not numeric', () => {
    expect(computeDiscountedPrice(100, coupon('Percentage', 'half off'))).toBe(100);
    expect(computeDiscountedPrice(100, coupon('Fixed Amount', 'free'))).toBe(100);
  });
});

describe('calculateAge', () => {
  it('computes whole-years age before the birthday in the year', () => {
    const dob = new Date('2000-12-31');

    expect(calculateAge(dob, new Date('2024-06-15'))).toBe(23);
  });

  it('computes whole-years age after the birthday in the year', () => {
    const dob = new Date('2000-01-01');

    expect(calculateAge(dob, new Date('2024-06-15'))).toBe(24);
  });

  it('handles the exact birthday as having turned that age', () => {
    const dob = new Date('2000-06-15');

    expect(calculateAge(dob, new Date('2024-06-15'))).toBe(24);
  });

  it('handles the day before the birthday', () => {
    const dob = new Date('2000-06-15');

    expect(calculateAge(dob, new Date('2024-06-14'))).toBe(23);
  });
});

describe('fileToDataUrl', () => {
  // FileReader is a browser API; provide a minimal stub for the Node unit env.
  class FakeFileReader {
    public result: string | null = null;
    public onload: (() => void) | null = null;
    public onerror: ((err: unknown) => void) | null = null;
    readAsDataURL(_file: unknown) {
      this.result = 'data:text/plain;base64,aGVsbG8=';
      this.onload?.();
    }
  }

  it('resolves with a base64 data URL for a file', async () => {
    vi.stubGlobal('FileReader', FakeFileReader);
    const file = { name: 'photo.txt' } as unknown as File;
    const result = await fileToDataUrl(file);

    expect(result).toBe('data:text/plain;base64,aGVsbG8=');

    vi.unstubAllGlobals();
  });

  it('rejects when the read fails', async () => {
    class ErroringReader extends FakeFileReader {
      override readAsDataURL() {
        this.onerror?.(new Error('read failed'));
      }
    }
    vi.stubGlobal('FileReader', ErroringReader);

    await expect(fileToDataUrl({} as File)).rejects.toThrow('read failed');

    vi.unstubAllGlobals();
  });
});

describe('buildSignedWaiverPayload', () => {
  const baseData = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    membershipPlanId: 'plan-1',
    waiverTemplateId: 'tmpl-1',
    waiverSignatureDataUrl: 'data:image/png;base64,abc',
    waiverRenderedContent: '<p>waiver</p>',
  } as unknown as WizardStepData;

  it('maps the core required fields', () => {
    const payload = buildSignedWaiverPayload(baseData, 'member-1');

    expect(payload).toMatchObject({
      waiverTemplateId: 'tmpl-1',
      memberId: 'member-1',
      signatureDataUrl: 'data:image/png;base64,abc',
      signedByName: 'John',
      signedByRelationship: 'self',
      memberFirstName: 'John',
      memberLastName: 'Doe',
      memberEmail: 'john@example.com',
      renderedContent: '<p>waiver</p>',
    });
  });

  it('omits optional plan/coupon keys when absent', () => {
    const payload = buildSignedWaiverPayload(baseData, 'member-1');

    expect(payload).not.toHaveProperty('membershipPlanName');
    expect(payload).not.toHaveProperty('couponCode');
    expect(payload).not.toHaveProperty('memberDateOfBirth');
    expect(payload).not.toHaveProperty('memberAgeAtSigning');
  });

  it('omits the member (minor) signature keys when not present', () => {
    const payload = buildSignedWaiverPayload(baseData, 'member-1');

    expect(payload).not.toHaveProperty('memberSignatureDataUrl');
    expect(payload).not.toHaveProperty('memberSignedByName');
  });

  it('includes the minor member signature alongside the guardian when present (#268)', () => {
    const data = {
      ...baseData,
      waiverSignedByRelationship: 'guardian',
      waiverMemberSignatureDataUrl: 'data:image/png;base64,minor',
      waiverMemberSignedByName: 'Little Doe',
    } as unknown as WizardStepData;
    const payload = buildSignedWaiverPayload(data, 'member-1') as Record<string, unknown>;

    expect(payload.signedByRelationship).toBe('guardian');
    expect(payload.memberSignatureDataUrl).toBe('data:image/png;base64,minor');
    expect(payload.memberSignedByName).toBe('Little Doe');
  });

  it('includes the age and DOB when dateOfBirth is present', () => {
    const data = { ...baseData, dateOfBirth: new Date('2000-01-01') } as WizardStepData;
    const payload = buildSignedWaiverPayload(data, 'member-1', undefined);

    expect(payload).toHaveProperty('memberDateOfBirth');
    expect(typeof (payload as { memberAgeAtSigning?: number }).memberAgeAtSigning).toBe('number');
  });

  it('includes the coupon snapshot with a discounted price when a coupon applies', () => {
    const data = {
      ...baseData,
      membershipPlanPrice: 100,
      appliedCoupon: { id: 'c1', code: 'SAVE10', type: 'Percentage', amount: '10%', description: '' },
    } as WizardStepData;
    const payload = buildSignedWaiverPayload(data, 'member-1') as Record<string, unknown>;

    expect(payload.couponCode).toBe('SAVE10');
    expect(payload.couponDiscountedPrice).toBe(90);
  });

  it('uses the identity override for name and email but keeps signedByName fallback', () => {
    const payload = buildSignedWaiverPayload(baseData, 'member-1', {
      firstName: 'Override',
      lastName: 'Name',
      email: 'override@example.com',
    }) as Record<string, unknown>;

    expect(payload.memberFirstName).toBe('Override');
    expect(payload.memberLastName).toBe('Name');
    expect(payload.memberEmail).toBe('override@example.com');
    expect(payload.signedByName).toBe('Override');
  });
});
