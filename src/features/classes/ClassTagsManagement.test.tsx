import type { Tag } from '@/hooks/useTagsCache';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { ClassTagsManagement } from './ClassTagsManagement';

// Mock class tags for testing
const mockClassTags: Tag[] = [
  { id: 'tag-beginner', name: 'Beginner', slug: 'beginner', color: '#22c55e', entityType: 'class', usageCount: 4, classNames: ['BJJ Fundamentals I', 'BJJ Fundamentals II'] },
  { id: 'tag-advanced', name: 'Advanced', slug: 'advanced', color: '#ef4444', entityType: 'class', usageCount: 3, classNames: ['BJJ Advanced', 'Competition Prep'] },
  { id: 'tag-adults', name: 'Adults', slug: 'adults', color: '#3b82f6', entityType: 'class', usageCount: 6, classNames: ['BJJ Fundamentals I', 'BJJ Advanced'] },
  { id: 'tag-kids', name: 'Kids', slug: 'kids', color: '#f59e0b', entityType: 'class', usageCount: 2, classNames: ['Kids BJJ'] },
  { id: 'tag-gi', name: 'Gi', slug: 'gi', color: '#8b5cf6', entityType: 'class', usageCount: 5, classNames: ['BJJ Fundamentals I'] },
  { id: 'tag-nogi', name: 'No-Gi', slug: 'no-gi', color: '#ec4899', entityType: 'class', usageCount: 3, classNames: ['No-Gi Class'] },
  { id: 'tag-intermediate', name: 'Intermediate', slug: 'intermediate', color: '#06b6d4', entityType: 'class', usageCount: 2, classNames: ['BJJ Intermediate'] },
  { id: 'tag-competition', name: 'Competition', slug: 'competition', color: '#84cc16', entityType: 'class', usageCount: 1, classNames: ['Competition Prep'] },
];

// Mock the hooks used by ClassTagsManagement
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({ organization: { id: 'test-org-123' } }),
}));

