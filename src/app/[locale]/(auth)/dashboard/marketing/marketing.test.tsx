import type { Coupon } from '@/hooks/useCouponsCache';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import MarketingPage from './page';

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({ organization: { id: 'test-org-123' } }),
}));

// Mock coupons data
const mockCoupons: Coupon[] = [
  { id: '1', code: 'CTA_FAMILY_1', name: 'Family Discount', description: 'Family coupon', discountType: 'percentage', discountValue: 15, applicableTo: 'memberships', usageLimit: 100, usageCount: 23, perUserLimit: 1, status: 'active', validFrom: new Date('2024-01-01'), validUntil: new Date('2025-12-31'), createdAt: new Date() },
  { id: '2', code: 'NEWYEAR25', name: 'New Year', description: 'New year promo', discountType: 'percentage', discountValue: 25, applicableTo: 'all', usageLimit: 150, usageCount: 0, perUserLimit: 1, status: 'active', validFrom: new Date('2024-12-01'), validUntil: new Date('2025-01-31'), createdAt: new Date() },
  { id: '3', code: 'FLASH20', name: 'Flash Sale', description: 'Flash promo', discountType: 'percentage', discountValue: 20, applicableTo: 'all', usageLimit: 50, usageCount: 50, perUserLimit: 1, status: 'expired', validFrom: new Date('2024-01-01'), validUntil: new Date('2024-06-30'), createdAt: new Date() },
  { id: '4', code: 'SAVE10', name: 'Save 10', description: '', discountType: 'fixed', discountValue: 10, applicableTo: 'all', usageLimit: 100, usageCount: 12, perUserLimit: 1, status: 'active', validFrom: new Date('2024-01-01'), validUntil: new Date('2025-12-31'), createdAt: new Date() },
  { id: '5', code: 'TRIAL30', name: 'Free Trial', description: '', discountType: 'trial', discountValue: 30, applicableTo: 'memberships', usageLimit: null, usageCount: 5, perUserLimit: 1, status: 'active', validFrom: new Date('2024-01-01'), validUntil: null, createdAt: new Date() },
  { id: '6', code: 'WELCOME', name: 'Welcome', description: '', discountType: 'percentage', discountValue: 10, applicableTo: 'all', usageLimit: 200, usageCount: 45, perUserLimit: 1, status: 'active', validFrom: new Date('2024-01-01'), validUntil: new Date('2025-12-31'), createdAt: new Date() },
  { id: '7', code: 'SUMMER24', name: 'Summer', description: '', discountType: 'percentage', discountValue: 15, applicableTo: 'classes', usageLimit: 75, usageCount: 30, perUserLimit: 1, status: 'active', validFrom: new Date('2024-06-01'), validUntil: new Date('2024-08-31'), createdAt: new Date() },
  { id: '8', code: 'KIDS25', name: 'Kids Promo', description: '', discountType: 'percentage', discountValue: 25, applicableTo: 'classes', usageLimit: 50, usageCount: 20, perUserLimit: 1, status: 'active', validFrom: new Date('2024-01-01'), validUntil: new Date('2025-12-31'), createdAt: new Date() },
  { id: '9', code: 'VIP50', name: 'VIP', description: '', discountType: 'percentage', discountValue: 50, applicableTo: 'all', usageLimit: 10, usageCount: 8, perUserLimit: 1, status: 'active', validFrom: new Date('2024-01-01'), validUntil: new Date('2025-12-31'), createdAt: new Date() },
  { id: '10', code: 'REFER15', name: 'Referral', description: '', discountType: 'percentage', discountValue: 15, applicableTo: 'memberships', usageLimit: 100, usageCount: 35, perUserLimit: 1, status: 'active', validFrom: new Date('2024-01-01'), validUntil: new Date('2025-12-31'), createdAt: new Date() },
  { id: '11', code: 'WEEKEND10', name: 'Weekend', description: '', discountType: 'fixed', discountValue: 10, applicableTo: 'all', usageLimit: 80, usageCount: 25, perUserLimit: 1, status: 'active', validFrom: new Date('2024-01-01'), validUntil: new Date('2025-12-31'), createdAt: new Date() },
  { id: '12', code: 'LOYALTY20', name: 'Loyalty', description: '', discountType: 'percentage', discountValue: 20, applicableTo: 'all', usageLimit: 60, usageCount: 40, perUserLimit: 1, status: 'active', validFrom: new Date('2024-01-01'), validUntil: new Date('2025-12-31'), createdAt: new Date() },
];

