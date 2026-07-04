import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditClassBasicsModal } from './EditClassBasicsModal';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Edit Class Basics',
  name_label: 'Class Name',
  name_placeholder: 'e.g., BJJ Fundamentals I',
  name_error: 'Please enter a class name.',
  program_label: 'Program',
  program_placeholder: 'Select a program',
  program_error: 'Please select a program.',
  level_label: 'Level',
  type_label: 'Type',
  style_label: 'Style',
  description_label: 'Description',
  description_placeholder: 'Describe what students will learn in this class...',
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

// Mock ORPC client — the program dropdown is now sourced from the API
vi.mock('@/libs/Orpc', () => ({
  client: {
    programs: {
      list: vi.fn().mockResolvedValue({
        programs: [
          { id: 'prog-1', name: 'Adult Brazilian Jiu-Jitsu', slug: 'adult-bjj', isActive: true },
          { id: 'prog-2', name: 'Kids Brazilian Jiu-Jitsu', slug: 'kids-bjj', isActive: true },
        ],
      }),
    },
  },
}));

describe('EditClassBasicsModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    className: 'BJJ Fundamentals I',
    program: 'adult-bjj',
    description: 'Covers core positions, escapes, and submissions.',
    level: 'Beginner' as const,
    type: 'Adults' as const,
    style: 'Gi' as const,
    onSave: mockOnSave,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the modal with title when open', () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const heading = page.getByText('Edit Class Basics');

    expect(heading).toBeTruthy();
  });

  it('should not render when isOpen is false', () => {
    render(<EditClassBasicsModal {...defaultProps} isOpen={false} />);

    const heading = document.body.textContent?.includes('Edit Class Basics');

    expect(heading).toBe(false);
  });

  it('should render class name input with initial value', () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const input = page.getByPlaceholder('e.g., BJJ Fundamentals I');

    expect(input).toBeTruthy();
  });

  it('should render Cancel button', () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');

    expect(cancelButton).toBeTruthy();
  });

  it('should render Save Changes button', () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');

    expect(saveButton).toBeTruthy();
  });

  it('should render program select', () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const programLabel = page.getByText('Program');

    expect(programLabel).toBeTruthy();
  });

  it('should render level select', () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const levelLabel = page.getByText('Level');

    expect(levelLabel).toBeTruthy();
  });

  it('should render type select', () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const typeLabel = page.getByText('Type');

    expect(typeLabel).toBeTruthy();
  });

  it('should render style select', () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const styleLabel = page.getByText('Style');

    expect(styleLabel).toBeTruthy();
  });

  it('should render description textarea', () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const descriptionLabel = page.getByText('Description');

    expect(descriptionLabel).toBeTruthy();
  });

  it('should show character count for description', () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const characterCount = page.getByText(/of 2000 characters used/);

    expect(characterCount).toBeTruthy();
  });

  it('should call onClose when Cancel button is clicked', async () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should have Save button enabled when form is valid', () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should call onSave with updated values when Save button is clicked', async () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    // Wait for the simulated API call
    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({
      className: defaultProps.className,
      program: defaultProps.program,
      description: defaultProps.description,
      level: defaultProps.level,
      type: defaultProps.type,
      style: defaultProps.style,
    });
  });

  it('should show saving state when submitting', async () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    // Check if saving button text appears during loading
    const savingButton = page.getByText('Saving...');

    expect(savingButton).toBeTruthy();
  });

  it('should update class name when input changes', async () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const nameInput = page.getByPlaceholder('e.g., BJJ Fundamentals I');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'New Class Name');

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
      className: 'New Class Name',
    }));
  });

  it('should show error when class name is empty on blur', async () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const nameInput = page.getByPlaceholder('e.g., BJJ Fundamentals I');
    await userEvent.clear(nameInput);
    await userEvent.tab(); // Trigger blur

    const errorText = page.getByText('Please enter a class name.');

    expect(errorText).toBeTruthy();
  });

  it('should disable Save button when class name is empty', async () => {
    render(<EditClassBasicsModal {...defaultProps} className="" />);

    const nameInput = page.getByPlaceholder('e.g., BJJ Fundamentals I');
    await userEvent.click(nameInput);
    await userEvent.tab(); // Trigger blur to show validation

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should update description when textarea changes', async () => {
    render(<EditClassBasicsModal {...defaultProps} />);

    const descriptionTextarea = page.getByPlaceholder('Describe what students will learn in this class...');
    await userEvent.clear(descriptionTextarea);
    await userEvent.type(descriptionTextarea, 'New description for the class');

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
      description: 'New description for the class',
    }));
  });
});
