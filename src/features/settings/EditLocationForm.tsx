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
    address: string;
    phone: string;
    email: string;
    taxRate: number;
  };
  onSave: (data: { address: string; phone: string; email: string; taxRate: number }) => void | Promise<void>;
  errorMessage?: string | null;
};

type FormErrors = {
  address?: string;
  phone?: string;
  email?: string;
  taxRate?: string;
};

export function EditLocationForm({ onCancel, onSuccess, initialData, onSave, errorMessage }: EditLocationFormProps) {
  const t = useTranslations('LocationSettings.EditLocationModal');
  const tCommon = useTranslations('MyProfile');

  const [address, setAddress] = useState(initialData.address);
  const [phone, setPhone] = useState(initialData.phone);
  const [email, setEmail] = useState(initialData.email);
  const [taxRate, setTaxRate] = useState(initialData.taxRate.toFixed(2));
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

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

    const parsedTaxRate = Number.parseFloat(taxRate);
    if (taxRate.trim() === '' || !Number.isFinite(parsedTaxRate) || parsedTaxRate < 0 || parsedTaxRate > 100) {
      newErrors.taxRate = t('tax_rate_error');
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
        address: sanitizeInput(address),
        phone: sanitizePhone(phone),
        email: sanitizeEmail(email),
        taxRate: Math.round(Number.parseFloat(taxRate) * 100) / 100,
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
        <div>
          <Label htmlFor="edit-location-tax-rate">{t('tax_rate_label')}</Label>
          <div className="relative mt-2">
            <Input
              id="edit-location-tax-rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder={t('tax_rate_placeholder')}
              className="pr-8"
              value={taxRate}
              onChange={e => setTaxRate(e.target.value)}
              error={!!errors.taxRate}
              disabled={isLoading}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('tax_rate_helper')}</p>
          {errors.taxRate && (
            <p className="mt-1 text-sm text-red-500">{errors.taxRate}</p>
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
