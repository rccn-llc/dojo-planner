'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type EditLocationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  address: string;
  phone: string;
  email: string;
  taxRate: number;
  onSave: (data: {
    address: string;
    phone: string;
    email: string;
    taxRate: number;
  }) => void | Promise<void>;
  errorMessage?: string | null;
};

export function EditLocationModal({
  isOpen,
  onClose,
  address: initialAddress,
  phone: initialPhone,
  email: initialEmail,
  taxRate: initialTaxRate,
  onSave,
  errorMessage,
}: EditLocationModalProps) {
  const t = useTranslations('LocationSettings.EditLocationModal');

  const [address, setAddress] = useState(initialAddress);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [taxRate, setTaxRate] = useState(initialTaxRate.toFixed(2));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Re-seed the form from the incoming props each time the modal transitions
  // to open. The `useState` initializers only run on mount, and Radix's
  // `onOpenChange` does not fire when the parent flips `isOpen`
  // programmatically — so without this re-seed the form keeps whatever (often
  // empty, still-loading) values it captured at mount time and the edit dialog
  // appears blank. This is the React "adjust state during render" pattern
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders),
  // which avoids a state-syncing effect.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setAddress(initialAddress);
    setPhone(initialPhone);
    setEmail(initialEmail);
    setTaxRate(initialTaxRate.toFixed(2));
    setTouched({});
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const parsedTaxRate = Number.parseFloat(taxRate);
  const isTaxRateValid = taxRate.trim() !== ''
    && Number.isFinite(parsedTaxRate)
    && parsedTaxRate >= 0
    && parsedTaxRate <= 100;

  const isAddressInvalid = touched.address && !address.trim();
  const isPhoneInvalid = touched.phone && !phone.trim();
  const isEmailInvalid = touched.email && (!email.trim() || !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email));
  const isTaxRateInvalid = touched.taxRate && !isTaxRateValid;

  const isFormValid = address.trim() !== ''
    && phone.trim() !== ''
    && email.trim() !== ''
    && /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)
    && isTaxRateValid;

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      await onSave({
        address,
        phone,
        email,
        taxRate: Math.round(parsedTaxRate * 100) / 100,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setAddress(initialAddress);
    setPhone(initialPhone);
    setEmail(initialEmail);
    setTaxRate(initialTaxRate.toFixed(2));
    setTouched({});
    onClose();
  };

  // Reset state when modal opens with new data
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setAddress(initialAddress);
      setPhone(initialPhone);
      setEmail(initialEmail);
      setTaxRate(initialTaxRate.toFixed(2));
      setTouched({});
    } else {
      handleCancel();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Address */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('address_label')}</label>
            <Input
              placeholder={t('address_placeholder')}
              value={address}
              onChange={e => setAddress(e.target.value)}
              onBlur={() => handleInputBlur('address')}
              error={isAddressInvalid}
            />
            {isAddressInvalid && (
              <p className="text-xs text-destructive">{t('address_error')}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('phone_label')}</label>
            <Input
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

          {/* Email */}
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

          {/* Tax Rate */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('tax_rate_label')}</label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder={t('tax_rate_placeholder')}
                className="pr-8"
                value={taxRate}
                onChange={e => setTaxRate(e.target.value)}
                onBlur={() => handleInputBlur('taxRate')}
                error={isTaxRateInvalid}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('tax_rate_helper')}</p>
            {isTaxRateInvalid && (
              <p className="text-xs text-destructive">{t('tax_rate_error')}</p>
            )}
          </div>

          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              {t('cancel_button')}
            </Button>
            <Button onClick={handleSubmit} disabled={!isFormValid || isLoading}>
              {isLoading ? t('saving_button') : t('save_button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
