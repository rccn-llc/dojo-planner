import { describe, expect, it } from 'vitest';
import { ProcessPaymentValidation } from './PaymentValidation';

const validCardPayment = {
  memberId: 'test-member-123',
  memberEmail: 'member@test-dojo.com',
  memberFirstName: 'John',
  memberLastName: 'Doe',
  paymentMethod: 'card' as const,
  billingType: 'autopay' as const,
  amount: 150,
  description: 'Monthly membership payment',
};

const validAchPayment = {
  memberId: 'test-member-456',
  memberEmail: 'member@test-dojo.com',
  memberFirstName: 'Jane',
  memberLastName: 'Smith',
  paymentMethod: 'ach' as const,
  billingType: 'one-time' as const,
  amount: 200,
  description: 'Annual membership payment',
};

describe('ProcessPaymentValidation', () => {
  // ===========================================================================
  // VALID INPUTS
  // ===========================================================================

  describe('valid inputs', () => {
    it('should accept a valid card payment', () => {
      const result = ProcessPaymentValidation.safeParse(validCardPayment);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.memberId).toBe('test-member-123');
        expect(result.data.paymentMethod).toBe('card');
        expect(result.data.billingType).toBe('autopay');
        expect(result.data.amount).toBe(150);
      }
    });

    it('should accept a valid ACH payment', () => {
      const result = ProcessPaymentValidation.safeParse(validAchPayment);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.memberId).toBe('test-member-456');
        expect(result.data.paymentMethod).toBe('ach');
        expect(result.data.billingType).toBe('one-time');
        expect(result.data.amount).toBe(200);
      }
    });

    it('should accept a payment with all optional fields', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberPhone: '555-123-4567',
        memberAddress: {
          street: '123 Main St',
          apartment: 'Apt 4B',
          city: 'Springfield',
          state: 'IL',
          zipCode: '62704',
          country: 'US',
        },
        cardholderName: 'John Doe',
        cardNumber: '4242424242424242',
        cardExpiry: '12/28',
        cardCvc: '123',
        membershipPlanId: 'test-plan-789',
        membershipPlanFrequency: 'Monthly',
        memberMembershipId: 'test-membership-101',
        appliedCoupon: {
          id: 'test-coupon-202',
          code: 'SAVE20',
          type: 'Percentage' as const,
          amount: '20%',
          description: '20% off first month',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept amount of zero', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        amount: 0,
      });

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // MISSING REQUIRED FIELDS
  // ===========================================================================

  describe('missing required fields', () => {
    it('should reject missing memberId', () => {
      const { memberId: _, ...withoutMemberId } = validCardPayment;
      const result = ProcessPaymentValidation.safeParse(withoutMemberId);

      expect(result.success).toBe(false);
    });

    it('should reject empty memberId', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberId: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing memberEmail', () => {
      const { memberEmail: _, ...withoutEmail } = validCardPayment;
      const result = ProcessPaymentValidation.safeParse(withoutEmail);

      expect(result.success).toBe(false);
    });

    it('should reject missing memberFirstName', () => {
      const { memberFirstName: _, ...withoutFirstName } = validCardPayment;
      const result = ProcessPaymentValidation.safeParse(withoutFirstName);

      expect(result.success).toBe(false);
    });

    it('should reject empty memberFirstName', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberFirstName: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing memberLastName', () => {
      const { memberLastName: _, ...withoutLastName } = validCardPayment;
      const result = ProcessPaymentValidation.safeParse(withoutLastName);

      expect(result.success).toBe(false);
    });

    it('should reject empty memberLastName', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberLastName: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing paymentMethod', () => {
      const { paymentMethod: _, ...withoutPaymentMethod } = validCardPayment;
      const result = ProcessPaymentValidation.safeParse(withoutPaymentMethod);

      expect(result.success).toBe(false);
    });

    it('should reject missing billingType', () => {
      const { billingType: _, ...withoutBillingType } = validCardPayment;
      const result = ProcessPaymentValidation.safeParse(withoutBillingType);

      expect(result.success).toBe(false);
    });

    it('should reject missing amount', () => {
      const { amount: _, ...withoutAmount } = validCardPayment;
      const result = ProcessPaymentValidation.safeParse(withoutAmount);

      expect(result.success).toBe(false);
    });

    it('should reject missing description', () => {
      const { description: _, ...withoutDescription } = validCardPayment;
      const result = ProcessPaymentValidation.safeParse(withoutDescription);

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // INVALID VALUES
  // ===========================================================================

  describe('invalid values', () => {
    it('should reject invalid email', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberEmail: 'not-an-email',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid paymentMethod enum', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        paymentMethod: 'crypto',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid billingType enum', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        billingType: 'recurring',
      });

      expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        amount: -10,
      });

      expect(result.success).toBe(false);
    });

    it('should reject non-number amount', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        amount: 'one hundred',
      });

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // OPTIONAL FIELDS
  // ===========================================================================

  describe('optional fields', () => {
    it('should accept without memberPhone', () => {
      const result = ProcessPaymentValidation.safeParse(validCardPayment);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.memberPhone).toBeUndefined();
      }
    });

    it('should accept without memberAddress', () => {
      const result = ProcessPaymentValidation.safeParse(validCardPayment);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.memberAddress).toBeUndefined();
      }
    });

    it('should accept without card fields', () => {
      const result = ProcessPaymentValidation.safeParse(validCardPayment);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.cardholderName).toBeUndefined();
        expect(result.data.cardNumber).toBeUndefined();
        expect(result.data.cardExpiry).toBeUndefined();
        expect(result.data.cardCvc).toBeUndefined();
      }
    });

    it('should accept cardToken as an optional string', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        cardToken: 'tok_test_abc123',
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.cardToken).toBe('tok_test_abc123');
      }
    });

    it('should accept without cardToken', () => {
      const result = ProcessPaymentValidation.safeParse(validCardPayment);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.cardToken).toBeUndefined();
      }
    });

    it('should accept without ACH fields', () => {
      const result = ProcessPaymentValidation.safeParse(validAchPayment);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.achAccountHolder).toBeUndefined();
        expect(result.data.achRoutingNumber).toBeUndefined();
        expect(result.data.achAccountNumber).toBeUndefined();
      }
    });

    it('should accept without membership context fields', () => {
      const result = ProcessPaymentValidation.safeParse(validCardPayment);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.membershipPlanId).toBeUndefined();
        expect(result.data.membershipPlanFrequency).toBeUndefined();
        expect(result.data.memberMembershipId).toBeUndefined();
      }
    });

    it('should accept without appliedCoupon', () => {
      const result = ProcessPaymentValidation.safeParse(validCardPayment);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.appliedCoupon).toBeUndefined();
      }
    });

    it('should accept appliedCoupon as null', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        appliedCoupon: null,
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.appliedCoupon).toBeNull();
      }
    });
  });

  // ===========================================================================
  // APPLIED COUPON VALIDATION
  // ===========================================================================

  describe('appliedCoupon', () => {
    it('should accept a valid coupon with Percentage type', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        appliedCoupon: {
          id: 'test-coupon-1',
          code: 'SAVE15',
          type: 'Percentage',
          amount: '15%',
          description: '15% off membership',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept a valid coupon with Fixed Amount type', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        appliedCoupon: {
          id: 'test-coupon-2',
          code: 'FLAT20',
          type: 'Fixed Amount',
          amount: '$20',
          description: '$20 off membership',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept a valid coupon with Free Trial type', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        appliedCoupon: {
          id: 'test-coupon-3',
          code: 'FREETRIAL',
          type: 'Free Trial',
          amount: '30 days',
          description: '30-day free trial',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject coupon with invalid type', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        appliedCoupon: {
          id: 'test-coupon-4',
          code: 'INVALID',
          type: 'BOGO',
          amount: '50%',
          description: 'Invalid coupon type',
        },
      });

      expect(result.success).toBe(false);
    });

    it('should reject coupon missing required fields', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        appliedCoupon: {
          id: 'test-coupon-5',
          code: 'PARTIAL',
        },
      });

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // MEMBER ADDRESS VALIDATION
  // ===========================================================================

  describe('memberAddress', () => {
    it('should accept a valid address with all fields', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberAddress: {
          street: '456 Oak Avenue',
          apartment: 'Suite 100',
          city: 'Portland',
          state: 'OR',
          zipCode: '97201',
          country: 'US',
        },
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.memberAddress?.street).toBe('456 Oak Avenue');
        expect(result.data.memberAddress?.apartment).toBe('Suite 100');
      }
    });

    it('should accept a valid address without optional apartment', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberAddress: {
          street: '789 Pine Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '73301',
          country: 'US',
        },
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.memberAddress?.apartment).toBeUndefined();
      }
    });

    it('should reject address missing street', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberAddress: {
          city: 'Austin',
          state: 'TX',
          zipCode: '73301',
          country: 'US',
        },
      });

      expect(result.success).toBe(false);
    });

    it('should reject address missing city', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberAddress: {
          street: '789 Pine Street',
          state: 'TX',
          zipCode: '73301',
          country: 'US',
        },
      });

      expect(result.success).toBe(false);
    });

    it('should reject address missing state', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberAddress: {
          street: '789 Pine Street',
          city: 'Austin',
          zipCode: '73301',
          country: 'US',
        },
      });

      expect(result.success).toBe(false);
    });

    it('should reject address missing zipCode', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberAddress: {
          street: '789 Pine Street',
          city: 'Austin',
          state: 'TX',
          country: 'US',
        },
      });

      expect(result.success).toBe(false);
    });

    it('should reject address missing country', () => {
      const result = ProcessPaymentValidation.safeParse({
        ...validCardPayment,
        memberAddress: {
          street: '789 Pine Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '73301',
        },
      });

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // ENUM VALUES
  // ===========================================================================

  describe('enum values', () => {
    it('should accept all valid paymentMethod values', () => {
      const methods = ['card', 'ach'] as const;

      for (const method of methods) {
        const result = ProcessPaymentValidation.safeParse({
          ...validCardPayment,
          paymentMethod: method,
        });

        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid billingType values', () => {
      const types = ['autopay', 'one-time'] as const;

      for (const type of types) {
        const result = ProcessPaymentValidation.safeParse({
          ...validCardPayment,
          billingType: type,
        });

        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid coupon type values', () => {
      const couponTypes = ['Percentage', 'Fixed Amount', 'Free Trial'] as const;

      for (const type of couponTypes) {
        const result = ProcessPaymentValidation.safeParse({
          ...validCardPayment,
          appliedCoupon: {
            id: 'test-coupon-enum',
            code: 'TEST',
            type,
            amount: '10',
            description: 'Test coupon',
          },
        });

        expect(result.success).toBe(true);
      }
    });
  });
});
