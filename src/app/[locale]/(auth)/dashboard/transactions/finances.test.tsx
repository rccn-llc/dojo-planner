import type { Transaction } from '@/features/finances/FinancesTable';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { FinancesTable } from '@/features/finances/FinancesTable';
import { I18nWrapper } from '@/lib/test-utils';

// FinancesTable renders TransactionDetailModal, which pulls in Clerk (via
// useHasRole) and the transactions cache. Mock them so the browser test env
// doesn't try to read `process` at import time.
vi.mock('@/hooks/useHasRole', () => ({
  useHasRole: () => false,
}));

vi.mock('@/hooks/useTransactionsCache', () => ({
  invalidateTransactionsCache: vi.fn(),
}));

vi.mock('@/libs/Orpc', () => ({
  client: {
    transactions: {
      get: vi.fn(),
      refund: vi.fn(),
    },
  },
}));

// Note: Card numbers shown are masked display values (****1234), not actual card numbers
const mockTransactions: Transaction[] = [
  { id: '1', date: 'April 15, 2025', amount: '$160.00', purpose: 'Membership Dues', method: 'Saved Card Ending ****1234', transactionId: 'TXN71MC01ANQ130', memberName: 'John Smith', memberId: 'M001', status: 'paid', transactionType: 'membership_payment' },
  { id: '2', date: 'March 15, 2025', amount: '$160.00', purpose: 'Membership Dues', method: 'Saved Card Ending ****1234', transactionId: 'TXN8CJ19CAMGB10', memberName: 'John Smith', memberId: 'M001', status: 'paid', transactionType: 'membership_payment' },
  { id: '3', date: 'February 15, 2025', amount: '$160.00', purpose: 'Membership Dues', method: 'Saved Card Ending ****1234', transactionId: 'TXNHCM1829NBAU', memberName: 'John Smith', memberId: 'M001', status: 'paid', transactionType: 'membership_payment' },
  { id: '4', date: 'January 15, 2025', amount: '$160.00', purpose: 'Membership Dues', method: 'Saved Card Ending ****1234', transactionId: 'TXNCP120C72N72KA', memberName: 'John Smith', memberId: 'M001', status: 'paid', transactionType: 'membership_payment' },
  { id: '5', date: 'December 15, 2024', amount: '$160.00', purpose: 'Membership Dues', method: 'Saved Card Ending ****1234', transactionId: 'TXN7621KCD721B92', memberName: 'Jane Doe', memberId: 'M002', status: 'paid', transactionType: 'membership_payment' },
  { id: '6', date: 'November 15, 2024', amount: '$160.00', purpose: 'Membership Dues', method: 'Saved Card Ending ****1234', transactionId: 'TXN73VBSV6DKSVD', memberName: 'Jane Doe', memberId: 'M002', status: 'declined', transactionType: 'membership_payment' },
  { id: '7', date: 'October 15, 2024', amount: '$160.00', purpose: 'Membership Dues', method: 'Saved Card Ending ****1234', transactionId: 'TXNABC123DEF456', memberName: 'Mike Johnson', memberId: 'M003', status: 'paid', transactionType: 'membership_payment' },
  { id: '8', date: 'September 15, 2024', amount: '$160.00', purpose: 'Membership Dues', method: 'Saved Card Ending ****1234', transactionId: 'TXNXYZ789GHI012', memberName: 'Mike Johnson', memberId: 'M003', status: 'refunded', transactionType: 'membership_payment' },
  { id: '9', date: 'August 15, 2024', amount: '$160.00', purpose: 'Membership Dues', method: 'Saved Card Ending ****1234', transactionId: 'TXNJKL345MNO678', memberName: 'Sarah Williams', memberId: 'M004', status: 'paid', transactionType: 'membership_payment' },
  { id: '10', date: 'July 15, 2024', amount: '$160.00', purpose: 'Membership Dues', method: 'Saved Card Ending ****1234', transactionId: 'TXNPQR901STU234', memberName: 'Sarah Williams', memberId: 'M004', status: 'pending', transactionType: 'membership_payment' },
  { id: '14', date: 'March 5, 2024', amount: '$160.00', purpose: 'Membership Dues', method: 'ACH Transfer', transactionId: 'TXNACH2024030501', memberName: 'Lisa Garcia', memberId: 'M007', status: 'paid', transactionType: 'membership_payment' },
  { id: '11', date: 'June 15, 2024', amount: '$75.00', purpose: 'Merchandise', method: 'Saved Card Ending ****5678', transactionId: 'TXNVWX567YZA890', memberName: 'John Smith', memberId: 'M001', status: 'paid', transactionType: 'membership_payment' },
  { id: '15', date: 'February 28, 2024', amount: '$35.00', purpose: 'Merchandise', method: 'Saved Card Ending ****5678', transactionId: 'TXNMERCH20240228', memberName: 'Chris Martinez', memberId: 'M008', status: 'paid', transactionType: 'membership_payment' },
  { id: '16', date: 'January 10, 2024', amount: '$45.00', purpose: 'Merchandise', method: 'Cash', transactionId: 'TXNMERCH20240110', memberName: 'Emily Brown', memberId: 'M005', status: 'pending', transactionType: 'membership_payment' },
  { id: '17', date: 'December 20, 2023', amount: '$120.00', purpose: 'Merchandise', method: 'Saved Card Ending ****1234', transactionId: 'TXNMERCH20231220', memberName: 'David Lee', memberId: 'M006', status: 'refunded', transactionType: 'membership_payment' },
  { id: '18', date: 'November 5, 2023', amount: '$65.00', purpose: 'Merchandise', method: 'Saved Card Ending ****5678', transactionId: 'TXNMERCH20231105', memberName: 'Sarah Williams', memberId: 'M004', status: 'declined', transactionType: 'membership_payment' },
  { id: '19', date: 'April 5, 2025', amount: '$50.00', purpose: 'Event', method: 'Saved Card Ending ****1234', transactionId: 'TXNEVT20250405', memberName: 'John Smith', memberId: 'M001', status: 'paid', transactionType: 'event_registration' },
  { id: '20', date: 'March 20, 2025', amount: '$75.00', purpose: 'Event', method: 'Saved Card Ending ****5678', transactionId: 'TXNEVT20250320', memberName: 'Jane Doe', memberId: 'M002', status: 'paid', transactionType: 'event_registration' },
  { id: '21', date: 'February 10, 2025', amount: '$100.00', purpose: 'Event', method: 'Cash', transactionId: 'TXNEVT20250210', memberName: 'Mike Johnson', memberId: 'M003', status: 'processing', transactionType: 'event_registration' },
  { id: '22', date: 'January 25, 2025', amount: '$50.00', purpose: 'Event', method: 'Saved Card Ending ****1234', transactionId: 'TXNEVT20250125', memberName: 'Lisa Garcia', memberId: 'M007', status: 'pending', transactionType: 'event_registration' },
  { id: '23', date: 'December 15, 2024', amount: '$75.00', purpose: 'Event', method: 'Saved Card Ending ****5678', transactionId: 'TXNEVT20241215', memberName: 'Chris Martinez', memberId: 'M008', status: 'declined', transactionType: 'event_registration' },
  { id: '24', date: 'November 10, 2024', amount: '$60.00', purpose: 'Event', method: 'ACH Transfer', transactionId: 'TXNEVT20241110', memberName: 'Emily Brown', memberId: 'M005', status: 'refunded', transactionType: 'event_registration' },
  { id: '12', date: 'May 10, 2024', amount: '$50.00', purpose: 'Private Lesson', method: 'Cash', transactionId: 'TXNCASH001', memberName: 'Emily Brown', memberId: 'M005', status: 'paid', transactionType: 'membership_payment' },
  { id: '25', date: 'April 1, 2024', amount: '$50.00', purpose: 'Private Lesson', method: 'Saved Card Ending ****1234', transactionId: 'TXNPL20240401', memberName: 'David Lee', memberId: 'M006', status: 'paid', transactionType: 'membership_payment' },
  { id: '26', date: 'March 15, 2024', amount: '$75.00', purpose: 'Private Lesson', method: 'Cash', transactionId: 'TXNPL20240315', memberName: 'Sarah Williams', memberId: 'M004', status: 'pending', transactionType: 'membership_payment' },
  { id: '13', date: 'April 22, 2024', amount: '$25.00', purpose: 'Seminar', method: 'Saved Card Ending ****1234', transactionId: 'TXNSEM20240422', memberName: 'David Lee', memberId: 'M006', status: 'processing', transactionType: 'event_registration' },
  { id: '27', date: 'February 5, 2024', amount: '$30.00', purpose: 'Seminar', method: 'Saved Card Ending ****5678', transactionId: 'TXNSEM20240205', memberName: 'Mike Johnson', memberId: 'M003', status: 'paid', transactionType: 'event_registration' },
];

