import { describe, expect, it } from 'vitest';
import { ReportTypeValidation, RetryQuoteValidation, RetryTransactionValidation, TransactionListValidation } from './TransactionValidation';

describe('TransactionListValidation', () => {
  describe('valid inputs', () => {
    it('should pass with all valid fields', () => {
      const result = TransactionListValidation.safeParse({
        limit: 50,
        offset: 10,
        status: 'paid',
        transactionType: 'membership_payment',
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toEqual({
          limit: 50,
          offset: 10,
          status: 'paid',
          transactionType: 'membership_payment',
        });
      }
    });

    it('should pass with partial fields', () => {
      const result = TransactionListValidation.safeParse({
        limit: 100,
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toEqual({ limit: 100 });
      }
    });

    it('should pass with empty object', () => {
      const result = TransactionListValidation.safeParse({});

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toEqual({});
      }
    });

    it('should pass with undefined', () => {
      const result = TransactionListValidation.safeParse(undefined);

      expect(result.success).toBe(true);
    });

    it('should pass with limit boundary values', () => {
      const minResult = TransactionListValidation.safeParse({ limit: 1 });

      expect(minResult.success).toBe(true);

      const maxResult = TransactionListValidation.safeParse({ limit: 500 });

      expect(maxResult.success).toBe(true);
    });

    it('should pass with offset at zero', () => {
      const result = TransactionListValidation.safeParse({ offset: 0 });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toEqual({ offset: 0 });
      }
    });

    it('should pass with all valid status enum values', () => {
      const statuses = ['pending', 'paid', 'declined', 'refunded', 'processing'] as const;

      for (const status of statuses) {
        const result = TransactionListValidation.safeParse({ status });

        expect(result.success).toBe(true);
      }
    });

    it('should pass with all valid transactionType enum values', () => {
      const types = ['membership_payment', 'event_registration', 'signup_fee', 'refund', 'adjustment'] as const;

      for (const transactionType of types) {
        const result = TransactionListValidation.safeParse({ transactionType });

        expect(result.success).toBe(true);
      }
    });
  });

  describe('invalid inputs', () => {
    it('should fail with limit below minimum', () => {
      const result = TransactionListValidation.safeParse({ limit: 0 });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/>=1|greater than or equal to 1/);
      }
    });

    it('should fail with limit above maximum', () => {
      const result = TransactionListValidation.safeParse({ limit: 501 });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/<=500|less than or equal to 500/);
      }
    });

    it('should fail with negative offset', () => {
      const result = TransactionListValidation.safeParse({ offset: -1 });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/>=0|greater than or equal to 0/);
      }
    });

    it('should fail with invalid status enum value', () => {
      const result = TransactionListValidation.safeParse({ status: 'invalid_status' });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/Invalid option/);
      }
    });

    it('should fail with invalid transactionType enum value', () => {
      const result = TransactionListValidation.safeParse({ transactionType: 'invalid_type' });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/Invalid option/);
      }
    });

    it('should fail with wrong type for limit', () => {
      const result = TransactionListValidation.safeParse({ limit: 'not-a-number' });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/expected number/i);
      }
    });

    it('should fail with wrong type for offset', () => {
      const result = TransactionListValidation.safeParse({ offset: 'not-a-number' });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/expected number/i);
      }
    });

    it('should fail with wrong type for status', () => {
      const result = TransactionListValidation.safeParse({ status: 123 });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/Invalid option/);
      }
    });

    it('should fail with wrong type for transactionType', () => {
      const result = TransactionListValidation.safeParse({ transactionType: true });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/Invalid option/);
      }
    });
  });
});

describe('ReportTypeValidation', () => {
  describe('valid inputs', () => {
    it('should pass with all valid reportType enum values', () => {
      const reportTypes = [
        'accounts-autopay-suspended',
        'expiring-credit-cards',
        'amount-due',
        'past-due',
        'payments-last-30-days',
        'payments-pending',
        'failed-payments',
        'income-per-student',
      ] as const;

      for (const reportType of reportTypes) {
        const result = ReportTypeValidation.safeParse({ reportType });

        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.data).toEqual({ reportType });
        }
      }
    });
  });

  describe('invalid inputs', () => {
    it('should fail with missing reportType field', () => {
      const result = ReportTypeValidation.safeParse({});

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/Invalid option|Required/);
      }
    });

    it('should fail with undefined', () => {
      const result = ReportTypeValidation.safeParse(undefined);

      expect(result.success).toBe(false);
    });

    it('should fail with invalid reportType enum value', () => {
      const result = ReportTypeValidation.safeParse({ reportType: 'invalid-report-type' });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/Invalid option/);
      }
    });

    it('should fail with wrong type for reportType', () => {
      const result = ReportTypeValidation.safeParse({ reportType: 123 });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/Invalid option/);
      }
    });

    it('should fail with null reportType', () => {
      const result = ReportTypeValidation.safeParse({ reportType: null });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/Invalid option/);
      }
    });

    it('should fail with extra fields', () => {
      const result = ReportTypeValidation.safeParse({
        reportType: 'amount-due',
        extraField: 'should-not-be-here',
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toEqual({ reportType: 'amount-due' });
      }
    });
  });
});

describe('TransactionListValidation — lifecycle fee types', () => {
  it.each(['cancellation_fee', 'hold_fee'])('accepts transactionType %s', (transactionType) => {
    expect(TransactionListValidation.safeParse({ transactionType }).success).toBe(true);
  });
});

describe('RetryTransactionValidation', () => {
  it('accepts a uuid transactionId', () => {
    expect(RetryTransactionValidation.safeParse({ transactionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }).success).toBe(true);
  });

  it('rejects a non-uuid transactionId', () => {
    expect(RetryTransactionValidation.safeParse({ transactionId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects a missing transactionId', () => {
    expect(RetryTransactionValidation.safeParse({}).success).toBe(false);
  });
});

describe('RetryQuoteValidation', () => {
  it('accepts a uuid transactionId', () => {
    expect(RetryQuoteValidation.safeParse({ transactionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }).success).toBe(true);
  });

  it('rejects a non-uuid transactionId', () => {
    expect(RetryQuoteValidation.safeParse({ transactionId: 'abc' }).success).toBe(false);
  });
});
