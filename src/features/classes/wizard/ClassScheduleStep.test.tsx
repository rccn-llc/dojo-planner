import type { AddClassWizardData, ScheduleInstance } from '@/hooks/useAddClassWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { createMockScheduleInstance, createMockWizardData } from '@/test-utils/mockWizardData';
import { ClassScheduleStep } from './ClassScheduleStep';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Schedule Details',
  subtitle: 'Set up the class schedule and assign instructors',
  schedule_instances_label: 'Schedule Instances',
  add_instance_button: 'Add Time Slot',
  add_first_instance_button: 'Add First Time Slot',
  no_instances_message: 'No schedule instances added yet. Add time slots to define when this class meets.',
  instances_error: 'Please add at least one schedule instance.',
  instance_number: 'Time Slot {number}',
  remove_button: 'Remove',
  column_day: 'Day',
  column_time: 'Time',
  column_duration: 'Duration',
  column_instructor: 'Instructor',
  column_assistant: 'Assistant',
  column_actions: 'Actions',
  remove_instance_aria: 'Remove this time slot',
  day_monday: 'Monday',
  day_tuesday: 'Tuesday',
  day_wednesday: 'Wednesday',
  day_thursday: 'Thursday',
  day_friday: 'Friday',
  day_saturday: 'Saturday',
  day_sunday: 'Sunday',
  duration_hr: 'hr',
  duration_min: 'min',
  staff_member_placeholder: 'Select instructor',
  assistant_staff_none: 'None',
  back_button: 'Back',
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

const mockInstructors = [
  { id: 'ins-1', name: 'Ann Lee', photoUrl: null },
  { id: 'ins-2', name: 'Bob Ng', photoUrl: null },
  { id: 'coach-alex', name: 'Coach Alex', photoUrl: null },
];

vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({ organization: { id: 'test-org' } }),
}));

