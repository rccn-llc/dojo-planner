import type { ClassData } from '@/hooks/useClassesCache';
import type { EventData } from '@/hooks/useEventsCache';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { ClassesPage } from '@/features/classes/ClassesPage';
import { I18nWrapper } from '@/lib/test-utils';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
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

// Mock classes data
const mockClasses: ClassData[] = [
  {
    id: '1',
    name: 'BJJ Fundamentals I',
    slug: 'bjj-fundamentals-i',
    description: 'Covers core positions, escapes, and submissions.',
    color: null,
    defaultDurationMinutes: 60,
    minAge: null,
    maxAge: null,
    maxCapacity: 20,
    allowWalkIns: 'Yes',
    isActive: true,
    program: { id: 'prog-1', name: 'Adult BJJ', slug: 'adult-bjj', color: '#22c55e' },
    tags: [
      { id: 't1', name: 'Beginner', slug: 'beginner', color: '#22c55e' },
      { id: 't2', name: 'Adults', slug: 'adults', color: '#3b82f6' },
    ],
    schedule: [{ id: 's1', dayOfWeek: 1, startTime: '06:00', endTime: '07:00', instructorClerkId: 'coach-alex' }],
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

vi.mock('@/hooks/useOrganizationLocation', () => ({
  useOrganizationLocation: () => ({
    location: { name: 'Main Dojo', address: 'Downtown HQ', phone: null, email: null },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Mock the tags cache for ClassTagsManagement
vi.mock('@/hooks/useTagsCache', () => ({
  useTagsCache: () => ({
    classTags: [
      { id: 't1', name: 'Beginner', slug: 'beginner', color: '#22c55e', entityType: 'class', usageCount: 1 },
    ],
    membershipTags: [],
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateTagsCache: vi.fn(),
}));

describe('Classes Page', () => {
  it('renders classes header', () => {
    render(<I18nWrapper><ClassesPage /></I18nWrapper>);

    const heading = page.getByRole('heading', { name: /Classes/i });

    expect(heading).toBeInTheDocument();
  });

  it('renders add new class button', () => {
    render(<I18nWrapper><ClassesPage /></I18nWrapper>);

    const addButton = page.getByRole('button', { name: /Add New Class/i });

    expect(addButton).toBeInTheDocument();
  });

  it('displays class cards', () => {
    render(<I18nWrapper><ClassesPage /></I18nWrapper>);

    const fundamentalsClass = page.getByRole('heading', { name: 'BJJ Fundamentals I' }).first();

    expect(fundamentalsClass).toBeInTheDocument();
  });

  it('displays class details', () => {
    render(<I18nWrapper><ClassesPage /></I18nWrapper>);

    const schedule = page.getByText(/Monday • 6:00 AM - 7:00 AM/);
    const location = page.getByText(/Downtown HQ/).first();

    expect(schedule).toBeInTheDocument();
    expect(location).toBeInTheDocument();
  });

  it('displays class level badges', () => {
    render(<I18nWrapper><ClassesPage /></I18nWrapper>);

    const beginnerBadge = page.getByText(/Beginner/).first();

    expect(beginnerBadge).toBeInTheDocument();
  });

  it('displays instructor names', () => {
    render(<I18nWrapper><ClassesPage /></I18nWrapper>);

    // The transformer uses "Instructor" as placeholder when clerkId exists
    const instructorName = page.getByText('Instructor').first();

    expect(instructorName).toBeInTheDocument();
  });

  it('opens add class modal when clicking add button', async () => {
    render(<I18nWrapper><ClassesPage /></I18nWrapper>);

    const addButton = page.getByRole('button', { name: /Add New Class/i });
    await userEvent.click(addButton);

    const dialog = page.getByRole('dialog');

    expect(dialog).toBeInTheDocument();
  });

  it('displays summary cards with correct labels', () => {
    render(<I18nWrapper><ClassesPage /></I18nWrapper>);

    const totalClassesLabel = page.getByText(/Total Classes/i);
    const instructorsLabel = page.getByText(/Instructors/i).first();

    expect(totalClassesLabel).toBeInTheDocument();
    expect(instructorsLabel).toBeInTheDocument();
  });

  it('displays manage tags button', () => {
    render(<I18nWrapper><ClassesPage /></I18nWrapper>);

    const manageTagsButton = page.getByRole('button', { name: /Manage Tags/i });

    expect(manageTagsButton).toBeInTheDocument();
  });
});
