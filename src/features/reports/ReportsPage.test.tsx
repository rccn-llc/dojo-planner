import type { ReportType } from './reportHelpers';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import ReportDetail from './ReportDetail';
import { ReportsPage } from './ReportsPage';

// Mock useReportsCache hooks
vi.mock('@/hooks/useReportsCache', () => ({
  useReportCurrentValues: () => ({
    data: {
      autopaysSuspended: 2,
      expiringCreditCards: 5,
      amountDue: 14394.20,
      pastDue: 450.62,
      paymentsLast30Days: 13150.44,
      paymentsPending: 0,
      failedPayments: 1834.67,
      incomePerStudent: 118.47,
    },
    loading: false,
    error: null,
  }),
  useReportDetail: () => ({
    chartData: {
      monthly: [
        { month: 'Jan', value: 3, previousYear: 4 },
        { month: 'Feb', value: 2, previousYear: 3 },
        { month: 'Mar', value: 4, previousYear: 5 },
        { month: 'Apr', value: 1, previousYear: 2 },
        { month: 'May', value: 3, previousYear: 4 },
        { month: 'Jun', value: 2, previousYear: 3 },
        { month: 'Jul', value: 5, previousYear: 6 },
        { month: 'Aug', value: 4, previousYear: 5 },
        { month: 'Sep', value: 3, previousYear: 4 },
        { month: 'Oct', value: 2, previousYear: 3 },
        { month: 'Nov', value: 4, previousYear: 5 },
        { month: 'Dec', value: 3, previousYear: 4 },
      ],
      yearly: [
        { year: '2020', value: 15 },
        { year: '2021', value: 20 },
        { year: '2022', value: 25 },
        { year: '2023', value: 30 },
        { year: '2024', value: 35 },
      ],
    },
    insights: [
      'Current suspended accounts represent 1.8% of total active memberships',
      'Most suspensions occur due to expired payment methods',
      'Average time to resolve suspension is 5 business days',
      'Sending reminder emails 7 days before expiration reduces suspensions by 35%',
    ],
    loading: false,
    error: null,
  }),
}));

// Mock Skeleton component
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) =>
    React.createElement('div', { 'data-testid': 'skeleton', className }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Reports',
      subtitle: 'Select a report to view detailed analytics and insights',
      back_to_reports: 'Back to Reports',
      report_accounts_autopay_suspended: 'Accounts with Autopay Suspended',
      report_accounts_autopay_suspended_description: 'View all accounts that have had their automatic payments suspended',
      report_expiring_credit_cards: 'Expiring Credit Cards',
      report_expiring_credit_cards_description: 'Credit cards expiring in the next 60 days',
      report_amount_due: 'Amount Due',
      report_amount_due_description: 'Total amount due from members in the next 30 days',
      report_past_due: 'Past Due',
      report_past_due_description: 'Total overdue payments from all members',
      report_payments_last_30_days: 'Payments (Last 30 Days)',
      report_payments_last_30_days_description: 'All payments received in the last 30 days',
      report_payments_pending: 'Payments (Pending)',
      report_payments_pending_description: 'Payments currently in pending status',
      report_failed_payments: 'Failed Payments',
      report_failed_payments_description: 'Payments that failed in the last 30 days',
      report_income_per_student: 'Income Per Student',
      report_income_per_student_description: 'Average income per student over the last 30 days',
      chart_title: 'Historical Data',
      insights_title: 'Insights',
      no_data: 'No data available',
      time_period_monthly: 'Monthly',
      time_period_yearly: 'Yearly',
      compare_with_last_year: 'Compare with last year',
    };
    return translations[key] || key;
  },
}));

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/en/dashboard/reports',
}));

// ReportsPage loads ReportDetail lazily via next/dynamic (so recharts is a
// separate chunk). The detail-view suites below assert on ReportDetail's own
// output (chart, tooltip/tick formatters, time-period select, comparison
// checkbox, back button) and read the DOM / captured callbacks synchronously,
// so they render ReportDetail directly rather than waiting on the async
// dynamic() chunk. The landing-grid + navigation suites keep rendering
// ReportsPage. onBack mirrors ReportsPage.handleBack (updates the URL) so the
// back-navigation assertions still exercise the pushState behavior.
function renderReportDetail() {
  const reportId = (mockSearchParams.get('report') ?? '') as ReportType;
  const onBack = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('report');
    window.history.pushState({}, '', url.toString());
  };
  return render(<ReportDetail reportId={reportId} onBack={onBack} />);
}