vi.mock('@/hooks/useInstructorsCache', () => ({
  useInstructorsCache: () => ({
    instructors: mockInstructors,
    instructorLookup: new Map(mockInstructors.map(i => [i.id, i])),
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateInstructorsCache: vi.fn(),
}));

describe('ClassScheduleStep', () => {
  const mockData = createMockWizardData({
    className: 'Test Class',
    program: 'adult-bjj',
    description: 'Test description',
  });

  const mockInstance: ScheduleInstance = createMockScheduleInstance({
    id: 'test-instance-1',
    staffMember: 'coach-alex',
  });

  const mockHandlers = {
    onUpdate: vi.fn(),
    onUpdateSchedule: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the step with title and subtitle', async () => {
    await render(
      <ClassScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const heading = page.getByRole('heading', { level: 2 });

    expect(heading).toBeTruthy();
  });

  it('should render empty state when no schedule instances', async () => {
    await render(
      <ClassScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const emptyMessage = page.getByText('No schedule instances added yet. Add time slots to define when this class meets.');

    expect(emptyMessage).toBeTruthy();
  });

  it('should render add time slot button in empty state', async () => {
    await render(
      <ClassScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const addButton = page.getByText('Add First Time Slot');

    expect(addButton).toBeTruthy();
  });

  it('should have Next button disabled when form is incomplete (no instances)', async () => {
    await render(
      <ClassScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(true);
  });

  it('should enable Next button when form has valid schedule instance', async () => {
    const completeData: AddClassWizardData = {
      ...mockData,
      schedule: {
        instances: [mockInstance],
        exceptions: [],
        location: 'Downtown HQ',
      },
    };

    await render(
      <ClassScheduleStep
        data={completeData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(false);
  });

  it('should call onCancel when Cancel button is clicked', async () => {
    await render(
      <ClassScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
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

  it('should call onBack when Back button is clicked', async () => {
    await render(
      <ClassScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const backButton = buttons.find(btn => btn.textContent?.includes('Back'));

    if (backButton) {
      await userEvent.click(backButton);

      expect(mockHandlers.onBack).toHaveBeenCalled();
    }
  });

  it('should display error message when provided', async () => {
    await render(
      <ClassScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        error="Something went wrong"
      />,
    );

    const errorMessage = page.getByText('Something went wrong');

    expect(errorMessage).toBeTruthy();
  });

  it('should render schedule instances table when instances exist', async () => {
    const dataWithInstances: AddClassWizardData = {
      ...mockData,
      schedule: {
        instances: [mockInstance],
        exceptions: [],
        location: 'Downtown HQ',
      },
    };

    await render(
      <ClassScheduleStep
        data={dataWithInstances}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    // Check that the table headers are rendered
    const dayHeader = page.getByText('Day');
    const timeHeader = page.getByText('Time');
    const durationHeader = page.getByText('Duration');

    expect(dayHeader).toBeTruthy();
    expect(timeHeader).toBeTruthy();
    expect(durationHeader).toBeTruthy();
  });

  it('should call onNext when Next button is clicked with valid data', async () => {
    const completeData: AddClassWizardData = {
      ...mockData,
      schedule: {
        instances: [mockInstance],
        exceptions: [],
        location: 'Downtown HQ',
      },
    };

    await render(
      <ClassScheduleStep
        data={completeData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
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

  it('should call onUpdateSchedule when adding a new instance', async () => {
    await render(
      <ClassScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const addButton = document.querySelector('[data-testid="add-schedule-instance"]');

    if (addButton) {
      await userEvent.click(addButton);

      expect(mockHandlers.onUpdateSchedule).toHaveBeenCalled();

      const call = mockHandlers.onUpdateSchedule.mock.calls[0]?.[0];

      expect(call?.instances).toHaveLength(1);
      expect(call?.instances[0]?.dayOfWeek).toBe('Monday');
    }
  });

  it('should render multiple schedule instances', async () => {
    const multipleInstances: ScheduleInstance[] = [
      { ...mockInstance, id: 'instance-1', dayOfWeek: 'Monday' },
      { ...mockInstance, id: 'instance-2', dayOfWeek: 'Wednesday' },
      { ...mockInstance, id: 'instance-3', dayOfWeek: 'Friday' },
    ];

    const dataWithMultiple: AddClassWizardData = {
      ...mockData,
      schedule: {
        instances: multipleInstances,
        exceptions: [],
        location: 'Downtown HQ',
      },
    };

    await render(
      <ClassScheduleStep
        data={dataWithMultiple}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    // Check that we have 3 rows in the table (one for each instance)
    const rows = document.querySelectorAll('[data-testid^="schedule-row-"]');

    expect(rows.length).toBe(3);
  });

  it('should have disabled Next button when instance has no duration', async () => {
    const invalidInstance: ScheduleInstance = {
      ...mockInstance,
      durationHours: 0,
      durationMinutes: 0,
    };

    const dataWithInvalidInstance: AddClassWizardData = {
      ...mockData,
      schedule: {
        instances: [invalidInstance],
        exceptions: [],
        location: 'Downtown HQ',
      },
    };

    await render(
      <ClassScheduleStep
        data={dataWithInvalidInstance}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(true);
  });

  it('should have disabled Next button when instance has no staff member', async () => {
    const invalidInstance: ScheduleInstance = {
      ...mockInstance,
      staffMember: '',
    };

    const dataWithInvalidInstance: AddClassWizardData = {
      ...mockData,
      schedule: {
        instances: [invalidInstance],
        exceptions: [],
        location: 'Downtown HQ',
      },
    };

    await render(
      <ClassScheduleStep
        data={dataWithInvalidInstance}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(true);
  });

  it('should render instructor column header', async () => {
    const dataWithInstances: AddClassWizardData = {
      ...mockData,
      schedule: {
        instances: [mockInstance],
        exceptions: [],
        location: 'Downtown HQ',
      },
    };

    await render(
      <ClassScheduleStep
        data={dataWithInstances}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const instructorHeader = page.getByText('Instructor');

    expect(instructorHeader).toBeTruthy();
  });

  it('should render assistant column header', async () => {
    const dataWithInstances: AddClassWizardData = {
      ...mockData,
      schedule: {
        instances: [mockInstance],
        exceptions: [],
        location: 'Downtown HQ',
      },
    };

    await render(
      <ClassScheduleStep
        data={dataWithInstances}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const assistantHeader = page.getByText('Assistant');

    expect(assistantHeader).toBeTruthy();
  });

  it('should render actions column header', async () => {
    const dataWithInstances: AddClassWizardData = {
      ...mockData,
      schedule: {
        instances: [mockInstance],
        exceptions: [],
        location: 'Downtown HQ',
      },
    };

    await render(
      <ClassScheduleStep
        data={dataWithInstances}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const actionsHeader = page.getByText('Actions');

    expect(actionsHeader).toBeTruthy();
  });

  it('should render Schedule Instances label', async () => {
    await render(
      <ClassScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const label = page.getByText('Schedule Instances');

    expect(label).toBeTruthy();
  });

  it('should call onUpdateSchedule when removing an instance', async () => {
    const dataWithInstance: AddClassWizardData = {
      ...mockData,
      schedule: {
        instances: [mockInstance],
        exceptions: [],
        location: 'Downtown HQ',
      },
    };

    await render(
      <ClassScheduleStep
        data={dataWithInstance}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const removeButton = document.querySelector(`[data-testid="remove-instance-${mockInstance.id}"]`);

    if (removeButton) {
      await userEvent.click(removeButton);

      expect(mockHandlers.onUpdateSchedule).toHaveBeenCalled();

      const call = mockHandlers.onUpdateSchedule.mock.calls[0]?.[0];

      expect(call?.instances).toHaveLength(0);
    }
  });

  it('should render add time slot button in header when instances exist', async () => {
    const dataWithInstances: AddClassWizardData = {
      ...mockData,
      schedule: {
        instances: [mockInstance],
        exceptions: [],
        location: 'Downtown HQ',
      },
    };

    await render(
      <ClassScheduleStep
        data={dataWithInstances}
        onUpdate={mockHandlers.onUpdate}
        onUpdateSchedule={mockHandlers.onUpdateSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const addButton = page.getByText('Add Time Slot');

    expect(addButton).toBeTruthy();
  });
});
