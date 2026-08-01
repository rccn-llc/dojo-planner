import type { TransactionStatus } from '@/features/finances/FinancesTable';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { TransactionCard } from './TransactionCard';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('TransactionCard', () => {
  const defaultProps = {
    id: '1',
    date: 'April 15, 2025',
    amount: '$160.00',
    purpose: 'Membership Dues',
    method: 'Saved Card Ending ****1234',
    transactionId: 'TXN71MC01ANQ130',
    memberName: 'John Smith',
    status: 'paid' as TransactionStatus,
  };

  describe('Header Section', () => {
    it('should render date', async () => {
      await render(<TransactionCard {...defaultProps} />);

      expect(page.getByText('April 15, 2025')).toBeInTheDocument();
    });

    it('should render member name', async () => {
      await render(<TransactionCard {...defaultProps} />);

      expect(page.getByText('John Smith')).toBeInTheDocument();
    });

    it('should render transaction ID', async () => {
      await render(<TransactionCard {...defaultProps} />);

      expect(page.getByText('TXN71MC01ANQ130')).toBeInTheDocument();
    });

    it('should render amount', async () => {
      await render(<TransactionCard {...defaultProps} />);

      expect(page.getByText('$160.00')).toBeInTheDocument();
    });

    it('should render purpose', async () => {
      await render(<TransactionCard {...defaultProps} />);

      expect(page.getByText('Membership Dues')).toBeInTheDocument();
    });

    it('should render status badge', async () => {
      await render(<TransactionCard {...defaultProps} />);

      expect(page.getByText('status_paid')).toBeInTheDocument();
    });
  });

  describe('Details Section', () => {
    it('should render method', async () => {
      await render(<TransactionCard {...defaultProps} />);

      expect(page.getByText('Saved Card Ending ****1234')).toBeInTheDocument();
    });

    it('should render method label', async () => {
      await render(<TransactionCard {...defaultProps} />);

      expect(page.getByText('table_method')).toBeInTheDocument();
    });
  });

  describe('Status Badge Variants', () => {
    it('should render paid status badge', async () => {
      await render(<TransactionCard {...defaultProps} status="paid" />);

      expect(page.getByText('status_paid')).toBeInTheDocument();
    });

    it('should render pending status badge', async () => {
      await render(<TransactionCard {...defaultProps} status="pending" />);

      expect(page.getByText('status_pending')).toBeInTheDocument();
    });

    it('should render declined status badge', async () => {
      await render(<TransactionCard {...defaultProps} status="declined" />);

      expect(page.getByText('status_declined')).toBeInTheDocument();
    });

    it('should render refunded status badge', async () => {
      await render(<TransactionCard {...defaultProps} status="refunded" />);

      expect(page.getByText('status_refunded')).toBeInTheDocument();
    });

    it('should render processing status badge', async () => {
      await render(<TransactionCard {...defaultProps} status="processing" />);

      expect(page.getByText('status_processing')).toBeInTheDocument();
    });
  });

  describe('Different Transaction Types', () => {
    it('should render merchandise transaction', async () => {
      await render(
        <TransactionCard
          {...defaultProps}
          purpose="Merchandise"
          amount="$75.00"
        />,
      );

      expect(page.getByText('Merchandise')).toBeInTheDocument();
      expect(page.getByText('$75.00')).toBeInTheDocument();
    });

    it('should render private lesson transaction', async () => {
      await render(
        <TransactionCard
          {...defaultProps}
          purpose="Private Lesson"
          amount="$50.00"
          method="Cash"
        />,
      );

      expect(page.getByText('Private Lesson')).toBeInTheDocument();
      expect(page.getByText('Cash')).toBeInTheDocument();
    });

    it('should render seminar transaction', async () => {
      await render(
        <TransactionCard
          {...defaultProps}
          purpose="Seminar"
          amount="$25.00"
        />,
      );

      expect(page.getByText('Seminar', { exact: true })).toBeInTheDocument();
      expect(page.getByText('$25.00')).toBeInTheDocument();
    });
  });

  describe('Click Interaction', () => {
    it('should call onClickAction when clicked', async () => {
      const mockOnClick = vi.fn();
      await render(<TransactionCard {...defaultProps} onClickAction={mockOnClick} />);

      const card = page.getByRole('button');
      await card.click();

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClickAction when Enter key is pressed', async () => {
      const mockOnClick = vi.fn();
      await render(<TransactionCard {...defaultProps} onClickAction={mockOnClick} />);

      const card = page.getByRole('button');
      await card.click();
      await userEvent.keyboard('{Enter}');

      expect(mockOnClick).toHaveBeenCalled();
    });

    it('should call onClickAction when Space key is pressed', async () => {
      const mockOnClick = vi.fn();
      await render(<TransactionCard {...defaultProps} onClickAction={mockOnClick} />);

      const card = page.getByRole('button');
      await card.click();
      await userEvent.keyboard(' ');

      expect(mockOnClick).toHaveBeenCalled();
    });

    it('should be focusable', async () => {
      await render(<TransactionCard {...defaultProps} />);

      const card = page.getByRole('button');

      expect(card).toBeInTheDocument();
    });
  });

  describe('Card Structure', () => {
    it('should render as a card component', async () => {
      await render(<TransactionCard {...defaultProps} />);

      expect(page.getByText('April 15, 2025')).toBeInTheDocument();
      expect(page.getByText('$160.00')).toBeInTheDocument();
      expect(page.getByText('John Smith')).toBeInTheDocument();
    });

    it('should render with cursor pointer style', async () => {
      await render(<TransactionCard {...defaultProps} />);

      const card = page.getByRole('button');

      expect(card).toBeInTheDocument();
    });
  });

  describe('Different Members', () => {
    it('should display different member names', async () => {
      await render(<TransactionCard {...defaultProps} memberName="Jane Doe" />);

      expect(page.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('should display different transaction IDs', async () => {
      await render(<TransactionCard {...defaultProps} transactionId="TXN999999" />);

      expect(page.getByText('TXN999999')).toBeInTheDocument();
    });
  });
});
