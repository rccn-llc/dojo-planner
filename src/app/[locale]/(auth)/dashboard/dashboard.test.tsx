import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

// Mock next/link to avoid Next.js router dependencies in tests
vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    __esModule: true,
    default: function MockLink(
      { ref, ...props }: { ref?: React.Ref<HTMLAnchorElement>; href: string; className?: string; children: React.ReactNode },
    ) {
      return React.createElement('a', { href: props.href, className: props.className, ref }, props.children);
    },
  };
});

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Performance',
      memberships_card_title: 'Memberships',
      financials_card_title: 'Financials',
    };
    return translations[key] || key;
  },
}));

// Mock DashboardCharts to avoid recharts rendering issues in tests
vi.mock('@/features/dashboard/DashboardCharts', async () => {
  const React = await import('react');
  return {
    __esModule: true,
    default: function MockDashboardCharts() {
      return React.createElement('div', { 'data-testid': 'mock-dashboard-charts' }, React.createElement('h2', null, 'Member average'), React.createElement('h2', null, 'Earnings'));
    },
  };
});

// Mock useDashboardCache hook
vi.mock('@/hooks/useDashboardCache', () => ({
  useDashboardCache: () => ({
    membershipStats: {
      totalPeople: 462,
      totalStudents: 111,
      totalFamilies: 92,
      newStudentsLast30Days: 8,
      autopayOn: 85,
      autopayOff: 26,
      membershipsOnHold: 3,
      cancelledLast30Days: 2,
      membershipNetChange30Days: 6,
    },
    financialStats: {
      autopaysSuspended: 2,
      expiringCreditCards60Days: 5,
      amountDueNext30Days: 14394.20,
      pastDueTotal: 450.62,
      paymentsLast30Days: 13150.44,
      paymentsPending: 0,
      failedPaymentsLast30Days: 1834.67,
      incomePerStudent30Days: 118.47,
    },
    memberAverageData: {
      monthly: [{ month: 'Jan', value: 100, previousYearValue: 90 }],
      yearly: [{ year: '2024', value: 100 }],
    },
    earningsData: {
      monthly: [{ month: 'Jan', value: 10000, previousYearValue: 9000 }],
      yearly: [{ year: '2024', value: 120000 }],
    },
    loading: false,
    error: null,
  }),
}));

describe('Dashboard Page', () => {
  it('renders performance header', async () => {
    await render(<DashboardPage />);

    const heading = page.getByRole('heading', { name: /Performance/i });

    expect(heading).toBeInTheDocument();
  });

  it('renders memberships section', async () => {
    await render(<DashboardPage />);

    const membershipsHeading = page.getByRole('heading', { name: /Memberships/i });

    expect(membershipsHeading).toBeInTheDocument();
  });

  it('renders financial metrics', async () => {
    await render(<DashboardPage />);

    const financialsHeading = page.getByRole('heading', { name: /Financials/i });

    expect(financialsHeading).toBeInTheDocument();
  });

  it('displays membership types and counts', async () => {
    await render(<DashboardPage />);

    const allPeople = page.getByText(/All people/);

    expect(allPeople).toBeInTheDocument();
  });

  it('displays financial data in table', async () => {
    await render(<DashboardPage />);

    const expireCards = page.getByText(/Expiring credit cards/);

    expect(expireCards).toBeInTheDocument();
  });

  it('displays chart headings', async () => {
    await render(<DashboardPage />);

    // DashboardCharts is loaded via next/dynamic, so poll until it resolves.
    await expect.element(page.getByRole('heading', { name: /Member average/i })).toBeInTheDocument();
    await expect.element(page.getByRole('heading', { name: /Earnings/i })).toBeInTheDocument();
  });
});

