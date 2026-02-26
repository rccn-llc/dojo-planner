import { describe, expect, it } from 'vitest';
import {
  DeleteMemberValidation,
  EditMemberValidation,
  GetHOHPaymentMethodsValidation,
  LinkFamilyMemberValidation,
  ListFamilyMembersValidation,
  MemberPaymentMethodsValidation,
  MemberTransactionsValidation,
  MemberValidation,
  SearchHOHValidation,
  SendConfirmationEmailValidation,
  UpdateMemberContactInfoValidation,
  UpdateMemberTypeValidation,
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

  describe('SearchHOHValidation schema', () => {
    it('should validate with no query', () => {
      const result = SearchHOHValidation.safeParse({});

      expect(result.success).toBe(true);
    });

    it('should validate with optional query', () => {
      const result = SearchHOHValidation.safeParse({ query: 'John' });

      expect(result.success).toBe(true);
    });

    it('should validate with empty query string', () => {
      const result = SearchHOHValidation.safeParse({ query: '' });

      expect(result.success).toBe(true);
    });
  });

  describe('LinkFamilyMemberValidation schema', () => {
    it('should validate with correct data', () => {
      const result = LinkFamilyMemberValidation.safeParse({
        memberId: 'member-123',
        hohMemberId: 'hoh-456',
        relationship: 'family-member',
      });

      expect(result.success).toBe(true);
    });

    it('should fail when memberId is empty', () => {
      const result = LinkFamilyMemberValidation.safeParse({
        memberId: '',
        hohMemberId: 'hoh-456',
        relationship: 'family-member',
      });

      expect(result.success).toBe(false);
    });

    it('should fail when hohMemberId is empty', () => {
      const result = LinkFamilyMemberValidation.safeParse({
        memberId: 'member-123',
        hohMemberId: '',
        relationship: 'family-member',
      });

      expect(result.success).toBe(false);
    });

    it('should fail when relationship is empty', () => {
      const result = LinkFamilyMemberValidation.safeParse({
        memberId: 'member-123',
        hohMemberId: 'hoh-456',
        relationship: '',
      });

      expect(result.success).toBe(false);
    });

    it('should fail when fields are missing', () => {
      const result = LinkFamilyMemberValidation.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('ListFamilyMembersValidation schema', () => {
    it('should validate with valid memberId', () => {
      const result = ListFamilyMembersValidation.safeParse({ memberId: 'member-123' });

      expect(result.success).toBe(true);
    });

    it('should fail when memberId is empty', () => {
      const result = ListFamilyMembersValidation.safeParse({ memberId: '' });

      expect(result.success).toBe(false);
    });

    it('should fail when memberId is missing', () => {
      const result = ListFamilyMembersValidation.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('GetHOHPaymentMethodsValidation schema', () => {
    it('should validate with valid hohMemberId', () => {
      const result = GetHOHPaymentMethodsValidation.safeParse({ hohMemberId: 'hoh-123' });

      expect(result.success).toBe(true);
    });

    it('should fail when hohMemberId is empty', () => {
      const result = GetHOHPaymentMethodsValidation.safeParse({ hohMemberId: '' });

      expect(result.success).toBe(false);
    });

    it('should fail when hohMemberId is missing', () => {
      const result = GetHOHPaymentMethodsValidation.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('SendConfirmationEmailValidation schema', () => {
    const validEmailData = {
      memberId: 'member-123',
      memberEmail: 'john@example.com',
      memberName: 'John Doe',
    };

    it('should validate with minimal required fields', () => {
      const result = SendConfirmationEmailValidation.safeParse(validEmailData);

      expect(result.success).toBe(true);
    });

    it('should validate with all optional fields', () => {
      const result = SendConfirmationEmailValidation.safeParse({
        ...validEmailData,
        membershipPlanName: 'Monthly Plan',
        membershipPlanPrice: 99.99,
        membershipPlanFrequency: 'Monthly',
        memberType: 'head-of-household',
        hohName: 'Jane Doe',
      });

      expect(result.success).toBe(true);
    });

    it('should validate with waiver PDF data', () => {
      const result = SendConfirmationEmailValidation.safeParse({
        ...validEmailData,
        waiverPdfData: {
          organizationName: 'Test Dojo',
          waiverName: 'Standard Waiver',
          waiverVersion: 1,
          renderedContent: 'Waiver content here',
          memberFirstName: 'John',
          memberLastName: 'Doe',
          memberEmail: 'john@example.com',
          signatureDataUrl: 'data:image/png;base64,abc',
          signedByName: 'John Doe',
          signedAt: new Date('2024-06-15'),
        },
      });

      expect(result.success).toBe(true);
    });

    it('should fail when memberEmail is invalid', () => {
      const result = SendConfirmationEmailValidation.safeParse({
        ...validEmailData,
        memberEmail: 'not-an-email',
      });

      expect(result.success).toBe(false);
    });

    it('should fail when memberName is empty', () => {
      const result = SendConfirmationEmailValidation.safeParse({
        ...validEmailData,
        memberName: '',
      });

      expect(result.success).toBe(false);
    });

    it('should fail when memberId is empty', () => {
      const result = SendConfirmationEmailValidation.safeParse({
        ...validEmailData,
        memberId: '',
      });

      expect(result.success).toBe(false);
    });

    it('should validate memberType enum values', () => {
      for (const memberType of ['individual', 'family-member', 'head-of-household']) {
        const result = SendConfirmationEmailValidation.safeParse({
          ...validEmailData,
          memberType,
        });

        expect(result.success).toBe(true);
      }
    });

    it('should fail with invalid memberType', () => {
      const result = SendConfirmationEmailValidation.safeParse({
        ...validEmailData,
        memberType: 'unknown-type',
      });

      expect(result.success).toBe(false);
    });

    it('should coerce signedAt from string in waiver data', () => {
      const result = SendConfirmationEmailValidation.safeParse({
        ...validEmailData,
        waiverPdfData: {
          organizationName: 'Test Dojo',
          waiverName: 'Standard Waiver',
          waiverVersion: 1,
          renderedContent: 'Content',
          memberFirstName: 'John',
          memberLastName: 'Doe',
          memberEmail: 'john@example.com',
          signatureDataUrl: 'data:image/png;base64,abc',
          signedByName: 'John Doe',
          signedAt: '2024-06-15',
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('UpdateMemberTypeValidation schema', () => {
    it('should validate with individual member type', () => {
      const result = UpdateMemberTypeValidation.safeParse({
        id: 'member-123',
        memberType: 'individual',
      });

      expect(result.success).toBe(true);
    });

    it('should validate with head-of-household member type', () => {
      const result = UpdateMemberTypeValidation.safeParse({
        id: 'member-123',
        memberType: 'head-of-household',
      });

      expect(result.success).toBe(true);
    });

    it('should validate with family-member member type', () => {
      const result = UpdateMemberTypeValidation.safeParse({
        id: 'member-123',
        memberType: 'family-member',
      });

      expect(result.success).toBe(true);
    });

    it('should fail with invalid member type', () => {
      const result = UpdateMemberTypeValidation.safeParse({
        id: 'member-123',
        memberType: 'invalid-type',
      });

      expect(result.success).toBe(false);
    });

    it('should fail without id', () => {
      const result = UpdateMemberTypeValidation.safeParse({
        memberType: 'individual',
      });

      expect(result.success).toBe(false);
    });

    it('should fail without memberType', () => {
      const result = UpdateMemberTypeValidation.safeParse({
        id: 'member-123',
      });

      expect(result.success).toBe(false);
    });
  });
});