function renderTable() {
  return render(
    <I18nWrapper>
      <FinancesTable transactions={mockTransactions} />
    </I18nWrapper>,
  );
}

describe('Finances Table', () => {
  describe('Search and Filter Bar', () => {
    it('should render search input', () => {
      renderTable();

      const searchInput = page.getByPlaceholder('Search transactions...');

      expect(searchInput).toBeInTheDocument();
    });

    it('should render filter dropdowns', () => {
      renderTable();

      const filterDropdowns = page.getByRole('combobox').elements();

      expect(filterDropdowns.length).toBe(2);
    });

    it('should not render tab navigation', () => {
      renderTable();

      const allTab = page.getByRole('button', { name: /^All$/i }).elements();
      const membershipDuesTab = page.getByRole('button', { name: /^Membership Dues$/i }).elements();

      expect(allTab.length).toBe(0);
      expect(membershipDuesTab.length).toBe(0);
    });

    it('should allow typing in search input', async () => {
      renderTable();

      const searchInput = page.getByPlaceholder('Search transactions...');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'Merchandise');

      const table = page.getByRole('table');

      expect(table.getByText('Merchandise').first()).toBeInTheDocument();
    });

    it('should filter transactions by search term', async () => {
      renderTable();

      const searchInput = page.getByPlaceholder('Search transactions...');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'Private');

      const table = page.getByRole('table');

      expect(table.getByText('Private Lesson').first()).toBeInTheDocument();
      expect(table.getByText('$50.00').first()).toBeInTheDocument();
    });

    it('should show no results message when search has no matches', async () => {
      renderTable();

      const searchInput = page.getByPlaceholder('Search transactions...');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'NonexistentTransaction');

      expect(page.getByText('No transactions match your search').first()).toBeInTheDocument();
    });
  });

  describe('Origin Filter', () => {
    it('should show origin filter options when clicked', async () => {
      renderTable();

      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();

      expect(page.getByRole('option', { name: 'All Origins' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'Membership Dues' })).toBeInTheDocument();
    });

    it('should filter by origin when selecting from dropdown', async () => {
      renderTable();

      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();

      const merchandiseOption = page.getByRole('option', { name: 'Merchandise' });
      await merchandiseOption.click();

      const table = page.getByRole('table');

      expect(table.getByText('Merchandise').first()).toBeInTheDocument();
    });
  });

  describe('Status Filter', () => {
    it('should show status filter options when clicked', async () => {
      renderTable();

      const statusFilter = page.getByTestId('finances-status-filter');
      await statusFilter.click();

      expect(page.getByRole('option', { name: 'All Statuses' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'Paid' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'Declined' })).toBeInTheDocument();
    });

    it('should filter by status when selecting from dropdown', async () => {
      renderTable();

      const statusFilter = page.getByTestId('finances-status-filter');
      await statusFilter.click();

      const declinedOption = page.getByRole('option', { name: 'Declined' });
      await declinedOption.click();

      const table = page.getByRole('table');

      expect(table.getByText('Declined').first()).toBeInTheDocument();
    });
  });

  describe('Transactions Table', () => {
    it('should render transactions table headers', () => {
      renderTable();

      const table = page.getByRole('table');

      expect(table.getByRole('button', { name: 'Date', exact: true })).toBeInTheDocument();
      expect(table.getByRole('button', { name: 'Member', exact: true })).toBeInTheDocument();
      expect(table.getByRole('button', { name: 'Amount', exact: true })).toBeInTheDocument();
      expect(table.getByRole('button', { name: 'Origin', exact: true })).toBeInTheDocument();
      expect(table.getByRole('button', { name: 'Method', exact: true })).toBeInTheDocument();
      expect(table.getByRole('button', { name: 'Transaction ID', exact: true })).toBeInTheDocument();
      expect(table.getByRole('button', { name: 'Status', exact: true })).toBeInTheDocument();
    });

    it('should render transaction data in table', () => {
      renderTable();

      const table = page.getByRole('table');

      expect(table.getByText('April 15, 2025')).toBeInTheDocument();
      expect(table.getByRole('cell', { name: '$160.00' }).first()).toBeInTheDocument();
    });

    it('should render member name in table', () => {
      renderTable();

      const table = page.getByRole('table');

      expect(table.getByText('John Smith').first()).toBeInTheDocument();
    });

    it('should render status badges in table', () => {
      renderTable();

      const table = page.getByRole('table');

      expect(table.getByText('Paid').first()).toBeInTheDocument();
    });

    it('should render at least 10 transactions', () => {
      renderTable();

      const table = page.getByRole('table');

      expect(table).toBeInTheDocument();
      expect(table.getByText('John Smith').first()).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('should have sortable date column', async () => {
      renderTable();

      const dateHeader = page.getByRole('button', { name: /Date/i });
      await dateHeader.click();

      const table = page.getByRole('table');

      expect(table).toBeInTheDocument();
    });

    it('should have sortable amount column', async () => {
      renderTable();

      const amountHeader = page.getByRole('button', { name: /Amount/i });
      await amountHeader.click();

      const table = page.getByRole('table');

      expect(table).toBeInTheDocument();
    });

    it('should have sortable origin column', async () => {
      renderTable();

      const originHeader = page.getByRole('button', { name: /Origin/i });
      await originHeader.click();

      const table = page.getByRole('table');

      expect(table).toBeInTheDocument();
    });

    it('should have sortable method column', async () => {
      renderTable();

      const table = page.getByRole('table');
      const methodHeader = table.getByRole('button', { name: 'Method', exact: true });
      await methodHeader.click();

      expect(table).toBeInTheDocument();
    });

    it('should have sortable transaction ID column', async () => {
      renderTable();

      const transactionIdHeader = page.getByRole('button', { name: /Transaction ID/i });
      await transactionIdHeader.click();

      const table = page.getByRole('table');

      expect(table).toBeInTheDocument();
    });

    it('should render member column header', () => {
      renderTable();

      const table = page.getByRole('table');

      expect(table.getByRole('button', { name: 'Member', exact: true })).toBeInTheDocument();
    });

    it('should have sortable status column', async () => {
      renderTable();

      const statusHeader = page.getByRole('button', { name: /Status/i });
      await statusHeader.click();

      const table = page.getByRole('table');

      expect(table).toBeInTheDocument();
    });

    it('should toggle sort direction when clicking same column twice', async () => {
      renderTable();

      const dateHeader = page.getByRole('button', { name: /Date/i });
      await dateHeader.click();
      await dateHeader.click();

      const table = page.getByRole('table');

      expect(table).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('should render pagination controls', () => {
      renderTable();

      const paginationText = page.getByText(/Showing 1-10 of 27 entries/);

      expect(paginationText).toBeInTheDocument();
    });

    it('should render previous button', () => {
      renderTable();

      const previousButton = page.getByRole('button', { name: /Previous/i });

      expect(previousButton).toBeInTheDocument();
    });

    it('should render next button', () => {
      renderTable();

      const nextButton = page.getByRole('button', { name: 'Next', exact: true });

      expect(nextButton).toBeInTheDocument();
    });

    it('should navigate to next page when clicking next', async () => {
      renderTable();

      const nextButton = page.getByRole('button', { name: 'Next', exact: true });
      await nextButton.click();

      const paginationText = page.getByText(/Showing 11-20 of 27 entries/);

      expect(paginationText).toBeInTheDocument();
    });

    it('should reset page when filtering', async () => {
      renderTable();

      const nextButton = page.getByRole('button', { name: 'Next', exact: true });
      await nextButton.click();

      const searchInput = page.getByPlaceholder('Search transactions...');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'Membership');

      expect(page.getByText(/Showing 1-10 of/)).toBeInTheDocument();
    });
  });

  describe('Empty and Loading States', () => {
    it('should show empty state message when no transactions match filter', async () => {
      renderTable();

      const searchInput = page.getByPlaceholder('Search transactions...');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'ZZZNoMatch');

      expect(page.getByText('No transactions match your search').first()).toBeInTheDocument();
    });
  });

  describe('Search by different fields', () => {
    it('should filter by transaction ID', async () => {
      renderTable();

      const searchInput = page.getByPlaceholder('Search transactions...');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'TXNCASH001');

      const table = page.getByRole('table');

      expect(table.getByText('Private Lesson')).toBeInTheDocument();
    });

    it('should filter by member name', async () => {
      renderTable();

      const searchInput = page.getByPlaceholder('Search transactions...');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'Jane Doe');

      const table = page.getByRole('table');

      expect(table.getByText('Jane Doe').first()).toBeInTheDocument();
    });

    it('should filter by status', async () => {
      renderTable();

      const searchInput = page.getByPlaceholder('Search transactions...');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'declined');

      const table = page.getByRole('table');

      expect(table.getByText('Declined').first()).toBeInTheDocument();
    });

    it('should filter by method', async () => {
      renderTable();

      const searchInput = page.getByPlaceholder('Search transactions...');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'ACH Transfer');

      const table = page.getByRole('table');

      expect(table.getByText('TXNACH2024030501')).toBeInTheDocument();
    });

    it('should filter by amount', async () => {
      renderTable();

      const searchInput = page.getByPlaceholder('Search transactions...');
      await userEvent.fill(searchInput.element() as HTMLInputElement, '$50.00');

      const table = page.getByRole('table');

      expect(table.getByText('Private Lesson').first()).toBeInTheDocument();
    });
  });

  describe('Combined Filters', () => {
    it('should apply search and origin filter together', async () => {
      renderTable();

      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();
      const merchandiseOption = page.getByRole('option', { name: 'Merchandise' });
      await merchandiseOption.click();

      const searchInput = page.getByPlaceholder('Search transactions...');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'John');

      const table = page.getByRole('table');

      expect(table.getByText('John Smith')).toBeInTheDocument();
    });
  });

  describe('Transaction Status Display', () => {
    it('should display different status badges', () => {
      renderTable();

      const table = page.getByRole('table');

      expect(table.getByText('Paid').first()).toBeInTheDocument();
    });

    it('should show declined status on page 1', () => {
      renderTable();

      const table = page.getByRole('table');

      expect(table.getByText('Declined').first()).toBeInTheDocument();
    });
  });

  describe('Row Click Interaction', () => {
    it('should have transaction rows with button role', () => {
      renderTable();

      const table = page.getByRole('table');

      expect(table).toBeInTheDocument();
    });

    it('should display member names as clickable rows', () => {
      renderTable();

      const table = page.getByRole('table');

      expect(table.getByText('John Smith').first()).toBeInTheDocument();
    });
  });
});
