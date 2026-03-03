import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { FamilyMemberSuccessStep } from './FamilyMemberSuccessStep';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    const allKeys: Record<string, string> = {
      member_success_title: 'Family Member Added!',
      member_success_description: '{name} has been successfully added as a family member.',
      members_added_count: '{count} family members added this session',
      add_another_button: 'Add Another Family Member',
      done_button: 'Done',
    };
    let result = allKeys[key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(`{${paramKey}}`, String(paramValue));
      });
    }
    return result;
  },
}));

describe('FamilyMemberSuccessStep', () => {
  const mockOnAddAnother = vi.fn();
  const mockOnDone = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display success title', async () => {
    render(
      <FamilyMemberSuccessStep
        memberName="Alice Smith"
        completedMembers={[]}
        onAddAnother={mockOnAddAnother}
        onDone={mockOnDone}
      />,
    );

    await expect.element(page.getByText('Family Member Added!')).toBeVisible();
  });

  it('should display member name in description', async () => {
    render(
      <FamilyMemberSuccessStep
        memberName="Alice Smith"
        completedMembers={[]}
        onAddAnother={mockOnAddAnother}
        onDone={mockOnDone}
      />,
    );

    await expect.element(page.getByText('Alice Smith has been successfully added as a family member.')).toBeVisible();
  });

  it('should display completed members count and list', async () => {
    const completedMembers = [
      { id: 'member-1', name: 'Alice Smith' },
      { id: 'member-2', name: 'Bob Smith' },
    ];

    render(
      <FamilyMemberSuccessStep
        memberName="Carol Smith"
        completedMembers={completedMembers}
        onAddAnother={mockOnAddAnother}
        onDone={mockOnDone}
      />,
    );

    await expect.element(page.getByText('2 family members added this session')).toBeVisible();
    await expect.element(page.getByText('Alice Smith')).toBeVisible();
    await expect.element(page.getByText('Bob Smith')).toBeVisible();
  });

  it('should not display members section when no completed members', async () => {
    render(
      <FamilyMemberSuccessStep
        memberName="Alice Smith"
        completedMembers={[]}
        onAddAnother={mockOnAddAnother}
        onDone={mockOnDone}
      />,
    );

    expect(page.getByText('family members added this session').elements()).toHaveLength(0);
  });

  it('should call onAddAnother when "Add Another" button is clicked', async () => {
    render(
      <FamilyMemberSuccessStep
        memberName="Alice Smith"
        completedMembers={[]}
        onAddAnother={mockOnAddAnother}
        onDone={mockOnDone}
      />,
    );

    await page.getByText('Add Another Family Member').click();

    expect(mockOnAddAnother).toHaveBeenCalledOnce();
  });

  it('should call onDone when "Done" button is clicked', async () => {
    render(
      <FamilyMemberSuccessStep
        memberName="Alice Smith"
        completedMembers={[]}
        onAddAnother={mockOnAddAnother}
        onDone={mockOnDone}
      />,
    );

    await page.getByText('Done').click();

    expect(mockOnDone).toHaveBeenCalledOnce();
  });
});
