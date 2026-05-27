import type { AddMembershipWizardData } from '@/hooks/useAddMembershipWizard';
import { describe, expect, it } from 'vitest';
import { slugify, transformDetailDataToDb, transformWizardDataToDb } from './membershipPlanTransformers';

const baseWizard: AddMembershipWizardData = {
  membershipName: 'Adult Monthly Gold',
  status: 'active',
  membershipType: 'standard',
  description: 'Premium plan',
  associatedProgramId: 'p-1',
  associatedProgramName: 'Adult BJJ',
  associatedWaiverId: null,
  associatedWaiverName: null,
  signUpFee: 99,
  chargeSignUpFee: 'at-registration',
  monthlyFee: 149,
  paymentFrequency: 'monthly',
  membershipStartDate: 'same-as-registration',
  customStartDate: '',
  proRateFirstPayment: false,
  contractLength: 'month-to-month',
  autoRenewal: 'none',
  cancellationFee: null,
  holdLimitPerYear: null,
  holdFeeAmount: null,
  holdFeeFrequency: null,
  classesIncluded: null,
  punchcardPrice: null,
};

describe('slugify', () => {
  it('produces a snake-case slug', () => {
    expect(slugify('Adult Monthly Gold')).toBe('adult_monthly_gold');
  });

  it('strips non-alphanumerics and trims', () => {
    expect(slugify('  Hello, World!  ')).toBe('hello_world');
  });
});

describe('transformWizardDataToDb', () => {
  it('produces a complete DB shape for a standard plan', () => {
    const result = transformWizardDataToDb(baseWizard);

    expect(result.name).toBe('Adult Monthly Gold');
    expect(result.slug).toBe('adult_monthly_gold');
    expect(result.programId).toBe('p-1');
    expect(result.program).toBe('Adult BJJ');
    expect(result.price).toBe(149);
    expect(result.signupFee).toBe(99);
    expect(result.frequency).toBe('Monthly');
    expect(result.contractLength).toBe('Month-to-Month');
    expect(result.accessLevel).toBe('Unlimited');
    expect(result.isTrial).toBe(false);
    expect(result.isActive).toBe(true);
  });

  it('marks trial plans as isTrial', () => {
    const result = transformWizardDataToDb({ ...baseWizard, membershipType: 'trial' });

    expect(result.isTrial).toBe(true);
  });

  it('writes null frequency for punchcard plans (no recurring billing)', () => {
    const result = transformWizardDataToDb({
      ...baseWizard,
      membershipType: 'punchcard',
      classesIncluded: 10,
      punchcardPrice: 200,
    });

    expect(result.frequency).toBeNull();
    expect(result.price).toBe(200);
    expect(result.contractLength).toBe('10 Classes');
    expect(result.accessLevel).toBe('10 Classes Total');
  });

  it('writes null frequency for trial plans', () => {
    const result = transformWizardDataToDb({
      ...baseWizard,
      membershipType: 'trial',
    });

    expect(result.frequency).toBeNull();
    expect(result.isTrial).toBe(true);
  });

  it('maps semi-annually wizard frequency to Semi-Annual DB value', () => {
    const result = transformWizardDataToDb({
      ...baseWizard,
      paymentFrequency: 'semi-annually',
    });

    expect(result.frequency).toBe('Semi-Annual');
  });

  it('maps weekly wizard frequency to Weekly DB value', () => {
    const result = transformWizardDataToDb({
      ...baseWizard,
      paymentFrequency: 'weekly',
    });

    expect(result.frequency).toBe('Weekly');
  });

  it('persists hold-fee fields when amount + frequency are set', () => {
    const result = transformWizardDataToDb({
      ...baseWizard,
      holdFeeAmount: 25,
      holdFeeFrequency: 'monthly',
    });

    expect(result.holdFeeAmount).toBe(25);
    expect(result.holdFeeFrequency).toBe('Monthly');
  });

  it('clears hold-fee fields for punchcards', () => {
    const result = transformWizardDataToDb({
      ...baseWizard,
      membershipType: 'punchcard',
      classesIncluded: 10,
      punchcardPrice: 200,
      holdFeeAmount: 25,
      holdFeeFrequency: 'monthly',
    });

    expect(result.holdFeeAmount).toBe(0);
    expect(result.holdFeeFrequency).toBeNull();
  });

  it('renders empty description as null', () => {
    expect(transformWizardDataToDb({ ...baseWizard, description: '' }).description).toBeNull();
    expect(transformWizardDataToDb({ ...baseWizard, description: '   ' }).description).toBeNull();
  });

  it('handles inactive status', () => {
    const result = transformWizardDataToDb({ ...baseWizard, status: 'inactive' });

    expect(result.isActive).toBe(false);
  });

  it('falls back to Uncategorized when no associated program is selected', () => {
    const result = transformWizardDataToDb({ ...baseWizard, associatedProgramId: null, associatedProgramName: null });

    expect(result.programId).toBeNull();
    expect(result.program).toBe('Uncategorized');
  });

  it('maps payment frequency correctly', () => {
    expect(transformWizardDataToDb({ ...baseWizard, paymentFrequency: 'monthly' }).frequency).toBe('Monthly');
    expect(transformWizardDataToDb({ ...baseWizard, paymentFrequency: 'annually' }).frequency).toBe('Annual');
    expect(transformWizardDataToDb({ ...baseWizard, paymentFrequency: 'weekly' }).frequency).toBe('Weekly');
  });

  it('maps contract length correctly', () => {
    expect(transformWizardDataToDb({ ...baseWizard, contractLength: '12-months' }).contractLength).toBe('12 Months');
    expect(transformWizardDataToDb({ ...baseWizard, contractLength: '6-months' }).contractLength).toBe('6 Months');
    expect(transformWizardDataToDb({ ...baseWizard, contractLength: '3-months' }).contractLength).toBe('3 Months');
  });
});

describe('transformDetailDataToDb', () => {
  const baseDetail = {
    id: 'plan-1',
    membershipName: 'Adult Monthly Gold',
    status: 'active' as const,
    membershipType: 'standard' as const,
    description: 'Premium plan',
    category: 'Adult BJJ',
    associatedProgramId: 'p-1',
    associatedProgramName: 'Adult BJJ',
    signUpFee: 99,
    monthlyFee: 149,
    paymentFrequency: 'monthly' as const,
    contractLength: 'month-to-month' as const,
  };

  it('produces a DB shape with the existing fallbacks', () => {
    const result = transformDetailDataToDb(baseDetail, 'Month-to-Month', 'Unlimited');

    expect(result.name).toBe('Adult Monthly Gold');
    expect(result.programId).toBe('p-1');
    expect(result.contractLength).toBe('Month-to-Month');
    expect(result.accessLevel).toBe('Unlimited');
  });

  it('uses fallback contractLength for punchcard plans', () => {
    const result = transformDetailDataToDb(
      { ...baseDetail, membershipType: 'punchcard' },
      '10 Classes',
      '10 Classes Total',
    );

    expect(result.contractLength).toBe('10 Classes');
    expect(result.accessLevel).toBe('10 Classes Total');
  });
});
