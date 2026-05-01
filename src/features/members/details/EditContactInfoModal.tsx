'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { COUNTRIES, US_STATES } from '@/constants/locations';
import { invalidateMembersCache } from '@/hooks/useMembersCache';
import { client } from '@/libs/Orpc';

type Address = {
  street: string;
  apartment?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
};

type EditContactInfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  initialEmail: string;
  initialPhone: string;
  initialDateOfBirth?: Date;
  initialAddress?: Address;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

const isValidEmail = (email: string): boolean => {
  return EMAIL_REGEX.test(email);
};

function dateToInputValue(date: Date | undefined): string {
  if (!date) {
    return '';
  }
  // Anchor on local timezone so a date picked in the UI persists as the same
  // calendar day rather than shifting based on UTC offset.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function EditContactInfoModal({
  isOpen,
  onClose,
  memberId,
  initialEmail,
  initialPhone,
  initialDateOfBirth,
  initialAddress,
}: EditContactInfoModalProps) {
  const t = useTranslations('EditContactInfoModal');
  const router = useRouter();

  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [dateOfBirth, setDateOfBirth] = useState<string>(() => dateToInputValue(initialDateOfBirth));
  const [address, setAddress] = useState<Address>({
    street: initialAddress?.street || '',
    apartment: initialAddress?.apartment || '',
    city: initialAddress?.city || '',
    state: initialAddress?.state || '',
    zipCode: initialAddress?.zipCode || '',
    country: initialAddress?.country || 'US',
  });

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleAddressChange = (field: keyof Address, value: string) => {
    setAddress(prev => ({ ...prev, [field]: value }));
  };

  const isEmailInvalid = touched.email && (email ? !isValidEmail(email) : true);
  const isPhoneInvalid = touched.phone && !phone;

  const isAddressComplete = address.street && address.city && address.state && address.zipCode && address.country;
  const isAddressPartiallyFilled = address.street || address.city || address.state || address.zipCode;

  const isFormValid = email && isValidEmail(email) && phone && (!isAddressPartiallyFilled || isAddressComplete);

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const addressPayload = isAddressComplete
        ? {
            street: address.street,
            apartment: address.apartment || undefined,
            city: address.city,
            state: address.state,
            zipCode: address.zipCode,
            country: address.country,
          }
        : undefined;

      await client.member.updateContactInfo({
        id: memberId,
        email,
        phone: phone || null,
        ...(dateOfBirth.trim() ? { dateOfBirth: new Date(dateOfBirth) } : {}),
        address: addressPayload,
      });

      // Invalidate members cache to refresh data across the app
      invalidateMembersCache();
      router.refresh();
      onClose();
    } catch (err) {
      console.error('Failed to update contact info:', err);
      setError(err instanceof Error ? err.message : t('submit_error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setEmail(initialEmail);
    setPhone(initialPhone);
    setDateOfBirth(dateToInputValue(initialDateOfBirth));
    setAddress({
      street: initialAddress?.street || '',
      apartment: initialAddress?.apartment || '',
      city: initialAddress?.city || '',
      state: initialAddress?.state || '',
      zipCode: initialAddress?.zipCode || '',
      country: initialAddress?.country || 'US',
    });
    setTouched({});
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('email_label')}</label>
              <Input
                type="email"
                placeholder={t('email_placeholder')}
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={() => handleInputBlur('email')}
                error={isEmailInvalid}
              />
              {isEmailInvalid && (
                <p className="text-xs text-destructive">{t('email_error')}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('phone_label')}</label>
              <Input
                type="tel"
                placeholder={t('phone_placeholder')}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onBlur={() => handleInputBlur('phone')}
                error={isPhoneInvalid}
              />
              {isPhoneInvalid && (
                <p className="text-xs text-destructive">{t('phone_error')}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-contact-dob" className="text-sm font-medium text-foreground">
                {t('date_of_birth_label')}
              </label>
              <Input
                id="edit-contact-dob"
                type="date"
                placeholder={t('date_of_birth_placeholder')}
                value={dateOfBirth}
                onChange={e => setDateOfBirth(e.target.value)}
              />
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="mb-4 text-sm font-medium text-foreground">{t('address_label')}</h3>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('street_label')}</label>
                  <Input
                    placeholder={t('street_placeholder')}
                    value={address.street}
                    onChange={e => handleAddressChange('street', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('apartment_label')}</label>
                  <Input
                    placeholder={t('apartment_placeholder')}
                    value={address.apartment || ''}
                    onChange={e => handleAddressChange('apartment', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-6 space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t('city_label')}</label>
                    <Input
                      placeholder={t('city_placeholder')}
                      value={address.city}
                      onChange={e => handleAddressChange('city', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t('state_label')}</label>
                    <Select value={address.state} onValueChange={value => handleAddressChange('state', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('state_placeholder')} />
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        {US_STATES.map(state => (
                          <SelectItem key={state.value} value={state.value}>
                            {state.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4 space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t('zip_code_label')}</label>
                    <Input
                      placeholder={t('zip_code_placeholder')}
                      value={address.zipCode}
                      onChange={e => handleAddressChange('zipCode', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('country_label')}</label>
                  <Select value={address.country} onValueChange={value => handleAddressChange('country', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('country_placeholder')} />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {COUNTRIES.map(country => (
                        <SelectItem key={country.value} value={country.value}>
                          {country.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              {t('cancel_button')}
            </Button>
            <Button onClick={handleSubmit} disabled={!isFormValid || isLoading}>
              {isLoading ? t('saving_button') : t('submit_button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
