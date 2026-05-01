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

type DeleteWaiverAlertDialogProps = {
  isOpen: boolean;
  waiverName: string;
  onCloseAction: () => void;
  onConfirmAction: () => void;
};

export function DeleteWaiverAlertDialog({
  isOpen,
  waiverName,
  onCloseAction,
  onConfirmAction,
}: DeleteWaiverAlertDialogProps) {
  const t = useTranslations('DeleteWaiverAlertDialog');

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
            {t('description', { waiverName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel_button')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={handleConfirm}
          >
            {t('delete_button')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
