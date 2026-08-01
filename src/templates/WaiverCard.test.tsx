import type { WaiverCardProps } from './WaiverCard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { WaiverCard } from './WaiverCard';

// Mock next-intl
const translationKeys: Record<string, string> = {
  status_active: 'Active',
  status_inactive: 'Inactive',
  status_draft: 'Draft',
  default_badge: 'Default',
  version_label: 'Version',
  last_updated_label: 'Last Updated',
  signed_count_label: 'Signed',
  membership_count_label: 'Memberships',
  edit_button_aria_label: 'Edit waiver',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === 'guardian_required_badge' && params) {
      return `Guardian required (under ${params.age})`;
    }
    return translationKeys[key] || key;
  },
}));

const defaultProps: WaiverCardProps = {
  id: 'waiver-1',
  name: 'Standard Liability Waiver',
  description: 'A standard waiver for all members participating in martial arts training.',
  status: 'Active',
  version: 3,
  isDefault: true,
  requiresGuardian: true,
  guardianAgeThreshold: 18,
  signedCount: 42,
  membershipCount: 5,
  lastUpdated: '2025-12-01',
  onEdit: vi.fn(),
};

describe('WaiverCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render all props correctly', async () => {
    await render(<WaiverCard {...defaultProps} />);

    expect(page.getByText('Standard Liability Waiver')).toBeTruthy();
    expect(page.getByText('A standard waiver for all members participating in martial arts training.')).toBeTruthy();
    expect(page.getByText('v3')).toBeTruthy();
    expect(page.getByText('42')).toBeTruthy();
    expect(page.getByText('5')).toBeTruthy();
    expect(page.getByText('2025-12-01')).toBeTruthy();
  });

  it('should render Active status badge', async () => {
    await render(<WaiverCard {...defaultProps} status="Active" />);

    expect(page.getByText('Active')).toBeTruthy();
  });

  it('should render Inactive status badge', async () => {
    await render(<WaiverCard {...defaultProps} status="Inactive" />);

    expect(page.getByText('Inactive')).toBeTruthy();
  });

  it('should render Draft status badge', async () => {
    await render(<WaiverCard {...defaultProps} status="Draft" />);

    expect(page.getByText('Draft')).toBeTruthy();
  });

  it('should render Default badge when isDefault is true', async () => {
    await render(<WaiverCard {...defaultProps} isDefault={true} />);

    expect(page.getByText('Default')).toBeTruthy();
  });

  it('should not render Default badge when isDefault is false', async () => {
    await render(<WaiverCard {...defaultProps} isDefault={false} />);

    const defaultBadges = page.getByText('Default');

    expect(defaultBadges.elements()).toHaveLength(0);
  });

  it('should render Guardian required badge when requiresGuardian is true', async () => {
    await render(<WaiverCard {...defaultProps} requiresGuardian={true} guardianAgeThreshold={18} />);

    expect(page.getByText('Guardian required (under 18)')).toBeTruthy();
  });

  it('should not render Guardian required badge when requiresGuardian is false', async () => {
    await render(<WaiverCard {...defaultProps} requiresGuardian={false} />);

    const guardianBadges = page.getByText('Guardian required (under 18)');

    expect(guardianBadges.elements()).toHaveLength(0);
  });

  it('should render guardian badge with the correct age threshold', async () => {
    await render(<WaiverCard {...defaultProps} requiresGuardian={true} guardianAgeThreshold={16} />);

    expect(page.getByText('Guardian required (under 16)')).toBeTruthy();
  });

  it('should display version number with v prefix', async () => {
    await render(<WaiverCard {...defaultProps} version={7} />);

    expect(page.getByText('v7')).toBeTruthy();
  });

  it('should display version label', async () => {
    await render(<WaiverCard {...defaultProps} />);

    expect(page.getByText('Version')).toBeTruthy();
  });

  it('should display signed count', async () => {
    await render(<WaiverCard {...defaultProps} signedCount={100} />);

    expect(page.getByText('100')).toBeTruthy();
    expect(page.getByText('Signed')).toBeTruthy();
  });

  it('should display membership count', async () => {
    await render(<WaiverCard {...defaultProps} membershipCount={12} />);

    expect(page.getByText('12')).toBeTruthy();
    expect(page.getByText('Memberships')).toBeTruthy();
  });

  it('should display last updated date', async () => {
    await render(<WaiverCard {...defaultProps} lastUpdated="2026-01-15" />);

    expect(page.getByText('Last Updated')).toBeTruthy();
    expect(page.getByText('2026-01-15')).toBeTruthy();
  });

  it('should render edit button when onEdit is provided', async () => {
    await render(<WaiverCard {...defaultProps} onEdit={vi.fn()} />);

    const editButton = page.getByRole('button', { name: 'Edit waiver' });

    expect(editButton).toBeTruthy();
  });

  it('should not render edit button when onEdit is not provided', async () => {
    await render(<WaiverCard {...defaultProps} onEdit={undefined} />);

    const editButtons = page.getByRole('button', { name: 'Edit waiver' });

    expect(editButtons.elements()).toHaveLength(0);
  });

  it('should call onEdit with the waiver id when edit button is clicked', async () => {
    const mockOnEdit = vi.fn();
    await render(<WaiverCard {...defaultProps} id="waiver-42" onEdit={mockOnEdit} />);

    const editButton = page.getByRole('button', { name: 'Edit waiver' });
    await userEvent.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledWith('waiver-42');
  });

  it('should not render description when it is null', async () => {
    await render(<WaiverCard {...defaultProps} description={null} />);

    // Name should still render
    expect(page.getByText('Standard Liability Waiver')).toBeTruthy();

    // Description paragraph should not exist
    const descriptionElements = page.getByText('A standard waiver for all members participating in martial arts training.');

    expect(descriptionElements.elements()).toHaveLength(0);
  });

  it('should render with zero signed count', async () => {
    await render(<WaiverCard {...defaultProps} signedCount={0} />);

    expect(page.getByText('0')).toBeTruthy();
  });

  it('should render with zero membership count', async () => {
    await render(<WaiverCard {...defaultProps} membershipCount={0} signedCount={42} />);

    // Both 0 and 42 should appear
    expect(page.getByText('0')).toBeTruthy();
    expect(page.getByText('42')).toBeTruthy();
  });

  it('should render with version 1', async () => {
    await render(<WaiverCard {...defaultProps} version={1} />);

    expect(page.getByText('v1')).toBeTruthy();
  });
});
