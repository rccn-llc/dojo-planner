import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { MembershipStatsCard } from './MembershipStatsCard';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  price_label: 'Price',
  active_members: 'Active Members',
  active_trials: 'Active Trials',
  revenue_label: 'Revenue',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translationKeys[key] || key,
}));

describe('MembershipStatsCard', () => {
  const defaultProps = {
    activeCount: 89,
    revenue: '$13,350/mo revenue',
    isTrial: false,
    price: '$150.00/mo',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the price', async () => {
    await render(<MembershipStatsCard {...defaultProps} />);

    const price = page.getByText('$150.00/mo');

    expect(price).toBeTruthy();
  });

  it('should render the price label', async () => {
    await render(<MembershipStatsCard {...defaultProps} />);

    const priceLabel = page.getByText('Price');

    expect(priceLabel).toBeTruthy();
  });

  it('should render the active count', async () => {
    await render(<MembershipStatsCard {...defaultProps} />);

    const activeCount = page.getByText('89');

    expect(activeCount).toBeTruthy();
  });

  it('should render Active Members label for standard membership', async () => {
    await render(<MembershipStatsCard {...defaultProps} />);

    const activeLabel = page.getByText('Active Members');

    expect(activeLabel).toBeTruthy();
  });

  it('should render Active Trials label for trial membership', async () => {
    await render(<MembershipStatsCard {...defaultProps} isTrial={true} />);

    const activeLabel = page.getByText('Active Trials');

    expect(activeLabel).toBeTruthy();
  });

  it('should render the revenue', async () => {
    await render(<MembershipStatsCard {...defaultProps} />);

    const revenue = page.getByText('$13,350/mo revenue');

    expect(revenue).toBeTruthy();
  });

  it('should render the revenue label', async () => {
    await render(<MembershipStatsCard {...defaultProps} />);

    const revenueLabel = page.getByText('Revenue');

    expect(revenueLabel).toBeTruthy();
  });

  it('should render Free price correctly', async () => {
    await render(<MembershipStatsCard {...defaultProps} price="Free" />);

    const price = page.getByText('Free');

    expect(price).toBeTruthy();
  });

  it('should render zero active count correctly', async () => {
    await render(<MembershipStatsCard {...defaultProps} activeCount={0} />);

    const activeCount = page.getByText('0');

    expect(activeCount).toBeTruthy();
  });
});
