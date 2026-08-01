import type { MemberCardProps } from './MemberCard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { MemberCard } from './MemberCard';

const defaultProps: MemberCardProps = {
  id: '1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phone: '+1234567890',
  dateOfBirth: new Date('1990-01-15'),
  photoUrl: null,
  lastAccessedAt: new Date('2025-05-01'),
  status: 'Active',
  membershipType: 'monthly',
  amountDue: '$99.00',
  nextPayment: new Date('2025-06-01'),
};

describe('MemberCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render member information correctly', async () => {
    await render(<MemberCard {...defaultProps} />);

    expect(page.getByText('John Doe')).toBeTruthy();
    expect(page.getByText('john.doe@example.com')).toBeTruthy();
    expect(page.getByText('$99.00')).toBeTruthy();
  });

  it('should render member initials when no avatar is provided', async () => {
    await render(<MemberCard {...defaultProps} />);

    const avatar = page.getByText('JD');

    expect(avatar).toBeTruthy();
  });

  it('should render avatar image when provided', async () => {
    await render(<MemberCard {...defaultProps} photoUrl="https://example.com/avatar.jpg" />);

    const avatarImage = page.getByRole('img');

    expect(avatarImage).toBeTruthy();
  });

  it('should handle null names for initials', async () => {
    await render(<MemberCard {...defaultProps} firstName={null} lastName={null} />);

    const avatar = page.getByText('?');

    expect(avatar).toBeTruthy();
  });

  it('should handle single name for initials', async () => {
    await render(<MemberCard {...defaultProps} firstName="John" lastName={null} />);

    const avatar = page.getByText('J');

    expect(avatar).toBeTruthy();
  });

  it('should display membership type badge correctly', async () => {
    await render(<MemberCard {...defaultProps} membershipType="annual" />);

    expect(page.getByText('Annual')).toBeTruthy();
  });

  it('should display free trial membership correctly', async () => {
    await render(<MemberCard {...defaultProps} membershipType="free-trial" />);

    expect(page.getByText('Free Trial')).toBeTruthy();
  });

  it('should handle missing membership type', async () => {
    await render(<MemberCard {...defaultProps} membershipType={undefined} />);

    // Should still render other content
    expect(page.getByText('John Doe')).toBeTruthy();
  });

  it('should handle onClick when provided', async () => {
    const mockOnClick = vi.fn();
    await render(<MemberCard {...defaultProps} onClick={mockOnClick} />);

    const card = page.getByRole('button');
    await card.click();

    expect(mockOnClick).toHaveBeenCalledWith('1');
  });

  it('should not be clickable when onClick is not provided', async () => {
    await render(<MemberCard {...defaultProps} />);

    // Should not have button role when onClick is not provided
    const buttons = page.getByRole('button', { includeHidden: true });

    expect(buttons.elements()).toHaveLength(0);
  });

  it('should format text by default', async () => {
    await render(<MemberCard {...defaultProps} membershipType="free-trial" />);

    expect(page.getByText('Free Trial')).toBeTruthy();
  });

  it('should not format text when formatText is false', async () => {
    await render(<MemberCard {...defaultProps} membershipType="free-trial" formatText={false} />);

    expect(page.getByText('free-trial')).toBeTruthy();
  });

  it('should render custom labels', async () => {
    const customLabels = {
      membership: 'Plan Type',
      amountDue: 'Balance',
      nextPayment: 'Due Date',
      lastVisited: 'Last Seen',
    };

    await render(<MemberCard {...defaultProps} labels={customLabels} />);

    expect(page.getByText('Plan Type')).toBeTruthy();
    expect(page.getByText('Balance')).toBeTruthy();
    expect(page.getByText('Due Date')).toBeTruthy();
    expect(page.getByText('Last Seen')).toBeTruthy();
  });

  it('should use custom formatters when provided', async () => {
    const customFormatters = {
      currency: (amount: string) => `€${amount.replace('$', '')}`,
      date: (date: Date | null) => date ? 'Custom Date' : 'No Date',
      membershipType: (type: string) => `Premium ${type}`,
      status: (status: string) => `Status: ${status}`,
    };

    await render(
      <MemberCard
        {...defaultProps}
        formatters={customFormatters}
      />,
    );

    expect(page.getByText('€99.00')).toBeTruthy();
    expect(page.getByText('Custom Date')).toBeTruthy();
    expect(page.getByText('Premium monthly')).toBeTruthy();
    expect(page.getByText('Status: Active')).toBeTruthy();
  });

  it('should handle null dates correctly', async () => {
    await render(
      <MemberCard
        {...defaultProps}
        nextPayment={null}
        lastAccessedAt={null}
      />,
    );

    expect(page.getByText('Never')).toBeTruthy();
  });

  it('should display status badge with correct variant', async () => {
    await render(<MemberCard {...defaultProps} status="Active" />);

    expect(page.getByText('Active')).toBeTruthy();
  });

  it('should handle different membership types correctly', async () => {
    const membershipTypes: Array<'free' | 'free-trial' | 'monthly' | 'annual'> = [
      'free',
      'free-trial',
      'monthly',
      'annual',
    ];

    membershipTypes.forEach(async (type) => {
      const renderResult = await render(<MemberCard {...defaultProps} membershipType={type} />);

      const expectedText = type === 'free-trial'
        ? 'Free Trial'
        : type.charAt(0).toUpperCase() + type.slice(1);

      expect(page.getByText(expectedText)).toBeTruthy();

      await renderResult.unmount();
    });
  });

  it('should render all grid sections', async () => {
    await render(<MemberCard {...defaultProps} />);

    expect(page.getByText('Membership')).toBeTruthy();
    expect(page.getByText('Amount Due')).toBeTruthy();
    expect(page.getByText('Next Payment')).toBeTruthy();
    expect(page.getByText('Last Visited')).toBeTruthy();
  });

  it('should handle missing amount due', async () => {
    await render(<MemberCard {...defaultProps} amountDue={undefined} />);

    expect(page.getByText('$0.00')).toBeTruthy();
  });
});
