'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const TAG_NAME_MAX = 64;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const DEFAULT_COLOR = '#6b7280';

export type AddEditTagModalSubmitPayload = {
  name: string;
  color: string | null;
};

type AddEditTagModalProps = {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialName?: string;
  initialColor?: string | null;
  onCloseAction: () => void;
  /**
   * Called on submit. Returning a string causes that string to render as the
   * server error (e.g. "A tag with this name already exists"). Resolving with
   * undefined means success and the modal closes itself.
   */
  onSubmitAction: (payload: AddEditTagModalSubmitPayload) => Promise<string | undefined>;
};

export function AddEditTagModal({
  isOpen,
  mode,
  initialName = '',
  initialColor = null,
  onCloseAction,
  onSubmitAction,
}: AddEditTagModalProps) {
  const t = useTranslations('AddEditTagModal');

  // The parent must remount this component (e.g. via a `key` that changes
  // when the candidate tag changes) to reset state between opens. That keeps
  // this component prop-driven and avoids derived-state effects.
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string>(initialColor ?? DEFAULT_COLOR);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedName = name.trim();
  const isNameInvalid = touched && trimmedName.length === 0;
  const isColorInvalid = !HEX_COLOR_RE.test(color);
  const canSubmit = trimmedName.length > 0 && trimmedName.length <= TAG_NAME_MAX && !isColorInvalid && !isSubmitting;

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSubmit) {
      return;
    }
    setIsSubmitting(true);
    setServerError(null);
    try {
      const error = await onSubmitAction({ name: trimmedName, color });
      if (error) {
        setServerError(error);
      } else {
        onCloseAction();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onCloseAction();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('add_title') : t('edit_title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label htmlFor="tag-name" className="text-sm font-medium text-foreground">
              {t('name_label')}
            </label>
            <Input
              id="tag-name"
              placeholder={t('name_placeholder')}
              value={name}
              onChange={e => setName(e.target.value.slice(0, TAG_NAME_MAX))}
              onBlur={() => setTouched(true)}
              error={isNameInvalid}
              disabled={isSubmitting}
              maxLength={TAG_NAME_MAX}
            />
            {isNameInvalid && (
              <p className="text-xs text-destructive">{t('error_required')}</p>
            )}
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label htmlFor="tag-color" className="text-sm font-medium text-foreground">
              {t('color_label')}
            </label>
            <div className="flex items-center gap-3">
              <Input
                id="tag-color"
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                disabled={isSubmitting}
                className="h-10 w-16 cursor-pointer p-1"
              />
              <Input
                aria-label={t('color_hex_label')}
                value={color}
                onChange={e => setColor(e.target.value)}
                disabled={isSubmitting}
                className="flex-1"
                placeholder="#4f46e5"
              />
            </div>
            {isColorInvalid && (
              <p className="text-xs text-destructive">{t('error_color')}</p>
            )}
          </div>

          {serverError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onCloseAction} disabled={isSubmitting}>
              {t('cancel_button')}
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {isSubmitting ? t('saving_button') : t('save_button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