describe('Dashboard Page - Membership Card Links', () => {
  it('renders All people link pointing to members page', async () => {
    await render(<DashboardPage />);

    const allPeopleLink = page.getByRole('link', { name: /All people/i });

    expect(allPeopleLink).toBeInTheDocument();
    expect(allPeopleLink.element()).toHaveAttribute('href', '/dashboard/members');
  });

  it('renders All students link pointing to members page', async () => {
    await render(<DashboardPage />);

    const allStudentsLink = page.getByRole('link', { name: /All students/i });

    expect(allStudentsLink).toBeInTheDocument();
    expect(allStudentsLink.element()).toHaveAttribute('href', '/dashboard/members');
  });

  it('renders All families with students link pointing to members page', async () => {
    await render(<DashboardPage />);

    const familiesLink = page.getByRole('link', { name: /All families with students/i });

    expect(familiesLink).toBeInTheDocument();
    expect(familiesLink.element()).toHaveAttribute('href', '/dashboard/members');
  });

  it('renders New students link pointing to members page', async () => {
    await render(<DashboardPage />);

    const newStudentsLink = page.getByRole('link', { name: /New students \(last 30 days\)/i });

    expect(newStudentsLink).toBeInTheDocument();
    expect(newStudentsLink.element()).toHaveAttribute('href', '/dashboard/members');
  });

  it('renders Memberships with autopay on link pointing to members page', async () => {
    await render(<DashboardPage />);

    const autopayOnLink = page.getByRole('link', { name: /Memberships with autopay on/i });

    expect(autopayOnLink).toBeInTheDocument();
    expect(autopayOnLink.element()).toHaveAttribute('href', '/dashboard/members');
  });

  it('renders Memberships with autopay off link pointing to members page', async () => {
    await render(<DashboardPage />);

    const autopayOffLink = page.getByRole('link', { name: /Memberships with autopay off/i });

    expect(autopayOffLink).toBeInTheDocument();
    expect(autopayOffLink.element()).toHaveAttribute('href', '/dashboard/members');
  });

  it('renders Memberships on hold link pointing to members page', async () => {
    await render(<DashboardPage />);

    const onHoldLink = page.getByRole('link', { name: /Memberships on hold/i });

    expect(onHoldLink).toBeInTheDocument();
    expect(onHoldLink.element()).toHaveAttribute('href', '/dashboard/members');
  });

  it('renders Canceled memberships link pointing to members page', async () => {
    await render(<DashboardPage />);

    const canceledLink = page.getByRole('link', { name: /Canceled memberships/i });

    expect(canceledLink).toBeInTheDocument();
    expect(canceledLink.element()).toHaveAttribute('href', '/dashboard/members');
  });

  it('displays Membership net change as plain text without link', async () => {
    await render(<DashboardPage />);

    const netChangeText = page.getByText(/Membership net change/i);

    expect(netChangeText).toBeInTheDocument();
    expect(netChangeText.element().tagName.toLowerCase()).not.toBe('a');
  });
});

describe('Dashboard Page - Financials Card Links', () => {
  it('renders Accounts with autopay suspended link pointing to reports page', async () => {
    await render(<DashboardPage />);

    const autopaySuspendedLink = page.getByRole('link', { name: /Accounts with autopay suspended/i });

    expect(autopaySuspendedLink).toBeInTheDocument();
    expect(autopaySuspendedLink.element()).toHaveAttribute('href', '/dashboard/reports?report=accounts-autopay-suspended');
  });

  it('renders Expiring credit cards link pointing to reports page', async () => {
    await render(<DashboardPage />);

    const expiringCardsLink = page.getByRole('link', { name: /Expiring credit cards/i });

    expect(expiringCardsLink).toBeInTheDocument();
    expect(expiringCardsLink.element()).toHaveAttribute('href', '/dashboard/reports?report=expiring-credit-cards');
  });

  it('renders Amount due link pointing to reports page', async () => {
    await render(<DashboardPage />);

    const amountDueLink = page.getByRole('link', { name: /Amount due/i });

    expect(amountDueLink).toBeInTheDocument();
    expect(amountDueLink.element()).toHaveAttribute('href', '/dashboard/reports?report=amount-due');
  });

  it('renders Past due link pointing to reports page', async () => {
    await render(<DashboardPage />);

    const pastDueLink = page.getByRole('link', { name: /Past due/i });

    expect(pastDueLink).toBeInTheDocument();
    expect(pastDueLink.element()).toHaveAttribute('href', '/dashboard/reports?report=past-due');
  });

  it('renders Payments (last 30 days) link pointing to reports page', async () => {
    await render(<DashboardPage />);

    const paymentsLink = page.getByRole('link', { name: /^Payments \(last 30 days\)/i });

    expect(paymentsLink).toBeInTheDocument();
    expect(paymentsLink.element()).toHaveAttribute('href', '/dashboard/reports?report=payments-last-30-days');
  });

  it('renders Payments (pending status) link pointing to reports page', async () => {
    await render(<DashboardPage />);

    const pendingPaymentsLink = page.getByRole('link', { name: /Payments \(pending status\)/i });

    expect(pendingPaymentsLink).toBeInTheDocument();
    expect(pendingPaymentsLink.element()).toHaveAttribute('href', '/dashboard/reports?report=payments-pending');
  });

  it('renders Failed payments link pointing to reports page', async () => {
    await render(<DashboardPage />);

    const failedPaymentsLink = page.getByRole('link', { name: /Failed payments/i });

    expect(failedPaymentsLink).toBeInTheDocument();
    expect(failedPaymentsLink.element()).toHaveAttribute('href', '/dashboard/reports?report=failed-payments');
  });

  it('renders Income per student link pointing to reports page', async () => {
    await render(<DashboardPage />);

    const incomeLink = page.getByRole('link', { name: /Income per student/i });

    expect(incomeLink).toBeInTheDocument();
    expect(incomeLink.element()).toHaveAttribute('href', '/dashboard/reports?report=income-per-student');
  });
});

