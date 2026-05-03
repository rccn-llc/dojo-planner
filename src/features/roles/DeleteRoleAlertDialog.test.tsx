import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { DeleteRoleAlertDialog } from './DeleteRoleAlertDialog';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      delete_dialog_title: 'Delete Role',
      delete_dialog_description: `Delete "${vars?.roleName ?? ''}"?`,
      delete_cancel_button: 'Cancel',
      delete_confirm_button: 'Delete Role',
    };
    return map[key] || key;
  },
}));

describe('DeleteRoleAlertDialog', () => {
  it('renders the role name in the description', () => {
    render(
      <DeleteRoleAlertDialog
        isOpen
        roleName="Front Desk"
        onCloseAction={() => {}}
        onConfirmAction={() => {}}
      />,
    );

    expect(page.getByText('Delete "Front Desk"?')).toBeDefined();
  });

  it('calls onConfirmAction when delete is clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteRoleAlertDialog
        isOpen
        roleName="Coach"
        onCloseAction={() => {}}
        onConfirmAction={onConfirm}
      />,
    );

    await userEvent.click(page.getByTestId('role-delete-confirm'));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCloseAction when cancel is clicked', async () => {
    const onClose = vi.fn();
    render(
      <DeleteRoleAlertDialog
        isOpen
        roleName="Coach"
        onCloseAction={onClose}
        onConfirmAction={() => {}}
      />,
    );

    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('renders the error banner when errorMessage is provided', () => {
    render(
      <DeleteRoleAlertDialog
        isOpen
        roleName="Coach"
        onCloseAction={() => {}}
        onConfirmAction={() => {}}
        errorMessage="Role still has members"
      />,
    );

    const banner = page.getByTestId('role-delete-error');

    expect(banner).toBeDefined();
    expect(page.getByText('Role still has members')).toBeDefined();
  });

  it('does not render when isOpen is false', () => {
    render(
      <DeleteRoleAlertDialog
        isOpen={false}
        roleName="Coach"
        onCloseAction={() => {}}
        onConfirmAction={() => {}}
      />,
    );

    const titles = page.getByText('Delete Role').elements();

    expect(titles.length).toBe(0);
  });
});
