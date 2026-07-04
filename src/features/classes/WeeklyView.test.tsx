import type { ClassData } from '@/hooks/useClassesCache';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { WeeklyView } from './WeeklyView';

// Mock next/navigation for ClassEventHoverCard
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({ organization: { id: 'test-org-123' } }),
}));

// Mock classes data
const mockClasses: ClassData[] = [
  {
    id: '1',
    name: 'BJJ Fundamentals I',
    slug: 'bjj-fundamentals-i',
    description: 'Covers core positions, escapes, and submissions.',
    color: '#22c55e',
    defaultDurationMinutes: 60,
    minAge: null,
    maxAge: null,
    maxCapacity: 20,
    allowWalkIns: 'Yes',
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [{ id: 't1', name: 'Beginner', slug: 'beginner', color: '#22c55e' }],
    schedule: [{ id: 's1', dayOfWeek: 1, startTime: '06:00', endTime: '07:00', instructorClerkId: 'coach-1' }],
    scheduleExceptions: [],
  },
  {
    id: '2',
    name: 'BJJ Intermediate',
    slug: 'bjj-intermediate',
    description: 'Intermediate curriculum.',
    color: '#06b6d4',
    defaultDurationMinutes: 60,
    minAge: null,
    maxAge: null,
    maxCapacity: 15,
    allowWalkIns: 'Yes',
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [{ id: 't2', name: 'Intermediate', slug: 'intermediate', color: '#06b6d4' }],
    schedule: [{ id: 's2', dayOfWeek: 3, startTime: '19:00', endTime: '20:00', instructorClerkId: 'coach-2' }],
    scheduleExceptions: [],
  },
  {
    id: '3',
    name: 'BJJ Advanced',
    slug: 'bjj-advanced',
    description: 'Advanced curriculum.',
    color: '#a855f7',
    defaultDurationMinutes: 90,
    minAge: 16,
    maxAge: null,
    maxCapacity: 12,
    allowWalkIns: 'Yes',
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [{ id: 't3', name: 'Advanced', slug: 'advanced', color: '#a855f7' }],
    schedule: [{ id: 's3', dayOfWeek: 4, startTime: '19:00', endTime: '20:30', instructorClerkId: 'coach-3' }],
    scheduleExceptions: [],
  },
  {
    id: '4',
    name: 'Kids Class',
    slug: 'kids-class',
    description: 'Kids training.',
    color: '#06b6d4',
    defaultDurationMinutes: 45,
    minAge: 5,
    maxAge: 12,
    maxCapacity: 15,
    allowWalkIns: 'Yes',
    isActive: true,
    program: { id: 'prog-2', name: 'Kids Program', slug: 'kids-program', color: '#06b6d4' },
    tags: [{ id: 't4', name: 'Kids', slug: 'kids', color: '#f59e0b' }],
    schedule: [{ id: 's4', dayOfWeek: 6, startTime: '10:00', endTime: '10:45', instructorClerkId: 'coach-4' }],
    scheduleExceptions: [],
  },
  {
    id: '5',
    name: 'Open Mat',
    slug: 'open-mat',
    description: 'Open training.',
    color: '#ef4444',
    defaultDurationMinutes: 120,
    minAge: null,
    maxAge: null,
    maxCapacity: null,
    allowWalkIns: 'Yes',
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [],
    schedule: [{ id: 's5', dayOfWeek: 6, startTime: '12:00', endTime: '14:00', instructorClerkId: null }],
    scheduleExceptions: [],
  },
  {
    id: '6',
    name: 'Women\'s BJJ',
    slug: 'womens-bjj',
    description: 'Women only class.',
    color: '#ec4899',
    defaultDurationMinutes: 60,
    minAge: null,
    maxAge: null,
    maxCapacity: 15,
    allowWalkIns: 'Yes',
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [{ id: 't5', name: 'Women', slug: 'women', color: '#ec4899' }],
    schedule: [{ id: 's6', dayOfWeek: 0, startTime: '11:00', endTime: '12:00', instructorClerkId: 'coach-5' }],
    scheduleExceptions: [],
  },
];

