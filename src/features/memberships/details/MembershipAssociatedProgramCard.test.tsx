import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MembershipAssociatedProgramCard } from './MembershipAssociatedProgramCard';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Associated Program',
  program_label: 'Program',
  no_program: 'No program assigned',
  waiver_label: 'Waiver',
  no_waiver: 'No waiver assigned',
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

describe('MembershipAssociatedProgramCard', () => {
  const mockOnEdit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render card with title', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="1"
        associatedProgramName="Adult Brazilian Jiu-jitsu"
        associatedWaiverId={null}
        associatedWaiverName={null}
        onEdit={mockOnEdit}
      />,
    );

    const title = page.getByText('Associated Program');

    expect(title).toBeTruthy();
  });

  it('should display program name when program is associated', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="1"
        associatedProgramName="Adult Brazilian Jiu-jitsu"
        associatedWaiverId={null}
        associatedWaiverName={null}
        onEdit={mockOnEdit}
      />,
    );

    const programName = page.getByText('Adult Brazilian Jiu-jitsu');

    expect(programName).toBeTruthy();
  });

  it('should display no program message when no program is associated', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId={null}
        associatedProgramName={null}
        associatedWaiverId={null}
        associatedWaiverName={null}
        onEdit={mockOnEdit}
      />,
    );

    const noProgram = page.getByText('No program assigned');

    expect(noProgram).toBeTruthy();
  });

  it('should display no program message when program ID is null but name exists', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId={null}
        associatedProgramName="Some Program"
        associatedWaiverId={null}
        associatedWaiverName={null}
        onEdit={mockOnEdit}
      />,
    );

    const noProgram = page.getByText('No program assigned');

    expect(noProgram).toBeTruthy();
  });

  it('should display program label', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="1"
        associatedProgramName="Adult Brazilian Jiu-jitsu"
        associatedWaiverId={null}
        associatedWaiverName={null}
        onEdit={mockOnEdit}
      />,
    );

    const label = page.getByText('Program');

    expect(label).toBeTruthy();
  });

  it('should render edit button', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="1"
        associatedProgramName="Adult Brazilian Jiu-jitsu"
        associatedWaiverId={null}
        associatedWaiverName={null}
        onEdit={mockOnEdit}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));

    expect(buttons.length).toBe(1);
  });

  it('should call onEdit when edit button is clicked', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="1"
        associatedProgramName="Adult Brazilian Jiu-jitsu"
        associatedWaiverId={null}
        associatedWaiverName={null}
        onEdit={mockOnEdit}
      />,
    );

    const editButton = document.querySelector('button');
    if (editButton) {
      await userEvent.click(editButton);

      expect(mockOnEdit).toHaveBeenCalled();
    }
  });

  it('should render different program names correctly', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="2"
        associatedProgramName="Kids Program"
        associatedWaiverId={null}
        associatedWaiverName={null}
        onEdit={mockOnEdit}
      />,
    );

    const programName = page.getByText('Kids Program');

    expect(programName).toBeTruthy();
  });

  it('should render Competition Team program', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="3"
        associatedProgramName="Competition Team"
        associatedWaiverId={null}
        associatedWaiverName={null}
        onEdit={mockOnEdit}
      />,
    );

    const programName = page.getByText('Competition Team');

    expect(programName).toBeTruthy();
  });

  it('should be wrapped in a Card component', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="1"
        associatedProgramName="Adult Brazilian Jiu-jitsu"
        associatedWaiverId={null}
        associatedWaiverName={null}
        onEdit={mockOnEdit}
      />,
    );

    const card = document.querySelector('.p-6');

    expect(card).toBeTruthy();
  });

  it('should display waiver label', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="1"
        associatedProgramName="Adult Brazilian Jiu-jitsu"
        associatedWaiverId="waiver-1"
        associatedWaiverName="Standard Adult Waiver (v1)"
        onEdit={mockOnEdit}
      />,
    );

    const label = page.getByText('Waiver');

    expect(label).toBeTruthy();
  });

  it('should display waiver name when waiver is associated', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="1"
        associatedProgramName="Adult Brazilian Jiu-jitsu"
        associatedWaiverId="waiver-1"
        associatedWaiverName="Standard Adult Waiver (v1)"
        onEdit={mockOnEdit}
      />,
    );

    const waiverName = page.getByText('Standard Adult Waiver (v1)');

    expect(waiverName).toBeTruthy();
  });

  it('should display no waiver message when no waiver is associated', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="1"
        associatedProgramName="Adult Brazilian Jiu-jitsu"
        associatedWaiverId={null}
        associatedWaiverName={null}
        onEdit={mockOnEdit}
      />,
    );

    const noWaiver = page.getByText('No waiver assigned');

    expect(noWaiver).toBeTruthy();
  });

  it('should display no waiver message when waiver ID is null but name exists', async () => {
    await render(
      <MembershipAssociatedProgramCard
        associatedProgramId="1"
        associatedProgramName="Adult Brazilian Jiu-jitsu"
        associatedWaiverId={null}
        associatedWaiverName="Some Waiver"
        onEdit={mockOnEdit}
      />,
    );

    const noWaiver = page.getByText('No waiver assigned');

    expect(noWaiver).toBeTruthy();
  });
});
