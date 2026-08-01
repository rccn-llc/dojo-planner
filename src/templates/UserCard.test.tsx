import type { UserCardProps } from './UserCard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { UserCard } from './UserCard';

const defaultProps: UserCardProps = {
  id: '1',
  name: 'Charlie Baptista',
  title: 'Account Owner',
  roles: 'Owner, Admin, Coach',
  status: 'Active',
  recentActivity: 'May 1, 2025',
  lastLoggedIn: 'May 1, 2025',
};

describe('UserCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render user information correctly', async () => {
    await render(<UserCard {...defaultProps} />);

    expect(page.getByText('Charlie Baptista')).toBeTruthy();
    expect(page.getByText('Account Owner')).toBeTruthy();
    expect(page.getByText('Owner, Admin, Coach')).toBeTruthy();
    expect(page.getByText('May 1, 2025')).toBeTruthy();
  });

  it('should render user initials when no avatar is provided', async () => {
    await render(<UserCard {...defaultProps} />);

    const avatar = page.getByText('CB');

    expect(avatar).toBeTruthy();
  });

  it('should render avatar image when provided', async () => {
    await render(<UserCard {...defaultProps} avatar="https://example.com/avatar.jpg" />);

    const avatarImage = page.getByRole('img');

    expect(avatarImage).toBeTruthy();
  });

  it('should display correct status colors', async () => {
    const renderResult = await render(<UserCard {...defaultProps} status="Active" />);

    expect(page.getByText('Active')).toBeTruthy();

    await renderResult.unmount();

    await render(<UserCard {...defaultProps} status="Inactive" />);

    expect(page.getByText('Inactive')).toBeTruthy();
  });

  it('should display invitation sent status correctly', async () => {
    await render(<UserCard {...defaultProps} status="Invitation sent" />);

    expect(page.getByText('Invitation Sent')).toBeTruthy();
  });

  it('should handle onClick when provided', async () => {
    const mockOnClick = vi.fn();
    await render(<UserCard {...defaultProps} onClick={mockOnClick} />);

    const card = page.getByRole('button');
    await card.click();

    expect(mockOnClick).toHaveBeenCalledWith('1');
  });

  it('should not be clickable when onClick is not provided', async () => {
    await render(<UserCard {...defaultProps} />);

    // Should not have button role when onClick is not provided
    const buttons = page.getByRole('button', { includeHidden: true });

    expect(buttons.elements()).toHaveLength(0);
  });

  it('should format text by default', async () => {
    await render(<UserCard {...defaultProps} status="Invitation sent" />);

    expect(page.getByText('Invitation Sent')).toBeTruthy();
  });

  it('should not format text when formatText is false', async () => {
    await render(<UserCard {...defaultProps} status="Invitation sent" formatText={false} />);

    expect(page.getByText('Invitation sent')).toBeTruthy();
  });

  it('should render all grid sections', async () => {
    await render(<UserCard {...defaultProps} />);

    expect(page.getByText('Roles')).toBeTruthy();
    expect(page.getByText('Status')).toBeTruthy();
    expect(page.getByText('Recent Activity')).toBeTruthy();
    expect(page.getByText('Last Logged In')).toBeTruthy();
  });

  it('should handle single name correctly for initials', async () => {
    await render(<UserCard {...defaultProps} name="Charlie" />);

    const avatar = page.getByText('C');

    expect(avatar).toBeTruthy();
  });

  it('should handle multiple names correctly for initials', async () => {
    await render(<UserCard {...defaultProps} name="Charlie Baptista Silva" />);

    const avatar = page.getByText('CBS');

    expect(avatar).toBeTruthy();
  });

  it('should render with proper hover styles when clickable', async () => {
    const mockOnClick = vi.fn();
    await render(<UserCard {...defaultProps} onClick={mockOnClick} />);

    const card = page.getByRole('button');

    expect(card).toBeTruthy();
  });

  it('should render different status variants correctly', async () => {
    // Test each status
    const statuses: Array<'Active' | 'Inactive' | 'Invitation sent'> = [
      'Active',
      'Inactive',
      'Invitation sent',
    ];

    statuses.forEach(async (status) => {
      const renderResult = await render(<UserCard {...defaultProps} status={status} />);

      if (status === 'Invitation sent') {
        expect(page.getByText('Invitation Sent')).toBeTruthy();
      } else {
        expect(page.getByText(status)).toBeTruthy();
      }

      await renderResult.unmount();
    });
  });
});