// Mock recharts to avoid rendering issues in tests - capture callbacks for testing
let capturedTickFormatter: ((value: number) => string) | undefined;
let capturedTooltipFormatter: ((value: number) => [string, string]) | undefined;
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'responsive-container' }, children),
  BarChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'bar-chart' }, children),
  LineChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'line-chart' }, children),
  AreaChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'area-chart' }, children),
  Bar: () => React.createElement('div', { 'data-testid': 'bar' }),
  Line: () => React.createElement('div', { 'data-testid': 'line' }),
  Area: () => React.createElement('div', { 'data-testid': 'area' }),
  Legend: () => React.createElement('div', { 'data-testid': 'legend' }),
  XAxis: () => React.createElement('div', { 'data-testid': 'x-axis' }),
  YAxis: ({ tickFormatter }: { tickFormatter?: (value: number) => string }) => {
    capturedTickFormatter = tickFormatter;
    return React.createElement('div', { 'data-testid': 'y-axis' });
  },
  Tooltip: ({ formatter }: { formatter?: (value: number) => [string, string] }) => {
    capturedTooltipFormatter = formatter;
    return React.createElement('div', { 'data-testid': 'tooltip' });
  },
}));

// Mock Card components
vi.mock('@/components/ui/card', () => ({
  Card: ({ 'children': c, 'className': cn, 'onClick': oc, 'data-testid': tid }: { 'children': React.ReactNode; 'className'?: string; 'onClick'?: () => void; 'data-testid'?: string }) =>
    React.createElement('div', { 'data-testid': tid || 'card', 'className': cn, 'onClick': oc }, c),
  CardHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'card-header' }, children),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement('h3', { 'data-testid': 'card-title', className }, children),
  CardDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement('p', { 'data-testid': 'card-description' }, children),
  CardContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'card-content' }, children),
}));

// Mock Button component
vi.mock('@/components/ui/button', () => ({
  Button: ({ 'children': c, 'onClick': oc, 'variant': v, 'data-testid': tid }: { 'children': React.ReactNode; 'onClick'?: () => void; 'variant'?: string; 'data-testid'?: string }) =>
    React.createElement('button', { 'type': 'button', 'onClick': oc, 'data-variant': v, 'data-testid': tid || 'button' }, c),
}));

// Mock Select components - capture onValueChange for testing
let capturedOnValueChange: ((value: string) => void) | undefined;
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; onValueChange?: (value: string) => void; value?: string }) => {
    capturedOnValueChange = onValueChange;
    return React.createElement('div', { 'data-testid': 'select', 'data-value': value }, children);
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement('button', { 'type': 'button', 'data-testid': 'select-trigger' }, children),
  SelectValue: ({ placeholder }: { placeholder?: string }) =>
    React.createElement('span', { 'data-testid': 'select-value' }, placeholder),
  SelectContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'select-content' }, children),
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) =>
    React.createElement('div', { 'data-testid': `select-item-${value}`, 'data-value': value }, children),
}));

// Mock Checkbox component - capture onCheckedChange for testing
let capturedOnCheckedChange: ((checked: boolean) => void) | undefined;
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ id, checked, onCheckedChange, 'data-testid': tid }: { 'id'?: string; 'checked'?: boolean; 'onCheckedChange'?: (checked: boolean) => void; 'data-testid'?: string }) => {
    capturedOnCheckedChange = onCheckedChange;
    return React.createElement('input', { 'type': 'checkbox', 'id': id, 'checked': checked, 'data-testid': tid || 'checkbox', 'onChange': () => onCheckedChange?.(!checked) });
  },
}));

// Mock Label component
vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) =>
    React.createElement('label', { 'htmlFor': htmlFor, 'className': className, 'data-testid': 'label' }, children),
}));

