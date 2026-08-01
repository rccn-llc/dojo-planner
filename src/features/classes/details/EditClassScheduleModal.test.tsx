import type { ScheduleInstance } from '@/hooks/useAddClassWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditClassScheduleModal } from './EditClassScheduleModal';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Edit Schedule',
  schedule_instances_label: 'Schedule Instances',
  add_instance_button: 'Add Time Slot',
  add_first_instance_button: 'Add First Time Slot',
  instance_number: 'Time Slot {number}',
  remove_button: 'Remove',
  column_day: 'Day',
  column_time: 'Time',
  column_duration: 'Duration',
  column_instructor: 'Instructor',
  column_assistant: 'Assistant',
  column_actions: 'Actions',
  remove_instance_aria: 'Remove time slot',
  no_instances_message: 'No schedule instances. Click "Add Time Slot" to create one.',
  instances_error: 'Please add at least one schedule instance.',
  duration_hr: 'hr',
  duration_min: 'min',
  staff_placeholder: 'Select instructor',
  assistant_none: 'None',
  day_monday: 'Monday',
  day_tuesday: 'Tuesday',
  day_wednesday: 'Wednesday',
  day_thursday: 'Thursday',
  day_friday: 'Friday',
  day_saturday: 'Saturday',
  day_sunday: 'Sunday',
  location_label: 'Location',
  location_placeholder: 'e.g., Downtown HQ',
  calendar_color_label: 'Calendar Color',
  calendar_color_select: 'Choose a color',
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

describe('EditClassScheduleModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  const mockInstance: ScheduleInstance = {
    id: 'test-instance-1',
    dayOfWeek: 'Monday',
    timeHour: 6,
    timeMinute: 0,
    timeAmPm: 'PM',
    durationHours: 1,
    durationMinutes: 0,
    staffMember: 'coach-alex',
    assistantStaff: '',
  };

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    scheduleInstances: [
      mockInstance,
      { ...mockInstance, id: 'test-instance-2', dayOfWeek: 'Wednesday' as const },
      { ...mockInstance, id: 'test-instance-3', dayOfWeek: 'Friday' as const },
    ],
    location: 'Downtown HQ',
    calendarColor: '#22c55e',
    onSave: mockOnSave,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the modal with title when open', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const heading = page.getByText('Edit Schedule');

    expect(heading).toBeTruthy();
  });

  it('should not render when isOpen is false', async () => {
    await render(<EditClassScheduleModal {...defaultProps} isOpen={false} />);

    const heading = document.body.textContent?.includes('Edit Schedule');

    expect(heading).toBe(false);
  });

  it('should render schedule instances label', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const instancesLabel = page.getByText('Schedule Instances');

    expect(instancesLabel).toBeTruthy();
  });

  it('should render Cancel button', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');

    expect(cancelButton).toBeTruthy();
  });

  it('should render Save Changes button', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');

    expect(saveButton).toBeTruthy();
  });

  it('should render field labels in schedule cards', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    // Labels are now inside cards, not table headers
    const dayLabels = document.querySelectorAll('label');
    const labelTexts = Array.from(dayLabels).map(l => l.textContent);

    expect(labelTexts).toContain('Day');
    expect(labelTexts).toContain('Time');
    expect(labelTexts).toContain('Duration');
  });

  it('should render location input', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const locationLabel = page.getByText('Location');

    expect(locationLabel).toBeTruthy();
  });

  it('should render calendar color label', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const colorLabel = page.getByText('Calendar Color');

    expect(colorLabel).toBeTruthy();
  });

  it('should call onClose when Cancel button is clicked', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should have Save button enabled when form is valid', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should render schedule instances', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    // Should have 3 instances
    const rows = document.querySelectorAll('[data-testid^="schedule-row-"]');

    expect(rows.length).toBe(3);
  });

  it('should call onSave with updated values when Save button is clicked', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    // Wait for the simulated API call
    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({
      scheduleInstances: expect.arrayContaining([
        expect.objectContaining({ dayOfWeek: 'Monday' }),
        expect.objectContaining({ dayOfWeek: 'Wednesday' }),
        expect.objectContaining({ dayOfWeek: 'Friday' }),
      ]),
      location: defaultProps.location,
      calendarColor: defaultProps.calendarColor,
    });
  });

  it('should show saving state when submitting', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    // Check if saving button text appears during loading
    const savingButton = page.getByText('Saving...');

    expect(savingButton).toBeTruthy();
  });

  it('should render Add Time Slot button', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const addButton = document.querySelector('[data-testid="add-schedule-instance"]');

    expect(addButton).toBeTruthy();
  });

  it('should update location when input changes', async () => {
    await render(<EditClassScheduleModal {...defaultProps} />);

    const locationInput = page.getByPlaceholder('e.g., Downtown HQ');
    await userEvent.clear(locationInput);
    await userEvent.type(locationInput, 'New Location');

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
      location: 'New Location',
    }));
  });

  it('should render with empty schedule instances', async () => {
    await render(<EditClassScheduleModal {...defaultProps} scheduleInstances={[]} />);

    const noInstancesMsg = page.getByText('No schedule instances. Click "Add Time Slot" to create one.');

    expect(noInstancesMsg).toBeTruthy();
  });

  it('should disable Save button when no instances exist', async () => {
    await render(<EditClassScheduleModal {...defaultProps} scheduleInstances={[]} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(true);
  });
});
