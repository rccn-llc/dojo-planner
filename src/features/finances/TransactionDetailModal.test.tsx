import type { Transaction, TransactionStatus } from './FinancesTable';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { TransactionDetailModal } from './TransactionDetailModal';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock ORPC client
const mockGetTransaction = vi.fn();
vi.mock('@/libs/Orpc', () => ({
  client: {
    transactions: {
      get: (...args: unknown[]) => mockGetTransaction(...args),
    },
  },
}));

// Helper to create mock transactions
const createMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'txn-uuid-1',
  date: 'April 15, 2025',
  amount: '$160.00',
  purpose: 'Membership Dues',
  method: 'Saved Card Ending ****1234',
  transactionId: 'TXN71MC01ANQ130',
  memberName: 'John Smith',
  memberId: 'M001',
  status: 'paid' as TransactionStatus,
  transactionType: 'membership_payment',
  ...overrides,
});

const mockMembershipDetails = {
  id: 'txn-uuid-1',
  memberId: 'M001',
  memberFirstName: 'John',
  memberLastName: 'Smith',
  memberType: 'individual',
  transactionType: 'membership_payment',
  amount: 16000,
  currency: 'USD',
  status: 'paid',
  paymentMethod: 'card',
  description: 'Monthly membership payment',
  iqproTransactionId: 'iqpro_123',
  processedAt: new Date('2025-04-15'),
  createdAt: new Date('2025-04-15'),
  membershipPlanName: 'Adult BJJ Monthly',
  membershipPlanFrequency: 'Monthly',
  membershipPlanPrice: 16000,
  membershipBillingType: 'autopay',
  membershipStartDate: new Date('2025-01-01'),
  membershipNextPaymentDate: new Date('2025-05-15'),
  eventName: null,
  eventType: null,
};

const mockEventDetails = {
  id: 'txn-uuid-2',
  memberId: 'M002',
  memberFirstName: 'Jane',
  memberLastName: 'Doe',
  memberType: 'individual',
  transactionType: 'event_registration',
  amount: 5000,
  currency: 'USD',
  status: 'paid',
  paymentMethod: 'card',
  description: 'BJJ Seminar',
  iqproTransactionId: null,
  processedAt: new Date('2025-04-20'),
  createdAt: new Date('2025-04-20'),
  membershipPlanName: null,
  membershipPlanFrequency: null,
  membershipPlanPrice: null,
  membershipBillingType: null,
  membershipStartDate: null,
  membershipNextPaymentDate: null,
  eventName: 'BJJ Fundamentals Seminar',
  eventType: 'seminar',
};

