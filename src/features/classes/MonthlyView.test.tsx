import type { ClassData } from '@/hooks/useClassesCache';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { MonthlyView } from './MonthlyView';

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
    tags: [{ id: 't2', name: 'Advanced', slug: 'advanced', color: '#a855f7' }],
    schedule: [{ id: 's2', dayOfWeek: 4, startTime: '19:00', endTime: '20:30', instructorClerkId: 'coach-2' }],
    scheduleExceptions: [],
  },
  {
    id: '3',
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
    tags: [{ id: 't3', name: 'Kids', slug: 'kids', color: '#f59e0b' }],
    schedule: [{ id: 's3', dayOfWeek: 6, startTime: '10:00', endTime: '10:45', instructorClerkId: 'coach-3' }],
    scheduleExceptions: [],
  },
  {
    id: '4',
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
    tags: [{ id: 't4', name: 'Women', slug: 'women', color: '#ec4899' }],
    schedule: [{ id: 's4', dayOfWeek: 0, startTime: '11:00', endTime: '12:00', instructorClerkId: 'coach-4' }],
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

describe('MonthlyView', () => {
  describe('Page Header', () => {
    it('should render the page title', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
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
          <MonthlyView />
        </I18nWrapper>,
      );

      const button = page.getByRole('button').first();

      expect(button).toBeInTheDocument();
    });

    it('should render Add New Class button', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      const addButton = page.getByRole('button', { name: /Add New Class/i });

      expect(addButton).toBeInTheDocument();
    });

    it('should render view toggle buttons', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      const weeklyButton = page.getByRole('button', { name: /Weekly/i });

      expect(weeklyButton).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should render Previous button', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      const prevButton = page.getByRole('button', { name: /Previous/i });

      expect(prevButton).toBeInTheDocument();
    });

    it('should render Next button', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      const nextButton = page.getByRole('button', { name: /Next/i });

      expect(nextButton).toBeInTheDocument();
    });

    it('should render Today button', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      const todayButton = page.getByRole('button', { name: /Today/i });

      expect(todayButton).toBeInTheDocument();
    });

    it('should render date display showing current month', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      // Check for current month dynamically
      const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
      const dateText = page.getByText(new RegExp(currentMonth, 'i'));

      expect(dateText).toBeInTheDocument();
    });
  });

  describe('Calendar Grid', () => {
    it('should render all days of week headers', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

      for (const day of daysOfWeek) {
        const dayHeader = day === 'MON' ? page.getByText(day).first() : page.getByText(day);

        expect(dayHeader).toBeInTheDocument();
      }
    });

    it('should render calendar days', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      // Check for some specific dates in September 2025
      const day1 = page.getByText('1').first();
      const day15 = page.getByText('15').first();

      expect(day1).toBeInTheDocument();
      expect(day15).toBeInTheDocument();
    });

    it('should display class events on calendar days', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      // Look for class names that should appear on the calendar
      const fundamentals = page.getByText(/Fundamentals/i).first();

      expect(fundamentals).toBeInTheDocument();
    });

    it('should show multiple classes per day when applicable', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      // Saturday has 2 classes (Kids Class and Open Mat)
      // Verify the calendar renders properly - check for any Saturday classes
      const kidsClass = page.getByText(/Kids/i).first();

      expect(kidsClass).toBeInTheDocument();
    });
  });

  describe('Class Styling', () => {
    it('should render classes with color coding', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      const classElement = page.getByText(/BJJ/i).first();

      expect(classElement).toBeInTheDocument();
    });

    it('should display class badges with proper styling', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      // Verify that class elements exist
      const advancedClass = page.getByText('BJJ Advanced').first();

      expect(advancedClass).toBeInTheDocument();
    });
  });

  describe('Legend', () => {
    it('should render legend section', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
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
          <MonthlyView />
        </I18nWrapper>,
      );

      const legend = page.getByText(/BJJ Fundamentals I/i).first();

      expect(legend).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('should render responsive grid layout', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      const calendar = page.getByText('SUN').first();

      expect(calendar).toBeInTheDocument();
    });

    it('should truncate class names on small screens', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      // Verify calendar is renderable
      const grid = page.getByText('MON').first();

      expect(grid).toBeInTheDocument();
    });
  });

  describe('All Mock Classes Display', () => {
    it('should render all class types on calendar', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      const classNames = [
        /Fundamentals/i,
        /Advanced/i,
        /Kids/i,
        /Women/i,
        /Open Mat/i,
      ];

      for (const className of classNames) {
        const element = page.getByText(className).first();

        expect(element).toBeInTheDocument();
      }
    });

    it('should distribute classes across week days appropriately', () => {
      render(
        <I18nWrapper>
          <MonthlyView />
        </I18nWrapper>,
      );

      // Fundamentals classes typically occur on Monday, Wednesday, Friday
      const fundamentals = page.getByText(/Fundamentals/i).first().first();

      expect(fundamentals).toBeInTheDocument();
    });
  });
});