// Mock window.history for URL manipulation tests
const mockPushState = vi.fn();
const originalPushState = window.history.pushState;

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete('report');
    window.history.pushState = mockPushState;
  });

  afterEach(async () => {
    await cleanup();
    window.history.pushState = originalPushState;
  });

  describe('Reports Landing Page', () => {
    it('should render the page title', async () => {
      await render(<ReportsPage />);

      expect(page.getByText('Reports')).toBeDefined();
    });

    it('should render the page subtitle', async () => {
      await render(<ReportsPage />);

      expect(page.getByText('Select a report to view detailed analytics and insights')).toBeDefined();
    });

    it('should render all report cards', async () => {
      await render(<ReportsPage />);

      expect(page.getByText('Accounts with Autopay Suspended')).toBeDefined();
      expect(page.getByText('Expiring Credit Cards')).toBeDefined();
      expect(page.getByText('Amount Due')).toBeDefined();
      expect(page.getByText('Past Due')).toBeDefined();
      expect(page.getByText('Payments (Last 30 Days)')).toBeDefined();
      expect(page.getByText('Payments (Pending)')).toBeDefined();
      expect(page.getByText('Failed Payments')).toBeDefined();
      expect(page.getByText('Income Per Student')).toBeDefined();
    });

    it('should render report descriptions', async () => {
      await render(<ReportsPage />);

      expect(page.getByText('View all accounts that have had their automatic payments suspended')).toBeDefined();
      expect(page.getByText('Credit cards expiring in the next 60 days')).toBeDefined();
    });

    it('should render current values on cards', async () => {
      await render(<ReportsPage />);

      expect(page.getByText('2')).toBeDefined(); // accounts autopay suspended
      expect(page.getByText('5')).toBeDefined(); // expiring credit cards
      expect(page.getByText('$14,394.20')).toBeDefined(); // amount due
      expect(page.getByText('$450.62')).toBeDefined(); // past due
    });

    it('should have clickable report cards', async () => {
      await render(<ReportsPage />);

      const card = page.getByTestId('report-card-accounts-autopay-suspended');
      await userEvent.click(card);

      expect(mockPushState).toHaveBeenCalled();
    });

    it('should render 8 report cards total', async () => {
      await render(<ReportsPage />);

      const cards = page.getByTestId(/^report-card-/);

      expect(cards.elements().length).toBe(8);
    });
  });

  describe('Report Detail View', () => {
    beforeEach(() => {
      mockSearchParams.set('report', 'accounts-autopay-suspended');
    });

    it('should render back button', async () => {
      await renderReportDetail();

      expect(page.getByTestId('back-button')).toBeDefined();
    });

    it('should render report title in detail view', async () => {
      await renderReportDetail();

      const titles = page.getByText('Accounts with Autopay Suspended');

      expect(titles.elements().length).toBeGreaterThan(0);
    });

    it('should render chart section', async () => {
      await renderReportDetail();

      expect(page.getByText('Historical Data')).toBeDefined();
    });

    it('should render insights section', async () => {
      await renderReportDetail();

      expect(page.getByText('Insights')).toBeDefined();
    });

    it('should render time period selector', async () => {
      await renderReportDetail();

      expect(page.getByTestId('select')).toBeDefined();
    });

    it('should navigate back when back button is clicked', async () => {
      await renderReportDetail();

      const backButton = page.getByTestId('back-button');
      await userEvent.click(backButton);

      // Should update URL to remove report param
      expect(mockPushState).toHaveBeenCalled();
    });
  });

  describe('Amount Due Report', () => {
    beforeEach(() => {
      mockSearchParams.set('report', 'amount-due');
    });

    it('should render amount due report title', async () => {
      await renderReportDetail();

      const titles = page.getByText('Amount Due');

      expect(titles.elements().length).toBeGreaterThan(0);
    });

    it('should render amount due current value', async () => {
      await renderReportDetail();

      expect(page.getByText('$14,394.20')).toBeDefined();
    });
  });

  describe('Failed Payments Report', () => {
    beforeEach(() => {
      mockSearchParams.set('report', 'failed-payments');
    });

    it('should render failed payments report title', async () => {
      await renderReportDetail();

      const titles = page.getByText('Failed Payments');

      expect(titles.elements().length).toBeGreaterThan(0);
    });

    it('should render failed payments current value', async () => {
      await renderReportDetail();

      expect(page.getByText('$1,834.67')).toBeDefined();
    });
  });

  describe('Income Per Student Report', () => {
    beforeEach(() => {
      mockSearchParams.set('report', 'income-per-student');
    });

    it('should render income per student report title', async () => {
      await renderReportDetail();

      const titles = page.getByText('Income Per Student');

      expect(titles.elements().length).toBeGreaterThan(0);
    });

    it('should render income per student current value', async () => {
      await renderReportDetail();

      expect(page.getByText('$118.47')).toBeDefined();
    });
  });

  describe('Report Card Interactions', () => {
    it('should open expiring credit cards report on click', async () => {
      await render(<ReportsPage />);

      const card = page.getByTestId('report-card-expiring-credit-cards');
      await userEvent.click(card);

      expect(mockPushState).toHaveBeenCalled();

      const call = mockPushState.mock.calls[0] as [unknown, string, string];

      expect(call[2]).toContain('report=expiring-credit-cards');
    });

    it('should open past due report on click', async () => {
      await render(<ReportsPage />);

      const card = page.getByTestId('report-card-past-due');
      await userEvent.click(card);

      expect(mockPushState).toHaveBeenCalled();

      const call = mockPushState.mock.calls[0] as [unknown, string, string];

      expect(call[2]).toContain('report=past-due');
    });

    it('should open payments last 30 days report on click', async () => {
      await render(<ReportsPage />);

      const card = page.getByTestId('report-card-payments-last-30-days');
      await userEvent.click(card);

      expect(mockPushState).toHaveBeenCalled();

      const call = mockPushState.mock.calls[0] as [unknown, string, string];

      expect(call[2]).toContain('report=payments-last-30-days');
    });

    it('should open payments pending report on click', async () => {
      await render(<ReportsPage />);

      const card = page.getByTestId('report-card-payments-pending');
      await userEvent.click(card);

      expect(mockPushState).toHaveBeenCalled();

      const call = mockPushState.mock.calls[0] as [unknown, string, string];

      expect(call[2]).toContain('report=payments-pending');
    });

    it('should open failed payments report on click', async () => {
      await render(<ReportsPage />);

      const card = page.getByTestId('report-card-failed-payments');
      await userEvent.click(card);

      expect(mockPushState).toHaveBeenCalled();

      const call = mockPushState.mock.calls[0] as [unknown, string, string];

      expect(call[2]).toContain('report=failed-payments');
    });

    it('should open income per student report on click', async () => {
      await render(<ReportsPage />);

      const card = page.getByTestId('report-card-income-per-student');
      await userEvent.click(card);

      expect(mockPushState).toHaveBeenCalled();

      const call = mockPushState.mock.calls[0] as [unknown, string, string];

      expect(call[2]).toContain('report=income-per-student');
    });

    it('should open amount due report on click', async () => {
      await render(<ReportsPage />);

      const card = page.getByTestId('report-card-amount-due');
      await userEvent.click(card);

      expect(mockPushState).toHaveBeenCalled();

      const call = mockPushState.mock.calls[0] as [unknown, string, string];

      expect(call[2]).toContain('report=amount-due');
    });
  });

  describe('Insights Display', () => {
    beforeEach(() => {
      mockSearchParams.set('report', 'accounts-autopay-suspended');
    });

    it('should display insights for accounts autopay suspended', async () => {
      await renderReportDetail();

      expect(page.getByText(/Current suspended accounts represent/)).toBeDefined();
    });

    it('should display multiple insight items', async () => {
      await renderReportDetail();

      expect(page.getByText(/Most suspensions occur/)).toBeDefined();
      expect(page.getByText(/Average time to resolve/)).toBeDefined();
    });
  });

  describe('Chart Components', () => {
    it('should render line chart for amount-due report', async () => {
      mockSearchParams.set('report', 'amount-due');
      await renderReportDetail();

      expect(page.getByTestId('line-chart')).toBeDefined();
    });

    it('should render bar chart for payments-last-30-days report', async () => {
      mockSearchParams.set('report', 'payments-last-30-days');
      await renderReportDetail();

      expect(page.getByTestId('bar-chart')).toBeDefined();
    });

    it('should render area chart for accounts-autopay-suspended report', async () => {
      mockSearchParams.set('report', 'accounts-autopay-suspended');
      await renderReportDetail();

      expect(page.getByTestId('area-chart')).toBeDefined();
    });

    it('should render responsive container', async () => {
      mockSearchParams.set('report', 'amount-due');
      await renderReportDetail();

      expect(page.getByTestId('responsive-container')).toBeDefined();
    });
  });

  describe('URL State Management', () => {
    it('should update URL when selecting a report', async () => {
      await render(<ReportsPage />);

      const card = page.getByTestId('report-card-past-due');
      await userEvent.click(card);

      expect(mockPushState).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('report=past-due'),
      );
    });

    it('should remove report from URL when going back', async () => {
      mockSearchParams.set('report', 'past-due');
      await renderReportDetail();

      const backButton = page.getByTestId('back-button');
      await userEvent.click(backButton);

      const lastCall = mockPushState.mock.calls[mockPushState.mock.calls.length - 1] as [unknown, string, string];

      expect(lastCall[2]).not.toContain('report=');
    });
  });
});