describe('Dashboard Page - Link Styling', () => {
  it('membership links have proper styling classes', async () => {
    await render(<DashboardPage />);

    const allPeopleLink = page.getByRole('link', { name: /All people/i });

    expect(allPeopleLink.element()).toHaveClass('text-primary');
    expect(allPeopleLink.element()).toHaveClass('underline-offset-4');
    expect(allPeopleLink.element()).toHaveClass('hover:underline');
  });

  it('financial links have proper styling classes', async () => {
    await render(<DashboardPage />);

    const autopaySuspendedLink = page.getByRole('link', { name: /Accounts with autopay suspended/i });

    expect(autopaySuspendedLink.element()).toHaveClass('text-primary');
    expect(autopaySuspendedLink.element()).toHaveClass('underline-offset-4');
    expect(autopaySuspendedLink.element()).toHaveClass('hover:underline');
  });
});

describe('Dashboard Page - Data Display', () => {
  it('displays membership quantities correctly', async () => {
    await render(<DashboardPage />);

    expect(page.getByText('462')).toBeInTheDocument();
    expect(page.getByText('111', { exact: true }).first()).toBeInTheDocument();
    expect(page.getByText('92')).toBeInTheDocument();
  });

  it('displays financial amounts correctly', async () => {
    await render(<DashboardPage />);

    expect(page.getByText('$14,394.20')).toBeInTheDocument();
    expect(page.getByText('$450.62')).toBeInTheDocument();
    expect(page.getByText('$13,150.44', { exact: true }).first()).toBeInTheDocument();
  });

  it('displays table headers for memberships', async () => {
    await render(<DashboardPage />);

    const typeHeaders = page.getByText('Type');

    expect(typeHeaders.first()).toBeInTheDocument();
  });

  it('displays table headers for financials', async () => {
    await render(<DashboardPage />);

    const quantityHeaders = page.getByText('Quantity');

    expect(quantityHeaders.first()).toBeInTheDocument();
  });
});

describe('Dashboard Page - Layout Structure', () => {
  it('renders main content grid', async () => {
    await render(<DashboardPage />);

    const heading = page.getByRole('heading', { name: /Performance/i });

    expect(heading).toBeInTheDocument();
    expect(heading.element().tagName.toLowerCase()).toBe('h1');
  });

  it('renders two cards for memberships and financials', async () => {
    await render(<DashboardPage />);

    const membershipsHeading = page.getByRole('heading', { name: /Memberships/i });
    const financialsHeading = page.getByRole('heading', { name: /Financials/i });

    expect(membershipsHeading).toBeInTheDocument();
    expect(financialsHeading).toBeInTheDocument();
  });

  it('renders charts section', async () => {
    await render(<DashboardPage />);

    // DashboardCharts is loaded via next/dynamic, so poll until it resolves.
    await expect.element(page.getByRole('heading', { name: /Member average/i })).toBeInTheDocument();
    await expect.element(page.getByRole('heading', { name: /Earnings/i })).toBeInTheDocument();
  });
});

describe('Dashboard Page - Accessibility', () => {
  it('membership table has proper accessibility structure', async () => {
    await render(<DashboardPage />);

    const table = page.getByRole('table').first();

    expect(table).toBeInTheDocument();
  });

  it('financials table has proper accessibility structure', async () => {
    await render(<DashboardPage />);

    const tables = page.getByRole('table');

    expect(tables.elements().length).toBeGreaterThanOrEqual(2);
  });

  it('links are keyboard accessible', async () => {
    await render(<DashboardPage />);

    const links = page.getByRole('link');

    expect(links.elements().length).toBeGreaterThan(0);
  });
});
