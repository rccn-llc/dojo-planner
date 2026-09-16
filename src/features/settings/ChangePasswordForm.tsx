'use client';

import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/input/password-input';
import { Label } from '@/components/ui/label';
import { logger } from '@/libs/Logger';
import { isStrongPassword } from '@/validations/PasswordValidation';

type ChangePasswordFormProps = {
  onCancel: () => void;
  onSuccess?: () => void;
};

type FormErrors = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  general?: string;
};

export function ChangePasswordForm({ onCancel, onSuccess }: ChangePasswordFormProps) {
  const t = useTranslations('Security');
  const { user } = useUser();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState('');

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!currentPassword) {
      newErrors.currentPassword = t('password_required');
    }

    if (!newPassword) {
      newErrors.newPassword = t('password_required');
    } else if (!isStrongPassword(newPassword)) {
      newErrors.newPassword = t('password_too_weak');
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = t('password_required');
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = t('passwords_do_not_match');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});
    setSuccessMessage('');

    try {
      await user?.updatePassword({
        currentPassword,
        newPassword,
      });

      setSuccessMessage(t('password_changed_success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (error) {
      const clerkError = error as { errors?: Array<{ code: string; message: string }> };

      if (clerkError.errors?.[0]?.code === 'form_password_incorrect') {
        setErrors({ currentPassword: t('current_password_incorrect') });
      } else {
        logger.error('Failed to change password', { error });
        setErrors({ general: t('password_change_error') });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {errors.general && (
        <Alert variant="error">{errors.general}</Alert>
      )}
      <div>
        <Label htmlFor="current-password">{t('current_password_label')}</Label>
        <PasswordInput
          id="current-password"
          placeholder={t('current_password_placeholder')}
          className="mt-2"
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          autoComplete="off"
          error={!!errors.currentPassword}
          disabled={isLoading}
        />
        {errors.currentPassword && (
          <p className="mt-1 text-sm text-destructive">{errors.currentPassword}</p>
        )}
      </div>
      <div>
        <Label htmlFor="new-password">{t('new_password_label')}</Label>
        <PasswordInput
          id="new-password"
          placeholder={t('new_password_placeholder')}
          className="mt-2"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          autoComplete="new-password"
          error={!!errors.newPassword}
          disabled={isLoading}
        />
        {errors.newPassword && (
          <p className="mt-1 text-sm text-destructive">{errors.newPassword}</p>
        )}
      </div>
      <div>
        <Label htmlFor="confirm-password">{t('confirm_password_label')}</Label>
        <PasswordInput
          id="confirm-password"
          placeholder={t('confirm_password_placeholder')}
          className="mt-2"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          error={!!errors.confirmPassword}
          disabled={isLoading}
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-sm text-destructive">{errors.confirmPassword}</p>
        )}
      </div>
      {successMessage && (
        <p className="text-sm text-green-600">{successMessage}</p>
      )}
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? t('saving_button') : t('save_button')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          {t('cancel_button')}
        </Button>
      </div>
    </form>
  );
}
