import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { ClassSettingsCard } from './ClassSettingsCard';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Class Settings',
  max_capacity_label: 'Maximum Capacity',
  min_age_label: 'Minimum Age',
  allow_walkins_label: 'Allow Walk-ins',
  no_limit: 'No limit',
  no_minimum: 'No minimum',
  walkins_yes: 'Yes',
  walkins_no: 'No',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, number>) => {
    if (key === 'age_years' && params?.age) {
      return `${params.age} years`;
    }
    return translationKeys[key] || key;
  },
}));

describe('ClassSettingsCard', () => {
  const mockOnEdit = vi.fn();

  const defaultProps = {
    maximumCapacity: 25,
    minimumAge: 16,
    allowWalkIns: 'Yes' as const,
    onEdit: mockOnEdit,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the card with title', async () => {
    await render(<ClassSettingsCard {...defaultProps} />);

    const heading = page.getByText('Class Settings');

    expect(heading).toBeTruthy();
  });

  it('should render maximum capacity', async () => {
    await render(<ClassSettingsCard {...defaultProps} />);

    const capacity = page.getByText('25');

    expect(capacity).toBeTruthy();
  });

  it('should render minimum age', async () => {
    await render(<ClassSettingsCard {...defaultProps} />);

    const age = page.getByText('16 years');

    expect(age).toBeTruthy();
  });

  it('should render allow walk-ins badge', async () => {
    await render(<ClassSettingsCard {...defaultProps} />);

    const walkIns = page.getByText('Yes');

    expect(walkIns).toBeTruthy();
  });

  it('should render Edit button', async () => {
    await render(<ClassSettingsCard {...defaultProps} />);

    const editButton = page.getByRole('button');

    expect(editButton).toBeTruthy();
  });

  it('should call onEdit when Edit button is clicked', async () => {
    await render(<ClassSettingsCard {...defaultProps} />);

    const editButton = page.getByRole('button');
    await userEvent.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledTimes(1);
  });

  it('should render all field labels', async () => {
    await render(<ClassSettingsCard {...defaultProps} />);

    const capacityLabel = page.getByText('Maximum Capacity');
    const ageLabel = page.getByText('Minimum Age');
    const walkInsLabel = page.getByText('Allow Walk-ins');

    expect(capacityLabel).toBeTruthy();
    expect(ageLabel).toBeTruthy();
    expect(walkInsLabel).toBeTruthy();
  });

  it('should show no limit when capacity is null', async () => {
    await render(<ClassSettingsCard {...defaultProps} maximumCapacity={null} />);

    const noLimit = page.getByText('No limit');

    expect(noLimit).toBeTruthy();
  });

  it('should show no minimum when age is null', async () => {
    await render(<ClassSettingsCard {...defaultProps} minimumAge={null} />);

    const noMinimum = page.getByText('No minimum');

    expect(noMinimum).toBeTruthy();
  });

  it('should show No badge when walk-ins not allowed', async () => {
    await render(<ClassSettingsCard {...defaultProps} allowWalkIns="No" />);

    const noBadge = page.getByText('No');

    expect(noBadge).toBeTruthy();
  });
});
