import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatTransactionType,
  getInitials,
  getPaymentTypeIcon,
  getPaymentTypeLabel,
  getStatusColor,
  getStatusLabel,
  resolveTabFromUrl,
} from './utils';

describe('Member Detail Page Utilities', () => {
  describe('getInitials', () => {
    it('returns initials for a two-word name', () => {
      expect(getInitials('John Doe')).toBe('JD');
    });

    it('returns initials for a single-word name', () => {
      expect(getInitials('John')).toBe('J');
    });

    it('returns initials for a three-word name', () => {
      expect(getInitials('John Michael Doe')).toBe('JMD');
    });

    it('handles lowercase names', () => {
      expect(getInitials('john doe')).toBe('JD');
    });

    it('handles names with extra spaces', () => {
      expect(getInitials('John  Doe')).toBe('JD');
    });
  });

  describe('formatCurrency', () => {
    it('formats a whole number as USD', () => {
      expect(formatCurrency(100)).toBe('$100.00');
    });

    it('formats a decimal number as USD', () => {
      expect(formatCurrency(99.99)).toBe('$99.99');
    });

    it('formats zero as USD', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('formats large numbers with commas', () => {
      expect(formatCurrency(1000)).toBe('$1,000.00');
    });

    it('formats negative numbers', () => {
      expect(formatCurrency(-50)).toBe('-$50.00');
    });
  });

  describe('getPaymentTypeIcon', () => {
    it('returns card icon for card type', () => {
      expect(getPaymentTypeIcon('card')).toBe('💳');
    });

    it('returns bank icon for bank_transfer type', () => {
      expect(getPaymentTypeIcon('bank_transfer')).toBe('🏦');
    });

    it('returns cash icon for cash type', () => {
      expect(getPaymentTypeIcon('cash')).toBe('💵');
    });

    it('returns check icon for check type', () => {
      expect(getPaymentTypeIcon('check')).toBe('📝');
    });

    it('handles uppercase type names', () => {
      expect(getPaymentTypeIcon('CARD')).toBe('💳');
    });

    it('returns default icon for unknown type', () => {
      expect(getPaymentTypeIcon('unknown')).toBe('💳');
    });
  });

  describe('getPaymentTypeLabel', () => {
    it('returns "Card" for card type', () => {
      expect(getPaymentTypeLabel('card')).toBe('Card');
    });

    it('returns "Bank Transfer" for bank_transfer type', () => {
      expect(getPaymentTypeLabel('bank_transfer')).toBe('Bank Transfer');
    });

    it('returns "Cash" for cash type', () => {
      expect(getPaymentTypeLabel('cash')).toBe('Cash');
    });

    it('returns "Check" for check type', () => {
      expect(getPaymentTypeLabel('check')).toBe('Check');
    });

    it('returns raw type for unknown type', () => {
      expect(getPaymentTypeLabel('crypto')).toBe('crypto');
    });
  });

  describe('formatTransactionType', () => {
    it('returns "Membership Payment" for membership_payment', () => {
      expect(formatTransactionType('membership_payment')).toBe('Membership Payment');
    });

    it('returns "Event Registration" for event_registration', () => {
      expect(formatTransactionType('event_registration')).toBe('Event Registration');
    });

    it('returns "Signup Fee" for signup_fee', () => {
      expect(formatTransactionType('signup_fee')).toBe('Signup Fee');
    });

    it('returns "Refund" for refund', () => {
      expect(formatTransactionType('refund')).toBe('Refund');
    });

    it('returns "Adjustment" for adjustment', () => {
      expect(formatTransactionType('adjustment')).toBe('Adjustment');
    });

    it('returns raw type for unknown type', () => {
      expect(formatTransactionType('custom_type')).toBe('custom_type');
    });
  });

  describe('getStatusColor', () => {
    it('returns default for active status', () => {
      expect(getStatusColor('active')).toBe('default');
    });

    it('returns secondary for on-hold status', () => {
      expect(getStatusColor('on-hold')).toBe('secondary');
    });

    it('returns destructive for cancelled status', () => {
      expect(getStatusColor('cancelled')).toBe('destructive');
    });
  });

  describe('getStatusLabel', () => {
    it('returns "Active" for active status', () => {
      expect(getStatusLabel('active')).toBe('Active');
    });

    it('returns "On Hold" for on-hold status', () => {
      expect(getStatusLabel('on-hold')).toBe('On Hold');
    });

    it('returns "Cancelled" for cancelled status', () => {
      expect(getStatusLabel('cancelled')).toBe('Cancelled');
    });
  });

  describe('resolveTabFromUrl', () => {
    it('returns overview for null tab parameter', () => {
      expect(resolveTabFromUrl(null)).toBe('overview');
    });

    it('returns overview for overview tab parameter', () => {
      expect(resolveTabFromUrl('overview')).toBe('overview');
    });

    it('returns notes for notes tab parameter', () => {
      expect(resolveTabFromUrl('notes')).toBe('notes');
    });

    it('returns overview for financial tab parameter (backwards compatibility)', () => {
      expect(resolveTabFromUrl('financial')).toBe('overview');
    });

    it('returns overview for invalid tab parameter', () => {
      expect(resolveTabFromUrl('invalid')).toBe('overview');
    });

    it('returns overview for empty string tab parameter', () => {
      expect(resolveTabFromUrl('')).toBe('overview');
    });
  });
});
