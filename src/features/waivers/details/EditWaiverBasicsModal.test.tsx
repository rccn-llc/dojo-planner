import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditWaiverBasicsModal } from './EditWaiverBasicsModal';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Edit Waiver Basics',
  name_label: 'Name',
  name_placeholder: 'Enter waiver name...',
  name_error: 'Name is required',
  description_label: 'Description',
  description_placeholder: 'Enter a short description...',
  status_label: 'Status',
  status_active: 'Active',
  status_inactive: 'Inactive',
  default_label: 'Default',
  default_yes: 'Yes',
  default_no: 'No',
  guardian_label: 'Guardian',
  guardian_yes: 'Required',
  guardian_no: 'Not required',
  guardian_age_label: 'Guardian Age Threshold',
  guardian_age_help: 'Age below which a guardian is required',
  guardian_age_error: 'Age threshold must be between {min} and {max}.',
  save_error: 'Could not save changes. Please try again.',
  cancel_button: 'Cancel',
  save_button: 'Save Changes',
  saving_button: 'Saving...',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === 'description_character_count' && params) {
      return `${params.count} / ${params.max}`;
    }
    let result = translationKeys[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{${k}}`, String(v));
      }
    }
    return result;
  },
}));

describe('EditWaiverBasicsModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn().mockResolvedValue(undefined);

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    name: 'Test Waiver',
    description: 'A test description',
    isActive: true,
    isDefault: false,
    requiresGuardian: false,
    guardianAgeThreshold: 18,
    onSave: mockOnSave,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render dialog with title when open', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} />);

    const heading = page.getByText('Edit Waiver Basics');

    expect(heading).toBeTruthy();
  });

  it('should render with initial name value', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} />);

    const nameInput = page.getByPlaceholder('Enter waiver name...');

    expect(nameInput.element()).toHaveProperty('value', 'Test Waiver');
  });

  it('should render with initial description value', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} />);

    const textarea = document.querySelector('textarea');

    expect(textarea).toBeTruthy();
    expect(textarea?.value).toBe('A test description');
  });

  it('should render with empty description when initial description is null', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} description={null} />);

    const textarea = document.querySelector('textarea');

    expect(textarea).toBeTruthy();
    expect(textarea?.value).toBe('');
  });

  it('should show name validation error when name is cleared and blurred', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} />);

    const nameInput = page.getByPlaceholder('Enter waiver name...');
    await userEvent.clear(nameInput);
    await userEvent.tab();

    const error = page.getByText('Name is required');

    expect(error).toBeTruthy();
  });

  it('should not show name validation error before blur', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} name="" />);

    const errors = page.getByText('Name is required');

    expect(errors.elements()).toHaveLength(0);
  });

  it('should show description character count', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} description="Hello" />);

    const charCount = page.getByText('5 / 500');

    expect(charCount).toBeTruthy();
  });

  it('should update description character count on typing', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} description="" />);

    const textarea = document.querySelector('textarea')!;
    await userEvent.type(textarea, 'Test');

    const charCount = page.getByText('4 / 500');

    expect(charCount).toBeTruthy();
  });

  it('should render three toggle switches (status, default, guardian)', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} />);

    const switches = document.querySelectorAll('[role="switch"]');

    expect(switches).toHaveLength(3);
  });

  it('should display Active status text when isActive is true', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} isActive={true} />);

    expect(page.getByText('Active')).toBeTruthy();
  });

  it('should display Inactive status text when isActive is false', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} isActive={false} />);

    expect(page.getByText('Inactive')).toBeTruthy();
  });

  it('should display Yes for default when isDefault is true', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} isDefault={true} />);

    expect(page.getByText('Yes')).toBeTruthy();
  });

  it('should display No for default when isDefault is false', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} isDefault={false} />);

    expect(page.getByText('No')).toBeTruthy();
  });

  it('should display Required for guardian when requiresGuardian is true', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} requiresGuardian={true} />);

    expect(page.getByText('Required')).toBeTruthy();
  });

  it('should display Not required for guardian when requiresGuardian is false', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} requiresGuardian={false} />);

    expect(page.getByText('Not required')).toBeTruthy();
  });

  it('should show guardian age threshold input when requiresGuardian is true', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} requiresGuardian={true} guardianAgeThreshold={16} />);

    const ageLabel = page.getByText('Guardian Age Threshold');
    const ageInput = document.querySelector('input[type="number"]');

    expect(ageLabel).toBeTruthy();
    expect(ageInput).toBeTruthy();
    expect((ageInput as HTMLInputElement)?.value).toBe('16');
  });

  it('should not show guardian age threshold input when requiresGuardian is false', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} requiresGuardian={false} />);

    const ageLabels = page.getByText('Guardian Age Threshold');

    expect(ageLabels.elements()).toHaveLength(0);
  });

  it('should show guardian age help text when requiresGuardian is true', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} requiresGuardian={true} />);

    expect(page.getByText('Age below which a guardian is required')).toBeTruthy();
  });

  it('should toggle guardian age threshold visibility when guardian switch is clicked', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} requiresGuardian={false} />);

    // Initially no age threshold input
    expect(page.getByText('Guardian Age Threshold').elements()).toHaveLength(0);

    // Click the guardian switch (third switch)
    const switches = document.querySelectorAll('[role="switch"]');
    const guardianSwitch = switches[2]!;
    await userEvent.click(guardianSwitch);

    // Now the age threshold should appear
    expect(page.getByText('Guardian Age Threshold')).toBeTruthy();
  });

  it('should call onClose when cancel button is clicked', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} />);

    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should reset state when cancel is clicked after modifications', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} />);

    // Modify the name
    const nameInput = page.getByPlaceholder('Enter waiver name...');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Modified Name');

    // Click cancel
    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    // The onSave should NOT have been called
    expect(mockOnSave).not.toHaveBeenCalled();
    // onClose should have been called
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onSave with correct data when save is clicked', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} />);

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'Test Waiver',
      description: 'A test description',
      isActive: true,
      isDefault: false,
      requiresGuardian: false,
      guardianAgeThreshold: 18,
    });
  });

  it('should call onSave with null description when description is empty', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} description="" />);

    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
      }),
    );
  });

  it('should disable save button when name is empty', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} name="" />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should enable save button when name is non-empty', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should render all labels', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} />);

    expect(page.getByText('Name')).toBeTruthy();
    expect(page.getByText('Description')).toBeTruthy();
    expect(page.getByText('Status')).toBeTruthy();
    expect(page.getByText('Default')).toBeTruthy();
    expect(page.getByText('Guardian')).toBeTruthy();
  });

  it('should call onSave with modified data after editing fields', async () => {
    await render(<EditWaiverBasicsModal {...defaultProps} />);

    // Modify name
    const nameInput = page.getByPlaceholder('Enter waiver name...');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated Waiver');

    // Click save
    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Updated Waiver',
      }),
    );
  });

  describe('guardian age threshold validation (#266)', () => {
    const guardianProps = { ...defaultProps, requiresGuardian: true, guardianAgeThreshold: 12 };

    it('shows an inline error and blocks save when age is below the minimum', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      await render(<EditWaiverBasicsModal {...guardianProps} onSave={onSave} />);

      // The out-of-range (12) value surfaces a clear error instead of silently failing.
      await expect.element(page.getByText('Age threshold must be between 13 and 21.')).toBeInTheDocument();

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      await expect.element(saveButton).toBeDisabled();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('allows save when the age is within 13-21', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      await render(<EditWaiverBasicsModal {...defaultProps} requiresGuardian onSave={onSave} guardianAgeThreshold={14} />);

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      await expect.element(saveButton).toBeEnabled();
    });

    it('surfaces a server error instead of swallowing it', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('Boom from server'));
      await render(<EditWaiverBasicsModal {...defaultProps} requiresGuardian onSave={onSave} guardianAgeThreshold={16} />);

      await userEvent.click(page.getByRole('button', { name: 'Save Changes' }));

      await expect.element(page.getByText('Boom from server')).toBeInTheDocument();
    });
  });
});
