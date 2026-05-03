import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import ProgramsPage from './page';

// Mock Clerk with ACADEMY_OWNER role so edit/add/delete buttons are visible
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({
    organization: { id: 'test-org-123' },
    membership: { role: 'org:academy_owner' },
  }),
}));

// Mock useProgramsCache so tests run against deterministic fixture data
// without hitting the network. The shape mirrors what the real cache returns.
const mockPrograms = [
  {
    id: '1',
    organizationId: 'test-org-123',
    name: 'Adult Brazilian Jiu-jitsu',
    slug: 'adult-bjj',
    description: 'Traditional Brazilian Jiu-Jitsu program for adults focusing on self-defense, competition, and fitness.',
    color: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    classCount: 5,
  },
  {
    id: '2',
    organizationId: 'test-org-123',
    name: 'Kids Program',
    slug: 'kids',
    description: 'Fun and engaging martial arts program designed specifically for children ages 6-12.',
    color: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    classCount: 2,
  },
  {
    id: '3',
    organizationId: 'test-org-123',
    name: 'Competition Team',
    slug: 'competition',
    description: 'Elite training program for competitive athletes with advanced techniques and intensive conditioning.',
    color: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    classCount: 3,
  },
  {
    id: '4',
    organizationId: 'test-org-123',
    name: 'Judo Fundamentals',
    slug: 'judo',
    description: 'Traditional Judo program focusing on throws, breakfalls, and Olympic-style techniques.',
    color: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    classCount: 1,
  },
  {
    id: '5',
    organizationId: 'test-org-123',
    name: 'Wrestling Fundamentals',
    slug: 'wrestling',
    description: 'Traditional Wrestling program focusing on takedowns, mat control, and collegiate-style techniques.',
    color: null,
    isActive: false,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    classCount: 0,
  },
];

