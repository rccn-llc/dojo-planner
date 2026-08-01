import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditClassSettingsModal } from './EditClassSettingsModal';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Edit Class Settings',
  max_capacity_label: 'Maximum Capacity',
  max_capacity_placeholder: 'e.g., 20',
  max_capacity_help: 'Leave empty for no limit',
  min_age_label: 'Minimum Age',
  min_age_placeholder: 'e.g., 16',
  min_age_help: 'Leave empty for no minimum',
  allow_walkins_label: 'Allow Walk-ins',
  walkins_yes: 'Yes',
  walkins_no: 'No',
  allow_walkins_help: 'Allow students without a reservation to attend',
  cancel_button: 'Cancel',
  save_button: 'Save Changes',
  saving_button: 'Saving...',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translationKeys[key] || key,
}));

describe('EditClassSettingsModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    maximumCapacity: 25,
    minimumAge: 16,
    allowWalkIns: 'Yes' as const,
    onSave: mockOnSave,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the modal with title when open', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const heading = page.getByText('Edit Class Settings');

    expect(heading).toBeTruthy();
  });

  it('should not render when isOpen is false', async () => {
    await render(<EditClassSettingsModal {...defaultProps} isOpen={false} />);

    const heading = document.body.textContent?.includes('Edit Class Settings');

    expect(heading).toBe(false);
  });

  it('should render maximum capacity input', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const capacityLabel = page.getByText('Maximum Capacity');

    expect(capacityLabel).toBeTruthy();
  });

  it('should render Cancel button', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');

    expect(cancelButton).toBeTruthy();
  });

  it('should render Save Changes button', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');

    expect(saveButton).toBeTruthy();
  });

  it('should render minimum age input', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const ageLabel = page.getByText('Minimum Age');

    expect(ageLabel).toBeTruthy();
  });

  it('should render allow walk-ins select', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const walkInsLabel = page.getByText('Allow Walk-ins');

    expect(walkInsLabel).toBeTruthy();
  });

  it('should render help texts', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const capacityHelp = page.getByText('Leave empty for no limit');
    const ageHelp = page.getByText('Leave empty for no minimum');
    const walkInsHelp = page.getByText('Allow students without a reservation to attend');

    expect(capacityHelp).toBeTruthy();
    expect(ageHelp).toBeTruthy();
    expect(walkInsHelp).toBeTruthy();
  });

  it('should call onClose when Cancel button is clicked', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should have Save button enabled when form is valid', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should call onSave with updated values when Save button is clicked', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    // Wait for the simulated API call
    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({
      maximumCapacity: defaultProps.maximumCapacity,
      minimumAge: defaultProps.minimumAge,
      allowWalkIns: defaultProps.allowWalkIns,
    });
  });

  it('should show saving state when submitting', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    // Check if saving button text appears during loading
    const savingButton = page.getByText('Saving...');

    expect(savingButton).toBeTruthy();
  });

  it('should update maximum capacity when input changes', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const capacityInput = page.getByPlaceholder('e.g., 20');
    await userEvent.clear(capacityInput);
    await userEvent.type(capacityInput, '30');

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
      maximumCapacity: 30,
    }));
  });

  it('should update minimum age when input changes', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const ageInput = page.getByPlaceholder('e.g., 16');
    await userEvent.clear(ageInput);
    await userEvent.type(ageInput, '18');

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
      minimumAge: 18,
    }));
  });

  it('should allow empty maximum capacity (null)', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const capacityInput = page.getByPlaceholder('e.g., 20');
    await userEvent.clear(capacityInput);

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
      maximumCapacity: null,
    }));
  });

  it('should allow empty minimum age (null)', async () => {
    await render(<EditClassSettingsModal {...defaultProps} />);

    const ageInput = page.getByPlaceholder('e.g., 16');
    await userEvent.clear(ageInput);

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
      minimumAge: null,
    }));
  });

  it('should render with null values for capacity and age', async () => {
    await render(<EditClassSettingsModal {...defaultProps} maximumCapacity={null} minimumAge={null} />);

    const capacityInput = page.getByPlaceholder('e.g., 20');
    const ageInput = page.getByPlaceholder('e.g., 16');

    expect(capacityInput).toBeTruthy();
    expect(ageInput).toBeTruthy();
  });
});
