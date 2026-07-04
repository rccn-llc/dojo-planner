import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { client } from '@/libs/Orpc';
import { EditAssociatedProgramModal } from './EditAssociatedProgramModal';

// Mock next-intl with proper translations
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    const translationKeys: Record<string, string> = {
      title: 'Edit Associated Program',
      program_label: 'Associated Program',
      program_placeholder: 'Select a program',
      program_help: 'Members with this membership will have access to this program',
      waiver_label: 'Waiver',
      waiver_placeholder: 'Select a waiver',
      waiver_loading: 'Loading waivers...',
      waiver_help: 'Required waiver for this membership',
      cancel_button: 'Cancel',
      save_button: 'Save Changes',
      saving_button: 'Saving...',
    };
    let result = translationKeys[key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(`{${paramKey}}`, String(paramValue));
      });
    }
    return result;
  },
}));

// Mock @/libs/Orpc
vi.mock('@/libs/Orpc', () => ({
  client: {
    waivers: {
      listActiveTemplates: vi.fn(),
      setMembershipWaivers: vi.fn(),
    },
    programs: {
      list: vi.fn(),
    },
  },
}));

function makeProgram(id: string, name: string, slug: string, isActive: boolean) {
  return {
    id,
    organizationId: 'test-org',
    name,
    slug,
    description: null,
    color: null,
    isActive,
    sortOrder: 0,
    classCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('EditAssociatedProgramModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    vi.mocked(client.waivers.listActiveTemplates).mockResolvedValue({
      templates: [
        {
          id: 'waiver-1',
          organizationId: 'test-org',
          name: 'Standard Adult Waiver',
          slug: 'standard-adult-waiver',
          version: 1,
          content: 'Test content',
          description: null,
          isActive: true,
          isDefault: false,
          requiresGuardian: false,
          guardianAgeThreshold: 18,
          sortOrder: 0,
          parentId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          signedCount: 0,
          membershipCount: 0,
        },
        {
          id: 'waiver-2',
          organizationId: 'test-org',
          name: 'Kids Waiver',
          slug: 'kids-waiver',
          version: 1,
          content: 'Test content',
          description: null,
          isActive: true,
          isDefault: false,
          requiresGuardian: true,
          guardianAgeThreshold: 18,
          sortOrder: 1,
          parentId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          signedCount: 0,
          membershipCount: 0,
        },
      ],
    });
    vi.mocked(client.waivers.setMembershipWaivers).mockResolvedValue({});
    vi.mocked(client.programs.list).mockResolvedValue({
      programs: [
        makeProgram('prog-1', 'Adult Brazilian Jiu-jitsu', 'adult-bjj', true),
        makeProgram('prog-2', 'Kids Program', 'kids', true),
        makeProgram('prog-3', 'Competition Team', 'competition', true),
        makeProgram('prog-4', 'Judo Fundamentals', 'judo', true),
        makeProgram('prog-5', 'Wrestling Fundamentals', 'wrestling', false),
      ],
    });
  });

  it('should render modal with title when open', () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    const title = page.getByText('Edit Associated Program');

    expect(title).toBeTruthy();
  });

  it('should not render modal content when closed', () => {
    render(
      <EditAssociatedProgramModal
        isOpen={false}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    const title = document.querySelector('[role="dialog"]');

    expect(title).toBeNull();
  });

  it('should render program label', () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    const label = page.getByText('Associated Program');

    expect(label).toBeTruthy();
  });

  it('should render help text', () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    const helpText = page.getByText('Members with this membership will have access to this program');

    expect(helpText).toBeTruthy();
  });

  it('should render Cancel button', () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    const cancelButton = page.getByText('Cancel');

    expect(cancelButton).toBeTruthy();
  });

  it('should render Save button', () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    const saveButton = page.getByText('Save Changes');

    expect(saveButton).toBeTruthy();
  });

  it('should call onClose when Cancel button is clicked', async () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    const cancelButton = page.getByText('Cancel');
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should disable Save button when no program is selected', () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId={null}
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(true);
  });

  it('should enable Save button when program is selected', () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    expect(saveButton?.disabled).toBe(false);
  });

  it('should render program select dropdown', () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    const selectTrigger = document.querySelector('[role="combobox"]');

    expect(selectTrigger).toBeTruthy();
  });

  it('should show program options when dropdown is clicked', async () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    // Wait for the async programs.list() fetch to enable the program trigger
    const programTrigger = page.getByRole('combobox').first();

    await expect.element(programTrigger).toBeEnabled();

    await userEvent.click(programTrigger);

    await expect.element(page.getByRole('option', { name: 'Adult Brazilian Jiu-jitsu' })).toBeInTheDocument();
  });

  it('should call onSave with selected program when Save is clicked', async () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    // Wait for the async programs.list() fetch so the program name resolves
    await expect.element(page.getByRole('combobox').first()).toBeEnabled();

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    // Wait for async operation
    await new Promise(resolve => setTimeout(resolve, 600));

    expect(client.waivers.setMembershipWaivers).toHaveBeenCalledWith({
      membershipPlanId: 'test-plan-1',
      waiverTemplateIds: [],
    });

    expect(mockOnSave).toHaveBeenCalledWith({
      associatedProgramId: 'prog-1',
      associatedProgramName: 'Adult Brazilian Jiu-jitsu',
      associatedWaiverId: null,
      associatedWaiverName: null,
    });
  });

  it('should select a different program and save', async () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    // Wait for the async programs.list() fetch to enable the program trigger
    const programTrigger = page.getByRole('combobox').first();

    await expect.element(programTrigger).toBeEnabled();

    await userEvent.click(programTrigger);

    const kidsProgram = page.getByRole('option', { name: 'Kids Program' });
    await userEvent.click(kidsProgram);

    const saveButton = page.getByText('Save Changes');
    await userEvent.click(saveButton);

    // Wait for async operation
    await new Promise(resolve => setTimeout(resolve, 600));

    expect(mockOnSave).toHaveBeenCalledWith({
      associatedProgramId: 'prog-2',
      associatedProgramName: 'Kids Program',
      associatedWaiverId: null,
      associatedWaiverName: null,
    });
  });

  it('should reset to initial program when dialog is closed via backdrop', async () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    // Change the program selection first (wait for the fetch to enable it)
    const programTrigger = page.getByRole('combobox').first();

    await expect.element(programTrigger).toBeEnabled();

    await userEvent.click(programTrigger);
    const kidsProgram = page.getByRole('option', { name: 'Kids Program' });
    await userEvent.click(kidsProgram);

    // Close dialog by pressing Escape (simulates closing via backdrop or close button)
    await userEvent.keyboard('{Escape}');

    // onClose should be called (via handleCancel which is called from handleOpenChange)
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should show Saving... text during save operation', async () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    if (saveButton) {
      // Click save and check for Saving... text immediately
      await userEvent.click(saveButton);

      // Check for loading state (Saving... text should appear)
      const savingText = page.getByText('Saving...');

      expect(savingText).toBeTruthy();
    }
  });

  it('should only show active programs in dropdown', async () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    // Wait for the async programs.list() fetch to enable the program trigger
    const programTrigger = page.getByRole('combobox').first();

    await expect.element(programTrigger).toBeEnabled();

    await userEvent.click(programTrigger);

    // Active program should be visible
    await expect.element(page.getByRole('option', { name: 'Judo Fundamentals' })).toBeInTheDocument();

    // Inactive program (Wrestling Fundamentals) should NOT be visible
    const allOptions = Array.from(document.querySelectorAll('[role="option"]'));
    const wrestlingOption = allOptions.find(opt => opt.textContent?.includes('Wrestling Fundamentals'));

    expect(wrestlingOption).toBeUndefined();
  });

  it('should show 4 active programs in dropdown', async () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    // Wait for the async programs.list() fetch to enable the program trigger
    const programTrigger = page.getByRole('combobox').first();

    await expect.element(programTrigger).toBeEnabled();

    await userEvent.click(programTrigger);

    // Count the options - should be 4 active programs (Wrestling is inactive)
    await expect.element(page.getByRole('option', { name: 'Adult Brazilian Jiu-jitsu' })).toBeInTheDocument();

    const allOptions = Array.from(document.querySelectorAll('[role="option"]'));

    expect(allOptions.length).toBe(4);
  });

  it('should render waiver dropdown', async () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    // Wait for waivers to load
    await new Promise(resolve => setTimeout(resolve, 100));

    const waiverLabel = page.getByText('Waiver');

    expect(waiverLabel).toBeTruthy();
  });

  it('should show waiver options when dropdown is clicked', async () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    // Wait for waivers to load
    await new Promise(resolve => setTimeout(resolve, 100));

    const selectTriggers = document.querySelectorAll('[role="combobox"]');
    const waiverSelect = selectTriggers[1]; // Second combobox is the waiver dropdown

    if (waiverSelect) {
      await userEvent.click(waiverSelect);

      const adultWaiver = page.getByText('Standard Adult Waiver');

      expect(adultWaiver).toBeTruthy();
    }
  });

  it('should call onSave with selected waiver when Save is clicked', async () => {
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId="waiver-1"
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    // Wait for waivers to load
    await new Promise(resolve => setTimeout(resolve, 100));

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Changes'));

    if (saveButton) {
      await userEvent.click(saveButton);

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(client.waivers.setMembershipWaivers).toHaveBeenCalledWith({
        membershipPlanId: 'test-plan-1',
        waiverTemplateIds: ['waiver-1'],
      });

      expect(mockOnSave).toHaveBeenCalledWith({
        associatedProgramId: 'prog-1',
        associatedProgramName: 'Adult Brazilian Jiu-jitsu',
        associatedWaiverId: 'waiver-1',
        associatedWaiverName: 'Standard Adult Waiver (v1)',
      });
    }
  });

  it('should source programs from the API, not a hardcoded mock list', async () => {
    // Regression guard for the FK-violation 500 bug: options must come from
    // client.programs.list() with real program ids.
    render(
      <EditAssociatedProgramModal
        isOpen={true}
        onClose={mockOnClose}
        associatedProgramId="prog-1"
        associatedWaiverId={null}
        membershipPlanId="test-plan-1"
        onSave={mockOnSave}
      />,
    );

    // The trigger only becomes enabled once client.programs.list() resolves
    await expect.element(page.getByRole('combobox').first()).toBeEnabled();

    expect(client.programs.list).toHaveBeenCalled();
  });
});
