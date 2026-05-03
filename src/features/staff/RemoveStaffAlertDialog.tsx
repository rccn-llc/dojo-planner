'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
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

type RemoveStaffAlertDialogProps = {
  isOpen: boolean;
  staffName: string;
  onCloseAction: () => void;
  onConfirmAction: () => void;
  errorMessage?: string | null;
  isLoading?: boolean;
};

export function RemoveStaffAlertDialog({
  isOpen,
  staffName,
  onCloseAction,
  onConfirmAction,
  errorMessage,
  isLoading,
}: RemoveStaffAlertDialogProps) {
  const t = useTranslations('RemoveStaffAlertDialog');

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onCloseAction();
    }
  }, [onCloseAction]);

  const handleConfirm = useCallback(() => {
    onConfirmAction();
  }, [onConfirmAction]);

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('description', { staffName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="staff-remove-error">
            {errorMessage}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{t('cancel_button')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? t('removing_button') : t('remove_button')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
