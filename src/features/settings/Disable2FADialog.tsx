'use client';

import { useReverification, useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Disable2FADialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function Disable2FADialog({ open, onOpenChange, onSuccess }: Disable2FADialogProps) {
  const t = useTranslations('Security');
  const { user } = useUser();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const disableTOTP = useReverification(() => user?.disableTOTP());

  const handleDisable = async () => {
    setIsLoading(true);
    setError('');
    try {
      await disableTOTP();
      onSuccess();
      onOpenChange(false);
    } catch {
      setError(t('disable_error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('disable_2fa_title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('disable_2fa_confirm')}</AlertDialogDescription>
        </AlertDialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{t('cancel_button')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDisable} disabled={isLoading}>
            {isLoading
              ? t('disable_2fa_confirming')
              : t('disable_2fa_button')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
