import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditWaiverMembershipsModal } from './EditWaiverMembershipsModal';

const translationKeys: Record<string, string> = {
  title: 'Edit Memberships',
  description: 'Select which membership plans require this waiver.',
  no_plans: 'No membership plans found.',
  cancel_button: 'Cancel',
  save_button: 'Save Changes',
  saving_button: 'Saving...',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    return translationKeys[key] || key;
  },
}));

const mockListMembershipPlans = vi.fn();

vi.mock('@/libs/Orpc', () => ({
  client: {
    member: {
      listMembershipPlans: () => mockListMembershipPlans(),
    },
  },
}));

const mockPlans = [
  { id: 'plan-1', name: 'Adult BJJ Monthly' },
  { id: 'plan-2', name: 'Kids Program Quarterly' },
  { id: 'plan-3', name: 'Competition Team Annual' },
];

describe('EditWaiverMembershipsModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn().mockResolvedValue(undefined);

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    waiverId: 'waiver-1',
    currentMembershipIds: ['plan-1'],
    onSave: mockOnSave,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockListMembershipPlans.mockResolvedValue({ plans: mockPlans });
  });

  it('should render dialog with correct title when open', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    const heading = page.getByText('Edit Memberships');

    expect(heading).toBeTruthy();
  });

  it('should not render dialog content when closed', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} isOpen={false} />);

    const heading = page.getByText('Edit Memberships');

    expect(heading.elements()).toHaveLength(0);
  });

  it('should display description text', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    const description = page.getByText('Select which membership plans require this waiver.');

    expect(description).toBeTruthy();
  });

  it('should show loading skeletons while fetching plans', async () => {
    mockListMembershipPlans.mockImplementation(() => new Promise(() => {}));

    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');

    expect(skeletons.length).toBe(3);
  });

  it('should render membership plan checkboxes after loading', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    await vi.waitFor(() => {
      expect(page.getByText('Adult BJJ Monthly').element()).toBeTruthy();
    });

    expect(page.getByText('Kids Program Quarterly').element()).toBeTruthy();
    expect(page.getByText('Competition Team Annual').element()).toBeTruthy();
  });

  it('should show pre-selected membership plans as checked', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    await vi.waitFor(() => {
      expect(page.getByText('Adult BJJ Monthly').element()).toBeTruthy();
    });

    const checkboxes = document.querySelectorAll('[data-slot="checkbox"]');
    const firstCheckbox = checkboxes[0];

    expect(firstCheckbox?.getAttribute('data-state')).toBe('checked');
  });

  it('should show non-selected membership plans as unchecked', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    await vi.waitFor(() => {
      expect(page.getByText('Adult BJJ Monthly').element()).toBeTruthy();
    });

    const checkboxes = document.querySelectorAll('[data-slot="checkbox"]');
    const secondCheckbox = checkboxes[1];
    const thirdCheckbox = checkboxes[2];

    expect(secondCheckbox?.getAttribute('data-state')).toBe('unchecked');
    expect(thirdCheckbox?.getAttribute('data-state')).toBe('unchecked');
  });

  it('should toggle checkbox when clicked', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    await vi.waitFor(() => {
      expect(page.getByText('Kids Program Quarterly').element()).toBeTruthy();
    });

    const checkboxes = document.querySelectorAll('[data-slot="checkbox"]');
    const secondCheckbox = checkboxes[1] as HTMLElement;

    expect(secondCheckbox.getAttribute('data-state')).toBe('unchecked');

    await userEvent.click(secondCheckbox);

    expect(secondCheckbox.getAttribute('data-state')).toBe('checked');
  });

  it('should uncheck a previously checked checkbox when clicked', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    await vi.waitFor(() => {
      expect(page.getByText('Adult BJJ Monthly').element()).toBeTruthy();
    });

    const checkboxes = document.querySelectorAll('[data-slot="checkbox"]');
    const firstCheckbox = checkboxes[0] as HTMLElement;

    expect(firstCheckbox.getAttribute('data-state')).toBe('checked');

    await userEvent.click(firstCheckbox);

    expect(firstCheckbox.getAttribute('data-state')).toBe('unchecked');
  });

  it('should show no plans message when no membership plans exist', async () => {
    mockListMembershipPlans.mockResolvedValue({ plans: [] });

    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    await vi.waitFor(() => {
      expect(page.getByText('No membership plans found.').element()).toBeTruthy();
    });
  });

  it('should call onSave with selected membership IDs when save is clicked', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    await vi.waitFor(() => {
      expect(page.getByText('Adult BJJ Monthly').element()).toBeTruthy();
    });

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith(['plan-1']);
  });

  it('should call onSave with updated selection after toggling checkboxes', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    await vi.waitFor(() => {
      expect(page.getByText('Adult BJJ Monthly').element()).toBeTruthy();
    });

    // Toggle on the second plan
    const checkboxes = document.querySelectorAll('[data-slot="checkbox"]');
    const secondCheckbox = checkboxes[1] as HTMLElement;
    await userEvent.click(secondCheckbox);

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    const savedIds = mockOnSave.mock.calls[0]![0] as string[];

    expect(savedIds).toContain('plan-1');
    expect(savedIds).toContain('plan-2');
    expect(savedIds).toHaveLength(2);
  });

  it('should call onClose when cancel is clicked', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    await vi.waitFor(() => {
      expect(page.getByText('Adult BJJ Monthly').element()).toBeTruthy();
    });

    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should show loading text on save button while saving', async () => {
    let resolvePromise: () => void;
    const slowOnSave = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      resolvePromise = resolve;
    }));

    await render(<EditWaiverMembershipsModal {...defaultProps} onSave={slowOnSave} />);

    await vi.waitFor(() => {
      expect(page.getByText('Adult BJJ Monthly').element()).toBeTruthy();
    });

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 100));

    const savingButton = page.getByText('Saving...');

    expect(savingButton).toBeTruthy();

    resolvePromise!();
  });

  it('should disable save button while plans are loading', async () => {
    mockListMembershipPlans.mockImplementation(() => new Promise(() => {}));

    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should disable cancel button while saving', async () => {
    let resolvePromise: () => void;
    const slowOnSave = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      resolvePromise = resolve;
    }));

    await render(<EditWaiverMembershipsModal {...defaultProps} onSave={slowOnSave} />);

    await vi.waitFor(() => {
      expect(page.getByText('Adult BJJ Monthly').element()).toBeTruthy();
    });

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 100));

    const buttons = Array.from(document.querySelectorAll('button'));
    const cancelButton = buttons.find(btn => btn.textContent?.includes('Cancel'));

    expect(cancelButton?.disabled).toBe(true);

    resolvePromise!();
  });

  it('should fetch membership plans when dialog opens', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    expect(mockListMembershipPlans).toHaveBeenCalledTimes(1);
  });

  it('should not fetch membership plans when dialog is closed', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} isOpen={false} />);

    expect(mockListMembershipPlans).not.toHaveBeenCalled();
  });

  it('should handle fetch error gracefully', async () => {
    mockListMembershipPlans.mockRejectedValue(new Error('Network error'));

    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    // Should render without crashing and show no plans
    await vi.waitFor(() => {
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');

      expect(skeletons.length).toBe(0);
    });
  });

  it('should reset selection to current membership IDs when cancel is clicked after toggling', async () => {
    await render(<EditWaiverMembershipsModal {...defaultProps} />);

    await vi.waitFor(() => {
      expect(page.getByText('Adult BJJ Monthly').element()).toBeTruthy();
    });

    // Toggle on the second plan
    const checkboxes = document.querySelectorAll('[data-slot="checkbox"]');
    const secondCheckbox = checkboxes[1] as HTMLElement;
    await userEvent.click(secondCheckbox);

    expect(secondCheckbox.getAttribute('data-state')).toBe('checked');

    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
