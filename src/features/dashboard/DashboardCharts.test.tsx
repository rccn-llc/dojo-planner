import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import DashboardCharts from './DashboardCharts';

// Mock recharts to avoid rendering issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      compare_with_last_year: 'Compare with last year',
    };
    return translations[key] || key;
  },
}));

const mockMemberAverageData = {
  monthly: [
    { month: 'Jan', average: 110, previousYearAverage: 95 },
    { month: 'Feb', average: 105, previousYearAverage: 92 },
    { month: 'Mar', average: 115, previousYearAverage: 98 },
  ],
  yearly: [
    { year: '2022', average: 100 },
    { year: '2023', average: 115 },
    { year: '2024', average: 125 },
  ],
};

const mockEarningsData = {
  monthly: [
    { month: 'Jan', earnings: 14000, previousYearEarnings: 12000 },
    { month: 'Feb', earnings: 13000, previousYearEarnings: 11500 },
    { month: 'Mar', earnings: 14500, previousYearEarnings: 12800 },
  ],
  yearly: [
    { year: '2022', earnings: 150000 },
    { year: '2023', earnings: 175000 },
    { year: '2024', earnings: 195000 },
  ],
};

describe('DashboardCharts', () => {
  it('renders Member average chart heading', () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const memberAverageHeading = page.getByRole('heading', { name: /Member average/i });

    expect(memberAverageHeading).toBeInTheDocument();
  });

  it('renders Earnings chart heading', () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const earningsHeading = page.getByRole('heading', { name: /Earnings/i });

    expect(earningsHeading).toBeInTheDocument();
  });

  it('renders time period select for Member average', () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const memberAverageSelect = page.getByRole('combobox', { name: /Select time period for member average/i });

    expect(memberAverageSelect).toBeInTheDocument();
  });

  it('renders time period select for Earnings', () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const earningsSelect = page.getByRole('combobox', { name: /Select time period for earnings/i });

    expect(earningsSelect).toBeInTheDocument();
  });

  it('defaults to Monthly view for Member average', () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const memberAverageSelect = page.getByRole('combobox', { name: /Select time period for member average/i });

    expect(memberAverageSelect).toHaveTextContent('Monthly');
  });

  it('defaults to Monthly view for Earnings', () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const earningsSelect = page.getByRole('combobox', { name: /Select time period for earnings/i });

    expect(earningsSelect).toHaveTextContent('Monthly');
  });

  it('can change Member average to Yearly view', async () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const memberAverageSelect = page.getByRole('combobox', { name: /Select time period for member average/i });
    await userEvent.click(memberAverageSelect.element());

    const yearlyOption = page.getByRole('option', { name: /Yearly/i }).first();
    await userEvent.click(yearlyOption.element());

    expect(memberAverageSelect).toHaveTextContent('Yearly');
  });

  it('can change Earnings to Yearly view', async () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const earningsSelect = page.getByRole('combobox', { name: /Select time period for earnings/i });
    await userEvent.click(earningsSelect.element());

    const yearlyOptions = page.getByRole('option', { name: /Yearly/i });
    await userEvent.click(yearlyOptions.elements()[yearlyOptions.elements().length - 1]!);

    expect(earningsSelect).toHaveTextContent('Yearly');
  });

  it('does not render dead "View details" buttons (#230)', () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    // The charts have no detail view to link to, so the previously-dead
    // "View details" buttons were removed rather than wired to a generic target.
    const viewDetailsButtons = page.getByRole('button', { name: /View details/i });

    expect(viewDetailsButtons.elements().length).toBe(0);
  });

  it('Member average and Earnings selects work independently', async () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const memberAverageSelect = page.getByRole('combobox', { name: /Select time period for member average/i });
    const earningsSelect = page.getByRole('combobox', { name: /Select time period for earnings/i });

    // Change Member average to Yearly
    await userEvent.click(memberAverageSelect.element());
    const memberYearlyOption = page.getByRole('option', { name: /Yearly/i }).first();
    await userEvent.click(memberYearlyOption.element());

    // Verify Member average is Yearly but Earnings is still Monthly
    expect(memberAverageSelect).toHaveTextContent('Yearly');
    expect(earningsSelect).toHaveTextContent('Monthly');
  });

  it('renders comparison checkbox for Member average when in monthly view', () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const checkboxes = page.getByRole('checkbox');

    // Should have at least 2 checkboxes (one for member average, one for earnings)
    expect(checkboxes.elements().length).toBeGreaterThanOrEqual(2);
  });

  it('renders comparison checkbox for Earnings when in monthly view', () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const checkboxes = page.getByRole('checkbox');

    // Should have 2 checkboxes total (one for each chart)
    expect(checkboxes.elements().length).toBe(2);
  });

  it('comparison checkbox toggles on click', async () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const checkboxes = page.getByRole('checkbox');
    const memberComparisonCheckbox = checkboxes.first();

    expect(memberComparisonCheckbox.element()).not.toBeChecked();

    await userEvent.click(memberComparisonCheckbox.element());

    expect(memberComparisonCheckbox.element()).toBeChecked();
  });

  it('comparison checkbox is hidden when switching to yearly view', async () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    // Initially should have 2 checkboxes
    const initialCheckboxes = page.getByRole('checkbox');

    expect(initialCheckboxes.elements().length).toBe(2);

    const memberAverageSelect = page.getByRole('combobox', { name: /Select time period for member average/i });
    await userEvent.click(memberAverageSelect.element());
    const memberYearlyOption = page.getByRole('option', { name: /Yearly/i }).first();
    await userEvent.click(memberYearlyOption.element());

    // After switching to yearly, should only have 1 checkbox (for earnings)
    const remainingCheckboxes = page.getByRole('checkbox');

    expect(remainingCheckboxes.elements().length).toBe(1);
  });

  it('displays compare with last year label text', () => {
    render(
      <DashboardCharts
        memberAverageData={mockMemberAverageData}
        earningsData={mockEarningsData}
      />,
    );

    const comparisonLabel = page.getByText(/Compare with last year/i);

    expect(comparisonLabel.first()).toBeInTheDocument();
  });
});
