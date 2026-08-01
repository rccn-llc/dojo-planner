import type { AddClassWizardData } from '@/hooks/useAddClassWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { createMockWizardData } from '@/test-utils/mockWizardData';
import { TypeSelectionStep } from './TypeSelectionStep';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'What would you like to create?',
  subtitle: 'Choose whether to create a recurring class or a one-time event',
  class_option: 'Class',
  class_description: 'Recurring sessions that repeat on a weekly schedule',
  event_option: 'Event',
  event_description: 'One-time or multi-day events like seminars and workshops',
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

describe('TypeSelectionStep', () => {
  // Start with no item type selected to test initial state
  const mockData = createMockWizardData({
    itemType: undefined as unknown as 'class' | 'event',
  });

  const mockHandlers = {
    onUpdate: vi.fn(),
    onNext: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the step with title and subtitle', async () => {
    await render(
      <TypeSelectionStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const heading = page.getByRole('heading', { level: 2 });

    expect(heading).toBeTruthy();
  });

  it('should render class option card', async () => {
    await render(
      <TypeSelectionStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const classOption = page.getByText('Class');
    const classDescription = page.getByText('Recurring sessions that repeat on a weekly schedule');

    expect(classOption).toBeTruthy();
    expect(classDescription).toBeTruthy();
  });

  it('should render event option card', async () => {
    await render(
      <TypeSelectionStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const eventOption = page.getByText('Event');
    const eventDescription = page.getByText('One-time or multi-day events like seminars and workshops');

    expect(eventOption).toBeTruthy();
    expect(eventDescription).toBeTruthy();
  });

  it('should call onUpdate when class option is clicked', async () => {
    await render(
      <TypeSelectionStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const classCard = document.querySelector('[data-testid="type-selection-class"]');

    if (classCard) {
      await userEvent.click(classCard);

      expect(mockHandlers.onUpdate).toHaveBeenCalledWith({ itemType: 'class' });
    }
  });

  it('should call onUpdate when event option is clicked', async () => {
    await render(
      <TypeSelectionStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const eventCard = document.querySelector('[data-testid="type-selection-event"]');

    if (eventCard) {
      await userEvent.click(eventCard);

      expect(mockHandlers.onUpdate).toHaveBeenCalledWith({ itemType: 'event' });
    }
  });

  it('should have Next button disabled when no type is selected', async () => {
    await render(
      <TypeSelectionStep
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

  it('should enable Next button when class type is selected', async () => {
    const dataWithClass: AddClassWizardData = {
      ...mockData,
      itemType: 'class',
    };

    await render(
      <TypeSelectionStep
        data={dataWithClass}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(false);
  });

  it('should enable Next button when event type is selected', async () => {
    const dataWithEvent: AddClassWizardData = {
      ...mockData,
      itemType: 'event',
    };

    await render(
      <TypeSelectionStep
        data={dataWithEvent}
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
    await render(
      <TypeSelectionStep
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

  it('should call onNext when Next button is clicked with valid selection', async () => {
    const dataWithSelection: AddClassWizardData = {
      ...mockData,
      itemType: 'class',
    };

    await render(
      <TypeSelectionStep
        data={dataWithSelection}
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

  it('should display error message when provided', async () => {
    await render(
      <TypeSelectionStep
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

  it('should highlight class card when class is selected', async () => {
    const dataWithClass: AddClassWizardData = {
      ...mockData,
      itemType: 'class',
    };

    await render(
      <TypeSelectionStep
        data={dataWithClass}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const classCard = document.querySelector('[data-testid="type-selection-class"]');

    expect(classCard?.classList.contains('border-2')).toBe(true);
    expect(classCard?.classList.contains('border-primary')).toBe(true);
  });

  it('should highlight event card when event is selected', async () => {
    const dataWithEvent: AddClassWizardData = {
      ...mockData,
      itemType: 'event',
    };

    await render(
      <TypeSelectionStep
        data={dataWithEvent}
        onUpdate={mockHandlers.onUpdate}
        onNext={mockHandlers.onNext}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const eventCard = document.querySelector('[data-testid="type-selection-event"]');

    expect(eventCard?.classList.contains('border-2')).toBe(true);
    expect(eventCard?.classList.contains('border-primary')).toBe(true);
  });
});
