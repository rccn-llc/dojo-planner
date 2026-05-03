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

type DeleteMembershipAlertDialogProps = {
  isOpen: boolean;
  membershipName: string;
  onCloseAction: () => void;
  onConfirmAction: () => void;
  errorMessage?: string | null;
};

export function DeleteMembershipAlertDialog({
  isOpen,
  membershipName,
  onCloseAction,
  onConfirmAction,
  errorMessage,
}: DeleteMembershipAlertDialogProps) {
  const t = useTranslations('DeleteMembershipAlertDialog');

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
            {t('description', { membershipName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="membership-delete-error">
            {errorMessage}
          </div>
        )}
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
