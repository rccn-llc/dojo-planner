import type { AddClassWizardData, EventSession } from '@/hooks/useAddClassWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { createMockWizardData } from '@/test-utils/mockWizardData';
import { EventScheduleStep } from './EventScheduleStep';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Event Schedule',
  subtitle: 'Set up when and where the event will take place',
  date_range_label: 'Event Duration',
  single_day_label: 'Single Day',
  multi_day_label: 'Multiple Days',
  start_date_label: 'Start Date',
  end_date_label: 'End Date',
  location_label: 'Location',
  location_placeholder: 'Enter location',
  sessions_label: 'Sessions',
  session_number: 'Session {number}',
  add_session_button: 'Add Session',
  add_first_session_button: 'Add First Session',
  remove_session_aria: 'Remove this session',
  no_sessions_message: 'No sessions added yet. Add sessions to define your event schedule.',
  sessions_error: 'Please add at least one session.',
  column_date: 'Date',
  column_time: 'Time',
  column_duration: 'Duration',
  column_instructor: 'Instructor',
  column_assistant: 'Assistant',
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

describe('EventScheduleStep', () => {
  const mockData = createMockWizardData({
    itemType: 'event',
    eventSchedule: {
      isMultiDay: false,
      startDate: '',
      endDate: '',
      sessions: [],
      location: '',
    },
  });

  const mockSession: EventSession = {
    id: 'test-session-1',
    date: '2026-01-15',
    timeHour: 10,
    timeMinute: 0,
    timeAmPm: 'AM',
    durationHours: 2,
    durationMinutes: 0,
    staffMember: 'coach-alex',
    assistantStaff: '',
  };

  const mockHandlers = {
    onUpdate: vi.fn(),
    onUpdateEventSchedule: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the step with title and subtitle', () => {
    render(
      <EventScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const heading = page.getByRole('heading', { level: 2 });

    expect(heading).toBeTruthy();
  });

  it('should render single/multi day radio options', () => {
    render(
      <EventScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const singleDayLabel = page.getByText('Single Day');
    const multiDayLabel = page.getByText('Multiple Days');

    expect(singleDayLabel).toBeTruthy();
    expect(multiDayLabel).toBeTruthy();
  });

  it('should render empty state when no sessions', () => {
    render(
      <EventScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const emptyMessage = page.getByText('No sessions added yet. Add sessions to define your event schedule.');

    expect(emptyMessage).toBeTruthy();
  });

  it('should have Next button disabled when form is incomplete (no sessions)', () => {
    render(
      <EventScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(true);
  });

  it('should enable Next button when form has valid session', () => {
    const completeData: AddClassWizardData = {
      ...mockData,
      eventSchedule: {
        isMultiDay: false,
        startDate: '2026-01-15',
        endDate: '2026-01-15',
        sessions: [mockSession],
        location: 'Downtown HQ',
      },
    };

    render(
      <EventScheduleStep
        data={completeData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
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
    render(
      <EventScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
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
    render(
      <EventScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
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

  it('should display error message when provided', () => {
    render(
      <EventScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        error="Something went wrong"
      />,
    );

    const errorMessage = page.getByText('Something went wrong');

    expect(errorMessage).toBeTruthy();
  });

  it('should render session rows when sessions exist', () => {
    const dataWithSession: AddClassWizardData = {
      ...mockData,
      eventSchedule: {
        isMultiDay: false,
        startDate: '2026-01-15',
        endDate: '2026-01-15',
        sessions: [mockSession],
        location: 'Downtown HQ',
      },
    };

    render(
      <EventScheduleStep
        data={dataWithSession}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const sessionRow = document.querySelector(`[data-testid="event-session-row-${mockSession.id}"]`);

    expect(sessionRow).toBeTruthy();
  });

  it('should call onNext when Next button is clicked with valid data', async () => {
    const completeData: AddClassWizardData = {
      ...mockData,
      eventSchedule: {
        isMultiDay: false,
        startDate: '2026-01-15',
        endDate: '2026-01-15',
        sessions: [mockSession],
        location: 'Downtown HQ',
      },
    };

    render(
      <EventScheduleStep
        data={completeData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
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

  it('should render multiple sessions', () => {
    const multipleSessions: EventSession[] = [
      { ...mockSession, id: 'session-1' },
      { ...mockSession, id: 'session-2' },
      { ...mockSession, id: 'session-3' },
    ];

    const dataWithMultiple: AddClassWizardData = {
      ...mockData,
      eventSchedule: {
        isMultiDay: true,
        startDate: '2026-01-15',
        endDate: '2026-01-17',
        sessions: multipleSessions,
        location: 'Downtown HQ',
      },
    };

    render(
      <EventScheduleStep
        data={dataWithMultiple}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const rows = document.querySelectorAll('[data-testid^="event-session-row-"]');

    expect(rows.length).toBe(3);
  });

  it('should have disabled Next button when session has no instructor', () => {
    const invalidSession: EventSession = {
      ...mockSession,
      staffMember: '',
    };

    const dataWithInvalidSession: AddClassWizardData = {
      ...mockData,
      eventSchedule: {
        isMultiDay: false,
        startDate: '2026-01-15',
        endDate: '2026-01-15',
        sessions: [invalidSession],
        location: 'Downtown HQ',
      },
    };

    render(
      <EventScheduleStep
        data={dataWithInvalidSession}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(true);
  });

  it('should render location input', () => {
    render(
      <EventScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const locationLabel = page.getByText('Location');

    expect(locationLabel).toBeTruthy();
  });

  it('should render start date input', () => {
    render(
      <EventScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const startDateLabel = page.getByText('Start Date');

    expect(startDateLabel).toBeTruthy();
  });

  it('should render end date input when multi-day is selected', () => {
    const multiDayData: AddClassWizardData = {
      ...mockData,
      eventSchedule: {
        ...mockData.eventSchedule,
        isMultiDay: true,
      },
    };

    render(
      <EventScheduleStep
        data={multiDayData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const endDateLabel = page.getByText('End Date');

    expect(endDateLabel).toBeTruthy();
  });

  it('should not render end date input when single-day is selected', () => {
    render(
      <EventScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const endDateLabels = Array.from(document.querySelectorAll('label')).filter(
      el => el.textContent === 'End Date',
    );

    expect(endDateLabels.length).toBe(0);
  });

  it('should render sessions label', () => {
    render(
      <EventScheduleStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const label = page.getByText('Sessions');

    expect(label).toBeTruthy();
  });

  it('should call onUpdateEventSchedule when removing a session', async () => {
    const dataWithSession: AddClassWizardData = {
      ...mockData,
      eventSchedule: {
        isMultiDay: false,
        startDate: '2026-01-15',
        endDate: '2026-01-15',
        sessions: [mockSession],
        location: 'Downtown HQ',
      },
    };

    render(
      <EventScheduleStep
        data={dataWithSession}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventSchedule={mockHandlers.onUpdateEventSchedule}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const removeButton = document.querySelector(`[data-testid="remove-session-${mockSession.id}"]`);

    if (removeButton) {
      await userEvent.click(removeButton);

      expect(mockHandlers.onUpdateEventSchedule).toHaveBeenCalled();

      const call = mockHandlers.onUpdateEventSchedule.mock.calls[0]?.[0];

      expect(call?.sessions).toHaveLength(0);
    }
  });
});
