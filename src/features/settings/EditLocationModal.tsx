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
  name: string;
  address: string;
  phone: string;
  email: string;
  onSave: (data: {
    name: string;
    address: string;
    phone: string;
    email: string;
  }) => void | Promise<void>;
  errorMessage?: string | null;
};

export function EditLocationModal({
  isOpen,
  onClose,
  name: initialName,
  address: initialAddress,
  phone: initialPhone,
  email: initialEmail,
  onSave,
  errorMessage,
}: EditLocationModalProps) {
  const t = useTranslations('LocationSettings.EditLocationModal');

  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(initialAddress);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const isNameInvalid = touched.name && !name.trim();
  const isAddressInvalid = touched.address && !address.trim();
  const isPhoneInvalid = touched.phone && !phone.trim();
  const isEmailInvalid = touched.email && (!email.trim() || !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email));

  const isFormValid = name.trim() !== ''
    && address.trim() !== ''
    && phone.trim() !== ''
    && email.trim() !== ''
    && /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      await onSave({ name, address, phone, email });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setName(initialName);
    setAddress(initialAddress);
    setPhone(initialPhone);
    setEmail(initialEmail);
    setTouched({});
    onClose();
  };

  // Reset state when modal opens with new data
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setName(initialName);
      setAddress(initialAddress);
      setPhone(initialPhone);
      setEmail(initialEmail);
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
          {/* Location Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('name_label')}</label>
            <Input
              placeholder={t('name_placeholder')}
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={() => handleInputBlur('name')}
              error={isNameInvalid}
            />
            {isNameInvalid && (
              <p className="text-xs text-destructive">{t('name_error')}</p>
            )}
          </div>

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
