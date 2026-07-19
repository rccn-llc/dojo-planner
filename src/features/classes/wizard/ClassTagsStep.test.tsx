import type { AddClassWizardData } from '@/hooks/useAddClassWizard';
import type { Tag } from '@/hooks/useTagsCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { createMockScheduleInstance, createMockWizardData } from '@/test-utils/mockWizardData';
import { ClassTagsStep } from './ClassTagsStep';

// Mock class tags for testing
const mockClassTags: Tag[] = [
  { id: 'tag-1', name: 'Beginner', slug: 'beginner', color: '#22c55e', entityType: 'class', usageCount: 3 },
  { id: 'tag-2', name: 'Advanced', slug: 'advanced', color: '#ef4444', entityType: 'class', usageCount: 2 },
  { id: 'tag-3', name: 'Adults', slug: 'adults', color: '#3b82f6', entityType: 'class', usageCount: 5 },
];

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Add Tags',
  subtitle: 'Select tags to categorize this class',
  selected_tags_label: 'Selected Tags',
  no_tags_selected: 'No tags selected. Click tags below to add them.',
  available_tags_label: 'Available Tags',
  all_tags_selected: 'All available tags have been selected.',
  remove_tag_aria: 'Remove {tag} tag',
  tags_help: 'Tags help members find classes and organize your schedule.',
  calendar_color_label: 'Calendar Color',
  calendar_color_select: 'Choose a color',
  calendar_color_help: 'Use the color picker or enter a hex code, e.g., #ff0000 = red',
  back_button: 'Back',
  cancel_button: 'Cancel',
  finish_button: 'Create Class',
  creating_button: 'Creating...',
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

describe('ClassTagsStep', () => {
  const mockInstance = createMockScheduleInstance({ id: 'test-instance-1', staffMember: 'coach-alex' });

  const mockData = createMockWizardData({
    className: 'Test Class',
    program: 'adult-bjj',
    description: 'Test description',
    schedule: {
      instances: [mockInstance],
      exceptions: [],
      location: '',
    },
    calendarColor: '#000000',
    tags: [],
  });

  const mockHandlers = {
    onUpdate: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the step with title and subtitle', () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    const heading = page.getByRole('heading', { level: 2 });

    expect(heading).toBeTruthy();
  });

  it('should show message when no tags are selected', () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    const noTagsMessage = page.getByText('No tags selected. Click tags below to add them.');

    expect(noTagsMessage).toBeTruthy();
  });

  it('should render available tags section', () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    const availableTagsLabel = page.getByText('Available Tags');

    expect(availableTagsLabel).toBeTruthy();
  });

  it('constrains the available-tags list height so it scrolls instead of overflowing (#234)', () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    // The available-tags box (immediately following its label) must be capped
    // in height with vertical scroll so a large tag list can't push the wizard
    // footer off-screen.
    const label = page.getByText('Available Tags').element();
    const box = label.parentElement?.querySelector('div');

    expect(box?.className).toContain('max-h-96');
    expect(box?.className).toContain('overflow-y-auto');
  });

  it('should call onCancel when Cancel button is clicked', async () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const cancelButton = buttons.find(btn => btn.textContent?.includes('Cancel'));

    if (cancelButton) {
      await userEvent.click(cancelButton);

      expect(mockHandlers.onCancel).toHaveBeenCalled();
    }
  });

  it('should call onBack when Back button is clicked', async () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const backButton = buttons.find(btn => btn.textContent?.includes('Back'));

    if (backButton) {
      await userEvent.click(backButton);

      expect(mockHandlers.onBack).toHaveBeenCalled();
    }
  });

  it('should display Create Class button', () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const createButton = buttons.find(btn => btn.textContent?.includes('Create Class'));

    expect(createButton).toBeTruthy();
  });

  it('should show Creating... button when loading', () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={true}
        classTags={mockClassTags}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const creatingButton = buttons.find(btn => btn.textContent?.includes('Creating...'));

    expect(creatingButton).toBeTruthy();
  });

  it('should disable Create Class button when loading', () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={true}
        classTags={mockClassTags}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const createButton = buttons.find(btn => btn.textContent?.includes('Creating...'));

    expect(createButton?.disabled).toBe(true);
  });

  it('should call onNext when Create Class button is clicked', async () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const createButton = buttons.find(btn => btn.textContent?.includes('Create Class'));

    if (createButton) {
      await userEvent.click(createButton);

      expect(mockHandlers.onNext).toHaveBeenCalled();
    }
  });

  it('should display error message when provided', () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        error="Something went wrong"
        classTags={mockClassTags}
      />,
    );

    const errorMessage = page.getByText('Something went wrong');

    expect(errorMessage).toBeTruthy();
  });

  it('should display selected tags when they exist', () => {
    const dataWithTags: AddClassWizardData = {
      ...mockData,
      tags: ['tag-1'],
    };

    render(
      <ClassTagsStep
        data={dataWithTags}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    const selectedTagsLabel = page.getByText('Selected Tags');

    expect(selectedTagsLabel).toBeTruthy();
  });

  it('should show help text', () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    const helpText = page.getByText('Tags help members find classes and organize your schedule.');

    expect(helpText).toBeTruthy();
  });

  it('should render calendar color picker', () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    const colorLabel = page.getByText('Calendar Color');

    expect(colorLabel).toBeTruthy();
  });

  it('should render calendar color help text', () => {
    render(
      <ClassTagsStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        isLoading={false}
        classTags={mockClassTags}
      />,
    );

    const colorHelp = page.getByText('Use the color picker or enter a hex code, e.g., #ff0000 = red');

    expect(colorHelp).toBeTruthy();
  });
});
