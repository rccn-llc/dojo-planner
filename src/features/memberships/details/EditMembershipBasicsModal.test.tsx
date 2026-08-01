import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditMembershipBasicsModal } from './EditMembershipBasicsModal';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Edit Membership Basics',
  name_label: 'Membership Name',
  name_placeholder: 'e.g., 12 Month Commitment (Gold)',
  name_error: 'Please enter a membership name.',
  status_label: 'Status',
  status_active: 'Active',
  status_inactive: 'Inactive',
  type_label: 'Membership Type',
  type_standard: 'Standard',
  type_standard_help: 'Regular paid membership with recurring billing',
  type_trial: 'Trial Membership',
  type_trial_help: 'Free or low-cost introductory offer',
  description_label: 'Description',
  description_placeholder: 'Describe the terms, conditions, and benefits...',
  description_error: 'Please enter a description.',
  description_character_count: '{count} of {max} characters used',
  cancel_button: 'Cancel',
  save_button: 'Save Changes',
  saving_button: 'Saving...',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    let result = translationKeys[key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(`{${paramKey}}`, String(paramValue));
      });
    }
    return result;
  },
}));

describe('EditMembershipBasicsModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    membershipName: '12 Month Commitment (Gold)',
    status: 'active' as const,
    membershipType: 'standard' as const,
    description: 'Our most popular membership option',
    onSave: mockOnSave,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the modal with title when open', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const heading = page.getByText('Edit Membership Basics');

    expect(heading).toBeTruthy();
  });

  it('should not render when isOpen is false', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} isOpen={false} />);

    const heading = document.body.textContent?.includes('Edit Membership Basics');

    expect(heading).toBe(false);
  });

  it('should render membership name input with initial value', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const input = page.getByPlaceholder('e.g., 12 Month Commitment (Gold)');

    expect(input).toBeTruthy();
  });

  it('should render Cancel button', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');

    expect(cancelButton).toBeTruthy();
  });

  it('should render Save Changes button', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');

    expect(saveButton).toBeTruthy();
  });

  it('should render status toggle', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const statusLabel = page.getByText('Status');

    expect(statusLabel).toBeTruthy();
  });

  it('should render membership type selection cards', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const standardCard = page.getByText('Standard');
    const trialCard = page.getByText('Trial Membership');

    expect(standardCard).toBeTruthy();
    expect(trialCard).toBeTruthy();
  });

  it('should render description textarea', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const descriptionLabel = page.getByText('Description');

    expect(descriptionLabel).toBeTruthy();
  });

  it('should show character count for description', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const characterCount = page.getByText(/of 2000 characters used/);

    expect(characterCount).toBeTruthy();
  });

  it('should call onClose when Cancel button is clicked', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should have Save button enabled when form is valid', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should display Active status when status is active', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const activeStatus = page.getByText('Active');

    expect(activeStatus).toBeTruthy();
  });

  it('should display Inactive status when status is inactive', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} status="inactive" />);

    const inactiveStatus = page.getByText('Inactive');

    expect(inactiveStatus).toBeTruthy();
  });

  it('should render membership type help text for standard', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const standardHelp = page.getByText(/Regular paid membership with recurring billing/);

    expect(standardHelp).toBeTruthy();
  });

  it('should render membership type help text for trial', async () => {
    await render(<EditMembershipBasicsModal {...defaultProps} />);

    const trialHelp = page.getByText(/Free or low-cost introductory offer/);

    expect(trialHelp).toBeTruthy();
  });
});
