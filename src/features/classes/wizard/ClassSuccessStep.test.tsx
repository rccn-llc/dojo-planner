import type { AddClassWizardData } from '@/hooks/useAddClassWizard';
import type { Tag } from '@/hooks/useTagsCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { createMockScheduleInstance, createMockWizardData } from '@/test-utils/mockWizardData';
import { ClassSuccessStep } from './ClassSuccessStep';

// Mock class tags for testing
const mockClassTags: Tag[] = [
  { id: 'tag-1', name: 'Beginner', slug: 'beginner', color: '#22c55e', entityType: 'class', usageCount: 3 },
  { id: 'tag-2', name: 'Advanced', slug: 'advanced', color: '#ef4444', entityType: 'class', usageCount: 2 },
];

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Class Created Successfully!',
  description: '"{name}" has been added to your schedule.',
  summary_title: 'Class Summary',
  summary_class_name: 'Class Name',
  summary_program: 'Program',
  summary_schedule: 'Schedule',
  summary_duration: 'Duration',
  summary_instructor: 'Instructor',
  summary_tags: 'Tags',
  summary_calendar_color: 'Calendar Color',
  done_button: 'Done',
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

describe('ClassSuccessStep', () => {
  const baseInstance = createMockScheduleInstance({
    timeHour: 6,
    timeMinute: 30,
    timeAmPm: 'AM',
    durationHours: 1,
    durationMinutes: 30,
    staffMember: 'coach-alex',
  });

  const mockData = createMockWizardData({
    className: 'Morning BJJ',
    program: 'prog-1',
    programName: 'Adult Brazilian Jiu-Jitsu',
    description: 'A great class for adults',
    schedule: {
      instances: [
        { ...baseInstance, id: 'instance-1', dayOfWeek: 'Monday' },
        { ...baseInstance, id: 'instance-2', dayOfWeek: 'Wednesday' },
        { ...baseInstance, id: 'instance-3', dayOfWeek: 'Friday' },
      ],
      exceptions: [],
      location: '',
    },
    calendarColor: '#3b82f6',
    tags: [],
  });

  const mockOnDone = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render success title', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const title = page.getByRole('heading', { level: 2 });

    expect(title).toBeTruthy();
  });

  it('should display class name in description', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const description = page.getByText(/"Morning BJJ" has been added to your schedule./);

    expect(description).toBeTruthy();
  });

  it('should display success checkmark icon', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const svg = document.querySelector('svg');

    expect(svg).toBeTruthy();
    expect(svg?.classList.contains('text-green-600')).toBe(true);
  });

  it('should display class summary section', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const summaryTitle = page.getByText('Class Summary');

    expect(summaryTitle).toBeTruthy();
  });

  it('should display class name in summary', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const className = page.getByText('Morning BJJ');

    expect(className).toBeTruthy();
  });

  it('should display program name in summary', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const program = page.getByText('Adult Brazilian Jiu-Jitsu');

    expect(program).toBeTruthy();
  });

  it('should display schedule in summary', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const schedule = page.getByText(/Monday, Wednesday, Friday \(3 time slots\)/);

    expect(schedule).toBeTruthy();
  });

  it('should display duration with hours and minutes', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const duration = page.getByText('1h 30m');

    expect(duration).toBeTruthy();
  });

  it('should display duration with only hours when no minutes', async () => {
    const dataWithOnlyHours: AddClassWizardData = {
      ...mockData,
      schedule: {
        ...mockData.schedule,
        instances: mockData.schedule.instances.map(inst => ({
          ...inst,
          durationHours: 2,
          durationMinutes: 0,
        })),
      },
    };

    await render(<ClassSuccessStep data={dataWithOnlyHours} onDone={mockOnDone} classTags={mockClassTags} />);

    const duration = page.getByText('2h');

    expect(duration).toBeTruthy();
  });

  it('should display duration with only minutes when no hours', async () => {
    const dataWithOnlyMinutes: AddClassWizardData = {
      ...mockData,
      schedule: {
        ...mockData.schedule,
        instances: mockData.schedule.instances.map(inst => ({
          ...inst,
          durationHours: 0,
          durationMinutes: 45,
        })),
      },
    };

    await render(<ClassSuccessStep data={dataWithOnlyMinutes} onDone={mockOnDone} classTags={mockClassTags} />);

    const duration = page.getByText('45m');

    expect(duration).toBeTruthy();
  });

  it('should display instructor name in summary', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const instructor = page.getByText('Coach Alex');

    expect(instructor).toBeTruthy();
  });

  it('should display calendar color preview', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const colorHex = page.getByText('#3b82f6');

    expect(colorHex).toBeTruthy();
  });

  it('should not display tags section when no tags are selected', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const tagsLabel = document.body.textContent?.includes('Tags');

    // The Tags label should not appear when no tags are selected
    expect(tagsLabel).toBe(false);
  });

  it('should display tags when selected', async () => {
    const dataWithTags: AddClassWizardData = {
      ...mockData,
      tags: ['tag-1'],
    };

    await render(<ClassSuccessStep data={dataWithTags} onDone={mockOnDone} classTags={mockClassTags} />);

    const tagsLabel = page.getByText('Tags');

    expect(tagsLabel).toBeTruthy();
  });

  it('should display Done button', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const doneButton = page.getByRole('button', { name: 'Done' });

    expect(doneButton).toBeTruthy();
  });

  it('should call onDone when Done button is clicked', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    const doneButton = page.getByRole('button', { name: 'Done' });
    await userEvent.click(doneButton.element());

    expect(mockOnDone).toHaveBeenCalled();
  });

  it('should fall back to the raw program value when no display name is set', async () => {
    const dataWithUnknownProgram: AddClassWizardData = {
      ...mockData,
      program: 'unknown-program',
      programName: '',
    };

    await render(<ClassSuccessStep data={dataWithUnknownProgram} onDone={mockOnDone} classTags={mockClassTags} />);

    const program = page.getByText('unknown-program');

    expect(program).toBeTruthy();
  });

  it('should handle unknown staff member gracefully', async () => {
    const dataWithUnknownStaff: AddClassWizardData = {
      ...mockData,
      schedule: {
        ...mockData.schedule,
        instances: mockData.schedule.instances.map(inst => ({
          ...inst,
          staffMember: 'unknown-coach',
        })),
      },
    };

    await render(<ClassSuccessStep data={dataWithUnknownStaff} onDone={mockOnDone} classTags={mockClassTags} />);

    const instructor = page.getByText('unknown-coach');

    expect(instructor).toBeTruthy();
  });

  it('should display schedule summary with days and time slots', async () => {
    await render(<ClassSuccessStep data={mockData} onDone={mockOnDone} classTags={mockClassTags} />);

    // Should show days and time slot count
    const schedule = page.getByText(/Monday, Wednesday, Friday \(3 time slots\)/);

    expect(schedule).toBeTruthy();
  });
});