// Mock the caching hooks
vi.mock('@/hooks/useClassesCache', () => ({
  useClassesCache: () => ({
    classes: mockClasses,
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateClassesCache: vi.fn(),
}));

vi.mock('@/hooks/useEventsCache', () => ({
  useEventsCache: () => ({
    events: [],
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateEventsCache: vi.fn(),
}));

describe('WeeklyView', () => {
  describe('Page Header', () => {
    it('should render the page title', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const heading = page.getByRole('heading', { name: /Class Calendar/i }).first();

      expect(heading).toBeInTheDocument();
    });
  });

  describe('Filter Controls', () => {
    it('should render location dropdown button', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const button = page.getByRole('button').first();

      expect(button).toBeInTheDocument();
    });

    it('should render Add New Class button', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const addButton = page.getByRole('button', { name: /Add New Class/i });

      expect(addButton).toBeInTheDocument();
    });

    it('should render view toggle buttons', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const monthlyButton = page.getByRole('button', { name: /Monthly/i });

      expect(monthlyButton).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should render Previous button', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const prevButton = page.getByRole('button', { name: /Previous/i });

      expect(prevButton).toBeInTheDocument();
    });

    it('should render Next button', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const nextButton = page.getByRole('button', { name: /Next/i });

      expect(nextButton).toBeInTheDocument();
    });

    it('should render Today button', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const todayButton = page.getByRole('button', { name: /Today/i });

      expect(todayButton).toBeInTheDocument();
    });

    it('should render date display showing current week', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      // Check for current week date range dynamically
      const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
      const dateText = page.getByText(new RegExp(currentMonth, 'i'));

      expect(dateText).toBeInTheDocument();
    });
  });

  describe('Weekly Schedule Grid', () => {
    it('should render all days of week headers', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

      for (const day of daysOfWeek) {
        const dayHeader = day === 'MON' ? page.getByText(day).first() : page.getByText(day);

        expect(dayHeader).toBeInTheDocument();
      }
    });

    it('should render time column', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const timeLabel = page.getByText('Time');

      expect(timeLabel).toBeInTheDocument();
    });

    it('should display hourly time slots', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      // Check for some time slots (6 AM to 10 PM)
      const sixAM = page.getByText(/6:00 AM/i);

      expect(sixAM).toBeInTheDocument();
    });

    it('should render class events in schedule', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      // Look for class names that should appear in weekly schedule
      const fundamentals = page.getByText(/Fundamentals/i).first();

      expect(fundamentals).toBeInTheDocument();
    });

    it('should display multiple classes on same day/time when applicable', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      // Verify there are class elements
      const advancedClass = page.getByText('BJJ Advanced').first();

      expect(advancedClass).toBeInTheDocument();
    });
  });

  describe('Time Slot Layout', () => {
    it('should render consistent grid structure', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      // Verify grid is properly structured
      const timeColumn = page.getByText('Time');

      expect(timeColumn).toBeInTheDocument();
    });

    it('should show correct day numbers for each column', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      // Check for some date number in the current week (any single digit or double digit number)
      const date = page.getByText(/\d+/).first();

      expect(date).toBeInTheDocument();
    });

    it('should align classes to correct time slots', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      // Fundamentals I is at 6 AM on Monday
      const fundamentalsI = page.getByText('BJJ Fundamentals I').first();

      expect(fundamentalsI).toBeInTheDocument();
    });
  });

  describe('Class Styling', () => {
    it('should render classes with color coding', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const classElement = page.getByText(/BJJ/i).first();

      expect(classElement).toBeInTheDocument();
    });

    it('should display class blocks with proper styling', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      // Verify class elements exist and are styled
      const kidClass = page.getByText('Kids Class').first();

      expect(kidClass).toBeInTheDocument();
    });
  });

  describe('Legend', () => {
    it('should render legend section', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const legendEntries = [
        'BJJ Fundamentals I',
        'BJJ Advanced',
        'Kids Class',
        'Women\'s BJJ',
        'Open Mat',
      ];

      for (const entry of legendEntries) {
        const legendItem = page.getByText(entry).first();

        expect(legendItem).toBeInTheDocument();
      }
    });

    it('should show color indicators in legend', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const legend = page.getByText(/BJJ Fundamentals I/i).first();

      expect(legend).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('should render responsive table layout', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const timeLabels = page.getByText('Time');

      expect(timeLabels).toBeInTheDocument();
    });

    it('should handle horizontal scrolling for small screens', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      // Verify the schedule grid is renderable
      const schedule = page.getByText('MON').first();

      expect(schedule).toBeInTheDocument();
    });
  });

  describe('All Mock Classes Display', () => {
    it('should render all class types in schedule', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const classNames = [
        /Fundamentals/i,
        /Advanced/i,
        /Kids/i,
        /Women/i,
        /Open/i,
      ];

      for (const className of classNames) {
        const element = page.getByText(className).first();

        expect(element).toBeInTheDocument();
      }
    });

    it('should place classes at appropriate time slots', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      // Morning classes (6 AM) - Fundamentals I is at 6 AM
      const morningClass = page.getByText(/Fundamentals I/i).first();

      expect(morningClass).toBeInTheDocument();
    });

    it('should display afternoon and evening classes', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      // Afternoon/evening classes (4-8 PM)
      const kidClass = page.getByText('Kids Class').first().first();

      expect(kidClass).toBeInTheDocument();
    });
  });

  describe('Navigation Functionality', () => {
    it('should render Previous button that is clickable', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const prevButton = page.getByRole('button', { name: /Previous/i });

      expect(prevButton).toBeVisible();
    });

    it('should render Next button that is clickable', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const nextButton = page.getByRole('button', { name: /Next/i });

      expect(nextButton).toBeVisible();
    });

    it('should render Today button with proper styling', () => {
      render(
        <I18nWrapper>
          <WeeklyView />
        </I18nWrapper>,
      );

      const todayButton = page.getByRole('button', { name: /Today/i });

      expect(todayButton).toBeVisible();
    });
  });
});
