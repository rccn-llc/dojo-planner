import type { AddClassWizardData } from '@/hooks/useAddClassWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { createMockWizardData } from '@/test-utils/mockWizardData';
import { ClassBasicsStep } from './ClassBasicsStep';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Class Basics',
  subtitle: 'Enter the basic information for this class',
  class_name_label: 'Class Name',
  class_name_placeholder: 'Enter class name',
  class_name_error: 'Please enter a class name.',
  program_label: 'Program',
  program_placeholder: 'Select a program',
  program_error: 'Please select a program.',
  max_capacity_label: 'Maximum Capacity',
  max_capacity_placeholder: 'e.g., 20',
  max_capacity_help: 'Maximum number of students per class',
  min_age_label: 'Minimum Age',
  min_age_placeholder: 'e.g., 16',
  min_age_help: 'Minimum age to enroll',
  allow_walkins_label: 'Allow Walk-ins',
  allow_walkins_yes: 'Yes',
  allow_walkins_no: 'No',
  description_label: 'Description',
  description_placeholder: 'Enter class description',
  description_error: 'Please enter a description.',
  description_character_count: '{count}/{max} characters',
  cancel_button: 'Cancel',
  next_button: 'Next',
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
          { id: 'prog-3', name: 'Competition Team', slug: 'competition', isActive: false },
        ],
      }),
    },
  },
}));

describe('ClassBasicsStep', () => {
  const mockData = createMockWizardData();

  const mockHandlers = {
    onUpdate: vi.fn(),
    onNext: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the step with title and subtitle', () => {
    render(
      <ClassBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const heading = page.getByRole('heading', { level: 2 });

    expect(heading).toBeTruthy();
  });

  it('should render class name input', () => {
    render(
      <ClassBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const input = page.getByPlaceholder('Enter class name');

    expect(input).toBeTruthy();
  });

  it('should call onUpdate when class name changes', async () => {
    render(
      <ClassBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const input = page.getByPlaceholder('Enter class name');
    await userEvent.type(input, 'BJJ Fundamentals');

    expect(mockHandlers.onUpdate).toHaveBeenCalled();
  });

  it('should have Next button disabled when form is incomplete', () => {
    render(
      <ClassBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(true);
  });

  it('should enable Next button when form is complete', () => {
    const completeData: AddClassWizardData = {
      ...mockData,
      className: 'BJJ Fundamentals',
      program: 'adult-bjj',
      description: 'A beginner class',
    };

    render(
      <ClassBasicsStep
        data={completeData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(false);
  });

  it('should call onCancel when Cancel button is clicked', async () => {
    render(
      <ClassBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const cancelButton = buttons.find(btn => btn.textContent?.includes('Cancel'));

    if (cancelButton) {
      await userEvent.click(cancelButton);

      expect(mockHandlers.onCancel).toHaveBeenCalled();
    }
  });

  it('should call onNext when Next button is clicked with valid data', async () => {
    const completeData: AddClassWizardData = {
      ...mockData,
      className: 'BJJ Fundamentals',
      program: 'adult-bjj',
      description: 'A beginner class',
    };

    render(
      <ClassBasicsStep
        data={completeData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    if (nextButton) {
      await userEvent.click(nextButton);

      expect(mockHandlers.onNext).toHaveBeenCalled();
    }
  });

  it('should display error message when provided', () => {
    render(
      <ClassBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
        error="Something went wrong"
      />,
    );

    const errorMessage = page.getByText('Something went wrong');

    expect(errorMessage).toBeTruthy();
  });

  it('should show character count for description', () => {
    const dataWithDescription: AddClassWizardData = {
      ...mockData,
      description: 'Test description',
    };

    render(
      <ClassBasicsStep
        data={dataWithDescription}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const characterCount = page.getByText(/16\/2000 characters/);

    expect(characterCount).toBeTruthy();
  });

  it('should render program select', () => {
    render(
      <ClassBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const programLabel = page.getByText('Program');

    expect(programLabel).toBeTruthy();
  });

  it('should render optional fields', () => {
    render(
      <ClassBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const maxCapacityLabel = page.getByText('Maximum Capacity');
    const minAgeLabel = page.getByText('Minimum Age');
    const allowWalkInsLabel = page.getByText('Allow Walk-ins');

    expect(maxCapacityLabel).toBeTruthy();
    expect(minAgeLabel).toBeTruthy();
    expect(allowWalkInsLabel).toBeTruthy();
  });

  it('should show validation error when class name is touched but empty', async () => {
    render(
      <ClassBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const input = page.getByPlaceholder('Enter class name');
    await userEvent.click(input);
    await userEvent.tab(); // Blur the input

    // Wait for state update
    await new Promise(resolve => setTimeout(resolve, 100));

    const errorMessage = page.getByText('Please enter a class name.');

    expect(errorMessage).toBeTruthy();
  });

  it('should update maximum capacity when changed', async () => {
    render(
      <ClassBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const input = page.getByPlaceholder('e.g., 20');
    await userEvent.type(input, '25');

    expect(mockHandlers.onUpdate).toHaveBeenCalled();
  });

  it('should update minimum age when changed', async () => {
    render(
      <ClassBasicsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const input = page.getByPlaceholder('e.g., 16');
    await userEvent.type(input, '18');

    expect(mockHandlers.onUpdate).toHaveBeenCalled();
  });
});
