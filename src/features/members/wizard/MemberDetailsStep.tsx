'use client';

import type { AddMemberWizardData } from '@/hooks/useAddMemberWizard';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DateOfBirthInput } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { COUNTRIES, US_STATES } from '@/constants/locations';

type MemberDetailsStepProps = {
  data: AddMemberWizardData;
  onUpdate: (updates: Partial<AddMemberWizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  error?: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

const isValidEmail = (email: string): boolean => {
  return EMAIL_REGEX.test(email);
};

export const MemberDetailsStep = ({ data, onUpdate, onNext, onBack, onCancel, error }: MemberDetailsStepProps) => {
  const t = useTranslations('AddMemberWizard.MemberDetailsStep');
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const handleInputChange = (field: string, value: string) => {
    onUpdate({ [field]: value });
  };

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleAddressChange = (field: string, value: string) => {
    onUpdate({
      address: {
        ...(data.address || { street: '', apartment: '', city: '', state: '', zipCode: '', country: 'US' }),
        [field]: value,
      },
    });
  };

  const handleAddressBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [`address.${field}`]: true }));
  };

  const isDateOfBirthInvalid = touched.dateOfBirth && !data.dateOfBirth;

  // Address is optional (see the "Address Fields (Optional)" section below) and
  // the create API accepts a member with no address — so it must NOT gate the
  // Next button. Requiring a full address here left the button permanently
  // disabled for members added without one (#238). Per-field address hints
  // (isStreetInvalid, etc.) still surface if a field is touched then cleared.
  const isFormValid
    = data.firstName
      && data.lastName
      && data.phone
      && data.dateOfBirth
      && isValidEmail(data.email);

  // Validation helpers for touched fields
  const isFirstNameInvalid = touched.firstName && !data.firstName;
  const isLastNameInvalid = touched.lastName && !data.lastName;
  const isEmailInvalid = touched.email && (data.email ? !isValidEmail(data.email) : true);
  const isPhoneInvalid = touched.phone && !data.phone;
  const isStreetInvalid = touched['address.street'] && !data.address?.street;
  const isCityInvalid = touched['address.city'] && !data.address?.city;
  const isStateInvalid = touched['address.state'] && !data.address?.state;
  const isZipCodeInvalid = touched['address.zipCode'] && !data.address?.zipCode;
  const isCountryInvalid = touched['address.country'] && !data.address?.country;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Name Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('first_name_label')}</label>
            <Input
              autoComplete="off"
              placeholder={t('first_name_placeholder')}
              value={data.firstName}
              onChange={e => handleInputChange('firstName', e.target.value)}
              onBlur={() => handleInputBlur('firstName')}
              error={isFirstNameInvalid}
            />
            {isFirstNameInvalid && (
              <p className="text-xs text-destructive">Please enter a first name.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('last_name_label')}</label>
            <Input
              autoComplete="off"
              placeholder={t('last_name_placeholder')}
              value={data.lastName}
              onChange={e => handleInputChange('lastName', e.target.value)}
              onBlur={() => handleInputBlur('lastName')}
              error={isLastNameInvalid}
            />
            {isLastNameInvalid && (
              <p className="text-xs text-destructive">Please enter a last name.</p>
            )}
          </div>
        </div>

        {/* Email and Phone */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{t('email_label')}</label>
          <Input
            type="email"
            autoComplete="off"
            placeholder={t('email_placeholder')}
            value={data.email}
            onChange={e => handleInputChange('email', e.target.value)}
            onBlur={() => handleInputBlur('email')}
            error={isEmailInvalid}
          />
          {isEmailInvalid && (
            <p className="text-xs text-destructive">Please enter a valid email address</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{t('phone_label')}</label>
          <Input
            type="tel"
            autoComplete="off"
            placeholder={t('phone_placeholder')}
            value={data.phone}
            onChange={e => handleInputChange('phone', e.target.value)}
            onBlur={() => handleInputBlur('phone')}
            error={isPhoneInvalid}
          />
          {isPhoneInvalid && (
            <p className="text-xs text-destructive">Please enter a phone number.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="member-dob" className="text-sm font-medium text-foreground">{t('date_of_birth_label')}</label>
          {/*
            #128 — typed input + calendar popover. Replaces the native
            <input type="date"> whose macOS year scroller had momentum/snap-back
            quirks. The text input is keyboard-friendly (MM/DD/YYYY) with
            inline validation; the calendar icon opens a Shadcn Calendar with
            year/month dropdowns for fast historical navigation.
          */}
          <DateOfBirthInput
            id="member-dob"
            value={data.dateOfBirth}
            onChange={date => onUpdate({ dateOfBirth: date })}
            onBlur={() => handleInputBlur('dateOfBirth')}
            aria-invalid={isDateOfBirthInvalid}
            aria-label={t('date_of_birth_picker_aria')}
            data-testid="member-dob-input"
          />
          {isDateOfBirthInvalid && (
            <p className="text-xs text-destructive">Please enter a date of birth.</p>
          )}
        </div>

        {/* Address Fields (Optional) */}
        <div className="border-t border-border pt-4">
          <h3 className="mb-4 text-sm font-medium text-foreground">{t('address_label')}</h3>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('street_label')}</label>
              <Input
                autoComplete="off"
                placeholder={t('street_placeholder')}
                value={data.address?.street || ''}
                onChange={e => handleAddressChange('street', e.target.value)}
                onBlur={() => handleAddressBlur('street')}
                error={isStreetInvalid}
              />
              {isStreetInvalid && (
                <p className="text-xs text-destructive">Please enter a street address.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('apartment_label')}</label>
              <Input
                autoComplete="off"
                placeholder={t('apartment_placeholder')}
                value={data.address?.apartment || ''}
                onChange={e => handleAddressChange('apartment', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-6 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t('city_label')}</label>
                <Input
                  autoComplete="off"
                  placeholder={t('city_placeholder')}
                  value={data.address?.city || ''}
                  onChange={e => handleAddressChange('city', e.target.value)}
                  onBlur={() => handleAddressBlur('city')}
                  error={isCityInvalid}
                />
                {isCityInvalid && (
                  <p className="text-xs text-destructive">Please enter a city.</p>
                )}
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t('state_label')}</label>
                <Select value={data.address?.state || ''} onValueChange={value => handleAddressChange('state', value)}>
                  <SelectTrigger aria-invalid={isStateInvalid}>
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
                {isStateInvalid && (
                  <p className="text-xs text-destructive">Please select a state.</p>
                )}
              </div>
              <div className="col-span-4 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t('zip_code_label')}</label>
                <Input
                  autoComplete="off"
                  placeholder={t('zip_code_placeholder')}
                  value={data.address?.zipCode || ''}
                  onChange={e => handleAddressChange('zipCode', e.target.value)}
                  onBlur={() => handleAddressBlur('zipCode')}
                  error={isZipCodeInvalid}
                />
                {isZipCodeInvalid && (
                  <p className="text-xs text-destructive">Please enter a zip code.</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('country_label')}</label>
              <Select value={data.address?.country || 'US'} onValueChange={value => handleAddressChange('country', value)}>
                <SelectTrigger aria-invalid={isCountryInvalid}>
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
              {isCountryInvalid && (
                <p className="text-xs text-destructive">Please select a country.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between gap-3 pt-6">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            {t('back_button')}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t('cancel_button')}
          </Button>
        </div>
        <Button onClick={onNext} disabled={!isFormValid}>
          {t('next_button')}
        </Button>
      </div>
    </div>
  );
};
