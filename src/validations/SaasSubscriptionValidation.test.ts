import { describe, expect, it } from 'vitest';
import { CancelSubscriptionValidation, ChangePlanValidation, SubscribeValidation } from './SaasSubscriptionValidation';

// ===========================================================================
// SubscribeValidation
// ===========================================================================

const validSubscription = {
  planId: 'basic' as const,
  billingCycle: 'monthly' as const,
  orgName: 'Test Dojo',
  adminEmail: 'admin@test-dojo.com',
};

describe('SubscribeValidation', () => {
  // ===========================================================================
  // VALID INPUTS
  // ===========================================================================

  describe('valid inputs', () => {
    it('should accept a valid subscription with required fields only', () => {
      const result = SubscribeValidation.safeParse(validSubscription);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.planId).toBe('basic');
        expect(result.data.billingCycle).toBe('monthly');
        expect(result.data.orgName).toBe('Test Dojo');
        expect(result.data.adminEmail).toBe('admin@test-dojo.com');
      }
    });

    it('should accept growth plan with annual billing', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        planId: 'growth',
        billingCycle: 'annual',
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.planId).toBe('growth');
        expect(result.data.billingCycle).toBe('annual');
      }
    });

    it('should accept a subscription with all optional card fields', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        cardToken: 'tok_test_abc123',
        cardFirstSix: '424242',
        cardLastFour: '4242',
        cardExpiry: '12/28',
        cardNumber: '4242424242424242',
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.cardToken).toBe('tok_test_abc123');
        expect(result.data.cardFirstSix).toBe('424242');
        expect(result.data.cardLastFour).toBe('4242');
        expect(result.data.cardExpiry).toBe('12/28');
        expect(result.data.cardNumber).toBe('4242424242424242');
      }
    });
  });

  // ===========================================================================
  // INVALID PLAN IDS
  // ===========================================================================

  describe('invalid plan IDs', () => {
    it('should reject invalid plan IDs', () => {
      for (const planId of ['enterprise', 'invalid', 'free']) {
        const result = SubscribeValidation.safeParse({
          ...validSubscription,
          planId,
        });

        expect(result.success).toBe(false);
      }
    });

    it('should reject empty string as a plan ID', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        planId: '',
      });

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // INVALID BILLING CYCLES
  // ===========================================================================

  describe('invalid billing cycles', () => {
    it('should reject weekly as a billing cycle', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        billingCycle: 'weekly',
      });

      expect(result.success).toBe(false);
    });

    it('should reject quarterly as a billing cycle', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        billingCycle: 'quarterly',
      });

      expect(result.success).toBe(false);
    });

    it('should reject empty string as a billing cycle', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        billingCycle: '',
      });

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // MISSING REQUIRED FIELDS
  // ===========================================================================

  describe('missing required fields', () => {
    it('should reject missing planId', () => {
      const { planId: _, ...withoutPlanId } = validSubscription;
      const result = SubscribeValidation.safeParse(withoutPlanId);

      expect(result.success).toBe(false);
    });

    it('should reject missing billingCycle', () => {
      const { billingCycle: _, ...withoutBillingCycle } = validSubscription;
      const result = SubscribeValidation.safeParse(withoutBillingCycle);

      expect(result.success).toBe(false);
    });

    it('should reject missing orgName', () => {
      const { orgName: _, ...withoutOrgName } = validSubscription;
      const result = SubscribeValidation.safeParse(withoutOrgName);

      expect(result.success).toBe(false);
    });

    it('should reject empty orgName', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        orgName: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing adminEmail', () => {
      const { adminEmail: _, ...withoutAdminEmail } = validSubscription;
      const result = SubscribeValidation.safeParse(withoutAdminEmail);

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // INVALID EMAIL FORMAT
  // ===========================================================================

  describe('invalid email format', () => {
    it('should reject email without @ symbol', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        adminEmail: 'not-an-email',
      });

      expect(result.success).toBe(false);
    });

    it('should reject email without domain', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        adminEmail: 'admin@',
      });

      expect(result.success).toBe(false);
    });

    it('should reject empty email', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        adminEmail: '',
      });

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // OPTIONAL FIELDS
  // ===========================================================================

  describe('optional fields', () => {
    it('should accept without cardToken', () => {
      const result = SubscribeValidation.safeParse(validSubscription);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.cardToken).toBeUndefined();
      }
    });

    it('should accept without cardFirstSix', () => {
      const result = SubscribeValidation.safeParse(validSubscription);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.cardFirstSix).toBeUndefined();
      }
    });

    it('should accept without cardLastFour', () => {
      const result = SubscribeValidation.safeParse(validSubscription);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.cardLastFour).toBeUndefined();
      }
    });

    it('should accept without cardExpiry', () => {
      const result = SubscribeValidation.safeParse(validSubscription);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.cardExpiry).toBeUndefined();
      }
    });

    it('should accept without cardNumber', () => {
      const result = SubscribeValidation.safeParse(validSubscription);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.cardNumber).toBeUndefined();
      }
    });

    it('should reject cardFirstSix longer than 6 characters', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        cardFirstSix: '4242421',
      });

      expect(result.success).toBe(false);
    });

    it('should reject cardLastFour longer than 4 characters', () => {
      const result = SubscribeValidation.safeParse({
        ...validSubscription,
        cardLastFour: '42421',
      });

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // ENUM VALUES
  // ===========================================================================

  describe('enum values', () => {
    it('should accept all valid planId values', () => {
      const plans = ['basic', 'growth'] as const;

      for (const planId of plans) {
        const result = SubscribeValidation.safeParse({
          ...validSubscription,
          planId,
        });

        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid billingCycle values', () => {
      const cycles = ['monthly', 'annual'] as const;

      for (const billingCycle of cycles) {
        const result = SubscribeValidation.safeParse({
          ...validSubscription,
          billingCycle,
        });

        expect(result.success).toBe(true);
      }
    });
  });
});

// ===========================================================================
// ChangePlanValidation
// ===========================================================================

const validChangePlan = {
  newPlanId: 'growth' as const,
  newBillingCycle: 'annual' as const,
};

describe('ChangePlanValidation', () => {
  // ===========================================================================
  // VALID INPUTS
  // ===========================================================================

  describe('valid inputs', () => {
    it('should accept a valid plan change to growth annual', () => {
      const result = ChangePlanValidation.safeParse(validChangePlan);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.newPlanId).toBe('growth');
        expect(result.data.newBillingCycle).toBe('annual');
      }
    });

    it('should accept a valid plan change to basic monthly', () => {
      const result = ChangePlanValidation.safeParse({
        newPlanId: 'basic',
        newBillingCycle: 'monthly',
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.newPlanId).toBe('basic');
        expect(result.data.newBillingCycle).toBe('monthly');
      }
    });
  });

  // ===========================================================================
  // INVALID PLAN IDS
  // ===========================================================================

  describe('invalid plan IDs', () => {
    it('should reject invalid plan IDs', () => {
      for (const newPlanId of ['enterprise', 'invalid']) {
        const result = ChangePlanValidation.safeParse({
          ...validChangePlan,
          newPlanId,
        });

        expect(result.success).toBe(false);
      }
    });
  });

  // ===========================================================================
  // INVALID BILLING CYCLES
  // ===========================================================================

  describe('invalid billing cycles', () => {
    it('should reject weekly as a billing cycle', () => {
      const result = ChangePlanValidation.safeParse({
        ...validChangePlan,
        newBillingCycle: 'weekly',
      });

      expect(result.success).toBe(false);
    });

    it('should reject quarterly as a billing cycle', () => {
      const result = ChangePlanValidation.safeParse({
        ...validChangePlan,
        newBillingCycle: 'quarterly',
      });

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // MISSING REQUIRED FIELDS
  // ===========================================================================

  describe('missing required fields', () => {
    it('should reject missing newPlanId', () => {
      const { newPlanId: _, ...withoutPlanId } = validChangePlan;
      const result = ChangePlanValidation.safeParse(withoutPlanId);

      expect(result.success).toBe(false);
    });

    it('should reject missing newBillingCycle', () => {
      const { newBillingCycle: _, ...withoutBillingCycle } = validChangePlan;
      const result = ChangePlanValidation.safeParse(withoutBillingCycle);

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // ENUM VALUES
  // ===========================================================================

  describe('enum values', () => {
    it('should accept all valid newPlanId values', () => {
      const plans = ['basic', 'growth'] as const;

      for (const newPlanId of plans) {
        const result = ChangePlanValidation.safeParse({
          ...validChangePlan,
          newPlanId,
        });

        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid newBillingCycle values', () => {
      const cycles = ['monthly', 'annual'] as const;

      for (const newBillingCycle of cycles) {
        const result = ChangePlanValidation.safeParse({
          ...validChangePlan,
          newBillingCycle,
        });

        expect(result.success).toBe(true);
      }
    });
  });
});

// ===========================================================================
// CancelSubscriptionValidation
// ===========================================================================

describe('CancelSubscriptionValidation', () => {
  // ===========================================================================
  // VALID INPUTS
  // ===========================================================================

  describe('valid inputs', () => {
    it('should accept endOfPeriod as true', () => {
      const result = CancelSubscriptionValidation.safeParse({ endOfPeriod: true });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.endOfPeriod).toBe(true);
      }
    });

    it('should accept endOfPeriod as false', () => {
      const result = CancelSubscriptionValidation.safeParse({ endOfPeriod: false });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.endOfPeriod).toBe(false);
      }
    });
  });

  // ===========================================================================
  // INVALID VALUES
  // ===========================================================================

  describe('invalid values', () => {
    it('should reject endOfPeriod as a string', () => {
      const result = CancelSubscriptionValidation.safeParse({ endOfPeriod: 'true' });

      expect(result.success).toBe(false);
    });

    it('should reject endOfPeriod as a number', () => {
      const result = CancelSubscriptionValidation.safeParse({ endOfPeriod: 1 });

      expect(result.success).toBe(false);
    });

    it('should reject endOfPeriod as null', () => {
      const result = CancelSubscriptionValidation.safeParse({ endOfPeriod: null });

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // MISSING REQUIRED FIELDS
  // ===========================================================================

  describe('missing required fields', () => {
    it('should reject missing endOfPeriod', () => {
      const result = CancelSubscriptionValidation.safeParse({});

      expect(result.success).toBe(false);
    });
  });
});
