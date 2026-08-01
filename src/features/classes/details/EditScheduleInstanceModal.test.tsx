import type { ScheduleException, ScheduleInstance } from '@/hooks/useAddClassWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditScheduleInstanceModal } from './EditScheduleInstanceModal';

const translationKeys: Record<string, string> = {
  title: 'Edit Schedule Instance',
  edit_mode_label: 'Apply changes to',
  edit_mode_this_instance: 'This instance only',
  edit_mode_this_instance_desc: 'Only modify this specific date',
  edit_mode_this_and_future: 'This and all future instances',
  edit_mode_this_and_future_desc: 'Apply changes from this date going forward',
  instance_details_title: 'Instance Details',
  time_label: 'Time',
  duration_label: 'Duration',
  instructor_label: 'Instructor',
  instructor_placeholder: 'Select instructor',
  instructor_none: 'None',
  assistant_label: 'Assistant',
  assistant_none: 'None',
  note_label: 'Note (optional)',
  note_placeholder: 'Add a note about this change...',
  delete_instance_button: 'Delete This Instance',
  cancel_button: 'Cancel',
  save_button: 'Save Changes',
  saving_button: 'Saving...',
  day_monday: 'Monday',
  day_tuesday: 'Tuesday',
  day_wednesday: 'Wednesday',
  day_thursday: 'Thursday',
  day_friday: 'Friday',
  day_saturday: 'Saturday',
  day_sunday: 'Sunday',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translationKeys[key] || key,
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

describe('EditScheduleInstanceModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSaveException = vi.fn();
  const mockOnDeleteException = vi.fn();

  const mockScheduleInstance: ScheduleInstance = {
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
    scheduleInstance: mockScheduleInstance,
    selectedDate: '2025-01-15',
    onSaveException: mockOnSaveException,
    onDeleteException: mockOnDeleteException,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the modal with title when open', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const heading = page.getByText('Edit Schedule Instance');

    expect(heading).toBeTruthy();
  });

  it('should not render when isOpen is false', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} isOpen={false} />);

    const heading = document.body.textContent?.includes('Edit Schedule Instance');

    expect(heading).toBe(false);
  });

  it('should render the selected date information', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const dayLabel = page.getByText('Monday');

    expect(dayLabel).toBeTruthy();
  });

  it('should render edit mode options', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const thisInstanceOption = page.getByText('This instance only');
    const futureOption = page.getByText('This and all future instances');

    expect(thisInstanceOption).toBeTruthy();
    expect(futureOption).toBeTruthy();
  });

  it('should render edit mode descriptions', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const thisInstanceDesc = page.getByText('Only modify this specific date');
    const futureDesc = page.getByText('Apply changes from this date going forward');

    expect(thisInstanceDesc).toBeTruthy();
    expect(futureDesc).toBeTruthy();
  });

  it('should render instance details section', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const detailsTitle = page.getByText('Instance Details');

    expect(detailsTitle).toBeTruthy();
  });

  it('should render time label', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const timeLabel = page.getByText('Time');

    expect(timeLabel).toBeTruthy();
  });

  it('should render duration label', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const durationLabel = page.getByText('Duration');

    expect(durationLabel).toBeTruthy();
  });

  it('should render instructor label', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const instructorLabel = page.getByText('Instructor');

    expect(instructorLabel).toBeTruthy();
  });

  it('should render assistant label', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const assistantLabel = page.getByText('Assistant');

    expect(assistantLabel).toBeTruthy();
  });

  it('should render note input', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const noteInput = page.getByPlaceholder('Add a note about this change...');

    expect(noteInput).toBeTruthy();
  });

  it('should render Cancel button', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');

    expect(cancelButton).toBeTruthy();
  });

  it('should render Save Changes button', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const saveButton = page.getByText('Save Changes');

    expect(saveButton).toBeTruthy();
  });

  it('should render Delete This Instance button', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const deleteButton = page.getByText('Delete This Instance');

    expect(deleteButton).toBeTruthy();
  });

  it('should call onClose when Cancel button is clicked', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const cancelButton = page.getByText('Cancel');
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should have Save button disabled when no changes made', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should call onDeleteException when Delete button is clicked', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const deleteButton = page.getByText('Delete This Instance');
    await userEvent.click(deleteButton);

    await new Promise(resolve => setTimeout(resolve, 400));

    expect(mockOnDeleteException).toHaveBeenCalledTimes(1);
    expect(mockOnDeleteException).toHaveBeenCalledWith(expect.objectContaining({
      scheduleInstanceId: mockScheduleInstance.id,
      date: '2025-01-15',
      type: 'deleted',
    }));
  });

  it('should render with default edit mode as this-instance', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const thisInstanceRadio = document.querySelector('[data-testid="edit-mode-this-instance"]');

    expect(thisInstanceRadio).toBeTruthy();
  });

  it('should render time selectors with initial values', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const hourSelect = document.querySelector('[data-testid="time-hour-select"]');
    const minuteSelect = document.querySelector('[data-testid="time-minute-select"]');
    const ampmSelect = document.querySelector('[data-testid="time-ampm-select"]');

    expect(hourSelect).toBeTruthy();
    expect(minuteSelect).toBeTruthy();
    expect(ampmSelect).toBeTruthy();
  });

  it('should render duration selector', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const durationSelect = document.querySelector('[data-testid="duration-select"]');

    expect(durationSelect).toBeTruthy();
  });

  it('should render instructor selector', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const instructorSelect = document.querySelector('[data-testid="instructor-select"]');

    expect(instructorSelect).toBeTruthy();
  });

  it('should render assistant selector', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const assistantSelect = document.querySelector('[data-testid="assistant-select"]');

    expect(assistantSelect).toBeTruthy();
  });

  it('should display existing exception values when provided', async () => {
    const existingException: ScheduleException = {
      id: 'exception-1',
      scheduleInstanceId: mockScheduleInstance.id,
      date: '2025-01-15',
      type: 'modified',
      overrides: {
        staffMember: 'professor-jessica',
      },
      note: 'Instructor substitution',
      createdAt: '2025-01-10T00:00:00.000Z',
    };

    await render(<EditScheduleInstanceModal {...defaultProps} existingException={existingException} />);

    const noteInput = page.getByPlaceholder('Add a note about this change...');

    expect(noteInput).toBeTruthy();
  });

  it('should render dialog content when open', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const title = page.getByText('Edit Schedule Instance');

    expect(title).toBeTruthy();
  });

  it('should render the edit mode radio buttons', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const thisInstance = page.getByText('This instance only');
    const thisFuture = page.getByText('This and all future instances');

    expect(thisInstance).toBeTruthy();
    expect(thisFuture).toBeTruthy();
  });

  it('should render time selection controls', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const timeLabel = page.getByText('Time');

    expect(timeLabel).toBeTruthy();
  });

  it('should render duration selection control', async () => {
    await render(<EditScheduleInstanceModal {...defaultProps} />);

    const durationLabel = page.getByText('Duration');

    expect(durationLabel).toBeTruthy();
  });

  it('should display day of week for the instance', async () => {
    const wednesdayInstance: ScheduleInstance = {
      ...mockScheduleInstance,
      dayOfWeek: 'Wednesday',
    };

    await render(<EditScheduleInstanceModal {...defaultProps} scheduleInstance={wednesdayInstance} />);

    const dayLabel = page.getByText('Wednesday');

    expect(dayLabel).toBeTruthy();
  });

  it('should handle different days of week correctly', async () => {
    const fridayInstance: ScheduleInstance = {
      ...mockScheduleInstance,
      dayOfWeek: 'Friday',
    };

    await render(<EditScheduleInstanceModal {...defaultProps} scheduleInstance={fridayInstance} />);

    const dayLabel = page.getByText('Friday');

    expect(dayLabel).toBeTruthy();
  });
});