vi.mock('@/hooks/useProgramsCache', () => ({
  useProgramsCache: () => ({
    programs: mockPrograms,
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateProgramsCache: vi.fn(),
}));

// Mock the ORPC client so save/delete handlers don't try to hit the network.
vi.mock('@/libs/Orpc', () => ({
  client: {
    programs: {
      create: vi.fn().mockResolvedValue({ program: { id: 'new-program' } }),
      update: vi.fn().mockResolvedValue({ program: { id: '1' } }),
      remove: vi.fn().mockResolvedValue({ success: true }),
    },
  },
}));

describe('Programs Page', () => {
  describe('Page Layout', () => {
    it('renders programs management header', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      const heading = page.getByRole('heading', { name: /Programs Management/i });

      expect(heading).toBeInTheDocument();
    });

    it('renders statistics cards', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      const totalPrograms = page.getByText(/Total Programs/);
      const active = page.getByText('Active').elements();
      const totalClasses = page.getByText(/Total Classes/);

      expect(totalPrograms).toBeInTheDocument();
      expect(active.length).toBeGreaterThan(0);
      expect(totalClasses).toBeInTheDocument();
    });

    it('renders statistics values', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Stats should show dynamic values from mock data
      // Total programs count of 5 appears in stats card
      const statValues = page.getByText('5', { exact: true }).elements();

      expect(statValues.length).toBeGreaterThan(0);
    });

    it('renders total classes count correctly', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Total classes should be 11 (5 + 2 + 3 + 1 + 0 for Wrestling)
      const classCount = page.getByText('11', { exact: true }).elements();

      expect(classCount.length).toBeGreaterThan(0);
    });

    it('renders add new program button', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      const button = page.getByRole('button', { name: /Add New Program/i });

      expect(button).toBeInTheDocument();
    });

    it('renders search input', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      const searchInput = page.getByPlaceholder(/Search programs/i);

      expect(searchInput).toBeInTheDocument();
    });

    it('renders status filter dropdown', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Select trigger should be rendered
      const statusSelect = page.getByRole('combobox').elements();

      expect(statusSelect.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Program Cards', () => {
    it('renders program cards with names', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      const adultProgram = page.getByRole('heading', { name: 'Adult Brazilian Jiu-jitsu' });
      const kidsProgram = page.getByRole('heading', { name: 'Kids Program' });
      const competitionTeam = page.getByRole('heading', { name: 'Competition Team' });
      const judoProgram = page.getByRole('heading', { name: 'Judo Fundamentals' });

      expect(adultProgram).toBeInTheDocument();
      expect(kidsProgram).toBeInTheDocument();
      expect(competitionTeam).toBeInTheDocument();
      expect(judoProgram).toBeInTheDocument();
    });

    it('renders program card descriptions', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      const adultDescription = page.getByText(/Traditional Brazilian Jiu-Jitsu program for adults/);
      const kidsDescription = page.getByText(/Fun and engaging martial arts program/);

      expect(adultDescription).toBeInTheDocument();
      expect(kidsDescription).toBeInTheDocument();
    });

    it('renders program card class counts', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Adult BJJ has 5 classes
      const fiveClasses = page.getByText('5', { exact: true }).elements();

      expect(fiveClasses.length).toBeGreaterThan(0);
    });

    it('renders classes label on program cards', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      const classesLabels = page.getByText('Classes').elements();

      expect(classesLabels.length).toBeGreaterThan(0);
    });

    it('renders edit buttons on program cards', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      const editButtons = page.getByRole('button', { name: /Edit program/i }).elements();

      expect(editButtons.length).toBe(5);
    });

    it('renders all five program cards', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Verify all programs are rendered by checking unique program names using headings
      const adultBjj = page.getByRole('heading', { name: 'Adult Brazilian Jiu-jitsu' });
      const kidsProgram = page.getByRole('heading', { name: 'Kids Program' });
      const competitionTeam = page.getByRole('heading', { name: 'Competition Team' });
      const judoFundamentals = page.getByRole('heading', { name: 'Judo Fundamentals' });
      const wrestlingFundamentals = page.getByRole('heading', { name: 'Wrestling Fundamentals' });

      expect(adultBjj).toBeInTheDocument();
      expect(kidsProgram).toBeInTheDocument();
      expect(competitionTeam).toBeInTheDocument();
      expect(judoFundamentals).toBeInTheDocument();
      expect(wrestlingFundamentals).toBeInTheDocument();
    });

    it('renders active status badges on program cards', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // All 4 programs are Active
      const activeBadges = page.getByText('Active').elements();

      // Should have Active in stats card + 4 program cards
      expect(activeBadges.length).toBeGreaterThanOrEqual(4);
    });

    it('renders inactive status badge for Wrestling Fundamentals', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      const inactiveBadges = page.getByText('Inactive').elements();

      // Should have 1 inactive program (Wrestling Fundamentals)
      expect(inactiveBadges.length).toBe(1);
    });

    it('renders active count of 4 in stats card', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // 4 out of 5 programs are active
      const fourElements = page.getByText('4', { exact: true }).elements();

      expect(fourElements.length).toBeGreaterThan(0);
    });
  });

  describe('Delete Button Conditional Visibility', () => {
    it('shows delete button only for programs with no classes', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Only Wrestling Fundamentals has 0 classes, so only 1 delete button should appear
      const deleteButtons = page.getByRole('button', { name: /Delete program/i }).elements();

      expect(deleteButtons.length).toBe(1);
    });

    it('does not show delete button for programs with classes', () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Programs with classes should not have delete buttons
      // Adult BJJ has 5 classes, Kids has 2, Competition has 3, Judo has 1
      // Only Wrestling (0 classes) should have delete button
      const deleteButtons = page.getByRole('button', { name: /Delete program/i }).elements();

      expect(deleteButtons.length).toBe(1);
    });
  });

  describe('Add Program Modal', () => {
    it('opens add program modal when add button is clicked', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      const addButton = page.getByRole('button', { name: /Add New Program/i });
      await userEvent.click(addButton);

      const modalTitle = page.getByRole('heading', { name: 'Add Program' });

      expect(modalTitle).toBeInTheDocument();
    });

    it('closes modal when cancel button is clicked', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Open modal
      const addButton = page.getByRole('button', { name: /Add New Program/i });
      await userEvent.click(addButton);

      // First interact with an input to stabilize dialog
      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.type(nameInput, 'Test');

      // Click cancel
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await userEvent.click(cancelButton);

      // Modal should be closed
      const modalTitles = page.getByRole('heading', { name: 'Add Program' }).elements();

      expect(modalTitles.length).toBe(0);
    });

    it('shows empty form in add mode', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Open modal
      const addButton = page.getByRole('button', { name: /Add New Program/i });
      await userEvent.click(addButton);

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      const descriptionInput = page.getByPlaceholder(/Enter program description/i);

      expect(nameInput).toHaveValue('');
      expect(descriptionInput).toHaveValue('');
    });

    it('disables submit button when form is empty', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Open modal
      const addButton = page.getByRole('button', { name: /Add New Program/i });
      await userEvent.click(addButton);

      // Submit button should be disabled when form is empty
      const submitButton = page.getByRole('button', { name: 'Add Program' });

      expect(submitButton).toBeDisabled();
    });

    it('can fill in the form fields', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Open modal
      const addButton = page.getByRole('button', { name: /Add New Program/i });
      await userEvent.click(addButton);

      // Fill form
      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.type(nameInput, 'New Test Program');

      const descriptionInput = page.getByPlaceholder(/Enter program description/i);
      await userEvent.type(descriptionInput, 'A new test program description');

      expect(nameInput).toHaveValue('New Test Program');
      expect(descriptionInput).toHaveValue('A new test program description');
    });

    it('can toggle status to inactive', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Open modal
      const addButton = page.getByRole('button', { name: /Add New Program/i });
      await userEvent.click(addButton);

      // First interact with an input to stabilize dialog
      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.type(nameInput, 'Test');

      // Initially shows Active in the modal (verify switch is checked)
      const statusSwitch = page.getByRole('switch');

      expect(statusSwitch).toHaveAttribute('data-state', 'checked');

      // Toggle status to inactive
      await userEvent.click(statusSwitch);

      // Should now be unchecked (Inactive)
      expect(statusSwitch).toHaveAttribute('data-state', 'unchecked');
    });
  });

  describe('Edit Program Modal', () => {
    it('opens edit program modal when edit button is clicked', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Click first edit button (Adult BJJ)
      const editButtons = page.getByRole('button', { name: /Edit program/i }).elements();
      await userEvent.click(editButtons[0]!);

      const modalTitle = page.getByRole('heading', { name: 'Edit Program' });

      expect(modalTitle).toBeInTheDocument();
    });

    it('populates form with program data in edit mode', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Click first edit button (Adult BJJ)
      const editButtons = page.getByRole('button', { name: /Edit program/i }).elements();
      await userEvent.click(editButtons[0]!);

      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      const descriptionInput = page.getByPlaceholder(/Enter program description/i);

      expect(nameInput).toHaveValue('Adult Brazilian Jiu-jitsu');
      expect(descriptionInput).toHaveValue('Traditional Brazilian Jiu-Jitsu program for adults focusing on self-defense, competition, and fitness.');
    });

    it('shows save changes button in edit mode', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Click first edit button
      const editButtons = page.getByRole('button', { name: /Edit program/i }).elements();
      await userEvent.click(editButtons[0]!);

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      expect(saveButton).toBeInTheDocument();
    });

    it('closes edit modal when cancel button is clicked', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Click first edit button
      const editButtons = page.getByRole('button', { name: /Edit program/i }).elements();
      await userEvent.click(editButtons[0]!);

      // Click cancel
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await userEvent.click(cancelButton);

      // Modal should be closed
      const modalTitles = page.getByRole('heading', { name: 'Edit Program' }).elements();

      expect(modalTitles.length).toBe(0);
    });

    it('can modify name in edit mode', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Click first edit button (Adult BJJ)
      const editButtons = page.getByRole('button', { name: /Edit program/i }).elements();
      await userEvent.click(editButtons[0]!);

      // Clear and modify name
      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Updated BJJ Program');

      expect(nameInput).toHaveValue('Updated BJJ Program');
    });

    it('can toggle status in edit mode', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Click first edit button (Adult BJJ which is Active)
      const editButtons = page.getByRole('button', { name: /Edit program/i }).elements();
      await userEvent.click(editButtons[0]!);

      // Verify switch is initially checked (Active)
      const statusSwitch = page.getByRole('switch');

      expect(statusSwitch).toHaveAttribute('data-state', 'checked');

      // Toggle status
      await userEvent.click(statusSwitch);

      // Should now be unchecked (Inactive)
      expect(statusSwitch).toHaveAttribute('data-state', 'unchecked');
    });
  });

  describe('Delete Program', () => {
    it('opens delete confirmation dialog when delete button is clicked', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Click delete button (only Wrestling has one since it has 0 classes)
      const deleteButton = page.getByRole('button', { name: /Delete program/i });
      await userEvent.click(deleteButton);

      // Delete confirmation dialog should appear
      const dialogTitle = page.getByRole('heading', { name: 'Are you absolutely sure?' });

      expect(dialogTitle).toBeInTheDocument();
    });

    it('shows correct warning message in delete confirmation dialog', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Click delete button
      const deleteButton = page.getByRole('button', { name: /Delete program/i });
      await userEvent.click(deleteButton);

      // Verify warning message
      const warningMessage = page.getByText(/This action cannot be undone/);

      expect(warningMessage).toBeInTheDocument();
    });

    it('closes delete dialog when cancel button is clicked', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Click delete button
      const deleteButton = page.getByRole('button', { name: /Delete program/i });
      await userEvent.click(deleteButton);

      // Click cancel
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await userEvent.click(cancelButton);

      // Dialog should be closed
      const dialogTitles = page.getByRole('heading', { name: 'Are you absolutely sure?' }).elements();

      expect(dialogTitles.length).toBe(0);

      // Program should still exist
      expect(page.getByRole('heading', { name: 'Wrestling Fundamentals' })).toBeInTheDocument();
    });

    it('calls programs.remove with the program id when delete is confirmed', async () => {
      const { client } = await import('@/libs/Orpc');
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Click delete button (only Wrestling has one since it has 0 classes)
      const deleteButton = page.getByRole('button', { name: /Delete program/i });
      await userEvent.click(deleteButton);

      // Click confirm delete in the dialog
      const confirmDeleteButton = page.getByRole('button', { name: 'Delete' });
      await userEvent.click(confirmDeleteButton);

      // The remove mutation should have been called with Wrestling's id ('5'
      // in the fixture). The fixture array doesn't mutate after delete since
      // the cache hook is mocked statically — we assert the API call instead.
      expect(client.programs.remove).toHaveBeenCalledWith({ id: '5' });
    });

    it('closes dialog after confirming deletion', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Click delete button
      const deleteButton = page.getByRole('button', { name: /Delete program/i });
      await userEvent.click(deleteButton);

      // Confirm deletion
      const confirmDeleteButton = page.getByRole('button', { name: 'Delete' });
      await userEvent.click(confirmDeleteButton);

      // Dialog should be closed
      const dialogTitles = page.getByRole('heading', { name: 'Are you absolutely sure?' }).elements();

      expect(dialogTitles.length).toBe(0);
    });
  });

  describe('Modal Close Button', () => {
    it('closes add modal when X button is clicked', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Open modal
      const addButton = page.getByRole('button', { name: /Add New Program/i });
      await userEvent.click(addButton);

      // First interact with an input to stabilize dialog
      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.type(nameInput, 'Test');

      // Click X close button
      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      // Modal should be closed
      const modalTitles = page.getByRole('heading', { name: 'Add Program' }).elements();

      expect(modalTitles.length).toBe(0);
    });

    it('closes edit modal when X button is clicked', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Open edit modal
      const editButtons = page.getByRole('button', { name: /Edit program/i }).elements();
      await userEvent.click(editButtons[0]!);

      // First interact with an input to stabilize dialog
      const nameInput = page.getByRole('textbox', { name: /Program Name/i });
      await userEvent.type(nameInput, 'Test');

      // Click X close button
      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      // Modal should be closed
      const modalTitles = page.getByRole('heading', { name: 'Edit Program' }).elements();

      expect(modalTitles.length).toBe(0);
    });
  });

  describe('Form Fields', () => {
    it('does not show required indicator on program name field', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Open modal
      const addButton = page.getByRole('button', { name: /Add New Program/i });
      await userEvent.click(addButton);

      // There should be no asterisk for required fields
      const requiredIndicators = page.getByText('*').elements();

      expect(requiredIndicators.length).toBe(0);
    });

    it('shows description label', async () => {
      render(<I18nWrapper><ProgramsPage /></I18nWrapper>);

      // Open modal
      const addButton = page.getByRole('button', { name: /Add New Program/i });
      await userEvent.click(addButton);

      const descriptionLabel = page.getByText('Description');

      expect(descriptionLabel).toBeInTheDocument();
    });
  });
});