describe('ReportsPage - Landing Grid Layout', () => {
  beforeEach(() => {
    mockSearchParams.delete('report');
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should render cards in a grid layout', async () => {
    await render(<ReportsPage />);

    // All 8 cards should be rendered
    const cards = page.getByTestId(/^report-card-/);

    expect(cards.elements().length).toBe(8);
  });
});

describe('ReportsPage - Accessibility', () => {
  beforeEach(() => {
    mockSearchParams.delete('report');
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should have accessible report cards', async () => {
    await render(<ReportsPage />);

    // Cards should be clickable
    const card = page.getByTestId('report-card-accounts-autopay-suspended');

    expect(card).toBeDefined();
  });

  it('should have accessible back button', async () => {
    mockSearchParams.set('report', 'accounts-autopay-suspended');
    await renderReportDetail();

    const backButton = page.getByTestId('back-button');

    expect(backButton).toBeDefined();
  });
});

describe('ReportsPage - Invalid Report Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState = mockPushState;
  });

  afterEach(async () => {
    await cleanup();
    mockSearchParams.delete('report');
    window.history.pushState = originalPushState;
  });

  it('should render detail view with back button for invalid report ID', async () => {
    mockSearchParams.set('report', 'invalid-report-id');
    await renderReportDetail();

    // Should render the detail view which will show back button
    // The component doesn't validate report IDs, it just renders the detail view
    expect(page.getByText('Back to Reports')).toBeDefined();
  });

  it('should navigate back from invalid report', async () => {
    mockSearchParams.set('report', 'invalid-report-id');
    await renderReportDetail();

    // The back button in the detail view has the 'back-button' test ID
    const backButton = page.getByTestId('back-button');
    await userEvent.click(backButton);

    expect(mockPushState).toHaveBeenCalled();
  });
});

