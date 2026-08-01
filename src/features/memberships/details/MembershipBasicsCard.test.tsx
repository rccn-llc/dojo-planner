import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MembershipBasicsCard } from './MembershipBasicsCard';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Membership Basics',
  edit_button: 'Edit',
  name_label: 'Name',
  status_label: 'Status',
  status_active: 'Active',
  status_inactive: 'Inactive',
  type_label: 'Type',
  type_standard: 'Standard',
  type_trial: 'Trial',
  description_label: 'Description',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translationKeys[key] || key,
}));

describe('MembershipBasicsCard', () => {
  const mockOnEdit = vi.fn();

  const defaultProps = {
    membershipName: '12 Month Commitment (Gold)',
    status: 'active' as const,
    membershipType: 'standard' as const,
    description: 'Our most popular membership option',
    onEdit: mockOnEdit,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the card with title', async () => {
    await render(<MembershipBasicsCard {...defaultProps} />);

    const heading = page.getByText('Membership Basics');

    expect(heading).toBeTruthy();
  });

  it('should render the membership name', async () => {
    await render(<MembershipBasicsCard {...defaultProps} />);

    const name = page.getByText('12 Month Commitment (Gold)');

    expect(name).toBeTruthy();
  });

  it('should render the description', async () => {
    await render(<MembershipBasicsCard {...defaultProps} />);

    const description = page.getByText('Our most popular membership option');

    expect(description).toBeTruthy();
  });

  it('should render Active status badge for active membership', async () => {
    await render(<MembershipBasicsCard {...defaultProps} />);

    const statusBadge = page.getByText('Active');

    expect(statusBadge).toBeTruthy();
  });

  it('should render Inactive status badge for inactive membership', async () => {
    await render(<MembershipBasicsCard {...defaultProps} status="inactive" />);

    const statusBadge = page.getByText('Inactive');

    expect(statusBadge).toBeTruthy();
  });

  it('should render Standard type badge for standard membership', async () => {
    await render(<MembershipBasicsCard {...defaultProps} />);

    const typeBadge = page.getByText('Standard');

    expect(typeBadge).toBeTruthy();
  });

  it('should render Trial type badge for trial membership', async () => {
    await render(<MembershipBasicsCard {...defaultProps} membershipType="trial" />);

    const typeBadge = page.getByText('Trial');

    expect(typeBadge).toBeTruthy();
  });

  it('should render Edit button', async () => {
    await render(<MembershipBasicsCard {...defaultProps} />);

    const editButton = page.getByRole('button');

    expect(editButton).toBeTruthy();
  });

  it('should call onEdit when Edit button is clicked', async () => {
    await render(<MembershipBasicsCard {...defaultProps} />);

    const editButton = page.getByRole('button');
    await userEvent.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledTimes(1);
  });

  it('should render all field labels', async () => {
    await render(<MembershipBasicsCard {...defaultProps} />);

    const nameLabel = page.getByText('Name');
    const statusLabel = page.getByText('Status');
    const typeLabel = page.getByText('Type');
    const descriptionLabel = page.getByText('Description');

    expect(nameLabel).toBeTruthy();
    expect(statusLabel).toBeTruthy();
    expect(typeLabel).toBeTruthy();
    expect(descriptionLabel).toBeTruthy();
  });
});