describe('TransactionDetailModal', () => {
  describe('Rendering', () => {
    it('should render dialog when isOpen is true', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction();

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render dialog when isOpen is false', () => {
      const mockTransaction = createMockTransaction();

      render(
        <TransactionDetailModal
          isOpen={false}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      expect(page.getByRole('dialog').elements()).toHaveLength(0);
    });

    it('should not render anything when transaction is null', () => {
      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={null}
        />,
      );

      expect(page.getByRole('dialog').elements()).toHaveLength(0);
    });
  });

  describe('Transaction Summary', () => {
    it('should display member name', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction();

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('John Smith').first()).toBeInTheDocument();
    });

    it('should display transaction ID', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ transactionId: 'TXN123456' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('TXN123456')).toBeInTheDocument();
    });

    it('should display amount', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ amount: '$250.00' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('$250.00')).toBeInTheDocument();
    });

    it('should display date', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ date: 'May 20, 2025' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('May 20, 2025')).toBeInTheDocument();
    });

    it('should display method', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ method: 'ACH Transfer' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('ACH Transfer')).toBeInTheDocument();
    });

    it('should display purpose', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ purpose: 'Merchandise' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('Merchandise')).toBeInTheDocument();
    });
  });

  describe('Status Badge', () => {
    it('should display paid status badge', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ status: 'paid' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('status_paid')).toBeInTheDocument();
    });

    it('should display pending status badge', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ status: 'pending' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('status_pending')).toBeInTheDocument();
    });

    it('should display declined status badge', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ status: 'declined' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('status_declined')).toBeInTheDocument();
    });

    it('should display refunded status badge', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ status: 'refunded' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('status_refunded')).toBeInTheDocument();
    });

    it('should display processing status badge', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ status: 'processing' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('status_processing')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner while fetching details', async () => {
      let resolvePromise: (value: unknown) => void;
      mockGetTransaction.mockReturnValue(new Promise((resolve) => {
        resolvePromise = resolve;
      }));

      const mockTransaction = createMockTransaction();

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('loading_details')).toBeInTheDocument();

      // Resolve to clean up
      resolvePromise!({ transaction: mockMembershipDetails });
    });

    it('should hide loading after fetch completes', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction();

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      // Wait for membership details to appear (loading is done)
      await expect.element(page.getByText('Adult BJJ Monthly')).toBeInTheDocument();
      expect(page.getByText('loading_details').elements()).toHaveLength(0);
    });
  });

  describe('Membership Details', () => {
    it('should display membership details for membership payment transactions', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ transactionType: 'membership_payment' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('membership_details_title')).toBeInTheDocument();
      await expect.element(page.getByText('Adult BJJ Monthly')).toBeInTheDocument();
      await expect.element(page.getByText('Monthly', { exact: true })).toBeInTheDocument();
    });

    it('should display plan name and frequency labels', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ transactionType: 'membership_payment' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('plan_name_label')).toBeInTheDocument();
      await expect.element(page.getByText('frequency_label')).toBeInTheDocument();
      await expect.element(page.getByText('start_date_label')).toBeInTheDocument();
      await expect.element(page.getByText('next_payment_label')).toBeInTheDocument();
    });

    it('should display membership details for signup fee transactions', async () => {
      const signupFeeDetails = { ...mockMembershipDetails, transactionType: 'signup_fee' };
      mockGetTransaction.mockResolvedValue({ transaction: signupFeeDetails });
      const mockTransaction = createMockTransaction({ transactionType: 'signup_fee' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('membership_details_title')).toBeInTheDocument();
      await expect.element(page.getByText('Adult BJJ Monthly')).toBeInTheDocument();
    });

    it('should hide next payment for one-time/punchcard memberships', async () => {
      const oneTimeDetails = {
        ...mockMembershipDetails,
        membershipBillingType: 'one-time',
        membershipPlanFrequency: 'None',
        membershipNextPaymentDate: null,
      };
      mockGetTransaction.mockResolvedValue({ transaction: oneTimeDetails });
      const mockTransaction = createMockTransaction({ transactionType: 'membership_payment' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('membership_details_title')).toBeInTheDocument();
      expect(page.getByText('next_payment_label').elements()).toHaveLength(0);
    });
  });

  describe('Event Details', () => {
    it('should display event details for event registration transactions', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockEventDetails });
      const mockTransaction = createMockTransaction({
        id: 'txn-uuid-2',
        transactionType: 'event_registration',
        purpose: 'Event Registration',
        memberName: 'Jane Doe',
      });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('event_details_title')).toBeInTheDocument();
      await expect.element(page.getByText('BJJ Fundamentals Seminar')).toBeInTheDocument();
      await expect.element(page.getByText('event_name_label')).toBeInTheDocument();
      await expect.element(page.getByText('event_type_label')).toBeInTheDocument();
    });

    it('should not display membership details for event transactions', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockEventDetails });
      const mockTransaction = createMockTransaction({
        id: 'txn-uuid-2',
        transactionType: 'event_registration',
      });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('event_details_title')).toBeInTheDocument();
      expect(page.getByText('membership_details_title').elements()).toHaveLength(0);
    });
  });

  describe('Transaction Type Labels', () => {
    it('should display membership type label', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ transactionType: 'membership_payment' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('type_membership')).toBeInTheDocument();
    });

    it('should display event registration type label', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockEventDetails });
      const mockTransaction = createMockTransaction({
        id: 'txn-uuid-2',
        transactionType: 'event_registration',
      });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('type_event_registration')).toBeInTheDocument();
    });

    it('should display refund type label', async () => {
      const refundDetails = { ...mockMembershipDetails, transactionType: 'refund' };
      mockGetTransaction.mockResolvedValue({ transaction: refundDetails });
      const mockTransaction = createMockTransaction({ transactionType: 'refund' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('type_refund')).toBeInTheDocument();
    });
  });

  describe('No Extra Details', () => {
    it('should not display membership or event details for refund transactions', async () => {
      const refundDetails = {
        ...mockMembershipDetails,
        transactionType: 'refund',
        membershipPlanName: null,
        membershipPlanFrequency: null,
        membershipPlanPrice: null,
        membershipBillingType: null,
        membershipStartDate: null,
        membershipNextPaymentDate: null,
        eventName: null,
        eventType: null,
      };
      mockGetTransaction.mockResolvedValue({ transaction: refundDetails });
      const mockTransaction = createMockTransaction({ transactionType: 'refund' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      // Wait for loading to complete
      await expect.element(page.getByText('type_refund')).toBeInTheDocument();
      expect(page.getByText('membership_details_title').elements()).toHaveLength(0);
      expect(page.getByText('event_details_title').elements()).toHaveLength(0);
    });

    it('should not display extra details for adjustment transactions', async () => {
      const adjustmentDetails = {
        ...mockMembershipDetails,
        transactionType: 'adjustment',
        membershipPlanName: null,
        membershipPlanFrequency: null,
        membershipPlanPrice: null,
        membershipBillingType: null,
        membershipStartDate: null,
        membershipNextPaymentDate: null,
        eventName: null,
        eventType: null,
      };
      mockGetTransaction.mockResolvedValue({ transaction: adjustmentDetails });
      const mockTransaction = createMockTransaction({ transactionType: 'adjustment' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('type_adjustment')).toBeInTheDocument();
      expect(page.getByText('membership_details_title').elements()).toHaveLength(0);
      expect(page.getByText('event_details_title').elements()).toHaveLength(0);
    });
  });

  describe('ORPC Fetch', () => {
    it('should call ORPC get with transaction id', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction({ id: 'txn-uuid-fetch' });

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('membership_details_title')).toBeInTheDocument();
      expect(mockGetTransaction).toHaveBeenCalledWith({ id: 'txn-uuid-fetch' });
    });

    it('should handle fetch error gracefully', async () => {
      mockGetTransaction.mockRejectedValue(new Error('Network error'));
      const mockTransaction = createMockTransaction();

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      // Should still show summary (from transaction prop), no details sections
      await expect.element(page.getByText('John Smith').first()).toBeInTheDocument();

      // Wait for loading to finish
      await vi.waitFor(() => {
        expect(page.getByText('loading_details').elements()).toHaveLength(0);
      });

      expect(page.getByText('membership_details_title').elements()).toHaveLength(0);
    });
  });

  describe('Close Button', () => {
    it('should display close button', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction();

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByRole('button', { name: 'close_button' })).toBeInTheDocument();
    });

    it('should call onCloseAction when close button is clicked', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction();
      const mockOnClose = vi.fn();

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={mockOnClose}
          transaction={mockTransaction}
        />,
      );

      const closeButton = page.getByRole('button', { name: 'close_button' });
      await closeButton.click();

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dialog Labels', () => {
    it('should display date label', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction();

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('date_label')).toBeInTheDocument();
    });

    it('should display method label', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction();

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('method_label')).toBeInTheDocument();
    });

    it('should display purpose label', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction();

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('purpose_label')).toBeInTheDocument();
    });

    it('should display type label', async () => {
      mockGetTransaction.mockResolvedValue({ transaction: mockMembershipDetails });
      const mockTransaction = createMockTransaction();

      render(
        <TransactionDetailModal
          isOpen={true}
          onCloseAction={() => {}}
          transaction={mockTransaction}
        />,
      );

      await expect.element(page.getByText('type_label')).toBeInTheDocument();
    });
  });
});