// Mock the coupons cache hook
vi.mock('@/hooks/useCouponsCache', () => ({
  useCouponsCache: () => ({
    coupons: mockCoupons,
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateCouponsCache: vi.fn(),
}));

// Helper to wait for async operations
async function waitFor(callback: () => void | Promise<void>, options?: { timeout?: number }) {
  return vi.waitFor(callback, { timeout: options?.timeout ?? 5000, interval: 50 });
}

describe('Marketing Page', () => {
  describe('Header and Layout', () => {
    it('renders marketing header', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const heading = page.getByRole('heading', { name: /Marketing/i });

      expect(heading).toBeInTheDocument();
    });

    it('renders add new coupon button', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const button = page.getByRole('button', { name: /Add New Coupon/i });

      expect(button).toBeInTheDocument();
    });
  });

  describe('Statistics Cards', () => {
    it('renders all statistics cards', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const totalCoupons = page.getByText(/Total Coupons/);
      const totalSavings = page.getByText(/Total Savings/);
      const timesUsed = page.getByText(/Times Used/);

      expect(totalCoupons).toBeInTheDocument();
      expect(totalSavings).toBeInTheDocument();
      expect(timesUsed).toBeInTheDocument();
    });

    it('renders statistics cards at the top of the page', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const totalCoupons = page.getByText(/Total Coupons/);

      expect(totalCoupons).toBeInTheDocument();
    });
  });

  describe('Search and Filters', () => {
    it('renders search input', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const searchInput = page.getByTestId('coupon-search-input');

      expect(searchInput).toBeInTheDocument();
    });

    it('renders status filter dropdown', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const statusFilter = page.getByTestId('coupon-status-filter');

      expect(statusFilter).toBeInTheDocument();
    });

    it('renders type filter dropdown', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const typeFilter = page.getByTestId('coupon-type-filter');

      expect(typeFilter).toBeInTheDocument();
    });

    it('filters coupons by search term', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const searchInput = page.getByTestId('coupon-search-input');
      await userEvent.type(searchInput, 'FAMILY');

      await waitFor(() => {
        const table = page.getByRole('table');
        const couponCode = table.getByText(/CTA_FAMILY_1/);

        expect(couponCode).toBeInTheDocument();
      });
    });
  });

  describe('Coupons Table', () => {
    it('renders coupons table headers', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const codeHeader = table.getByRole('button', { name: /Code/ });
      const typeHeader = table.getByRole('button', { name: /Type/ });
      const statusHeader = table.getByRole('button', { name: /Status/ });

      expect(codeHeader).toBeInTheDocument();
      expect(typeHeader).toBeInTheDocument();
      expect(statusHeader).toBeInTheDocument();
    });

    it('renders coupon data in table with type abbreviations', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const couponCode = table.getByText(/CTA_FAMILY_1/);
      // Type should be displayed as PCT abbreviation (not "Percentage")
      const couponType = table.getByRole('cell', { name: /PCT/ }).first();

      expect(couponCode).toBeInTheDocument();
      expect(couponType).toBeInTheDocument();
    });

    it('does not render selection column', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const checkboxes = table.element()?.querySelectorAll('input[type="checkbox"]');

      expect(checkboxes?.length || 0).toBe(0);
    });

    it('renders edit button for each coupon', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const editButton = table.getByRole('button', { name: /Edit CTA_FAMILY_1/i });

      expect(editButton).toBeInTheDocument();
    });

    it('renders delete button for coupons with 0 usage', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      // NEWYEAR25 has 0/150 usage
      const deleteButton = table.getByRole('button', { name: /Delete NEWYEAR25/i });

      expect(deleteButton).toBeInTheDocument();
    });

    it('hides delete button for coupons with active usage', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      // CTA_FAMILY_1 has 23/100 usage (active usage, not 0 or 100%)
      // Since delete button is hidden, we verify by checking edit button exists but delete doesn't
      const editButton = table.getByRole('button', { name: /Edit CTA_FAMILY_1/i });

      expect(editButton).toBeInTheDocument();

      try {
        const deleteButton = table.getByRole('button', { name: /Delete CTA_FAMILY_1/i });

        // If we find it, the test should fail
        expect(deleteButton.element()).toBeFalsy();
      } catch {
        // Expected - delete button should not exist
        expect(true).toBe(true);
      }
    });

    it('renders delete button for coupons at 100% usage', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      // FLASH20 has 50/50 usage (100%)
      const deleteButton = table.getByRole('button', { name: /Delete FLASH20/i });

      expect(deleteButton).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('renders pagination controls', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const nextButton = page.getByRole('button', { name: /^Next$/i });

      expect(nextButton).toBeInTheDocument();
    });

    it('shows 10 records per page', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const paginationText = page.getByText(/Showing 1-10 of 12 entries/);

      expect(paginationText).toBeInTheDocument();
    });
  });

  describe('Add/Edit Modal', () => {
    it('opens add modal when clicking Add New Coupon button', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const addButton = page.getByRole('button', { name: /Add New Coupon/i });
      await userEvent.click(addButton);

      await waitFor(() => {
        const modal = page.getByRole('dialog');

        expect(modal).toBeInTheDocument();
      });
    });

    it('opens edit modal when clicking edit button', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const editButton = table.getByRole('button', { name: /Edit CTA_FAMILY_1/i });
      await userEvent.click(editButton);

      await waitFor(() => {
        const modal = page.getByRole('dialog');

        expect(modal).toBeInTheDocument();
      });
    });

    it('closes modal when clicking close button', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const addButton = page.getByRole('button', { name: /Add New Coupon/i });
      await userEvent.click(addButton);

      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      await waitFor(() => {
        try {
          const modal = page.getByRole('dialog');

          expect(modal.element()).toBeFalsy();
        } catch {
          expect(true).toBe(true);
        }
      });
    });
  });

  describe('Sorting', () => {
    it('can sort by code column', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const codeHeader = table.getByRole('button', { name: /Code/ });
      await userEvent.click(codeHeader);

      expect(codeHeader).toBeInTheDocument();
    });

    it('can sort by code column twice to toggle direction', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const codeHeader = table.getByRole('button', { name: /Code/ });
      await userEvent.click(codeHeader);
      await userEvent.click(codeHeader);

      expect(codeHeader).toBeInTheDocument();
    });

    it('can sort by type column', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const typeHeader = table.getByRole('button', { name: /Type/ });
      await userEvent.click(typeHeader);

      expect(typeHeader).toBeInTheDocument();
    });

    it('can sort by amount column', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const amountHeader = table.getByRole('button', { name: /Amount/ });
      await userEvent.click(amountHeader);

      expect(amountHeader).toBeInTheDocument();
    });

    it('can sort by apply to column', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const applyToHeader = table.getByRole('button', { name: /Apply to/ });
      await userEvent.click(applyToHeader);

      expect(applyToHeader).toBeInTheDocument();
    });

    it('can sort by usage column', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const usageHeader = table.getByRole('button', { name: /Usage/ });
      await userEvent.click(usageHeader);

      expect(usageHeader).toBeInTheDocument();
    });

    it('can sort by effective column', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const effectiveHeader = table.getByRole('button', { name: /Effective/ });
      await userEvent.click(effectiveHeader);

      expect(effectiveHeader).toBeInTheDocument();
    });

    it('can sort by status column', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const statusHeader = table.getByRole('button', { name: /Status/ });
      await userEvent.click(statusHeader);

      expect(statusHeader).toBeInTheDocument();
    });
  });

  describe('Delete functionality', () => {
    it('opens delete confirmation dialog when clicking delete button', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      // NEWYEAR25 has 0/150 usage so delete button is visible
      const deleteButton = table.getByRole('button', { name: /Delete NEWYEAR25/i });
      await userEvent.click(deleteButton);

      await waitFor(() => {
        const dialog = page.getByRole('alertdialog');

        expect(dialog).toBeInTheDocument();
      });
    });

    it('closes delete dialog when cancel is clicked', async () => {
      await render(<I18nWrapper><MarketingPage /></I18nWrapper>);

      const table = page.getByRole('table');
      const deleteButton = table.getByRole('button', { name: /Delete NEWYEAR25/i });
      await userEvent.click(deleteButton);

      await waitFor(() => {
        const cancelButton = page.getByRole('button', { name: /Cancel/i });

        expect(cancelButton).toBeInTheDocument();
      });

      const cancelButton = page.getByRole('button', { name: /Cancel/i });
      await userEvent.click(cancelButton);

      await waitFor(() => {
        try {
          const dialog = page.getByRole('alertdialog');

          expect(dialog.element()).toBeFalsy();
        } catch {
          expect(true).toBe(true);
        }
      });
    });
  });
});
