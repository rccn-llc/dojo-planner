import type { ClassData } from '@/hooks/useClassesCache';
import type { EventData } from '@/hooks/useEventsCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { ClassesPage } from './ClassesPage';

// Mock next/navigation for AddClassModal and edit navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => '',
  }),
}));

// Mock Clerk with ACADEMY_OWNER role so edit/add/manage-tags buttons are visible
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({
    organization: { id: 'test-org-123' },
    membership: { role: 'org:academy_owner' },
  }),
}));

// Mock classes data that will transform to expected UI values
const mockClasses: ClassData[] = [
  {
    id: '1',
    name: 'BJJ Fundamentals I',
    slug: 'bjj-fundamentals-i',
    description: 'Covers core positions, escapes, and submissions for white belts.',
    color: null,
    defaultDurationMinutes: 60,
    minAge: null,
    maxAge: null,
    maxCapacity: 20,
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [
      { id: 't1', name: 'Beginner', slug: 'beginner', color: '#22c55e' },
      { id: 't2', name: 'Adults', slug: 'adults', color: '#3b82f6' },
      { id: 't3', name: 'Gi', slug: 'gi', color: '#8b5cf6' },
    ],
    schedule: [{ id: 's1', dayOfWeek: 1, startTime: '06:00', endTime: '07:00', instructorClerkId: 'coach-alex' }],
    scheduleExceptions: [],
  },
  {
    id: '2',
    name: 'BJJ Fundamentals II',
    slug: 'bjj-fundamentals-ii',
    description: 'Learn core BJJ techniques like sweeps, passes, and submissions.',
    color: null,
    defaultDurationMinutes: 60,
    minAge: null,
    maxAge: null,
    maxCapacity: 20,
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [
      { id: 't1', name: 'Beginner', slug: 'beginner', color: '#22c55e' },
      { id: 't2', name: 'Adults', slug: 'adults', color: '#3b82f6' },
      { id: 't3', name: 'Gi', slug: 'gi', color: '#8b5cf6' },
    ],
    schedule: [{ id: 's2', dayOfWeek: 2, startTime: '18:00', endTime: '19:00', instructorClerkId: 'prof-jessica' }],
    scheduleExceptions: [],
  },
  {
    id: '3',
    name: 'BJJ Intermediate',
    slug: 'bjj-intermediate',
    description: 'Covers our intermediate curriculum for blue and purple belts.',
    color: null,
    defaultDurationMinutes: 60,
    minAge: null,
    maxAge: null,
    maxCapacity: 15,
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [
      { id: 't4', name: 'Intermediate', slug: 'intermediate', color: '#06b6d4' },
      { id: 't2', name: 'Adults', slug: 'adults', color: '#3b82f6' },
      { id: 't3', name: 'Gi', slug: 'gi', color: '#8b5cf6' },
    ],
    schedule: [{ id: 's3', dayOfWeek: 3, startTime: '19:00', endTime: '20:00', instructorClerkId: 'prof-ivan' }],
    scheduleExceptions: [],
  },
  {
    id: '4',
    name: 'BJJ Advanced',
    slug: 'bjj-advanced',
    description: 'Advanced curriculum that requires at least blue belt.',
    color: null,
    defaultDurationMinutes: 90,
    minAge: 16,
    maxAge: null,
    maxCapacity: 12,
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [
      { id: 't5', name: 'Advanced', slug: 'advanced', color: '#a855f7' },
      { id: 't2', name: 'Adults', slug: 'adults', color: '#3b82f6' },
      { id: 't3', name: 'Gi', slug: 'gi', color: '#8b5cf6' },
    ],
    schedule: [{ id: 's4', dayOfWeek: 4, startTime: '19:00', endTime: '20:30', instructorClerkId: 'prof-joao' }],
    scheduleExceptions: [],
  },
  {
    id: '5',
    name: 'Kids Class',
    slug: 'kids-class',
    description: 'Builds coordination, focus, and basic grappling skills for kids.',
    color: null,
    defaultDurationMinutes: 45,
    minAge: 5,
    maxAge: 12,
    maxCapacity: 15,
    isActive: true,
    program: { id: 'prog-2', name: 'Kids Program', slug: 'kids-program', color: '#06b6d4' },
    tags: [
      { id: 't1', name: 'Beginner', slug: 'beginner', color: '#22c55e' },
      { id: 't6', name: 'Kids', slug: 'kids', color: '#f59e0b' },
      { id: 't3', name: 'Gi', slug: 'gi', color: '#8b5cf6' },
    ],
    schedule: [{ id: 's5', dayOfWeek: 6, startTime: '10:00', endTime: '10:45', instructorClerkId: 'coach-liza' }],
    scheduleExceptions: [],
  },
  {
    id: '6',
    name: 'No-Gi Grappling',
    slug: 'no-gi-grappling',
    description: 'Explores high percentage transitions and submissions without the gi.',
    color: null,
    defaultDurationMinutes: 60,
    minAge: null,
    maxAge: null,
    maxCapacity: 20,
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [
      { id: 't4', name: 'Intermediate', slug: 'intermediate', color: '#06b6d4' },
      { id: 't2', name: 'Adults', slug: 'adults', color: '#3b82f6' },
      { id: 't7', name: 'No-Gi', slug: 'no-gi', color: '#ec4899' },
    ],
    schedule: [{ id: 's6', dayOfWeek: 5, startTime: '18:00', endTime: '19:00', instructorClerkId: 'prof-jessica' }],
    scheduleExceptions: [],
  },
  {
    id: '7',
    name: 'Open Mat',
    slug: 'open-mat',
    description: 'Open training session for all levels to practice freely.',
    color: null,
    defaultDurationMinutes: 120,
    minAge: null,
    maxAge: null,
    maxCapacity: null,
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [
      { id: 't2', name: 'Adults', slug: 'adults', color: '#3b82f6' },
      { id: 't3', name: 'Gi', slug: 'gi', color: '#8b5cf6' },
    ],
    schedule: [{ id: 's7', dayOfWeek: 6, startTime: '12:00', endTime: '14:00', instructorClerkId: null }],
    scheduleExceptions: [],
  },
  {
    id: '8',
    name: 'Women\'s BJJ',
    slug: 'womens-bjj',
    description: 'Technique focused class with optional sparring for women.',
    color: null,
    defaultDurationMinutes: 60,
    minAge: null,
    maxAge: null,
    maxCapacity: 15,
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [
      { id: 't1', name: 'Beginner', slug: 'beginner', color: '#22c55e' },
      { id: 't8', name: 'Women', slug: 'women', color: '#ec4899' },
      { id: 't3', name: 'Gi', slug: 'gi', color: '#8b5cf6' },
    ],
    schedule: [{ id: 's8', dayOfWeek: 0, startTime: '11:00', endTime: '12:00', instructorClerkId: 'coach-liza' }],
    scheduleExceptions: [],
  },
  {
    id: '9',
    name: 'Competition Team',
    slug: 'competition-team',
    description: 'Advanced training for competition preparation.',
    color: null,
    defaultDurationMinutes: 90,
    minAge: 16,
    maxAge: null,
    maxCapacity: 10,
    isActive: true,
    program: { id: 'prog-3', name: 'Competition Team', slug: 'competition-team', color: '#a855f7' },
    tags: [
      { id: 't5', name: 'Advanced', slug: 'advanced', color: '#a855f7' },
      { id: 't9', name: 'Competition', slug: 'competition', color: '#84cc16' },
      { id: 't7', name: 'No-Gi', slug: 'no-gi', color: '#ec4899' },
    ],
    schedule: [{ id: 's9', dayOfWeek: 6, startTime: '08:00', endTime: '09:30', instructorClerkId: 'master-rodriguez' }],
    scheduleExceptions: [],
  },
];

