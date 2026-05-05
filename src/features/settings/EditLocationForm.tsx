'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * Sanitizes user input by trimming whitespace and removing potentially dangerous characters.
 * This provides basic XSS protection for text inputs.
 */
function sanitizeInput(value: string): string {
  return value
    .trim()
    .replace(/[<>]/g, '');
}

/**
 * Sanitizes phone number input to only allow valid phone characters.
 */
function sanitizePhone(value: string): string {
  return value.replace(/[^0-9+\-() ]/g, '').trim();
}

/**
 * Sanitizes email input by trimming and converting to lowercase.
 */
function sanitizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

type EditLocationFormProps = {
  onCancel: () => void;
  onSuccess: () => void;
  initialData: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
  onSave: (data: { name: string; address: string; phone: string; email: string }) => void | Promise<void>;
  errorMessage?: string | null;
};

type FormErrors = {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
};

export function EditLocationForm({ onCancel, onSuccess, initialData, onSave, errorMessage }: EditLocationFormProps) {
  const t = useTranslations('LocationSettings.EditLocationModal');
  const tCommon = useTranslations('MyProfile');

  const [name, setName] = useState(initialData.name);
  const [address, setAddress] = useState(initialData.address);
  const [phone, setPhone] = useState(initialData.phone);
  const [email, setEmail] = useState(initialData.email);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = t('name_error');
    }

    if (!address.trim()) {
      newErrors.address = t('address_error');
    }

    if (!phone.trim()) {
      newErrors.phone = t('phone_error');
    }

    if (!email.trim()) {
      newErrors.email = t('email_error');
    } else if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)) {
      newErrors.email = t('email_error');
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

    try {
      const sanitizedData = {
        name: sanitizeInput(name),
        address: sanitizeInput(address),
        phone: sanitizePhone(phone),
        email: sanitizeEmail(email),
      };
      await onSave(sanitizedData);
      onSuccess();
    } catch {
      // Save failed; parent surfaces the error via errorMessage prop
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="edit-location-name">{t('name_label')}</Label>
          <Input
            id="edit-location-name"
            placeholder={t('name_placeholder')}
            className="mt-2"
            value={name}
            onChange={e => setName(e.target.value)}
            error={!!errors.name}
            disabled={isLoading}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-500">{errors.name}</p>
          )}
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="edit-location-address">{t('address_label')}</Label>
          <Textarea
            id="edit-location-address"
            placeholder={t('address_placeholder')}
            className="mt-2"
            value={address}
            onChange={e => setAddress(e.target.value)}
            error={!!errors.address}
            disabled={isLoading}
            rows={2}
          />
          {errors.address && (
            <p className="mt-1 text-sm text-red-500">{errors.address}</p>
          )}
        </div>
        <div>
          <Label htmlFor="edit-location-phone">{t('phone_label')}</Label>
          <Input
            id="edit-location-phone"
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
          <Label htmlFor="edit-location-email">{t('email_label')}</Label>
          <Input
            id="edit-location-email"
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
      {errorMessage && (
        <p className="text-sm text-red-500">{errorMessage}</p>
      )}
      <div className="flex justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          {tCommon('cancel_button')}
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? tCommon('saving_button') : tCommon('save_button')}
        </Button>
      </div>
    </form>
  );
}