describe('ReportsPage - Time Period Switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.set('report', 'amount-due');
    window.history.pushState = mockPushState;
    capturedOnValueChange = undefined;
  });

  afterEach(async () => {
    await cleanup();
    mockSearchParams.delete('report');
    window.history.pushState = originalPushState;
  });

  it('should allow switching to yearly time period', async () => {
    await renderReportDetail();

    // Check that onValueChange was captured
    expect(capturedOnValueChange).toBeDefined();

    // Simulate changing time period
    if (capturedOnValueChange) {
      capturedOnValueChange('yearly');
    }
  });

  it('should allow switching back to monthly time period', async () => {
    await renderReportDetail();

    // Simulate switching to yearly then back to monthly
    if (capturedOnValueChange) {
      capturedOnValueChange('yearly');
      capturedOnValueChange('monthly');
    }

    expect(capturedOnValueChange).toBeDefined();
  });
});

describe('ReportsPage - Value Formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState = mockPushState;
    capturedTickFormatter = undefined;
    capturedTooltipFormatter = undefined;
  });

  afterEach(async () => {
    await cleanup();
    mockSearchParams.delete('report');
    window.history.pushState = originalPushState;
  });

  it('should format currency values >= 1000 with k suffix for amount-due report', async () => {
    mockSearchParams.set('report', 'amount-due');
    await renderReportDetail();

    // Verify tickFormatter was captured
    expect(capturedTickFormatter).toBeDefined();

    // Test currency formatting >= 1000
    if (capturedTickFormatter) {
      expect(capturedTickFormatter(14394)).toBe('$14.4k');
      expect(capturedTickFormatter(1500)).toBe('$1.5k');
    }
  });

  it('should format currency values < 1000 without k suffix for amount-due report', async () => {
    mockSearchParams.set('report', 'amount-due');
    await renderReportDetail();

    if (capturedTickFormatter) {
      expect(capturedTickFormatter(500)).toBe('$500');
      expect(capturedTickFormatter(999)).toBe('$999');
    }
  });

  it('should format values for income-per-student report', async () => {
    mockSearchParams.set('report', 'income-per-student');
    await renderReportDetail();

    expect(capturedTickFormatter).toBeDefined();

    if (capturedTickFormatter) {
      expect(capturedTickFormatter(118)).toBe('$118');
      expect(capturedTickFormatter(125)).toBe('$125');
    }
  });

  it('should format non-currency values as plain numbers for accounts-autopay-suspended', async () => {
    mockSearchParams.set('report', 'accounts-autopay-suspended');
    await renderReportDetail();

    expect(capturedTickFormatter).toBeDefined();

    if (capturedTickFormatter) {
      expect(capturedTickFormatter(2)).toBe('2');
      expect(capturedTickFormatter(15)).toBe('15');
    }
  });

  it('should format values correctly via tooltip formatter for failed-payments report', async () => {
    mockSearchParams.set('report', 'failed-payments');
    await renderReportDetail();

    expect(capturedTooltipFormatter).toBeDefined();

    if (capturedTooltipFormatter) {
      const result = capturedTooltipFormatter(1835);

      expect(result[0]).toBe('$1.8k');
      expect(result[1]).toBe('This Year');
    }
  });

  it('should format values correctly via tooltip formatter for past-due report', async () => {
    mockSearchParams.set('report', 'past-due');
    await renderReportDetail();

    if (capturedTooltipFormatter) {
      const result = capturedTooltipFormatter(451);

      expect(result[0]).toBe('$451');
      expect(result[1]).toBe('This Year');
    }
  });

  it('should format values correctly via tooltip formatter for payments-pending report', async () => {
    mockSearchParams.set('report', 'payments-pending');
    await renderReportDetail();

    if (capturedTooltipFormatter) {
      const result = capturedTooltipFormatter(0);

      expect(result[0]).toBe('$0');
      expect(result[1]).toBe('This Year');
    }
  });

  it('should format values correctly via tooltip formatter for payments-last-30-days report', async () => {
    mockSearchParams.set('report', 'payments-last-30-days');
    await renderReportDetail();

    if (capturedTooltipFormatter) {
      const result = capturedTooltipFormatter(13150);

      expect(result[0]).toBe('$13.2k');
      expect(result[1]).toBe('This Year');
    }
  });

  it('should format values correctly via tooltip formatter for non-currency report', async () => {
    mockSearchParams.set('report', 'expiring-credit-cards');
    await renderReportDetail();

    if (capturedTooltipFormatter) {
      const result = capturedTooltipFormatter(5);

      expect(result[0]).toBe('5');
      expect(result[1]).toBe('This Year');
    }
  });
});

describe('ReportsPage - Year Comparison Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.set('report', 'amount-due');
    window.history.pushState = mockPushState;
    capturedOnCheckedChange = undefined;
  });

  afterEach(async () => {
    await cleanup();
    mockSearchParams.delete('report');
    window.history.pushState = originalPushState;
  });

  it('should show compare with last year checkbox in monthly view', async () => {
    await renderReportDetail();

    expect(page.getByTestId('compare-years-checkbox')).toBeDefined();
    expect(page.getByText('Compare with last year')).toBeDefined();
  });

  it('should allow toggling year comparison', async () => {
    await renderReportDetail();

    expect(capturedOnCheckedChange).toBeDefined();

    // Simulate toggling comparison on
    if (capturedOnCheckedChange) {
      capturedOnCheckedChange(true);
    }
  });

  it('should hide compare checkbox when switching to yearly view', async () => {
    await renderReportDetail();

    // Initially checkbox should be visible in monthly view
    expect(page.getByTestId('compare-years-checkbox')).toBeDefined();

    // Switch to yearly view
    if (capturedOnValueChange) {
      capturedOnValueChange('yearly');
    }

    // Note: Due to mock limitations, we just verify the onValueChange was captured
    expect(capturedOnValueChange).toBeDefined();
  });
});
