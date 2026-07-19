'use client';

import { AlertTriangle, ArchiveRestore } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { client } from '@/libs/Orpc';

type ArchiveMemberModalProps = {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  memberName: string;
  // 'archive' soft-archives an active member; 'restore' reactivates an archived one.
  mode: 'archive' | 'restore';
  onSuccess?: () => void;
};

export function ArchiveMemberModal({
  isOpen,
  onClose,
  memberId,
  memberName,
  mode,
  onSuccess,
}: ArchiveMemberModalProps) {
  const t = useTranslations('MemberDetailPage.ArchiveMemberModal');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isArchive = mode === 'archive';

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (isArchive) {
        await client.member.remove({ id: memberId });
      } else {
        await client.member.restore({ id: memberId });
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_generic'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) {
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isArchive ? t('archive_title') : t('restore_title')}</DialogTitle>
          <DialogDescription>
            {isArchive
              ? t('archive_description', { memberName })
              : t('restore_description', { memberName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isArchive
            ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">{t('archive_notice')}</p>
                  </div>
                </div>
              )
            : (
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-start gap-3">
                    <ArchiveRestore className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t('restore_notice')}</p>
                  </div>
                </div>
              )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            {t('back_button')}
          </Button>
          <Button
            variant={isArchive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading
              ? t('confirming_button')
              : isArchive
                ? t('archive_confirm_button')
                : t('restore_confirm_button')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
