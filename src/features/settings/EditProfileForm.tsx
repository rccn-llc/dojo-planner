'use client';

import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input/input';
import { Label } from '@/components/ui/label';
import { logger } from '@/libs/Logger';

/**
 * Sanitizes phone number input to only allow valid phone characters.
 */
function sanitizePhone(value: string): string {
  return value.replace(/[^0-9+\-() ]/g, '').trim();
}

type EditProfileFormProps = {
  onCancel: () => void;
  onSuccess?: () => void;
  initialData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
};

type FormErrors = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  general?: string;
};

export function EditProfileForm({ onCancel, onSuccess, initialData }: EditProfileFormProps) {
  const t = useTranslations('MyProfile');
  const { user } = useUser();

  const [firstName, setFirstName] = useState(initialData.firstName);
  const [lastName, setLastName] = useState(initialData.lastName);
  const [email, setEmail] = useState(initialData.email);
  const [phone, setPhone] = useState(initialData.phone);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState('');

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!firstName.trim()) {
      newErrors.firstName = t('first_name_required');
    }

    if (!lastName.trim()) {
      newErrors.lastName = t('last_name_required');
    }

    if (!email.trim()) {
      newErrors.email = t('email_required');
    } else if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = t('email_invalid');
    }

    if (!phone.trim()) {
      newErrors.phone = t('phone_required');
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
      // Sanitize phone input
      const sanitizedPhone = sanitizePhone(phone);

      // Update user profile via Clerk
      await user?.update({
        firstName,
        lastName,
      });

      // Update primary email if changed
      const currentEmail = user?.primaryEmailAddress?.emailAddress;
      if (email !== currentEmail) {
        // Create new email address if it doesn't exist
        const existingEmail = user?.emailAddresses.find(e => e.emailAddress === email);
        if (!existingEmail) {
          await user?.createEmailAddress({ email });
        }
      }

      // Update primary phone if changed
      const currentPhone = user?.primaryPhoneNumber?.phoneNumber;
      if (sanitizedPhone !== currentPhone) {
        // Create new phone number if it doesn't exist
        const existingPhone = user?.phoneNumbers.find(p => p.phoneNumber === sanitizedPhone);
        if (!existingPhone && sanitizedPhone) {
          await user?.createPhoneNumber({ phoneNumber: sanitizedPhone });
        }
      }

      setSuccessMessage(t('profile_updated_success'));

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (error) {
      logger.error('Failed to update profile', { error });
      setErrors({ general: t('profile_update_error') });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.general && (
        <Alert variant="error">{errors.general}</Alert>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="edit-first-name">{t('first_name_label')}</Label>
          <Input
            id="edit-first-name"
            placeholder={t('first_name_placeholder')}
            className="mt-2"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            error={!!errors.firstName}
            disabled={isLoading}
          />
          {errors.firstName && (
            <p className="mt-1 text-sm text-red-500">{errors.firstName}</p>
          )}
        </div>
        <div>
          <Label htmlFor="edit-last-name">{t('last_name_label')}</Label>
          <Input
            id="edit-last-name"
            placeholder={t('last_name_placeholder')}
            className="mt-2"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            error={!!errors.lastName}
            disabled={isLoading}
          />
          {errors.lastName && (
            <p className="mt-1 text-sm text-red-500">{errors.lastName}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="edit-phone">{t('phone_label')}</Label>
          <Input
            id="edit-phone"
            type="tel"
            placeholder={t('phone_placeholder')}
            className="mt-2"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            error={!!errors.phone}
            disabled={isLoading}
          />
          {errors.phone && (
            <p className="mt-1 text-sm text-red-500">{errors.phone}</p>
          )}
        </div>
        <div>
          <Label htmlFor="edit-email">{t('email_label')}</Label>
          <Input
            id="edit-email"
            type="email"
            placeholder={t('email_placeholder')}
            className="mt-2"
            value={email}
            onChange={e => setEmail(e.target.value)}
            error={!!errors.email}
            disabled={isLoading}
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-500">{errors.email}</p>
          )}
        </div>
      </div>
      {successMessage && (
        <p className="text-sm text-green-600">{successMessage}</p>
      )}
      <div className="flex justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          {t('cancel_button')}
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? t('saving_button') : t('save_button')}
        </Button>
      </div>
    </form>
  );
}
