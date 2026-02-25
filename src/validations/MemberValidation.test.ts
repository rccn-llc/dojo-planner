import { describe, expect, it } from 'vitest';
import {
  DeleteMemberValidation,
  EditMemberValidation,
  MemberPaymentMethodsValidation,
  MemberTransactionsValidation,
  MemberValidation,
  UpdateMemberContactInfoValidation,
} from './MemberValidation';

describe('MemberValidation', () => {
  describe('MemberValidation schema', () => {
    it('should validate a correct member form', () => {
      const validData = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '(555) 123-4567',
        dateOfBirth: new Date('1990-01-15'),
        memberType: 'individual' as const,
      };

      const result = MemberValidation.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should fail when email is invalid', () => {
      const invalidData = {
        email: 'invalid-email',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1990-01-15'),
      };

      const result = MemberValidation.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should fail when firstName is empty', () => {
      const invalidData = {
        email: 'john.doe@example.com',
        firstName: '',
        lastName: 'Doe',
        dateOfBirth: new Date('1990-01-15'),
      };

      const result = MemberValidation.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should fail when dateOfBirth is missing', () => {
      const invalidData = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = MemberValidation.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should coerce dateOfBirth from string', () => {
      const validData = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
      };

      const result = MemberValidation.safeParse(validData);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.dateOfBirth).toBeInstanceOf(Date);
      }
    });

    it('should validate with optional address', () => {
      const validData = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1990-01-15'),
        address: {
          street: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94102',
          country: 'US',
        },
      };

      const result = MemberValidation.safeParse(validData);

      expect(result.success).toBe(true);
    });
  });

  describe('EditMemberValidation schema', () => {
    it('should validate a correct edit form', () => {
      const validData = {
        id: 'member-123',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '(555) 123-4567',
      };

      const result = EditMemberValidation.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should fail when id is missing', () => {
      const invalidData = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = EditMemberValidation.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should allow null phone', () => {
      const validData = {
        id: 'member-123',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: null,
      };

      const result = EditMemberValidation.safeParse(validData);

      expect(result.success).toBe(true);
    });
  });

  describe('DeleteMemberValidation schema', () => {
    it('should validate with correct id', () => {
      const validData = {
        id: 'member-123',
      };

      const result = DeleteMemberValidation.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should fail when id is missing', () => {
      const invalidData = {};

      const result = DeleteMemberValidation.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('UpdateMemberContactInfoValidation schema', () => {
    it('should validate a correct contact info update', () => {
      const validData = {
        id: 'member-123',
        email: 'john.doe@example.com',
        phone: '(555) 123-4567',
      };

      const result = UpdateMemberContactInfoValidation.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with optional address', () => {
      const validData = {
        id: 'member-123',
        email: 'john.doe@example.com',
        phone: '(555) 123-4567',
        address: {
          street: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94102',
          country: 'US',
        },
      };

      const result = UpdateMemberContactInfoValidation.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should fail when email is invalid', () => {
      const invalidData = {
        id: 'member-123',
        email: 'invalid-email',
        phone: '(555) 123-4567',
      };

      const result = UpdateMemberContactInfoValidation.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should fail when id is missing', () => {
      const invalidData = {
        email: 'john.doe@example.com',
        phone: '(555) 123-4567',
      };

      const result = UpdateMemberContactInfoValidation.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should allow null phone', () => {
      const validData = {
        id: 'member-123',
        email: 'john.doe@example.com',
        phone: null,
      };

      const result = UpdateMemberContactInfoValidation.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate address with optional apartment', () => {
      const validData = {
        id: 'member-123',
        email: 'john.doe@example.com',
        address: {
          street: '123 Main St',
          apartment: '#201',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94102',
          country: 'US',
        },
      };

      const result = UpdateMemberContactInfoValidation.safeParse(validData);

      expect(result.success).toBe(true);
    });
  });

  describe('MemberPaymentMethodsValidation schema', () => {
    it('should validate with valid memberId', () => {
      const result = MemberPaymentMethodsValidation.safeParse({ memberId: 'member-123' });

      expect(result.success).toBe(true);
    });

    it('should fail when memberId is empty', () => {
      const result = MemberPaymentMethodsValidation.safeParse({ memberId: '' });

      expect(result.success).toBe(false);
    });

    it('should fail when memberId is missing', () => {
      const result = MemberPaymentMethodsValidation.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('MemberTransactionsValidation schema', () => {
    it('should validate with valid memberId', () => {
      const result = MemberTransactionsValidation.safeParse({ memberId: 'member-123' });

      expect(result.success).toBe(true);
    });

    it('should validate with optional limit', () => {
      const result = MemberTransactionsValidation.safeParse({ memberId: 'member-123', limit: 25 });

      expect(result.success).toBe(true);
    });

    it('should fail when limit is below 1', () => {
      const result = MemberTransactionsValidation.safeParse({ memberId: 'member-123', limit: 0 });

      expect(result.success).toBe(false);
    });

    it('should fail when limit exceeds 200', () => {
      const result = MemberTransactionsValidation.safeParse({ memberId: 'member-123', limit: 201 });

      expect(result.success).toBe(false);
    });

    it('should fail when memberId is empty', () => {
      const result = MemberTransactionsValidation.safeParse({ memberId: '' });

      expect(result.success).toBe(false);
    });
  });
});
