import type { ScheduleException, ScheduleInstance } from '@/hooks/useAddClassWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { ClassScheduleCard } from './ClassScheduleCard';

const translationKeys: Record<string, string> = {
  title: 'Schedule',
  schedule_label: 'Schedule',
  column_day: 'Day',
  column_time: 'Time',
  column_duration: 'Duration',
  column_instructor: 'Instructor',
  column_assistant: 'Assistant',
  column_actions: 'Actions',
  no_schedule: 'No schedule set',
  location_label: 'Location',
  calendar_color_label: 'Calendar Color',
  no_location: 'No location set',
  exceptions_label: 'Schedule Exceptions',
  exception_type_deleted: 'Cancelled',
  exception_type_modified: 'Modified',
  exception_type_modified_forward: 'Modified (ongoing)',
  unknown_instance: 'Unknown',
  and_onwards: '(and onwards)',
  instructor_changed: 'Instructor',
  time_changed: 'Time',
  edit_exception_aria: 'Edit exception',
  add_exception_aria: 'Add exception for this schedule',
  add_exception_title: 'Add Schedule Exception',
  add_exception_description: 'Select a {day} to modify or cancel this class occurrence.',
  select_date_label: 'Date',
  cancel_button: 'Cancel',
  continue_button: 'Continue',
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

describe('ClassScheduleCard', () => {
  const mockOnEdit = vi.fn();

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
    scheduleInstances: [mockInstance],
    location: 'Downtown HQ',
    calendarColor: '#22c55e',
    onEdit: mockOnEdit,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the card with title', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const heading = page.getByText('Schedule');

    expect(heading).toBeTruthy();
  });

  it('should render schedule instances table', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    // Check for table headers
    const dayHeader = page.getByText('Day');
    const timeHeader = page.getByText('Time');
    const durationHeader = page.getByText('Duration');

    expect(dayHeader).toBeTruthy();
    expect(timeHeader).toBeTruthy();
    expect(durationHeader).toBeTruthy();
  });

  it('should render the day abbreviation', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const day = page.getByText('Mon');

    expect(day).toBeTruthy();
  });

  it('should render the time', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const time = page.getByText('06:00 PM');

    expect(time).toBeTruthy();
  });

  it('should render the duration', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const duration = page.getByText('1h');

    expect(duration).toBeTruthy();
  });

  it('should render the location', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const location = page.getByText('Downtown HQ');

    expect(location).toBeTruthy();
  });

  it('should render the calendar color', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const colorCode = page.getByText('#22c55e');

    expect(colorCode).toBeTruthy();
  });

  it('should render Edit button', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const editButton = page.getByRole('button');

    expect(editButton).toBeTruthy();
  });

  it('should call onEdit when Edit button is clicked', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const editButton = page.getByRole('button');
    await userEvent.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledTimes(1);
  });

  it('should render all field labels', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const scheduleLabel = page.getByText('Schedule');
    const locationLabel = page.getByText('Location');
    const colorLabel = page.getByText('Calendar Color');

    expect(scheduleLabel).toBeTruthy();
    expect(locationLabel).toBeTruthy();
    expect(colorLabel).toBeTruthy();
  });

  it('should show no schedule message when no instances', async () => {
    await render(<ClassScheduleCard {...defaultProps} scheduleInstances={[]} />);

    const noSchedule = page.getByText('No schedule set');

    expect(noSchedule).toBeTruthy();
  });

  it('should show no location message when location is empty', async () => {
    await render(<ClassScheduleCard {...defaultProps} location="" />);

    const noLocation = page.getByText('No location set');

    expect(noLocation).toBeTruthy();
  });

  it('should format duration with hours and minutes', async () => {
    const instanceWithMinutes: ScheduleInstance = {
      ...mockInstance,
      durationHours: 1,
      durationMinutes: 30,
    };

    await render(<ClassScheduleCard {...defaultProps} scheduleInstances={[instanceWithMinutes]} />);

    const duration = page.getByText('1h 30m');

    expect(duration).toBeTruthy();
  });

  it('should render instructor name', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const instructor = page.getByText('Coach Alex');

    expect(instructor).toBeTruthy();
  });

  it('should render dash when no instructor assigned', async () => {
    const instanceNoStaff: ScheduleInstance = {
      ...mockInstance,
      staffMember: '',
    };

    await render(<ClassScheduleCard {...defaultProps} scheduleInstances={[instanceNoStaff]} />);

    // The instructor column should show a dash
    const rows = document.querySelectorAll('[data-testid^="schedule-instance-"]');

    expect(rows.length).toBe(1);
  });

  it('should render multiple schedule instances', async () => {
    const multipleInstances: ScheduleInstance[] = [
      { ...mockInstance, id: 'instance-1', dayOfWeek: 'Monday' },
      { ...mockInstance, id: 'instance-2', dayOfWeek: 'Wednesday' },
      { ...mockInstance, id: 'instance-3', dayOfWeek: 'Friday' },
    ];

    await render(<ClassScheduleCard {...defaultProps} scheduleInstances={multipleInstances} />);

    const rows = document.querySelectorAll('[data-testid^="schedule-instance-"]');

    expect(rows.length).toBe(3);
  });

  it('should render instructor column header', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const instructorHeader = page.getByText('Instructor');

    expect(instructorHeader).toBeTruthy();
  });

  it('should render assistant column header', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    const assistantHeader = page.getByText('Assistant');

    expect(assistantHeader).toBeTruthy();
  });

  it('should render assistant name when assigned', async () => {
    const instanceWithAssistant: ScheduleInstance = {
      ...mockInstance,
      assistantStaff: 'professor-jessica',
    };

    await render(<ClassScheduleCard {...defaultProps} scheduleInstances={[instanceWithAssistant]} />);

    const assistant = page.getByText('Professor Jessica');

    expect(assistant).toBeTruthy();
  });

  it('should render dash when no assistant assigned', async () => {
    await render(<ClassScheduleCard {...defaultProps} />);

    // With no assistant, there should be a dash in the assistant column
    const rows = document.querySelectorAll('[data-testid^="schedule-instance-"]');

    expect(rows.length).toBe(1);
  });

  it('should render different day abbreviations correctly', async () => {
    const weekInstances: ScheduleInstance[] = [
      { ...mockInstance, id: 'tue', dayOfWeek: 'Tuesday' },
      { ...mockInstance, id: 'thu', dayOfWeek: 'Thursday' },
      { ...mockInstance, id: 'sat', dayOfWeek: 'Saturday' },
    ];

    await render(<ClassScheduleCard {...defaultProps} scheduleInstances={weekInstances} />);

    const tue = page.getByText('Tue');
    const thu = page.getByText('Thu');
    const sat = page.getByText('Sat');

    expect(tue).toBeTruthy();
    expect(thu).toBeTruthy();
    expect(sat).toBeTruthy();
  });

  it('should render duration in minutes only when hours is 0', async () => {
    const instanceMinutesOnly: ScheduleInstance = {
      ...mockInstance,
      durationHours: 0,
      durationMinutes: 45,
    };

    await render(<ClassScheduleCard {...defaultProps} scheduleInstances={[instanceMinutesOnly]} />);

    const duration = page.getByText('45m');

    expect(duration).toBeTruthy();
  });

  describe('Schedule Exceptions', () => {
    const mockOnEditInstance = vi.fn();

    const mockException: ScheduleException = {
      id: 'exception-1',
      scheduleInstanceId: 'test-instance-1',
      date: '2025-01-15',
      type: 'modified',
      overrides: {
        staffMember: 'professor-jessica',
      },
      createdAt: '2025-01-10T00:00:00.000Z',
    };

    it('should not render exceptions section when no exceptions', async () => {
      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[]} />);

      const exceptionsSection = document.querySelector('[data-testid="schedule-exceptions-section"]');

      expect(exceptionsSection).toBeNull();
    });

    it('should render exceptions section when exceptions exist', async () => {
      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[mockException]} />);

      const exceptionsSection = document.querySelector('[data-testid="schedule-exceptions-section"]');

      expect(exceptionsSection).toBeTruthy();
    });

    it('should render exceptions label', async () => {
      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[mockException]} />);

      const label = page.getByText('Schedule Exceptions');

      expect(label).toBeTruthy();
    });

    it('should render exception with correct test id', async () => {
      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[mockException]} />);

      const exceptionElement = document.querySelector('[data-testid="schedule-exception-exception-1"]');

      expect(exceptionElement).toBeTruthy();
    });

    it('should render day abbreviation for exception', async () => {
      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[mockException]} />);

      const exceptionsSection = document.querySelector('[data-testid="schedule-exceptions-section"]');
      const dayAbbrev = exceptionsSection?.textContent?.includes('Mon');

      expect(dayAbbrev).toBe(true);
    });

    it('should render deleted exception with correct styling', async () => {
      const deletedException: ScheduleException = {
        ...mockException,
        type: 'deleted',
        overrides: undefined,
      };

      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[deletedException]} />);

      const exceptionElement = document.querySelector('[data-testid="schedule-exception-exception-1"]');

      expect(exceptionElement?.classList.toString()).toContain('destructive');
    });

    it('should render modified-forward exception with and onwards text', async () => {
      const forwardException: ScheduleException = {
        ...mockException,
        type: 'modified-forward',
        effectiveFromDate: '2025-01-15',
      };

      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[forwardException]} />);

      const onwardsText = page.getByText('(and onwards)');

      expect(onwardsText).toBeTruthy();
    });

    it('should render instructor changed badge when instructor is different', async () => {
      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[mockException]} />);

      const instructorBadge = page.getByText(/Instructor/);

      expect(instructorBadge).toBeTruthy();
    });

    it('should render exception note when provided', async () => {
      const exceptionWithNote: ScheduleException = {
        ...mockException,
        note: 'Substitute instructor for the day',
      };

      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[exceptionWithNote]} />);

      const note = page.getByText('Substitute instructor for the day');

      expect(note).toBeTruthy();
    });

    it('should render edit button for exception when onEditInstance is provided', async () => {
      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[mockException]} onEditInstance={mockOnEditInstance} />);

      const editButton = document.querySelector('[data-testid="edit-exception-exception-1"]');

      expect(editButton).toBeTruthy();
    });

    it('should not render edit button when onEditInstance is not provided', async () => {
      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[mockException]} />);

      const editButton = document.querySelector('[data-testid="edit-exception-exception-1"]');

      expect(editButton).toBeNull();
    });

    it('should call onEditInstance when edit button is clicked', async () => {
      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[mockException]} onEditInstance={mockOnEditInstance} />);

      const editButton = document.querySelector('[data-testid="edit-exception-exception-1"]');
      if (editButton) {
        await userEvent.click(editButton);
      }

      expect(mockOnEditInstance).toHaveBeenCalledWith(
        mockInstance,
        mockException.date,
        mockException,
      );
    });

    it('should render multiple exceptions', async () => {
      const multipleExceptions: ScheduleException[] = [
        { ...mockException, id: 'exc-1', date: '2025-01-15' },
        { ...mockException, id: 'exc-2', date: '2025-01-22' },
        { ...mockException, id: 'exc-3', date: '2025-01-29', type: 'deleted', overrides: undefined },
      ];

      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={multipleExceptions} />);

      const exc1 = document.querySelector('[data-testid="schedule-exception-exc-1"]');
      const exc2 = document.querySelector('[data-testid="schedule-exception-exc-2"]');
      const exc3 = document.querySelector('[data-testid="schedule-exception-exc-3"]');

      expect(exc1).toBeTruthy();
      expect(exc2).toBeTruthy();
      expect(exc3).toBeTruthy();
    });

    it('should show unknown for exception with invalid instance id', async () => {
      const orphanException: ScheduleException = {
        ...mockException,
        scheduleInstanceId: 'non-existent-instance',
      };

      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[orphanException]} />);

      const unknown = page.getByText('Unknown');

      expect(unknown).toBeTruthy();
    });

    it('should render time changed badge when time is modified', async () => {
      const timeException: ScheduleException = {
        ...mockException,
        overrides: {
          timeHour: 7,
          timeMinute: 30,
          timeAmPm: 'PM',
        },
      };

      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[timeException]} />);

      const timeBadge = page.getByText(/Time:/);

      expect(timeBadge).toBeTruthy();
    });

    it('should not render overrides section for deleted exceptions', async () => {
      const deletedException: ScheduleException = {
        ...mockException,
        type: 'deleted',
        overrides: {
          staffMember: 'professor-jessica',
        },
      };

      await render(<ClassScheduleCard {...defaultProps} scheduleExceptions={[deletedException]} />);

      const exceptionsSection = document.querySelector('[data-testid="schedule-exceptions-section"]');
      const hasInstructorBadge = exceptionsSection?.textContent?.includes('Instructor:');

      expect(hasInstructorBadge).toBe(false);
    });
  });

  describe('Add Exception Button', () => {
    const mockOnEditInstance = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should not render add exception button when onEditInstance is not provided', async () => {
      await render(<ClassScheduleCard {...defaultProps} />);

      const addButton = document.querySelector('[data-testid="add-exception-test-instance-1"]');

      expect(addButton).toBeNull();
    });

    it('should not render Actions column when onEditInstance is not provided', async () => {
      await render(<ClassScheduleCard {...defaultProps} />);

      const actionsHeader = page.getByText('Actions');

      expect(actionsHeader.elements().length).toBe(0);
    });

    it('should render add exception button when onEditInstance is provided', async () => {
      await render(<ClassScheduleCard {...defaultProps} onEditInstance={mockOnEditInstance} />);

      const addButton = document.querySelector('[data-testid="add-exception-test-instance-1"]');

      expect(addButton).toBeTruthy();
    });

    it('should render Actions column when onEditInstance is provided', async () => {
      await render(<ClassScheduleCard {...defaultProps} onEditInstance={mockOnEditInstance} />);

      const actionsHeader = page.getByText('Actions');

      expect(actionsHeader).toBeTruthy();
    });

    it('should open date picker popover when add button is clicked', async () => {
      await render(<ClassScheduleCard {...defaultProps} onEditInstance={mockOnEditInstance} />);

      const addButton = document.querySelector('[data-testid="add-exception-test-instance-1"]');
      if (addButton) {
        await userEvent.click(addButton);
      }

      const popoverTitle = page.getByText('Add Schedule Exception');

      expect(popoverTitle).toBeTruthy();
    });

    it('should render date input in popover', async () => {
      await render(<ClassScheduleCard {...defaultProps} onEditInstance={mockOnEditInstance} />);

      const addButton = document.querySelector('[data-testid="add-exception-test-instance-1"]');
      if (addButton) {
        await userEvent.click(addButton);
      }

      const dateInput = document.querySelector('[data-testid="date-input-test-instance-1"]');

      expect(dateInput).toBeTruthy();
    });

    it('should render cancel button in popover', async () => {
      await render(<ClassScheduleCard {...defaultProps} onEditInstance={mockOnEditInstance} />);

      const addButton = document.querySelector('[data-testid="add-exception-test-instance-1"]');
      if (addButton) {
        await userEvent.click(addButton);
      }

      const cancelButton = page.getByText('Cancel');

      expect(cancelButton).toBeTruthy();
    });

    it('should render continue button in popover', async () => {
      await render(<ClassScheduleCard {...defaultProps} onEditInstance={mockOnEditInstance} />);

      const addButton = document.querySelector('[data-testid="add-exception-test-instance-1"]');
      if (addButton) {
        await userEvent.click(addButton);
      }

      const continueButton = page.getByText('Continue');

      expect(continueButton).toBeTruthy();
    });

    it('should close popover when cancel is clicked', async () => {
      await render(<ClassScheduleCard {...defaultProps} onEditInstance={mockOnEditInstance} />);

      const addButton = document.querySelector('[data-testid="add-exception-test-instance-1"]');
      if (addButton) {
        await userEvent.click(addButton);
      }

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await userEvent.click(cancelButton);

      // Wait a bit for animation
      await new Promise(resolve => setTimeout(resolve, 100));

      const popoverTitle = document.querySelector('[data-testid="date-input-test-instance-1"]');

      expect(popoverTitle).toBeNull();
    });

    it('should call onEditInstance when continue is clicked with selected date', async () => {
      await render(<ClassScheduleCard {...defaultProps} onEditInstance={mockOnEditInstance} />);

      const addButton = document.querySelector('[data-testid="add-exception-test-instance-1"]');
      if (addButton) {
        await userEvent.click(addButton);
      }

      const dateInput = document.querySelector('[data-testid="date-input-test-instance-1"]') as HTMLInputElement;
      if (dateInput) {
        dateInput.value = '2025-02-10';
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const confirmButton = document.querySelector('[data-testid="confirm-date-test-instance-1"]');
      if (confirmButton) {
        await userEvent.click(confirmButton);
      }

      expect(mockOnEditInstance).toHaveBeenCalled();
    });

    it('should render add button for each schedule instance', async () => {
      const multipleInstances: ScheduleInstance[] = [
        { ...mockInstance, id: 'instance-1', dayOfWeek: 'Monday' },
        { ...mockInstance, id: 'instance-2', dayOfWeek: 'Wednesday' },
        { ...mockInstance, id: 'instance-3', dayOfWeek: 'Friday' },
      ];

      await render(<ClassScheduleCard {...defaultProps} scheduleInstances={multipleInstances} onEditInstance={mockOnEditInstance} />);

      const btn1 = document.querySelector('[data-testid="add-exception-instance-1"]');
      const btn2 = document.querySelector('[data-testid="add-exception-instance-2"]');
      const btn3 = document.querySelector('[data-testid="add-exception-instance-3"]');

      expect(btn1).toBeTruthy();
      expect(btn2).toBeTruthy();
      expect(btn3).toBeTruthy();
    });
  });
});
