'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { invalidateInstructorsCache } from '@/hooks/useInstructorsCache';
import { client } from '@/libs/Orpc';
import { compressImageForStorage, formatFileSize } from '@/utils/imageCompression';

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];

type EditInstructorPhotoModalProps = {
  isOpen: boolean;
  /** Clerk user id of the instructor whose photo is being edited. */
  clerkUserId: string;
  instructorName: string;
  /** Current photo (data URL or null). */
  currentPhotoUrl: string | null;
  onCloseAction: () => void;
  /** Called after a successful save so the parent can refetch staff data. */
  onSavedAction: () => void | Promise<void>;
};

export function EditInstructorPhotoModal({
  isOpen,
  clerkUserId,
  instructorName,
  currentPhotoUrl,
  onCloseAction,
  onSavedAction,
}: EditInstructorPhotoModalProps) {
  const t = useTranslations('EditInstructorPhotoModal');

  const [preview, setPreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  } | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const displayedPhoto = pendingRemoval ? null : (preview ?? currentPhotoUrl);
  const hasPhoto = !!displayedPhoto;
  const hasPendingChange = preview !== null || pendingRemoval;

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError(t('invalid_file_type'));
      return;
    }

    setError(null);
    setIsCompressing(true);
    try {
      const result = await compressImageForStorage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPreview(dataUrl);
        setPendingRemoval(false);
        setCompressionInfo({
          originalSize: result.originalSize,
          compressedSize: result.compressedSize,
          compressionRatio: result.compressionRatio,
        });
      };
      reader.readAsDataURL(result.compressedFile);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`${t('invalid_file_type')}: ${message}`);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleRequestRemove = () => {
    setConfirmRemoveOpen(true);
  };

  const handleConfirmRemove = () => {
    setPendingRemoval(true);
    setPreview(null);
    setCompressionInfo(null);
    setConfirmRemoveOpen(false);
  };

  const handleCancelRemove = () => {
    setConfirmRemoveOpen(false);
  };

  const handleSave = async () => {
    if (!hasPendingChange || isSaving) {
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const photoUrl = pendingRemoval ? null : preview!;
      await client.instructors.updatePhoto({ clerkUserId, photoUrl });
      await invalidateInstructorsCache();
      await onSavedAction();
      onCloseAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('save_error');
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSaving) {
      onCloseAction();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <p className="text-sm text-muted-foreground">{t('subtitle', { instructorName })}</p>

          <div className="flex flex-col items-center gap-4">
            {isCompressing
              ? (
                  <div className="flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed border-border bg-accent/50">
                    <Spinner size="lg" />
                  </div>
                )
              : hasPhoto
                ? (
                    // Plain <img> because the source is a base64 data URL —
                    // Next.js image optimization doesn't apply.
                    // eslint-disable-next-line next/no-img-element
                    <img
                      src={displayedPhoto}
                      alt={instructorName}
                      width={192}
                      height={192}
                      className="rounded-lg object-cover"
                    />
                  )
                : (
                    <div className="flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed border-border bg-accent/50">
                      <p className="text-sm text-muted-foreground">{t('no_photo')}</p>
                    </div>
                  )}

            {compressionInfo && (
              <div className="w-full rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{t('original_size')}</span>
                  <span className="font-medium">{formatFileSize(compressionInfo.originalSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('compressed_size')}</span>
                  <span className="font-medium text-foreground">{formatFileSize(compressionInfo.compressedSize)}</span>
                </div>
              </div>
            )}

            <input
              id="edit-instructor-photo-input"
              type="file"
              accept=".jpg,.jpeg,.png,.gif"
              onChange={handleFileSelect}
              disabled={isCompressing || isSaving}
              className="hidden"
              aria-label={t('choose_file_button')}
            />

            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline" disabled={isCompressing || isSaving}>
                <label htmlFor="edit-instructor-photo-input" className="cursor-pointer">
                  {hasPhoto ? t('change_button') : t('choose_file_button')}
                </label>
              </Button>
              {hasPhoto && (
                <Button
                  variant="outline"
                  onClick={handleRequestRemove}
                  disabled={isCompressing || isSaving}
                >
                  {t('remove_button')}
                </Button>
              )}
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onCloseAction} disabled={isSaving}>
              {t('cancel_button')}
            </Button>
            <Button onClick={handleSave} disabled={!hasPendingChange || isSaving}>
              {isSaving ? t('saving_button') : t('save_button')}
            </Button>
          </div>
        </div>
      </DialogContent>

      <AlertDialog
        open={confirmRemoveOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelRemove();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_remove_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirm_remove_description', { instructorName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel_button')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleConfirmRemove}
            >
              {t('confirm_remove_action')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
