'use client';

import type { AllowWalkIns } from '@/app/[locale]/(auth)/dashboard/classes/[classId]/page';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type EditClassSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  maximumCapacity: number | null;
  minimumAge: number | null;
  allowWalkIns: AllowWalkIns;
  onSave: (data: {
    maximumCapacity: number | null;
    minimumAge: number | null;
    allowWalkIns: AllowWalkIns;
  }) => void | Promise<void>;
};

export function EditClassSettingsModal({
  isOpen,
  onClose,
  maximumCapacity: initialMaximumCapacity,
  minimumAge: initialMinimumAge,
  allowWalkIns: initialAllowWalkIns,
  onSave,
}: EditClassSettingsModalProps) {
  const t = useTranslations('ClassDetailPage.EditSettingsModal');

  const [maximumCapacity, setMaximumCapacity] = useState<number | null>(initialMaximumCapacity);
  const [minimumAge, setMinimumAge] = useState<number | null>(initialMinimumAge);
  const [allowWalkIns, setAllowWalkIns] = useState<AllowWalkIns>(initialAllowWalkIns);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      await onSave({
        maximumCapacity,
        minimumAge,
        allowWalkIns,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setMaximumCapacity(initialMaximumCapacity);
    setMinimumAge(initialMinimumAge);
    setAllowWalkIns(initialAllowWalkIns);
    onClose();
  };

  // Reset state when modal opens with new data
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setMaximumCapacity(initialMaximumCapacity);
      setMinimumAge(initialMinimumAge);
      setAllowWalkIns(initialAllowWalkIns);
    } else {
      handleCancel();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Maximum Capacity */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('max_capacity_label')}</label>
            <Input
              type="number"
              placeholder={t('max_capacity_placeholder')}
              value={maximumCapacity ?? ''}
              onChange={e => setMaximumCapacity(e.target.value ? Number.parseInt(e.target.value, 10) : null)}
              min={1}
            />
            <p className="text-xs text-muted-foreground">{t('max_capacity_help')}</p>
          </div>

          {/* Minimum Age */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('min_age_label')}</label>
            <Input
              type="number"
              placeholder={t('min_age_placeholder')}
              value={minimumAge ?? ''}
              onChange={e => setMinimumAge(e.target.value ? Number.parseInt(e.target.value, 10) : null)}
              min={0}
            />
            <p className="text-xs text-muted-foreground">{t('min_age_help')}</p>
          </div>

          {/* Allow Walk-ins */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('allow_walkins_label')}</label>
            <Select
              value={allowWalkIns}
              onValueChange={value => setAllowWalkIns(value as AllowWalkIns)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Yes">{t('walkins_yes')}</SelectItem>
                <SelectItem value="No">{t('walkins_no')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('allow_walkins_help')}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              {t('cancel_button')}
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? t('saving_button') : t('save_button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
