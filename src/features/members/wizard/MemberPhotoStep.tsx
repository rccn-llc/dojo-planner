'use client';

import type { AddMemberWizardData } from '@/hooks/useAddMemberWizard';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { compressImageForStorage, formatFileSize } from '@/utils/imageCompression';

type MemberPhotoStepProps = {
  data: AddMemberWizardData;
  onUpdate: (updates: Partial<AddMemberWizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
};

export const MemberPhotoStep = ({ onUpdate, onNext, onBack, onCancel }: MemberPhotoStepProps) => {
  const t = useTranslations('AddMemberWizard.MemberPhotoStep');
  const [preview, setPreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  } | null>(null);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (file) {
      // Validate file type
      if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
        // eslint-disable-next-line no-alert
        alert(t('invalid_file_type'));
        return;
      }

      setIsCompressing(true);
      try {
        // Compress image for storage
        const result = await compressImageForStorage(file);

        // Create preview from compressed file
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setPreview(dataUrl);
          setCompressionInfo({
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            compressionRatio: result.compressionRatio,
          });
          // Store the compressed file
          onUpdate({ photoFile: result.compressedFile });
        };
        reader.readAsDataURL(result.compressedFile);
      } catch (error) {
        // eslint-disable-next-line no-alert
        alert(`${t('invalid_file_type')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error('Image compression failed:', error);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFiles(event.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="space-y-4">
        {isCompressing
          ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border bg-accent/50 p-8">
                <Spinner size="lg" />
                <p className="text-sm text-muted-foreground">Compressing image...</p>
              </div>
            )
          : preview
            ? (
                <div className="flex flex-col items-center gap-4">
                  <Image src={preview} alt="Preview" width={192} height={192} className="rounded-lg object-cover" />

                  {compressionInfo && (
                    <div className="w-full rounded-lg bg-secondary/50 p-4 text-sm">
                      <div className="space-y-2 text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Original size:</span>
                          <span className="font-medium">{formatFileSize(compressionInfo.originalSize)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Compressed size:</span>
                          <span className="font-medium text-foreground">{formatFileSize(compressionInfo.compressedSize)}</span>
                        </div>
                        <div className="flex justify-between border-t border-border pt-2">
                          <span>Reduction:</span>
                          <span className="font-medium text-green-600">
                            {compressionInfo.compressionRatio.toFixed(1)}
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => {
                      setPreview(null);
                      setCompressionInfo(null);
                      onUpdate({ photoFile: null });
                    }}
                  >
                    {t('remove_photo_button')}
                  </Button>
                </div>
              )
            : (
                <div
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                  className="rounded-lg border-2 border-dashed border-border bg-accent/50 p-8 text-center"
                >
                  <p className="mb-4 text-sm font-medium text-foreground">
                    {t('drop_text')}
                  </p>
                  <p className="mb-4 text-xs text-muted-foreground">{t('file_types')}</p>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.gif"
                    onChange={e => handleFiles(e.target.files)}
                    disabled={isCompressing}
                    className="hidden"
                    id="photo-input"
                    aria-label={t('choose_file_button')}
                  />
                  <label htmlFor="photo-input" className="inline-block cursor-pointer">
                    {t('choose_file_button')}
                    <Button asChild variant="outline" className="ml-2" disabled={isCompressing}>
                      <span>Upload</span>
                    </Button>
                  </label>
                </div>
              )}
      </div>

      <div className="flex justify-between gap-3 pt-6">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            {t('back_button')}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t('cancel_button')}
          </Button>
        </div>
        <Button onClick={onNext}>
          {t('next_button')}
        </Button>
      </div>
    </div>
  );
};
