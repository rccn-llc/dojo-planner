'use client';

import type { StaffRole } from '@/actions/staff';
import type { InviteStaffFormData, TouchedFields } from '@/hooks/useInviteStaffForm';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isValidEmail } from '@/hooks/useInviteStaffForm';

type InviteStaffFormContentProps = {
  data: InviteStaffFormData;
  onUpdate: (updates: Partial<InviteStaffFormData>) => void;
  onSave: () => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
  roles: StaffRole[];
  rolesLoading: boolean;
  rolesError: string | null;
  touched: TouchedFields;
  onFieldBlur: (field: keyof TouchedFields) => void;
  fieldErrors: TouchedFields;
  isEditMode: boolean;
};

export const InviteStaffFormContent = ({
  data,
  onUpdate,
  onSave,
  onCancel,
  isLoading,
  error,
  roles,
  rolesLoading,
  rolesError,
  touched,
  onFieldBlur,
  fieldErrors,
  isEditMode,
}: InviteStaffFormContentProps) => {
  const t = useTranslations('Staff.InviteStaffModal');

  const isFormValid
    = data.firstName.trim() !== ''
      && data.lastName.trim() !== ''
      && isValidEmail(data.email)
      && data.roleKey !== null;

  // Find the selected role to display its description
  const selectedRole = roles.find(role => role.key === data.roleKey);

  // Field validation states (only show error after blur)
  const isFirstNameInvalid = touched.firstName && fieldErrors.firstName;
  const isLastNameInvalid = touched.lastName && fieldErrors.lastName;
  const isEmailInvalid = touched.email && fieldErrors.email;
  const isRoleInvalid = touched.roleKey && fieldErrors.roleKey;

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/30">
        <p className="text-sm text-blue-900 dark:text-blue-200">
          {isEditMode ? t('edit_info_message') : t('info_message')}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 dark:bg-red-950/30">
          <p className="text-sm text-red-900 dark:text-red-200">
            {error}
          </p>
        </div>
      )}

      {rolesError && (
        <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-950/30">
          <p className="text-sm text-yellow-900 dark:text-yellow-200">
            {rolesError}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="invite-staff-first-name">
            {t('first_name_label')}
          </Label>
          <Input
            id="invite-staff-first-name"
            data-testid="invite-staff-first-name"
            placeholder={t('first_name_placeholder')}
            value={data.firstName}
            onChange={e => onUpdate({ firstName: e.target.value })}
            onBlur={() => onFieldBlur('firstName')}
            disabled={isLoading}
            error={isFirstNameInvalid}
          />
          {isFirstNameInvalid && (
            <p className="text-xs text-destructive">{t('first_name_error')}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-staff-last-name">
            {t('last_name_label')}
          </Label>
          <Input
            id="invite-staff-last-name"
            data-testid="invite-staff-last-name"
            placeholder={t('last_name_placeholder')}
            value={data.lastName}
            onChange={e => onUpdate({ lastName: e.target.value })}
            onBlur={() => onFieldBlur('lastName')}
            disabled={isLoading}
            error={isLastNameInvalid}
          />
          {isLastNameInvalid && (
            <p className="text-xs text-destructive">{t('last_name_error')}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-staff-email">
          {t('email_label')}
        </Label>
        <Input
          id="invite-staff-email"
          type="email"
          data-testid="invite-staff-email"
          placeholder={t('email_placeholder')}
          value={data.email}
          onChange={e => onUpdate({ email: e.target.value })}
          onBlur={() => onFieldBlur('email')}
          disabled={isLoading || isEditMode}
          error={isEmailInvalid}
        />
        {isEmailInvalid && (
          <p className="text-xs text-destructive">{t('email_error')}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-staff-role">
          {t('role_label')}
        </Label>
        <Select
          value={data.roleKey || ''}
          onValueChange={(value) => {
            onUpdate({ roleKey: value });
            onFieldBlur('roleKey');
          }}
          disabled={isLoading || rolesLoading}
        >
          <SelectTrigger
            id="invite-staff-role"
            data-testid="invite-staff-role"
            className="w-full"
            error={isRoleInvalid}
          >
            {rolesLoading
              ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {t('loading_roles')}
                  </span>
                )
              : (
                  <SelectValue placeholder={t('role_placeholder')} />
                )}
          </SelectTrigger>
          <SelectContent>
            {roles.map(role => (
              <SelectItem key={role.key} value={role.key}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isRoleInvalid && (
          <p className="text-xs text-destructive">{t('role_error')}</p>
        )}
        {selectedRole && (
          <p className="text-xs text-muted-foreground">
            {selectedRole.description}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={onCancel} disabled={isLoading} data-testid="invite-staff-cancel-button">
          {t('cancel_button')}
        </Button>
        <Button
          onClick={onSave}
          disabled={isLoading || !isFormValid || rolesLoading}
          data-testid="invite-staff-save-button"
        >
          {isLoading
            ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  {t('sending_invite')}
                </span>
              )
            : isEditMode
              ? t('save_changes_button')
              : t('send_invite_button')}
        </Button>
      </div>
    </div>
  );
};
