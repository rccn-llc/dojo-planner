'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type RefundConfirmDialogProps = {
  isOpen: boolean;
  /** Formatted amount of the charge, e.g. "$1.04". */
  amountLabel: string;
  isRefunding: boolean;
  errorMessage?: string | null;
  onCloseAction: () => void;
  onConfirmAction: () => void;
};

/**
 * "Are you sure?" before a refund. The refund voids or refunds the WHOLE
 * charge at the payment provider immediately and cannot be undone, so one
 * click on the Refund button must not do it.
 *
 * The confirm button is a plain Button, not AlertDialogAction: Radix closes
 * the dialog on Action click, but the refund takes seconds and can fail, so the
 * dialog stays open (and undismissable) while it runs and shows any error.
 */
export function RefundConfirmDialog({
  isOpen,
  amountLabel,
  isRefunding,
  errorMessage,
  onCloseAction,
  onConfirmAction,
}: RefundConfirmDialogProps) {
  const t = useTranslations('RefundConfirmDialog');

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isRefunding) {
          onCloseAction();
        }
      }}
    >
      <AlertDialogContent data-testid="refund-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            {t('title', { amount: amountLabel })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t('description', { amount: amountLabel })}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm font-medium text-destructive">{t('cannot_undo')}</p>
        {errorMessage && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRefunding}>{t('cancel_button')}</AlertDialogCancel>
          <Button variant="destructive" disabled={isRefunding} onClick={onConfirmAction} data-testid="refund-confirm-button">
            {isRefunding ? t('refunding_button') : t('confirm_button', { amount: amountLabel })}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
