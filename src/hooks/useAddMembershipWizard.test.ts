import type {
  AddMembershipWizardData,
  AutoRenewalOption,
  ChargeSignUpFeeOption,
  ContractLength,
  MembershipStatus,
  MembershipType,
  MembershipWizardStep,
  PaymentFrequency,
} from './useAddMembershipWizard';
import { describe, expect, it } from 'vitest';

describe('useAddMembershipWizard types and exports', () => {
  it('should export AddMembershipWizardData type', () => {
    const testData: AddMembershipWizardData = {
      membershipName: '12 Month Commitment (Gold)',
      status: 'active',
      membershipType: 'standard',
      description: 'A great membership option',
      associatedProgramId: '1',
      associatedProgramName: 'Adult Brazilian Jiu-jitsu',
      associatedWaiverId: null,
      associatedWaiverName: null,
      signUpFee: 35,
      chargeSignUpFee: 'at-registration',
      monthlyFee: 150,
      paymentFrequency: 'monthly',
      membershipStartDate: 'same-as-registration',
      customStartDate: '',
      proRateFirstPayment: false,
      contractLength: '12-months',
      autoRenewal: 'month-to-month',
      cancellationFee: 300,
      holdLimitPerYear: 2,
      holdFeeAmount: null,
      holdFeeFrequency: null,
      classesIncluded: null,
      punchcardPrice: null,
    };

    expect(testData.membershipName).toBe('12 Month Commitment (Gold)');
    expect(testData.monthlyFee).toBe(150);
    expect(testData.signUpFee).toBe(35);
  });

  it('should support all MembershipType options', () => {
    const types: MembershipType[] = ['standard', 'trial', 'punchcard'];

    expect(types).toHaveLength(3);
    expect(types[0]).toBe('standard');
    expect(types[1]).toBe('trial');
    expect(types[2]).toBe('punchcard');
  });

  it('should support all MembershipStatus options', () => {
    const statuses: MembershipStatus[] = ['active', 'inactive'];

    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toBe('active');
    expect(statuses[1]).toBe('inactive');
  });

  it('should support all ChargeSignUpFeeOption options', () => {
    const options: ChargeSignUpFeeOption[] = ['at-registration', 'first-payment'];

    expect(options).toHaveLength(2);
    expect(options[0]).toBe('at-registration');
    expect(options[1]).toBe('first-payment');
  });

  it('should support all PaymentFrequency options', () => {
    const frequencies: PaymentFrequency[] = ['monthly', 'weekly', 'annually'];

    expect(frequencies).toHaveLength(3);
    expect(frequencies[0]).toBe('monthly');
    expect(frequencies[1]).toBe('weekly');
    expect(frequencies[2]).toBe('annually');
  });

  it('should support all ContractLength options', () => {
    const lengths: ContractLength[] = ['month-to-month', '3-months', '6-months', '12-months'];

    expect(lengths).toHaveLength(4);
    expect(lengths[0]).toBe('month-to-month');
    expect(lengths[1]).toBe('3-months');
    expect(lengths[2]).toBe('6-months');
    expect(lengths[3]).toBe('12-months');
  });

  it('should support all AutoRenewalOption options', () => {
    const options: AutoRenewalOption[] = ['none', 'month-to-month', 'same-term'];

    expect(options).toHaveLength(3);
    expect(options[0]).toBe('none');
    expect(options[1]).toBe('month-to-month');
    expect(options[2]).toBe('same-term');
  });

  it('should support all MembershipWizardStep steps', () => {
    const steps: MembershipWizardStep[] = [
      'basics',
      'program-association',
      'payment-details',
      'contract-terms',
      'success',
    ];

    expect(steps).toHaveLength(5);
    expect(steps[0]).toBe('basics');
    expect(steps[1]).toBe('program-association');
    expect(steps[2]).toBe('payment-details');
    expect(steps[3]).toBe('contract-terms');
    expect(steps[4]).toBe('success');
  });

  it('should allow null values for optional number fields', () => {
    const minimalData: AddMembershipWizardData = {
      membershipName: '',
      status: 'active',
      membershipType: 'standard',
      description: '',
      associatedProgramId: null,
      associatedProgramName: null,
      associatedWaiverId: null,
      associatedWaiverName: null,
      signUpFee: null,
      chargeSignUpFee: 'at-registration',
      monthlyFee: null,
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

    expect(minimalData.signUpFee).toBeNull();
    expect(minimalData.monthlyFee).toBeNull();
    expect(minimalData.associatedProgramId).toBeNull();
    expect(minimalData.cancellationFee).toBeNull();
    expect(minimalData.holdLimitPerYear).toBeNull();
  });

  it('should allow creating membership with associated program', () => {
    const programData: AddMembershipWizardData = {
      membershipName: 'Kids Monthly',
      status: 'active',
      membershipType: 'standard',
      description: 'Kids program membership',
      associatedProgramId: '2',
      associatedProgramName: 'Kids Program',
      associatedWaiverId: null,
      associatedWaiverName: null,
      signUpFee: 25,
      chargeSignUpFee: 'at-registration',
      monthlyFee: 95,
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

    expect(programData.associatedProgramId).toBe('2');
    expect(programData.associatedProgramName).toBe('Kids Program');
  });

  it('should allow creating trial membership', () => {
    const trialData: AddMembershipWizardData = {
      membershipName: '7-Day Free Trial',
      status: 'active',
      membershipType: 'trial',
      description: 'Free trial for new students',
      associatedProgramId: '1',
      associatedProgramName: 'Adult Brazilian Jiu-jitsu',
      associatedWaiverId: null,
      associatedWaiverName: null,
      signUpFee: null,
      chargeSignUpFee: 'at-registration',
      monthlyFee: null,
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

    expect(trialData.membershipType).toBe('trial');
    expect(trialData.signUpFee).toBeNull();
    expect(trialData.monthlyFee).toBeNull();
  });

  it('should allow custom start date', () => {
    const customDateData: AddMembershipWizardData = {
      membershipName: 'Custom Start',
      status: 'active',
      membershipType: 'standard',
      description: 'With custom start date',
      associatedProgramId: '1',
      associatedProgramName: 'Adult Brazilian Jiu-jitsu',
      associatedWaiverId: null,
      associatedWaiverName: null,
      signUpFee: 35,
      chargeSignUpFee: 'at-registration',
      monthlyFee: 150,
      paymentFrequency: 'monthly',
      membershipStartDate: 'custom',
      customStartDate: '2024-02-01',
      proRateFirstPayment: true,
      contractLength: '12-months',
      autoRenewal: 'month-to-month',
      cancellationFee: 300,
      holdLimitPerYear: 2,
      holdFeeAmount: null,
      holdFeeFrequency: null,
      classesIncluded: null,
      punchcardPrice: null,
    };

    expect(customDateData.membershipStartDate).toBe('custom');
    expect(customDateData.customStartDate).toBe('2024-02-01');
    expect(customDateData.proRateFirstPayment).toBe(true);
  });

  it('should support weekly payment frequency', () => {
    const weeklyData: AddMembershipWizardData = {
      membershipName: 'Weekly Plan',
      status: 'active',
      membershipType: 'standard',
      description: 'Weekly payments',
      associatedProgramId: '1',
      associatedProgramName: 'Adult Brazilian Jiu-jitsu',
      associatedWaiverId: null,
      associatedWaiverName: null,
      signUpFee: null,
      chargeSignUpFee: 'at-registration',
      monthlyFee: 40,
      paymentFrequency: 'weekly',
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

    expect(weeklyData.paymentFrequency).toBe('weekly');
  });

  it('should support annual payment frequency', () => {
    const annualData: AddMembershipWizardData = {
      membershipName: 'Annual Plan',
      status: 'active',
      membershipType: 'standard',
      description: 'Annual payments',
      associatedProgramId: '1',
      associatedProgramName: 'Adult Brazilian Jiu-jitsu',
      associatedWaiverId: null,
      associatedWaiverName: null,
      signUpFee: null,
      chargeSignUpFee: 'at-registration',
      monthlyFee: 1200,
      paymentFrequency: 'annually',
      membershipStartDate: 'same-as-registration',
      customStartDate: '',
      proRateFirstPayment: false,
      contractLength: '12-months',
      autoRenewal: 'same-term',
      cancellationFee: null,
      holdLimitPerYear: null,
      holdFeeAmount: null,
      holdFeeFrequency: null,
      classesIncluded: null,
      punchcardPrice: null,
    };

    expect(annualData.paymentFrequency).toBe('annually');
    expect(annualData.autoRenewal).toBe('same-term');
  });

  it('should support inactive status', () => {
    const inactiveData: AddMembershipWizardData = {
      membershipName: 'Discontinued Plan',
      status: 'inactive',
      membershipType: 'standard',
      description: 'No longer available',
      associatedProgramId: '1',
      associatedProgramName: 'Adult Brazilian Jiu-jitsu',
      associatedWaiverId: null,
      associatedWaiverName: null,
      signUpFee: 35,
      chargeSignUpFee: 'at-registration',
      monthlyFee: 165,
      paymentFrequency: 'monthly',
      membershipStartDate: 'same-as-registration',
      customStartDate: '',
      proRateFirstPayment: false,
      contractLength: '6-months',
      autoRenewal: 'none',
      cancellationFee: null,
      holdLimitPerYear: null,
      holdFeeAmount: null,
      holdFeeFrequency: null,
      classesIncluded: null,
      punchcardPrice: null,
    };

    expect(inactiveData.status).toBe('inactive');
    expect(inactiveData.contractLength).toBe('6-months');
  });

  it('should support charge signup fee at first payment', () => {
    const testData: AddMembershipWizardData = {
      membershipName: 'Deferred Fee',
      status: 'active',
      membershipType: 'standard',
      description: 'Fee charged with first payment',
      associatedProgramId: '1',
      associatedProgramName: 'Adult Brazilian Jiu-jitsu',
      associatedWaiverId: null,
      associatedWaiverName: null,
      signUpFee: 35,
      chargeSignUpFee: 'first-payment',
      monthlyFee: 150,
      paymentFrequency: 'monthly',
      membershipStartDate: 'same-as-registration',
      customStartDate: '',
      proRateFirstPayment: false,
      contractLength: '12-months',
      autoRenewal: 'month-to-month',
      cancellationFee: null,
      holdLimitPerYear: null,
      holdFeeAmount: null,
      holdFeeFrequency: null,
      classesIncluded: null,
      punchcardPrice: null,
    };

    expect(testData.chargeSignUpFee).toBe('first-payment');
  });

  it('should allow creating punchcard membership', () => {
    const punchcardData: AddMembershipWizardData = {
      membershipName: '10-Class Punch Card',
      status: 'active',
      membershipType: 'punchcard',
      description: 'Pay once for 10 classes',
      associatedProgramId: '1',
      associatedProgramName: 'Adult Brazilian Jiu-jitsu',
      associatedWaiverId: null,
      associatedWaiverName: null,
      signUpFee: null,
      chargeSignUpFee: 'at-registration',
      monthlyFee: null,
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
      classesIncluded: 10,
      punchcardPrice: 200,
    };

    expect(punchcardData.membershipType).toBe('punchcard');
    expect(punchcardData.classesIncluded).toBe(10);
    expect(punchcardData.punchcardPrice).toBe(200);
  });
});
