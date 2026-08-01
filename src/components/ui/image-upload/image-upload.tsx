'use client';

import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useId, useState } from 'react';
import { compressImageForStorage, formatFileSize } from '@/utils/imageCompression';
import { Button } from '../button';
import { Label } from '../label/label';
import { Spinner } from '../spinner';

type ImageUploadFieldProps = {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  helpText?: string;
  previewSize?: 'sm' | 'md' | 'lg';
  className?: string;
};

const previewSizes = {
  sm: { width: 64, height: 64, className: 'h-16 w-16' },
  md: { width: 96, height: 96, className: 'h-24 w-24' },
  lg: { width: 128, height: 128, className: 'h-32 w-32' },
};

export function ImageUploadField({
  value,
  onChange,
  label,
  helpText,
  previewSize = 'md',
  className,
}: ImageUploadFieldProps) {
  const t = useTranslations('ImageUploadField');
  const inputId = useId();
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  } | null>(null);

  const { width, height, className: sizeClassName } = previewSizes[previewSize];

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
      // eslint-disable-next-line no-alert
      alert(t('invalid_file_type'));
      return;
    }

    setIsCompressing(true);
    try {
      const result = await compressImageForStorage(file);

      // Convert to data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setCompressionInfo({
          originalSize: result.originalSize,
          compressedSize: result.compressedSize,
          compressionRatio: result.compressionRatio,
        });
        onChange(dataUrl);
      };
      reader.readAsDataURL(result.compressedFile);
    } catch (error) {
      console.error('Image compression failed:', error);
      // eslint-disable-next-line no-alert
      alert(t('compression_failed'));
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect({ target: { files: event.dataTransfer.files } } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const handleRemove = () => {
    onChange(null);
    setCompressionInfo(null);
  };

  return (
    <div className={className}>
      {label && <Label className="mb-2 block font-medium">{label}</Label>}

      {isCompressing
        ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/50 p-6">
              <Spinner size="md" />
              <p className="text-sm text-muted-foreground">{t('compressing')}</p>
            </div>
          )
        : value
          ? (
              <div className="space-y-3">
                <div className="flex items-start gap-4">
                  <div className={`${sizeClassName} overflow-hidden rounded-lg border bg-muted`}>
                    <Image
                      src={value}
                      alt={t('preview_alt')}
                      width={width}
                      height={height}
                      className="size-full object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemove}
                    >
                      <Trash2 className="mr-1 size-4" />
                      {t('remove_button')}
                    </Button>
                    {compressionInfo && (
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(compressionInfo.compressedSize)}
                        {' '}
                        <span className="text-green-600">
                          (
                          -
                          {compressionInfo.compressionRatio.toFixed(0)}
                          %)
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          : (
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/50 p-6 transition-colors hover:border-primary/50 hover:bg-muted"
              >
                <ImageIcon className="size-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">{t('drop_text')}</p>
                  <p className="text-xs text-muted-foreground">{t('file_types')}</p>
                </div>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.gif"
                  onChange={handleFileSelect}
                  className="hidden"
                  id={inputId}
                  aria-label={t('choose_file_button')}
                />
                <Button type="button" variant="outline" size="sm" asChild>
                  <label htmlFor={inputId} className="cursor-pointer">
                    <Upload className="mr-1 size-4" />
                    {t('choose_file_button')}
                  </label>
                </Button>
              </div>
            )}

      {helpText && (
        <p className="mt-2 text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}
