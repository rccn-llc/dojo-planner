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

type DeleteRoleAlertDialogProps = {
  isOpen: boolean;
  roleName: string;
  onCloseAction: () => void;
  onConfirmAction: () => void;
  errorMessage?: string | null;
};

export function DeleteRoleAlertDialog({
  isOpen,
  roleName,
  onCloseAction,
  onConfirmAction,
  errorMessage,
}: DeleteRoleAlertDialogProps) {
  const t = useTranslations('Roles');

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
          <AlertDialogTitle>{t('delete_dialog_title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('delete_dialog_description', { roleName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="role-delete-error">
            {errorMessage}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t('delete_cancel_button')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={handleConfirm}
            data-testid="role-delete-confirm"
          >
            {t('delete_confirm_button')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