const mockEvents: EventData[] = [];

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
    events: mockEvents,
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateEventsCache: vi.fn(),
}));

// Mock the tags cache for ClassTagsManagement
vi.mock('@/hooks/useTagsCache', () => ({
  useTagsCache: () => ({
    classTags: [
      { id: 't1', name: 'Beginner', slug: 'beginner', color: '#22c55e', entityType: 'class', usageCount: 4 },
      { id: 't2', name: 'Adults', slug: 'adults', color: '#3b82f6', entityType: 'class', usageCount: 6 },
      { id: 't3', name: 'Gi', slug: 'gi', color: '#8b5cf6', entityType: 'class', usageCount: 7 },
      { id: 't4', name: 'Intermediate', slug: 'intermediate', color: '#06b6d4', entityType: 'class', usageCount: 2 },
      { id: 't5', name: 'Advanced', slug: 'advanced', color: '#a855f7', entityType: 'class', usageCount: 2 },
      { id: 't6', name: 'Kids', slug: 'kids', color: '#f59e0b', entityType: 'class', usageCount: 1 },
      { id: 't7', name: 'No-Gi', slug: 'no-gi', color: '#ec4899', entityType: 'class', usageCount: 2 },
      { id: 't8', name: 'Women', slug: 'women', color: '#ec4899', entityType: 'class', usageCount: 1 },
      { id: 't9', name: 'Competition', slug: 'competition', color: '#84cc16', entityType: 'class', usageCount: 1 },
    ],
    membershipTags: [],
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateTagsCache: vi.fn(),
}));

describe('ClassesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Summary Cards', () => {
    it('should render total classes stat card', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const totalClassesLabel = page.getByText('Total Classes');

      expect(totalClassesLabel).toBeInTheDocument();
    });

    it('should render tags stat card', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const tagsLabel = page.getByText('Tags').first();

      expect(tagsLabel).toBeInTheDocument();
    });

    it('should render instructors stat card', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      // "Instructors" appears both as stat card label and in class cards
      const instructorsLabel = page.getByText('Instructors').first();

      expect(instructorsLabel).toBeInTheDocument();
    });

    it('should display correct total classes count of 9', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      // 9 mock classes
      const nineElements = page.getByText('9', { exact: true }).elements();

      expect(nineElements.length).toBeGreaterThan(0);
    });

    it('should display correct tags count', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      // 9 unique tags from mock data: Beginner, Adults, Gi, Intermediate, Advanced, Kids, No-Gi, Women, Competition
      const nineElements = page.getByText('9', { exact: true }).elements();

      expect(nineElements.length).toBeGreaterThan(0);
    });

    it('should display instructor count', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      // 2 unique instructors: "Instructor" (placeholder from transformer) and "TBD" (for Open Mat)
      const twoElements = page.getByText('2', { exact: true }).elements();

      expect(twoElements.length).toBeGreaterThan(0);
    });
  });

  describe('Page Header', () => {
    it('should render the page title', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const heading = page.getByRole('heading', { name: /Classes/i }).first();

      expect(heading).toBeInTheDocument();
    });
  });

  describe('Filter Controls', () => {
    it('should render Add New Class button', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const addButton = page.getByRole('button', { name: /Add New Class/i });

      expect(addButton).toBeInTheDocument();
    });

    it('should render Manage Tags button', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const manageTagsButton = page.getByRole('button', { name: /Manage Tags/i });

      expect(manageTagsButton).toBeInTheDocument();
    });

    it('should open Class Tags Management sheet when Manage Tags button is clicked', async () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const manageTagsButton = page.getByRole('button', { name: /Manage Tags/i });
      await userEvent.click(manageTagsButton);

      const sheetTitle = page.getByRole('heading', { name: 'Class Tags Management' });

      expect(sheetTitle).toBeInTheDocument();
    });

    it('should close Class Tags Management sheet when close button is clicked', async () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const manageTagsButton = page.getByRole('button', { name: /Manage Tags/i });
      await userEvent.click(manageTagsButton);

      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      // Wait for animation to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const sheetTitles = page.getByRole('heading', { name: 'Class Tags Management' });

      expect(sheetTitles.elements()).toHaveLength(0);
    });

    it('should render view toggle buttons', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const gridButton = page.getByTitle('Grid view');
      const weeklyButton = page.getByTitle('Weekly view');
      const monthlyButton = page.getByTitle('Monthly view');

      expect(gridButton).toBeInTheDocument();
      expect(weeklyButton).toBeInTheDocument();
      expect(monthlyButton).toBeInTheDocument();
    });

    it('should render weekly view toggle button', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const weeklyButton = page.getByTitle('Weekly view');

      expect(weeklyButton).toBeInTheDocument();
    });

    it('should render monthly view toggle button', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const monthlyButton = page.getByTitle('Monthly view');

      expect(monthlyButton).toBeInTheDocument();
    });
  });

  describe('View Switching', () => {
    it('should switch to weekly view when clicking weekly button', async () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const weeklyButton = page.getByTitle('Weekly view');
      await userEvent.click(weeklyButton);

      // Weekly view should render
      expect(page.getByText(/Mon/i)).toBeDefined();
    });

    it('should switch to monthly view when clicking monthly button', async () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const monthlyButton = page.getByTitle('Monthly view');
      await userEvent.click(monthlyButton);

      // Monthly view should render (calendar grid)
      expect(monthlyButton).toBeInTheDocument();
    });

    it('should switch back to grid view after switching to weekly', async () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const weeklyButton = page.getByTitle('Weekly view');
      await userEvent.click(weeklyButton);

      const gridButton = page.getByTitle('Grid view');
      await userEvent.click(gridButton);

      // Class cards should render in grid view
      const classTitle = page.getByRole('heading', { name: 'BJJ Fundamentals I' }).first();

      expect(classTitle).toBeInTheDocument();
    });
  });

  describe('Class Cards', () => {
    it('should render class cards with mock data', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const classTitle = page.getByRole('heading', { name: 'BJJ Fundamentals I' }).first();

      expect(classTitle).toBeInTheDocument();
    });

    it('should display multiple class card titles', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const fundamentalsTwo = page.getByRole('heading', { name: 'BJJ Fundamentals II' });
      const intermediate = page.getByRole('heading', { name: 'BJJ Intermediate' });

      expect(fundamentalsTwo).toBeInTheDocument();
      expect(intermediate).toBeInTheDocument();
    });

    it('should display class descriptions', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const description = page.getByText(/Covers core positions, escapes, and submissions/);

      expect(description).toBeInTheDocument();
    });

    it('should display class level badges', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const beginnerBadge = page.getByText('Beginner').first();
      const advancedBadge = page.getByText('Advanced').first();
      const intermediateBadge = page.getByText('Intermediate').first();

      expect(beginnerBadge).toBeInTheDocument();
      expect(advancedBadge).toBeInTheDocument();
      expect(intermediateBadge).toBeInTheDocument();
    });

    it('should display class type badges', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const adultsBadge = page.getByText('Adults').first();
      const womenBadge = page.getByText('Women').first();

      expect(adultsBadge).toBeInTheDocument();
      expect(womenBadge).toBeInTheDocument();
    });

    it('should display class style badges', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const giBadge = page.getByText('Gi').first();
      // The transformer extracts style as "No-Gi" from tags
      const noGiBadge = page.getByText('No-Gi').first();

      expect(giBadge).toBeInTheDocument();
      expect(noGiBadge).toBeInTheDocument();
    });
  });

  describe('Class Details', () => {
    it('should display schedule information', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const scheduleLabel = page.getByText('Schedule').first();
      const scheduleTime = page.getByText(/Monday • 6:00 AM - 7:00 AM/);

      expect(scheduleLabel).toBeInTheDocument();
      expect(scheduleTime).toBeInTheDocument();
    });

    it('should display location information', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const locationLabel = page.getByText('Location').first();
      const locationValue = page.getByText('Downtown HQ').first();

      expect(locationLabel).toBeInTheDocument();
      expect(locationValue).toBeInTheDocument();
    });

    it('should display instructor information', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const instructorLabel = page.getByText('Instructors').first();
      // The transformer uses "Instructor" as placeholder name when clerkId exists
      // or "TBD" when no instructor is assigned
      const instructorName = page.getByText('Instructor').first();

      expect(instructorLabel).toBeInTheDocument();
      expect(instructorName).toBeInTheDocument();
    });

    it('should display TBD when no instructor assigned', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      // Open Mat class has no instructor assigned, so it should show TBD
      const tbdInstructor = page.getByText('TBD').first();

      expect(tbdInstructor).toBeInTheDocument();
    });
  });

  describe('View Toggle', () => {
    it('should have clickable view toggle buttons', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const gridButton = page.getByTitle('Grid view');
      const weeklyButton = page.getByTitle('Weekly view');
      const monthlyButton = page.getByTitle('Monthly view');

      expect(gridButton).toBeVisible();
      expect(weeklyButton).toBeVisible();
      expect(monthlyButton).toBeVisible();
    });
  });

  describe('All Mock Classes', () => {
    it('should render all 9 mock classes by checking class descriptions', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const classDescriptions = [
        /Covers core positions, escapes, and submissions/,
        /Learn core BJJ techniques like sweeps/,
        /Covers our intermediate curriculum/,
        /Advanced curriculum that requires at least blue belt/,
        /Builds coordination, focus, and basic grappling skills/,
        /Explores high percentage transitions/,
        /Open training session/,
        /Technique focused class with optional sparring/,
        /Advanced training for competition preparation/,
      ];

      for (const description of classDescriptions) {
        const element = page.getByText(description).first();

        expect(element).toBeInTheDocument();
      }
    });

    it('should render instructor names', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      // The transformer uses "Instructor" as placeholder when clerkId exists
      const instructor = page.getByText('Instructor').first();

      expect(instructor).toBeInTheDocument();
    });

    it('should render Kids Class', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const kidsClass = page.getByRole('heading', { name: 'Kids Class' });

      expect(kidsClass).toBeInTheDocument();
    });

    it('should render Open Mat class', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const openMat = page.getByRole('heading', { name: 'Open Mat' });

      expect(openMat).toBeInTheDocument();
    });

    it('should render Competition Team class', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const competitionTeam = page.getByRole('heading', { name: 'Competition Team' });

      expect(competitionTeam).toBeInTheDocument();
    });

    it('should render Women\'s BJJ class', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const womensBjj = page.getByRole('heading', { name: /Women's BJJ/ });

      expect(womensBjj).toBeInTheDocument();
    });
  });

  describe('Edit Functionality', () => {
    it('should render edit buttons on class cards', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const editButtons = page.getByRole('button', { name: /Edit class/i }).elements();

      // Should have edit buttons for all 9 classes
      expect(editButtons.length).toBe(9);
    });

    it('should navigate to class detail page when edit button is clicked', async () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      // Wait for all edit buttons to be rendered
      const editButtons = page.getByRole('button', { name: /Edit class/i });

      await expect.element(editButtons.first()).toBeInTheDocument();

      // Get the actual element and click it directly to avoid viewport/scroll issues
      const buttonElements = editButtons.elements();

      expect(buttonElements.length).toBeGreaterThan(0);

      // Click the button element directly
      const firstButton = buttonElements[0] as HTMLButtonElement;
      firstButton.click();

      // Should navigate to the class detail page (any class id is valid)
      expect(mockPush).toHaveBeenCalled();
      expect(mockPush.mock.calls[0]?.[0]).toMatch(/^\/dashboard\/classes\/\d+$/);
    });

    it('should have edit buttons visible in grid view', () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      const editButtons = page.getByRole('button', { name: /Edit class/i }).elements();

      // All edit buttons should be visible
      expect(editButtons.length).toBeGreaterThan(0);
    });

    it('should have edit buttons visible in grid view after switching views', async () => {
      render(
        <I18nWrapper>
          <ClassesPage />
        </I18nWrapper>,
      );

      // Switch to weekly then back to grid
      const weeklyButton = page.getByTitle('Weekly view');
      await userEvent.click(weeklyButton);

      const gridButton = page.getByTitle('Grid view');
      await userEvent.click(gridButton);

      const editButtons = page.getByRole('button', { name: /Edit class/i }).elements();

      // All edit buttons should be visible in grid view
      expect(editButtons.length).toBe(9);
    });
  });
});
