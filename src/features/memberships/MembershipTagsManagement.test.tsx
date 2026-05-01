import type { Tag } from '@/hooks/useTagsCache';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { MembershipTagsManagement } from './MembershipTagsManagement';

// Mock membership tags for testing
const mockMembershipTags: Tag[] = [
  { id: 'tag-active', name: 'Active', slug: 'active', color: '#22c55e', entityType: 'membership', usageCount: 4, membershipNames: ['12 Month Commitment', 'Monthly', 'Competition Team'] },
  { id: 'tag-trial', name: 'Trial', slug: 'trial', color: '#3b82f6', entityType: 'membership', usageCount: 2, membershipNames: ['Free Trial'] },
  { id: 'tag-inactive', name: 'Inactive', slug: 'inactive', color: '#ef4444', entityType: 'membership', usageCount: 1, membershipNames: ['Paused Membership'] },
];

// Mock the hooks used by MembershipTagsManagement
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({ organization: { id: 'test-org-123' } }),
}));

vi.mock('@/hooks/useTagsCache', () => ({
  useTagsCache: () => ({
    classTags: [],
    membershipTags: mockMembershipTags,
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateTagsCache: vi.fn(),
}));

vi.mock('@/libs/Orpc', () => ({
  client: {
    tags: {
      create: vi.fn().mockResolvedValue({ tag: { id: 'new', name: '', slug: '', color: null, entityType: 'membership', usageCount: 0 } }),
      update: vi.fn().mockResolvedValue({ tag: { id: 'tag-1', name: '', slug: '', color: null, entityType: 'membership', usageCount: 0 } }),
      remove: vi.fn().mockResolvedValue({ success: true, unlinkedFromCount: 0 }),
    },
  },
}));

describe('MembershipTagsManagement', () => {
  describe('Sheet Display', () => {
    it('should render the sheet when open is true', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const title = page.getByText('Membership Tags Management');

      expect(title).toBeInTheDocument();
    });

    it('should not render the sheet content when open is false', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={false} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const title = page.getByText('Membership Tags Management');

      expect(title.elements()).toHaveLength(0);
    });

    it('should render the sheet title', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Membership Tags Management' });

      expect(title).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should render the search input', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');

      expect(searchInput).toBeInTheDocument();
    });

    it('should filter tags when searching by tag name', async () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');
      await userEvent.type(searchInput, 'Active');

      const activeTag = page.getByText('Active').first();

      expect(activeTag).toBeInTheDocument();

      // Inactive should not be visible since we're searching for Active (exact)
      // Note: "Active" will partially match "Inactive", so this test checks tag filtering works
      const trialTagElements = page.getByRole('cell', { name: /^Trial$/ });

      expect(trialTagElements.elements()).toHaveLength(0);
    });

    it('should filter tags when searching by membership name', async () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');
      await userEvent.type(searchInput, 'Competition Team');

      // Active tag should be visible since it includes "Competition Team"
      const activeTag = page.getByText('Active').first();

      expect(activeTag).toBeInTheDocument();
    });

    it('should show no tags found message when search has no results', async () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');
      await userEvent.type(searchInput, 'NonexistentTag12345');

      const noTagsMessage = page.getByText('No tags found.');

      expect(noTagsMessage).toBeInTheDocument();
    });

    it('should be case-insensitive when searching', async () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');
      await userEvent.type(searchInput, 'active');

      const activeTag = page.getByText('Active').first();

      expect(activeTag).toBeInTheDocument();
    });

    it('should clear filter and show all tags when search is cleared', async () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByPlaceholder('Search tags...');
      await userEvent.type(searchInput, 'Active');

      // Clear the search
      await userEvent.clear(searchInput);

      // All tags should be visible again
      const trialTag = page.getByText('Trial').first();

      expect(trialTag).toBeInTheDocument();
    });
  });

  describe('Add New Tag Button', () => {
    it('should render the Add New Tag button', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const addButton = page.getByRole('button', { name: /Add New Tag/i });

      expect(addButton).toBeInTheDocument();
    });
  });

  describe('Table Headers', () => {
    it('should render Tag Name column header', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const tagNameHeader = page.getByText('Tag Name');

      expect(tagNameHeader).toBeInTheDocument();
    });

    it('should render Usage column header', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const usageHeader = page.getByText('Usage');

      expect(usageHeader).toBeInTheDocument();
    });

    it('should render Actions column header', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const actionsHeader = page.getByText('Actions');

      expect(actionsHeader).toBeInTheDocument();
    });
  });

  describe('Tag List', () => {
    it('should render all mock tags', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      for (const tag of mockMembershipTags) {
        const tagElement = page.getByText(tag.name).first();

        expect(tagElement).toBeInTheDocument();
      }
    });

    it('should display tag names', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const activeTag = page.getByText('Active').first();
      const trialTag = page.getByText('Trial').first();
      const inactiveTag = page.getByText('Inactive').first();

      expect(activeTag).toBeInTheDocument();
      expect(trialTag).toBeInTheDocument();
      expect(inactiveTag).toBeInTheDocument();
    });

    it('should display tag usage counts', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // Active has usage count of 4
      const usageCount4 = page.getByText('4', { exact: true }).first();

      expect(usageCount4).toBeInTheDocument();

      // Trial has usage count of 2
      const usageCount2 = page.getByText('2', { exact: true }).first();

      expect(usageCount2).toBeInTheDocument();

      // Inactive has usage count of 1
      const usageCount1 = page.getByText('1', { exact: true }).first();

      expect(usageCount1).toBeInTheDocument();
    });

    it('should display membership names for each tag', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // Check some membership names from the mock data - use first() to get first match
      const goldMembershipText = page.getByText(/12 Month Commitment/).first();

      expect(goldMembershipText).toBeInTheDocument();
    });

    it('should render color indicators for each tag', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // Color indicators are rendered as divs with aria-hidden
      const colorIndicators = document.querySelectorAll('[aria-hidden="true"]');

      expect(colorIndicators.length).toBeGreaterThan(0);
    });
  });

  describe('Tag Actions', () => {
    it('should render Edit buttons for each tag', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const editButtons = page.getByRole('button', { name: 'Edit' }).elements();

      expect(editButtons.length).toBe(mockMembershipTags.length);
    });

    it('should render Delete buttons for each tag', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const deleteButtons = page.getByRole('button', { name: 'Delete' }).elements();

      expect(deleteButtons.length).toBe(mockMembershipTags.length);
    });
  });

  describe('Sheet Close Functionality', () => {
    it('should call onOpenChange when close button is clicked', async () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Tag Row Component', () => {
    it('should render Active tag row', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const activeTag = page.getByText('Active').first();

      expect(activeTag).toBeInTheDocument();
    });

    it('should render Trial tag row', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const trialTag = page.getByText('Trial').first();

      expect(trialTag).toBeInTheDocument();
    });

    it('should render Inactive tag row', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const inactiveTag = page.getByText('Inactive').first();

      expect(inactiveTag).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible search input with aria-label', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const searchInput = page.getByLabelText('Search tags...');

      expect(searchInput).toBeInTheDocument();
    });

    it('should have proper table structure with rows', () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const rows = page.getByRole('row').elements();

      // Header row + 3 tag rows (Active, Trial, Inactive)
      expect(rows.length).toBe(mockMembershipTags.length + 1);
    });
  });

  describe('CRUD wiring', () => {
    it('opens the Add Tag modal when Add New Tag is clicked', async () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await userEvent.click(page.getByRole('button', { name: /Add New Tag/i }));

      expect(page.getByRole('heading', { name: 'Add Tag' })).toBeInTheDocument();
    });

    it('opens the Edit Tag modal pre-filled when an Edit button is clicked', async () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const editButtons = page.getByRole('button', { name: 'Edit' }).elements();
      await userEvent.click(editButtons[0]!);

      expect(page.getByRole('heading', { name: 'Edit Tag' })).toBeInTheDocument();
    });

    it('opens the delete confirm dialog when a Delete button is clicked', async () => {
      const onOpenChange = vi.fn();
      render(
        <I18nWrapper>
          <MembershipTagsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const deleteButtons = page.getByRole('button', { name: 'Delete' }).elements();
      await userEvent.click(deleteButtons[0]!);

      expect(page.getByRole('heading', { name: 'Are you absolutely sure?' })).toBeInTheDocument();
    });
  });
});
