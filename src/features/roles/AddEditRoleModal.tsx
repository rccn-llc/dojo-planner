'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type Permission = {
  id: string;
  key: string;
  name: string;
  description: string;
};

export type RoleFormData = {
  id?: string;
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystemRole: boolean;
};

type AddEditRoleModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  onSaveAction: (data: RoleFormData) => void;
  role?: RoleFormData | null;
  availablePermissions: Permission[];
  isLoading?: boolean;
  canEditSystemRoles?: boolean;
  errorMessage?: string | null;
};

const initialFormData: RoleFormData = {
  key: '',
  name: '',
  description: '',
  permissions: [],
  isSystemRole: false,
};

/**
 * Generates a role key from a name following Clerk's naming convention
 * Example: "Academy Owner" -> "org:academy_owner"
 */
function generateRoleKey(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return slug ? `org:${slug}` : '';
}

function AddEditRoleForm({
  role,
  availablePermissions,
  isLoading,
  canEditSystemRoles,
  onSaveAction,
  onCloseAction,
}: {
  role: RoleFormData | null | undefined;
  availablePermissions: Permission[];
  isLoading: boolean;
  canEditSystemRoles: boolean;
  onSaveAction: (data: RoleFormData) => void;
  onCloseAction: () => void;
}) {
  const t = useTranslations('AddEditRoleModal');

  // Initialize form data based on role prop
  const initialData = useMemo((): RoleFormData => {
    if (role) {
      return {
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: [...role.permissions],
        isSystemRole: role.isSystemRole,
      };
    }
    return initialFormData;
  }, [role]);

  const [formData, setFormData] = useState<RoleFormData>(initialData);
  const [touched, setTouched] = useState<{ name: boolean; description: boolean }>({
    name: false,
    description: false,
  });

  const isEditMode = !!role?.id;
  const isSystemRoleEdit = isEditMode && role?.isSystemRole;

  // System roles cannot be edited unless user has special permissions
  const isFieldsDisabled = isLoading || (isSystemRoleEdit && !canEditSystemRoles);

  // Check if form is valid (both name and description have values)
  const isFormValid = useMemo(() => {
    return formData.name.trim().length > 0 && formData.description.trim().length > 0;
  }, [formData.name, formData.description]);

  // Field-level validation for error display
  const isNameInvalid = touched.name && formData.name.trim().length === 0;
  const isDescriptionInvalid = touched.description && formData.description.trim().length === 0;

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setFormData((prev) => {
      // Auto-generate key only for new roles (not editing existing ones)
      const newKey = prev.id ? prev.key : generateRoleKey(value);
      return { ...prev, name: value, key: newKey };
    });
  }, []);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.target;
    setFormData(prev => ({ ...prev, description: value }));
  }, []);

  const handleNameBlur = useCallback(() => {
    setTouched(prev => ({ ...prev, name: true }));
  }, []);

  const handleDescriptionBlur = useCallback(() => {
    setTouched(prev => ({ ...prev, description: true }));
  }, []);

  const handlePermissionChange = useCallback((permission: Permission, checked: boolean) => {
    setFormData((prev) => {
      if (checked) {
        // Add permission if not already present
        const hasPermission = prev.permissions.some(p => p.id === permission.id);
        if (!hasPermission) {
          return { ...prev, permissions: [...prev.permissions, permission] };
        }
      } else {
        // Remove permission
        return { ...prev, permissions: prev.permissions.filter(p => p.id !== permission.id) };
      }
      return prev;
    });
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) {
      return;
    }

    onSaveAction({
      ...formData,
      name: formData.name.trim(),
      description: formData.description.trim(),
    });
  }, [formData, isFormValid, onSaveAction]);

  const isPermissionSelected = useCallback((permissionId: string) => {
    return formData.permissions.some(p => p.id === permissionId);
  }, [formData.permissions]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* System Role Warning */}
      {isSystemRoleEdit && !canEditSystemRoles && (
        <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {t('system_role_warning')}
          </p>
        </div>
      )}

      {/* Role Name */}
      <div className="space-y-1.5">
        <Label htmlFor="role-name">
          {t('name_label')}
        </Label>
        <Input
          id="role-name"
          type="text"
          value={formData.name}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          placeholder={t('name_placeholder')}
          disabled={isFieldsDisabled}
          error={isNameInvalid}
          data-testid="role-name-input"
        />
        {isNameInvalid && (
          <p className="text-xs text-destructive">{t('name_error')}</p>
        )}
      </div>

      {/* Role Key (auto-generated, read-only) */}
      <div className="space-y-1.5">
        <Label htmlFor="role-key">
          {t('key_label')}
        </Label>
        <Input
          id="role-key"
          type="text"
          value={formData.key}
          readOnly
          disabled
          className="bg-muted"
          data-testid="role-key-input"
        />
        <p className="text-xs text-muted-foreground">{t('key_helper')}</p>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="role-description">
          {t('description_label')}
        </Label>
        <Textarea
          id="role-description"
          value={formData.description}
          onChange={handleDescriptionChange}
          onBlur={handleDescriptionBlur}
          placeholder={t('description_placeholder')}
          disabled={isFieldsDisabled}
          rows={3}
          error={isDescriptionInvalid}
          data-testid="role-description-input"
        />
        {isDescriptionInvalid && (
          <p className="text-xs text-destructive">{t('description_error')}</p>
        )}
      </div>

      {/* Permissions */}
      <div className="space-y-3">
        <Label>{t('permissions_label')}</Label>
        <div className="rounded-lg border border-border p-4">
          {availablePermissions.length === 0
            ? (
                <p className="text-sm text-muted-foreground">{t('no_permissions_available')}</p>
              )
            : (
                <div className="space-y-3">
                  {availablePermissions.map(permission => (
                    <div key={permission.id} className="flex items-center justify-between">
                      <div className="flex-1">
                        <label
                          htmlFor={`permission-${permission.id}`}
                          className="cursor-pointer text-sm font-medium text-foreground"
                        >
                          {permission.name}
                        </label>
                        <p className="text-xs text-muted-foreground">{permission.description}</p>
                      </div>
                      <Switch
                        id={`permission-${permission.id}`}
                        checked={isPermissionSelected(permission.id)}
                        onCheckedChange={checked => handlePermissionChange(permission, checked)}
                        disabled={isFieldsDisabled}
                        data-testid={`permission-switch-${permission.id}`}
                      />
                    </div>
                  ))}
                </div>
              )}
        </div>
      </div>

      {/* Footer with Actions */}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCloseAction}
          disabled={isLoading}
          data-testid="role-cancel-button"
        >
          {t('cancel_button')}
        </Button>
        <Button
          type="submit"
          disabled={isLoading || !isFormValid || (isSystemRoleEdit && !canEditSystemRoles)}
          data-testid="role-save-button"
        >
          {isLoading
            ? t('saving_button')
            : isEditMode
              ? t('save_changes_button')
              : t('add_button')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddEditRoleModal({
  isOpen,
  onCloseAction,
  onSaveAction,
  role,
  availablePermissions,
  isLoading = false,
  canEditSystemRoles = false,
  errorMessage,
}: AddEditRoleModalProps) {
  const t = useTranslations('AddEditRoleModal');
  const isEditMode = !!role?.id;

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onCloseAction();
    }
  }, [onCloseAction]);

  // Use key to remount form when isOpen or role changes
  // This ensures fresh state when modal opens
  const formKey = isOpen ? `${role?.id ?? 'new'}-${isOpen}` : 'closed';

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? t('edit_title') : t('add_title')}
          </DialogTitle>
        </DialogHeader>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="role-save-error">
            {errorMessage}
          </div>
        )}

        {isOpen && (
          <AddEditRoleForm
            key={formKey}
            role={role}
            availablePermissions={availablePermissions}
            isLoading={isLoading}
            canEditSystemRoles={canEditSystemRoles}
            onSaveAction={onSaveAction}
            onCloseAction={onCloseAction}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
