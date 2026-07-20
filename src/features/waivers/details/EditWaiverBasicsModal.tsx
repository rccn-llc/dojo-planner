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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const MAX_DESCRIPTION_LENGTH = 500;

type EditWaiverBasicsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  requiresGuardian: boolean;
  guardianAgeThreshold: number;
  onSave: (data: {
    name: string;
    description: string | null;
    isActive: boolean;
    isDefault: boolean;
    requiresGuardian: boolean;
    guardianAgeThreshold: number;
  }) => Promise<void>;
};

export function EditWaiverBasicsModal({
  isOpen,
  onClose,
  name: initialName,
  description: initialDescription,
  isActive: initialIsActive,
  isDefault: initialIsDefault,
  requiresGuardian: initialRequiresGuardian,
  guardianAgeThreshold: initialGuardianAgeThreshold,
  onSave,
}: EditWaiverBasicsModalProps) {
  const t = useTranslations('WaiverDetailPage.EditBasicsModal');

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [isActive, setIsActive] = useState(initialIsActive);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [requiresGuardian, setRequiresGuardian] = useState(initialRequiresGuardian);
  const [guardianAgeThreshold, setGuardianAgeThreshold] = useState(initialGuardianAgeThreshold);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleInputBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const isNameInvalid = touched.name && !name.trim();
  // The guardian age threshold is constrained server-side to 13–21
  // (WaiverValidation). Previously an out-of-range value (e.g. 12) was rejected
  // by the server but the error was swallowed, so the modal appeared to do
  // nothing (#266). Validate + surface it here.
  const AGE_MIN = 13;
  const AGE_MAX = 21;
  const isAgeInvalid = requiresGuardian
    && (!Number.isInteger(guardianAgeThreshold) || guardianAgeThreshold < AGE_MIN || guardianAgeThreshold > AGE_MAX);
  const isFormValid = name.trim() !== '' && !isAgeInvalid;

  const handleSubmit = async () => {
    setSaveError(null);
    setIsLoading(true);
    try {
      await onSave({
        name,
        description: description.trim() || null,
        isActive,
        isDefault,
        requiresGuardian,
        guardianAgeThreshold,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('save_error'));
    } finally {
      setIsLoading(false);
    }
  };

  const resetState = () => {
    setName(initialName);
    setDescription(initialDescription ?? '');
    setIsActive(initialIsActive);
    setIsDefault(initialIsDefault);
    setRequiresGuardian(initialRequiresGuardian);
    setGuardianAgeThreshold(initialGuardianAgeThreshold);
    setTouched({});
    setSaveError(null);
  };

  const handleCancel = () => {
    resetState();
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      resetState();
    } else {
      handleCancel();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('name_label')}</label>
            <Input
              placeholder={t('name_placeholder')}
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={() => handleInputBlur('name')}
              error={isNameInvalid}
            />
            {isNameInvalid && (
              <p className="text-xs text-destructive">{t('name_error')}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('description_label')}</label>
            <Textarea
              placeholder={t('description_placeholder')}
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {t('description_character_count', { count: description.length, max: MAX_DESCRIPTION_LENGTH })}
            </p>
          </div>

          {/* Status Toggle */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('status_label')}</label>
            <div className="flex items-center gap-3">
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <span className="text-sm text-muted-foreground">
                {isActive ? t('status_active') : t('status_inactive')}
              </span>
            </div>
          </div>

          {/* Default Toggle */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('default_label')}</label>
            <div className="flex items-center gap-3">
              <Switch
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
              <span className="text-sm text-muted-foreground">
                {isDefault ? t('default_yes') : t('default_no')}
              </span>
            </div>
          </div>

          {/* Guardian Toggle */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('guardian_label')}</label>
            <div className="flex items-center gap-3">
              <Switch
                checked={requiresGuardian}
                onCheckedChange={setRequiresGuardian}
              />
              <span className="text-sm text-muted-foreground">
                {requiresGuardian ? t('guardian_yes') : t('guardian_no')}
              </span>
            </div>
          </div>

          {/* Guardian Age Threshold */}
          {requiresGuardian && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('guardian_age_label')}</label>
              <Input
                type="number"
                min={AGE_MIN}
                max={AGE_MAX}
                value={guardianAgeThreshold}
                onChange={e => setGuardianAgeThreshold(Number(e.target.value))}
                error={isAgeInvalid}
              />
              {isAgeInvalid
                ? (
                    <p className="text-xs text-destructive">{t('guardian_age_error', { min: AGE_MIN, max: AGE_MAX })}</p>
                  )
                : (
                    <p className="text-xs text-muted-foreground">{t('guardian_age_help')}</p>
                  )}
            </div>
          )}

          {saveError && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{saveError}</p>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              {t('cancel_button')}
            </Button>
            <Button onClick={handleSubmit} disabled={!isFormValid || isLoading}>
              {isLoading ? t('saving_button') : t('save_button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
