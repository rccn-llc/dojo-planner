import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { AddEditRoleModal } from './AddEditRoleModal';

const mockAvailablePermissions = [
  { id: 'perm-1', key: 'org:manage_members', name: 'Manage Members', description: 'Can add, edit, and remove members' },
  { id: 'perm-2', key: 'org:manage_classes', name: 'Manage Classes', description: 'Can create and manage class schedules' },
  { id: 'perm-3', key: 'org:view_reports', name: 'View Reports', description: 'Can view academy reports and analytics' },
];

describe('AddEditRoleModal', () => {
  const defaultProps = {
    isOpen: true,
    onCloseAction: vi.fn(),
    onSaveAction: vi.fn(),
    role: null,
    availablePermissions: mockAvailablePermissions,
    isLoading: false,
    canEditSystemRoles: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Add Mode', () => {
    it('renders add role title when role is null', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Add Role' });

      expect(title).toBeInTheDocument();
    });

    it('renders empty form fields in add mode', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      const descriptionInput = page.getByTestId('role-description-input');

      expect(nameInput).toHaveValue('');
      expect(descriptionInput).toHaveValue('');
    });

    it('renders add role button in add mode', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const addButton = page.getByRole('button', { name: 'Add Role' });

      expect(addButton).toBeInTheDocument();
    });

    it('renders empty role key in add mode', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const keyInput = page.getByTestId('role-key-input');

      expect(keyInput).toHaveValue('');
    });
  });

  describe('Edit Mode', () => {
    const editRole = {
      id: 'role-1',
      key: 'org:test_role',
      name: 'Test Role',
      description: 'Test description',
      permissions: [mockAvailablePermissions[0]!],
      isSystemRole: false,
    };

    it('renders edit role title when role is provided', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={editRole} />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Edit Role' });

      expect(title).toBeInTheDocument();
    });

    it('populates form fields with role data', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={editRole} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      const descriptionInput = page.getByTestId('role-description-input');
      const keyInput = page.getByTestId('role-key-input');

      expect(nameInput).toHaveValue('Test Role');
      expect(descriptionInput).toHaveValue('Test description');
      expect(keyInput).toHaveValue('org:test_role');
    });

    it('renders save changes button in edit mode', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={editRole} />
        </I18nWrapper>,
      );

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      expect(saveButton).toBeInTheDocument();
    });

    it('pre-selects permissions that role has', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={editRole} />
        </I18nWrapper>,
      );

      const permissionSwitch = page.getByTestId('permission-switch-perm-1');

      expect(permissionSwitch).toHaveAttribute('data-state', 'checked');
    });
  });

  describe('System Role Edit Mode', () => {
    const systemRole = {
      id: 'role-1',
      key: 'org:admin',
      name: 'Admin',
      description: 'Full system access',
      permissions: mockAvailablePermissions,
      isSystemRole: true,
    };

    it('shows system role warning for system roles', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={systemRole} />
        </I18nWrapper>,
      );

      const warning = page.getByText(/This is a system role and cannot be edited/);

      expect(warning).toBeInTheDocument();
    });

    it('disables form fields for system roles when canEditSystemRoles is false', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={systemRole} canEditSystemRoles={false} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      const descriptionInput = page.getByTestId('role-description-input');

      expect(nameInput).toBeDisabled();
      expect(descriptionInput).toBeDisabled();
    });

    it('enables form fields for system roles when canEditSystemRoles is true', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={systemRole} canEditSystemRoles />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      const descriptionInput = page.getByTestId('role-description-input');

      expect(nameInput).not.toBeDisabled();
      expect(descriptionInput).not.toBeDisabled();
    });

    it('disables save button for system roles when canEditSystemRoles is false', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={systemRole} canEditSystemRoles={false} />
        </I18nWrapper>,
      );

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      expect(saveButton).toBeDisabled();
    });
  });

  describe('Form Interactions', () => {
    it('updates name field when user types', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'New Role');

      expect(nameInput).toHaveValue('New Role');
    });

    it('auto-generates role key when typing name in add mode', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      await userEvent.type(nameInput, 'Academy Owner');

      const keyInput = page.getByTestId('role-key-input');

      expect(keyInput).toHaveValue('org:academy_owner');
    });

    it('does not auto-generate key when editing existing role', async () => {
      const editRole = {
        id: 'role-1',
        key: 'org:existing_key',
        name: 'Existing Role',
        description: 'Test description',
        permissions: [],
        isSystemRole: false,
      };

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={editRole} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Changed Name');

      const keyInput = page.getByTestId('role-key-input');

      expect(keyInput).toHaveValue('org:existing_key');
    });

    it('updates description field when user types', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const descriptionInput = page.getByTestId('role-description-input');
      await userEvent.type(descriptionInput, 'New description');

      expect(descriptionInput).toHaveValue('New description');
    });

    it('toggles permission when switch is clicked', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      // Interact with form first to stabilize dialog
      const nameInput = page.getByTestId('role-name-input');
      await userEvent.type(nameInput, 'Test');

      const permissionSwitch = page.getByTestId('permission-switch-perm-1');

      expect(permissionSwitch).toHaveAttribute('data-state', 'unchecked');

      await userEvent.click(permissionSwitch);

      expect(permissionSwitch).toHaveAttribute('data-state', 'checked');
    });

    it('can toggle multiple permissions', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      // Interact with form first to stabilize dialog
      const nameInput = page.getByTestId('role-name-input');
      await userEvent.type(nameInput, 'Test');

      const permSwitch1 = page.getByTestId('permission-switch-perm-1');
      const permSwitch2 = page.getByTestId('permission-switch-perm-2');

      await userEvent.click(permSwitch1);
      await userEvent.click(permSwitch2);

      expect(permSwitch1).toHaveAttribute('data-state', 'checked');
      expect(permSwitch2).toHaveAttribute('data-state', 'checked');
    });

    it('can uncheck a permission', async () => {
      const editRole = {
        id: 'role-1',
        key: 'org:test_role',
        name: 'Test Role',
        description: 'Test description',
        permissions: [mockAvailablePermissions[0]!],
        isSystemRole: false,
      };

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={editRole} />
        </I18nWrapper>,
      );

      const permissionSwitch = page.getByTestId('permission-switch-perm-1');

      expect(permissionSwitch).toHaveAttribute('data-state', 'checked');

      await userEvent.click(permissionSwitch);

      expect(permissionSwitch).toHaveAttribute('data-state', 'unchecked');
    });
  });

  describe('Form Validation', () => {
    it('disables submit button when name is empty', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const submitButton = page.getByRole('button', { name: 'Add Role' });

      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when description is empty', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      await userEvent.type(nameInput, 'Test Role');

      const submitButton = page.getByRole('button', { name: 'Add Role' });

      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when name has only whitespace', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      const descriptionInput = page.getByTestId('role-description-input');

      await userEvent.type(nameInput, '   ');
      await userEvent.type(descriptionInput, 'Some description');

      const submitButton = page.getByRole('button', { name: 'Add Role' });

      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when description has only whitespace', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      const descriptionInput = page.getByTestId('role-description-input');

      await userEvent.type(nameInput, 'Test Role');
      await userEvent.type(descriptionInput, '   ');

      const submitButton = page.getByRole('button', { name: 'Add Role' });

      expect(submitButton).toBeDisabled();
    });

    it('enables submit button when both name and description have values', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      const descriptionInput = page.getByTestId('role-description-input');

      await userEvent.type(nameInput, 'Test Role');
      await userEvent.type(descriptionInput, 'Test description');

      const submitButton = page.getByRole('button', { name: 'Add Role' });

      expect(submitButton).toBeEnabled();
    });

    it('does not call onSaveAction when button is disabled', async () => {
      const onSaveAction = vi.fn();

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} onSaveAction={onSaveAction} />
        </I18nWrapper>,
      );

      const submitButton = page.getByRole('button', { name: 'Add Role' });

      expect(submitButton).toBeDisabled();

      const buttonElement = submitButton.element() as HTMLButtonElement;
      buttonElement.click();

      expect(onSaveAction).not.toHaveBeenCalled();
    });

    it('does not call onSaveAction when form is submitted programmatically with invalid data', async () => {
      const onSaveAction = vi.fn();

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} onSaveAction={onSaveAction} />
        </I18nWrapper>,
      );

      // Trigger touched state by filling and clearing name
      const nameInput = page.getByTestId('role-name-input');
      await userEvent.type(nameInput, 'x');
      await userEvent.clear(nameInput);

      // Find the form element and submit it programmatically
      const form = nameInput.element().closest('form');

      expect(form).not.toBeNull();

      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      expect(onSaveAction).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    it('calls onSaveAction with trimmed data when form is valid', async () => {
      const onSaveAction = vi.fn();

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} onSaveAction={onSaveAction} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      const descriptionInput = page.getByTestId('role-description-input');

      await userEvent.type(nameInput, '  Test Role  ');
      await userEvent.type(descriptionInput, '  Test description  ');

      const submitButton = page.getByRole('button', { name: 'Add Role' });
      await userEvent.click(submitButton);

      expect(onSaveAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Role',
          description: 'Test description',
        }),
      );
    });

    it('calls onSaveAction with id when editing existing role', async () => {
      const onSaveAction = vi.fn();
      const editRole = {
        id: 'role-123',
        key: 'org:existing_role',
        name: 'Existing Role',
        description: 'Existing description',
        permissions: [],
        isSystemRole: false,
      };

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={editRole} onSaveAction={onSaveAction} />
        </I18nWrapper>,
      );

      const submitButton = page.getByRole('button', { name: 'Save Changes' });
      await userEvent.click(submitButton);

      expect(onSaveAction).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'role-123',
          key: 'org:existing_role',
        }),
      );
    });

    it('includes selected permissions in submission', async () => {
      const onSaveAction = vi.fn();

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} onSaveAction={onSaveAction} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      const descriptionInput = page.getByTestId('role-description-input');

      await userEvent.type(nameInput, 'Test Role');
      await userEvent.type(descriptionInput, 'Test description');

      const permissionSwitch = page.getByTestId('permission-switch-perm-1');
      await userEvent.click(permissionSwitch);

      const submitButton = page.getByRole('button', { name: 'Add Role' });
      await userEvent.click(submitButton);

      expect(onSaveAction).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: [mockAvailablePermissions[0]],
        }),
      );
    });
  });

  describe('Cancel Action', () => {
    it('calls onCloseAction when cancel button is clicked', async () => {
      const onCloseAction = vi.fn();

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} onCloseAction={onCloseAction} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      await userEvent.type(nameInput, 'Test');

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await userEvent.click(cancelButton);

      expect(onCloseAction).toHaveBeenCalled();
    });

    it('calls onCloseAction when dialog close button is clicked', async () => {
      const onCloseAction = vi.fn();

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} onCloseAction={onCloseAction} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      await userEvent.type(nameInput, 'Test');

      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      expect(onCloseAction).toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('shows saving button text when loading', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} isLoading />
        </I18nWrapper>,
      );

      const savingButton = page.getByRole('button', { name: 'Saving...' });

      expect(savingButton).toBeInTheDocument();
    });

    it('disables inputs when loading', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} isLoading />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      const descriptionInput = page.getByTestId('role-description-input');

      expect(nameInput).toBeDisabled();
      expect(descriptionInput).toBeDisabled();
    });

    it('disables permission switches when loading', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} isLoading />
        </I18nWrapper>,
      );

      const permissionSwitch = page.getByTestId('permission-switch-perm-1');

      expect(permissionSwitch).toBeDisabled();
    });

    it('disables buttons when loading', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} isLoading />
        </I18nWrapper>,
      );

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      const savingButton = page.getByRole('button', { name: 'Saving...' });

      expect(cancelButton).toBeDisabled();
      expect(savingButton).toBeDisabled();
    });
  });

  describe('Modal Visibility', () => {
    it('does not render content when isOpen is false', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} isOpen={false} />
        </I18nWrapper>,
      );

      const titles = page.getByRole('heading', { name: 'Add Role' }).elements();

      expect(titles.length).toBe(0);
    });

    it('renders content when isOpen is true', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} isOpen />
        </I18nWrapper>,
      );

      const title = page.getByRole('heading', { name: 'Add Role' });

      expect(title).toBeInTheDocument();
    });
  });

  describe('Form Labels', () => {
    it('renders role name label', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameLabel = page.getByText('Role Name', { exact: true });

      expect(nameLabel).toBeInTheDocument();
    });

    it('renders role key label', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const keyLabel = page.getByText('Role Key');

      expect(keyLabel).toBeInTheDocument();
    });

    it('renders description label', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const descriptionLabel = page.getByText('Description');

      expect(descriptionLabel).toBeInTheDocument();
    });

    it('renders permissions label', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const permissionsLabel = page.getByText('Permissions', { exact: true });

      expect(permissionsLabel).toBeInTheDocument();
    });

    it('renders cancel button', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const cancelButton = page.getByRole('button', { name: 'Cancel' });

      expect(cancelButton).toBeInTheDocument();
    });
  });

  describe('Permissions Display', () => {
    it('renders all available permissions', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      expect(page.getByText('Manage Members')).toBeInTheDocument();
      expect(page.getByText('Manage Classes')).toBeInTheDocument();
      expect(page.getByText('View Reports')).toBeInTheDocument();
    });

    it('renders permission descriptions', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      expect(page.getByText('Can add, edit, and remove members')).toBeInTheDocument();
      expect(page.getByText('Can create and manage class schedules')).toBeInTheDocument();
    });

    it('shows no permissions message when no permissions available', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} availablePermissions={[]} />
        </I18nWrapper>,
      );

      const message = page.getByText('No permissions available to assign.');

      expect(message).toBeInTheDocument();
    });
  });

  describe('Role Key Generation', () => {
    it('handles special characters in name', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      await userEvent.type(nameInput, 'Test Role!@#$%');

      const keyInput = page.getByTestId('role-key-input');

      expect(keyInput).toHaveValue('org:test_role');
    });

    it('handles multiple spaces in name', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      await userEvent.type(nameInput, 'Test   Multiple   Spaces');

      const keyInput = page.getByTestId('role-key-input');

      expect(keyInput).toHaveValue('org:test_multiple_spaces');
    });

    it('generates lowercase key', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      await userEvent.type(nameInput, 'UPPERCASE ROLE');

      const keyInput = page.getByTestId('role-key-input');

      expect(keyInput).toHaveValue('org:uppercase_role');
    });
  });

  describe('Input Error States', () => {
    it('does not show error state on name input before blur', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');

      expect(nameInput).not.toHaveAttribute('aria-invalid', 'true');
    });

    it('shows error state and message on name input after blur when empty', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      await userEvent.click(nameInput);
      await userEvent.tab();

      expect(nameInput).toHaveAttribute('aria-invalid', 'true');

      const errorMessage = page.getByText('Please enter a role name.');

      expect(errorMessage).toBeInTheDocument();
    });

    it('shows error state on description input after blur when empty', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const descriptionInput = page.getByTestId('role-description-input');
      await userEvent.click(descriptionInput);
      await userEvent.tab();

      expect(descriptionInput).toHaveAttribute('aria-invalid', 'true');

      const errorMessage = page.getByText('Please enter a description.');

      expect(errorMessage).toBeInTheDocument();
    });

    it('clears error state when user enters valid content', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');

      await userEvent.click(nameInput);
      await userEvent.tab();

      expect(nameInput).toHaveAttribute('aria-invalid', 'true');

      await userEvent.click(nameInput);
      await userEvent.type(nameInput, 'Valid Name');

      expect(nameInput).not.toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Edit Mode Button State', () => {
    it('enables save button when edit mode has valid data', async () => {
      const editRole = {
        id: 'role-1',
        key: 'org:test_role',
        name: 'Test Role',
        description: 'Test description',
        permissions: [],
        isSystemRole: false,
      };

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={editRole} />
        </I18nWrapper>,
      );

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      expect(saveButton).toBeEnabled();
    });

    it('disables save button when name is cleared in edit mode', async () => {
      const editRole = {
        id: 'role-1',
        key: 'org:test_role',
        name: 'Test Role',
        description: 'Test description',
        permissions: [],
        isSystemRole: false,
      };

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={editRole} />
        </I18nWrapper>,
      );

      const nameInput = page.getByTestId('role-name-input');
      await userEvent.clear(nameInput);

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      expect(saveButton).toBeDisabled();
    });

    it('disables save button when description is cleared in edit mode', async () => {
      const editRole = {
        id: 'role-1',
        key: 'org:test_role',
        name: 'Test Role',
        description: 'Test description',
        permissions: [],
        isSystemRole: false,
      };

      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} role={editRole} />
        </I18nWrapper>,
      );

      const descriptionInput = page.getByTestId('role-description-input');
      await userEvent.clear(descriptionInput);

      const saveButton = page.getByRole('button', { name: 'Save Changes' });

      expect(saveButton).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has accessible name input with label', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const nameInput = page.getByRole('textbox', { name: /Role Name/i });

      expect(nameInput).toBeInTheDocument();
    });

    it('has role key input that is read-only', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const keyInput = page.getByTestId('role-key-input');

      expect(keyInput).toHaveAttribute('readonly');
    });

    it('has helper text for role key', async () => {
      await render(
        <I18nWrapper>
          <AddEditRoleModal {...defaultProps} />
        </I18nWrapper>,
      );

      const helperText = page.getByText(/Auto-generated from role name/);

      expect(helperText).toBeInTheDocument();
    });
  });
});