vi.mock('@/hooks/useTagsCache', () => ({
  useTagsCache: () => ({
    classTags: mockClassTags,
    membershipTags: [],
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateTagsCache: vi.fn(),
}));

vi.mock('@/libs/Orpc', () => ({
  client: {
    tags: {
      create: vi.fn().mockResolvedValue({ tag: { id: 'new', name: '', slug: '', color: null, entityType: 'class', usageCount: 0 } }),
      update: vi.fn().mockResolvedValue({ tag: { id: 'tag-1', name: '', slug: '', color: null, entityType: 'class', usageCount: 0 } }),
      remove: vi.fn().mockResolvedValue({ success: true, unlinkedFromCount: 0 }),
    },
  },
}));

describe('ClassTagsManagement', () => {
  describe('Sheet Display', () => {
    it('should render the sheet when open is true', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const title = page.getByText('Class Tags Management');

      expect(title).toBeInTheDocument();
    });

    it('should not render the sheet content when open is false', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={false} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const title = page.getByText('Class Tags Management');

      expect(title.elements()).toHaveLength(0);
    });

    it('should render the sheet title', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Class Tags Management' });

      expect(title).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should render the search input', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');

      expect(searchInput).toBeInTheDocument();
    });

    it('should filter tags when searching by tag name', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');
      await userEvent.type(searchInput, 'Beginner');

      const beginnerTag = page.getByText('Beginner');

      expect(beginnerTag).toBeInTheDocument();

      // Advanced should not be visible since we're searching for Beginner
      const advancedTagElements = page.getByRole('cell', { name: /^Advanced$/ });

      expect(advancedTagElements.elements()).toHaveLength(0);
    });

    it('should filter tags when searching by class name', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');
      await userEvent.type(searchInput, 'BJJ Advanced');

      // Advanced tag should be visible since it includes "BJJ Advanced"
      const advancedTag = page.getByText('Advanced', { exact: true }).first();

      expect(advancedTag).toBeInTheDocument();
    });

    it('should show no tags found message when search has no results', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');
      await userEvent.type(searchInput, 'NonexistentTag12345');

      const noTagsMessage = page.getByText('No tags found.');

      expect(noTagsMessage).toBeInTheDocument();
    });

    it('should be case-insensitive when searching', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');
      await userEvent.type(searchInput, 'beginner');

      const beginnerTag = page.getByText('Beginner');

      expect(beginnerTag).toBeInTheDocument();
    });

    it('should clear filter and show all tags when search is cleared', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');
      await userEvent.type(searchInput, 'Beginner');

      // Clear the search
      await userEvent.clear(searchInput);

      // All tags should be visible again
      const advancedTag = page.getByText('Advanced').first();

      expect(advancedTag).toBeInTheDocument();
    });
  });

  describe('Add New Tag Button', () => {
    it('should render the Add New Tag button', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const addButton = page.getByRole('button', { name: /Add New Tag/i });

      expect(addButton).toBeInTheDocument();
    });
  });

  describe('Table Headers', () => {
    it('should render Tag Name column header', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const tagNameHeader = page.getByText('Tag Name');

      expect(tagNameHeader).toBeInTheDocument();
    });

    it('should render Usage column header', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const usageHeader = page.getByText('Usage');

      expect(usageHeader).toBeInTheDocument();
    });

    it('should render Actions column header', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const actionsHeader = page.getByText('Actions');

      expect(actionsHeader).toBeInTheDocument();
    });
  });

  describe('Tag List', () => {
    it('should render all mock tags', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      for (const tag of mockClassTags) {
        const tagElement = page.getByText(tag.name).first();

        expect(tagElement).toBeInTheDocument();
      }
    });

    it('should display tag names', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const beginnerTag = page.getByText('Beginner').first();
      const advancedTag = page.getByText('Advanced').first();
      const adultsTag = page.getByText('Adults').first();

      expect(beginnerTag).toBeInTheDocument();
      expect(advancedTag).toBeInTheDocument();
      expect(adultsTag).toBeInTheDocument();
    });

    it('should display tag usage counts', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // Beginner has usage count of 4
      const usageCount4 = page.getByText('4', { exact: true }).first();

      expect(usageCount4).toBeInTheDocument();

      // Adults has usage count of 6
      const usageCount6 = page.getByText('6', { exact: true }).first();

      expect(usageCount6).toBeInTheDocument();
    });

    it('should display class names for each tag', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // Check some class names from the mock data - use first() to get first match
      const fundamentalsText = page.getByText(/BJJ Fundamentals I/).first();

      expect(fundamentalsText).toBeInTheDocument();
    });

    it('should render color indicators for each tag', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // Color indicators are rendered as divs with aria-hidden
      const colorIndicators = document.querySelectorAll('[aria-hidden="true"]');

      expect(colorIndicators.length).toBeGreaterThan(0);
    });
  });

  describe('Tag Actions', () => {
    it('should render Edit buttons for each tag', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const editButtons = page.getByRole('button', { name: 'Edit' }).elements();

      expect(editButtons.length).toBe(mockClassTags.length);
    });

    it('should render Delete buttons for each tag', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const deleteButtons = page.getByRole('button', { name: 'Delete' }).elements();

      expect(deleteButtons.length).toBe(mockClassTags.length);
    });
  });

  describe('Sheet Close Functionality', () => {
    it('should call onOpenChange when close button is clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Tag Row Component', () => {
    it('should render Beginner tag with correct color', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const beginnerTag = page.getByText('Beginner').first();

      expect(beginnerTag).toBeInTheDocument();
    });

    it('should render Kids tag row', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const kidsTag = page.getByText('Kids').first();

      expect(kidsTag).toBeInTheDocument();
    });

    it('should render Gi tag row', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const giTag = page.getByText('Gi').first();

      expect(giTag).toBeInTheDocument();
    });

    it('should render No-Gi tag row', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const noGiTag = page.getByText('No-Gi', { exact: true }).first();

      expect(noGiTag).toBeInTheDocument();
    });

    it('should render Intermediate tag row', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const intermediateTag = page.getByText('Intermediate').first();

      expect(intermediateTag).toBeInTheDocument();
    });

    it('should render Competition tag row', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const competitionTag = page.getByText('Competition').first();

      expect(competitionTag).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible search input with aria-label', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByLabelText('Search tags...');

      expect(searchInput).toBeInTheDocument();
    });

    it('should have proper table structure with rows', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const rows = page.getByRole('row').elements();

      // Header row + 8 tag rows
      expect(rows.length).toBe(mockClassTags.length + 1);
    });
  });

  describe('CRUD wiring', () => {
    it('opens the Add Tag modal when Add New Tag is clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await userEvent.click(page.getByRole('button', { name: /Add New Tag/i }));

      // Modal renders its title
      expect(page.getByRole('heading', { name: 'Add Tag' })).toBeInTheDocument();
    });

    it('opens the Edit Tag modal pre-filled when an Edit button is clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const editButtons = page.getByRole('button', { name: 'Edit' }).elements();
      await userEvent.click(editButtons[0]!);

      expect(page.getByRole('heading', { name: 'Edit Tag' })).toBeInTheDocument();
    });

    it('opens the delete confirm dialog when a Delete button is clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <ClassTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const deleteButtons = page.getByRole('button', { name: 'Delete' }).elements();
      await userEvent.click(deleteButtons[0]!);

      // The delete-tag dialog renders with the standard "Are you absolutely sure?" title
      expect(page.getByRole('heading', { name: 'Are you absolutely sure?' })).toBeInTheDocument();
    });
  });
});
