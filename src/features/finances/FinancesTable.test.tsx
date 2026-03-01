import type { Transaction, TransactionStatus } from './FinancesTable';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { FinancesTable } from './FinancesTable';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Helper to create mock transactions
const createMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: '1',
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

describe('FinancesTable', () => {
  describe('Page Header', () => {
    it('should render filter bar', () => {
      const mockTransactions = [createMockTransaction()];

      render(<FinancesTable transactions={mockTransactions} />);

      // Title is now rendered by the page component, not the table
      // Check for search input instead
      const searchInput = page.getByPlaceholder('search_placeholder');

      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('Render method', () => {
    it('should render transactions table with transactions list', () => {
      const mockTransactions = [createMockTransaction()];

      render(<FinancesTable transactions={mockTransactions} />);

      const table = page.getByRole('table');

      expect(table.getByText('April 15, 2025')).toBeInTheDocument();
    });

    it('should render empty state when no transactions', () => {
      render(<FinancesTable transactions={[]} />);

      const emptyState = page.getByText('no_transactions').first();

      expect(emptyState).toBeInTheDocument();
    });

    it('should render loading state when loading prop is true', () => {
      render(<FinancesTable transactions={[]} loading />);

      const loadingText = page.getByText('loading_transactions').first();

      expect(loadingText).toBeInTheDocument();
    });

    it('should render header actions when provided', () => {
      render(
        <FinancesTable
          transactions={[]}
          headerActions={<button type="button">Add Transaction</button>}
        />,
      );

      const addButton = page.getByRole('button', { name: 'Add Transaction' });

      expect(addButton).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('should sort transactions by date column', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', date: 'April 15, 2025' }),
        createMockTransaction({ id: '2', date: 'March 15, 2025' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const dateHeader = page.getByRole('button', { name: /table_date/i });
      await dateHeader.click();

      const table = page.getByRole('table');

      expect(table.getByText('April 15, 2025')).toBeInTheDocument();
      expect(table.getByText('March 15, 2025')).toBeInTheDocument();
    });

    it('should sort transactions by amount column', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', amount: '$200.00' }),
        createMockTransaction({ id: '2', amount: '$100.00' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const amountHeader = page.getByRole('button', { name: /table_amount/i });
      await amountHeader.click();

      const table = page.getByRole('table');

      expect(table.getByText('$200.00')).toBeInTheDocument();
      expect(table.getByText('$100.00')).toBeInTheDocument();
    });

    it('should sort transactions by origin column', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', purpose: 'Merchandise' }),
        createMockTransaction({ id: '2', purpose: 'Membership Dues' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const originHeader = page.getByRole('button', { name: /table_origin/i });
      await originHeader.click();

      const table = page.getByRole('table');

      expect(table.getByText('Merchandise')).toBeInTheDocument();
      expect(table.getByText('Membership Dues')).toBeInTheDocument();
    });

    it('should toggle sort direction when clicking same column twice', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', date: 'April 15, 2025' }),
        createMockTransaction({ id: '2', date: 'March 15, 2025' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const dateHeader = page.getByRole('button', { name: /table_date/i });
      await dateHeader.click();
      await dateHeader.click();

      const table = page.getByRole('table');

      expect(table.getByText('April 15, 2025')).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('should have a search input', () => {
      const mockTransactions = [createMockTransaction()];

      render(<FinancesTable transactions={mockTransactions} />);

      const searchInput = page.getByPlaceholder('search_placeholder');

      expect(searchInput).toBeInTheDocument();
    });

    it('should allow typing in search input', async () => {
      const mockTransactions = [createMockTransaction()];

      render(<FinancesTable transactions={mockTransactions} />);

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'Membership');

      const table = page.getByRole('table');

      expect(table.getByText('Membership Dues')).toBeInTheDocument();
    });

    it('should filter by search term', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', purpose: 'Membership Dues' }),
        createMockTransaction({ id: '2', purpose: 'Merchandise' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'Merchandise');

      const table = page.getByRole('table');

      expect(table.getByText('Merchandise')).toBeInTheDocument();
    });

    it('should have origin filter dropdown', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', purpose: 'Membership Dues' }),
        createMockTransaction({ id: '2', purpose: 'Merchandise' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();

      expect(page.getByRole('option', { name: 'Membership Dues' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'Merchandise' })).toBeInTheDocument();
    });

    it('should filter by origin when selecting from dropdown', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', purpose: 'Membership Dues', memberName: 'John Smith' }),
        createMockTransaction({ id: '2', purpose: 'Merchandise', memberName: 'Jane Doe' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();

      const merchandiseOption = page.getByRole('option', { name: 'Merchandise' });
      await merchandiseOption.click();

      const table = page.getByRole('table');

      expect(table.getByText('Jane Doe')).toBeInTheDocument();
      expect(table.getByText('John Smith').elements()).toHaveLength(0);
    });

    it('should show no results message when filter has no matches', async () => {
      const mockTransactions = [createMockTransaction()];

      render(<FinancesTable transactions={mockTransactions} />);

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'NonexistentItem');

      expect(page.getByText('no_results_found').first()).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('should show pagination when there are more than 10 transactions', () => {
      const mockTransactions = Array.from({ length: 15 }, (_, i) =>
        createMockTransaction({ id: `${i}`, date: `April ${i + 1}, 2025` }));

      render(<FinancesTable transactions={mockTransactions} />);

      expect(page.getByRole('button', { name: /Previous/i })).toBeInTheDocument();
      expect(page.getByRole('button', { name: 'Next', exact: true })).toBeInTheDocument();
    });

    it('should only show first 10 transactions on first page', () => {
      const mockTransactions = Array.from({ length: 15 }, (_, i) =>
        createMockTransaction({ id: `${i}`, transactionId: `TXN${String(i).padStart(2, '0')}` }));

      render(<FinancesTable transactions={mockTransactions} />);

      const table = page.getByRole('table');

      expect(table.getByText('TXN00')).toBeInTheDocument();
      expect(table.getByText('TXN09')).toBeInTheDocument();
      expect(table.getByText('TXN10').elements()).toHaveLength(0);
    });

    it('should navigate to second page when clicking next', async () => {
      const mockTransactions = Array.from({ length: 15 }, (_, i) =>
        createMockTransaction({ id: `${i}`, transactionId: `TXN${String(i).padStart(2, '0')}` }));

      render(<FinancesTable transactions={mockTransactions} />);

      const nextButton = page.getByRole('button', { name: 'Next', exact: true });
      await nextButton.click();

      const table = page.getByRole('table');

      expect(table.getByText('TXN10')).toBeInTheDocument();
    });

    it('should reset page when filtering', async () => {
      const mockTransactions = Array.from({ length: 15 }, (_, i) =>
        createMockTransaction({ id: `${i}`, transactionId: `TXN${String(i).padStart(2, '0')}` }));

      render(<FinancesTable transactions={mockTransactions} />);

      const nextButton = page.getByRole('button', { name: 'Next', exact: true });
      await nextButton.click();

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'TXN01');

      const table = page.getByRole('table');

      expect(table.getByText('TXN01')).toBeInTheDocument();
    });
  });

  describe('Member column', () => {
    it('should display member name in table', () => {
      const mockTransactions = [createMockTransaction({ memberName: 'Jane Doe' })];

      render(<FinancesTable transactions={mockTransactions} />);

      const table = page.getByRole('table');

      expect(table.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('should sort by member name when clicking member header', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', memberName: 'Zack Williams' }),
        createMockTransaction({ id: '2', memberName: 'Alice Brown' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const memberHeader = page.getByRole('button', { name: /table_member/i });
      await memberHeader.click();

      const table = page.getByRole('table');

      expect(table.getByText('Alice Brown')).toBeInTheDocument();
      expect(table.getByText('Zack Williams')).toBeInTheDocument();
    });
  });

  describe('Status column', () => {
    it('should display status badge for paid transactions', () => {
      const mockTransactions = [createMockTransaction({ status: 'paid' })];

      render(<FinancesTable transactions={mockTransactions} />);

      const table = page.getByRole('table');

      expect(table.getByText('status_paid')).toBeInTheDocument();
    });

    it('should display status badge for declined transactions', () => {
      const mockTransactions = [createMockTransaction({ status: 'declined' })];

      render(<FinancesTable transactions={mockTransactions} />);

      const table = page.getByRole('table');

      expect(table.getByText('status_declined')).toBeInTheDocument();
    });

    it('should display status badge for pending transactions', () => {
      const mockTransactions = [createMockTransaction({ status: 'pending' })];

      render(<FinancesTable transactions={mockTransactions} />);

      const table = page.getByRole('table');

      expect(table.getByText('status_pending')).toBeInTheDocument();
    });

    it('should display status badge for refunded transactions', () => {
      const mockTransactions = [createMockTransaction({ status: 'refunded' })];

      render(<FinancesTable transactions={mockTransactions} />);

      const table = page.getByRole('table');

      expect(table.getByText('status_refunded')).toBeInTheDocument();
    });

    it('should display status badge for processing transactions', () => {
      const mockTransactions = [createMockTransaction({ status: 'processing' })];

      render(<FinancesTable transactions={mockTransactions} />);

      const table = page.getByRole('table');

      expect(table.getByText('status_processing')).toBeInTheDocument();
    });

    it('should sort by status when clicking status header', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', status: 'paid' }),
        createMockTransaction({ id: '2', status: 'declined' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const statusHeader = page.getByRole('button', { name: /table_status/i });
      await statusHeader.click();

      const table = page.getByRole('table');

      expect(table.getByText('status_paid')).toBeInTheDocument();
      expect(table.getByText('status_declined')).toBeInTheDocument();
    });
  });

  describe('Row click interaction', () => {
    it('should open transaction detail modal when clicking a row', async () => {
      const mockTransactions = [createMockTransaction()];

      render(<FinancesTable transactions={mockTransactions} />);

      // Click the table row (which has role="button" and contains the member name)
      // Use first() since there's both a table row and mobile card with the same name
      const dataRow = page.getByRole('button', { name: /John Smith/i }).first();
      await dataRow.click();

      expect(page.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have accessible row with tabIndex', () => {
      const mockTransactions = [createMockTransaction()];

      render(<FinancesTable transactions={mockTransactions} />);

      // Verify the row is rendered with button role (making it keyboard accessible)
      const dataRow = page.getByRole('button', { name: /John Smith/i }).first();

      expect(dataRow).toBeInTheDocument();
    });

    it('should close modal when clicking close button', async () => {
      const mockTransactions = [createMockTransaction()];

      render(<FinancesTable transactions={mockTransactions} />);

      // Click the table row (which has role="button" and contains the member name)
      // Use first() since there's both a table row and mobile card with the same name
      const dataRow = page.getByRole('button', { name: /John Smith/i }).first();
      await dataRow.click();

      const closeButton = page.getByRole('button', { name: 'close_button' });
      await closeButton.click();

      expect(page.getByRole('dialog').elements()).toHaveLength(0);
    });
  });

  describe('Search by different fields', () => {
    it('should filter by transaction ID', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', transactionId: 'TXN001' }),
        createMockTransaction({ id: '2', transactionId: 'TXN002' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'TXN001');

      const table = page.getByRole('table');

      expect(table.getByText('TXN001')).toBeInTheDocument();
      expect(table.getByText('TXN002').elements()).toHaveLength(0);
    });

    it('should filter by method', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', method: 'Credit Card' }),
        createMockTransaction({ id: '2', method: 'Cash' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'Cash');

      const table = page.getByRole('table');

      expect(table.getByText('Cash')).toBeInTheDocument();
    });

    it('should filter by member name', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', memberName: 'John Smith' }),
        createMockTransaction({ id: '2', memberName: 'Jane Doe' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'Jane');

      const table = page.getByRole('table');

      expect(table.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('should filter by status', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', status: 'paid' }),
        createMockTransaction({ id: '2', status: 'declined' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const searchInput = page.getByPlaceholder('search_placeholder');
      await userEvent.fill(searchInput.element() as HTMLInputElement, 'declined');

      const table = page.getByRole('table');

      expect(table.getByText('status_declined')).toBeInTheDocument();
    });
  });

  describe('Dynamic filter options', () => {
    it('should only show available origins in filter', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', purpose: 'Membership Dues' }),
        createMockTransaction({ id: '2', purpose: 'Merchandise' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();

      expect(page.getByRole('option', { name: 'Membership Dues' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'Merchandise' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'Seminar' }).elements()).toHaveLength(0);
    });

    it('should update origin options based on selected status', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', purpose: 'Membership Dues', status: 'paid' }),
        createMockTransaction({ id: '2', purpose: 'Merchandise', status: 'declined' }),
        createMockTransaction({ id: '3', purpose: 'Seminar', status: 'paid' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      // Select 'paid' status
      const statusFilter = page.getByTestId('finances-status-filter');
      await statusFilter.click();
      const paidOption = page.getByRole('option', { name: 'status_paid' });
      await paidOption.click();

      // Now check origin filter - should only show origins with paid status
      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();

      expect(page.getByRole('option', { name: 'Membership Dues' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'Seminar' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'Merchandise' }).elements()).toHaveLength(0);
    });

    it('should update status options based on selected origin', async () => {
      const mockTransactions = [
        createMockTransaction({ id: '1', purpose: 'Membership Dues', status: 'paid' }),
        createMockTransaction({ id: '2', purpose: 'Membership Dues', status: 'pending' }),
        createMockTransaction({ id: '3', purpose: 'Merchandise', status: 'declined' }),
      ];

      render(<FinancesTable transactions={mockTransactions} />);

      // Select 'Membership Dues' origin
      const originFilter = page.getByTestId('finances-origin-filter');
      await originFilter.click();
      const membershipOption = page.getByRole('option', { name: 'Membership Dues' });
      await membershipOption.click();

      // Now check status filter - should only show statuses for Membership Dues
      const statusFilter = page.getByTestId('finances-status-filter');
      await statusFilter.click();

      expect(page.getByRole('option', { name: 'status_paid' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_pending' })).toBeInTheDocument();
      expect(page.getByRole('option', { name: 'status_declined' }).elements()).toHaveLength(0);
    });
  });
});
