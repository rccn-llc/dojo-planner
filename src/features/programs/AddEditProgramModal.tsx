'use client';

import type { ProgramStatus } from '@/templates/ProgramCard';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export type ProgramFormData = {
  id?: string;
  name: string;
  description: string;
  status: ProgramStatus;
};

type AddEditProgramModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  onSaveAction: (data: ProgramFormData) => Promise<void>;
  program?: ProgramFormData | null;
  isLoading?: boolean;
  errorMessage?: string | null;
};

const initialFormData: ProgramFormData = {
  name: '',
  description: '',
  status: 'Active',
};

function AddEditProgramForm({
  program,
  isLoading,
  onSaveAction,
  onCloseAction,
  errorMessage,
}: {
  program: ProgramFormData | null | undefined;
  isLoading: boolean;
  onSaveAction: (data: ProgramFormData) => Promise<void>;
  onCloseAction: () => void;
  errorMessage?: string | null;
}) {
  const t = useTranslations('AddEditProgramModal');

  // Initialize form data based on program prop
  const initialData = useMemo((): ProgramFormData => {
    if (program) {
      return {
        id: program.id,
        name: program.name,
        description: program.description,
        status: program.status,
      };
    }
    return initialFormData;
  }, [program]);

  const [formData, setFormData] = useState<ProgramFormData>(initialData);
  const [touched, setTouched] = useState<{ name: boolean; description: boolean }>({
    name: false,
    description: false,
  });

  const isEditMode = !!program?.id;

  // Check if form is valid (both name and description have values)
  const isFormValid = useMemo(() => {
    return formData.name.trim().length > 0 && formData.description.trim().length > 0;
  }, [formData.name, formData.description]);

  // Field-level validation for error display
  const isNameInvalid = touched.name && formData.name.trim().length === 0;
  const isDescriptionInvalid = touched.description && formData.description.trim().length === 0;

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setFormData(prev => ({ ...prev, name: value }));
  }, []);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.target;
    setFormData(prev => ({ ...prev, description: value }));
  }, []);

  const handleNameBlur = useCallback(() => {
    setTouched(prev => ({ ...prev, name: true }));
  }, []);

  const handleDescriptionBlur = useCallback(() => {
    setTouched(prev => ({ ...prev, description: true }));
  }, []);

  const handleStatusChange = useCallback((checked: boolean) => {
    setFormData(prev => ({ ...prev, status: checked ? 'Active' : 'Inactive' }));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) {
      return;
    }

    onSaveAction({
      ...formData,
      name: formData.name.trim(),
      description: formData.description.trim(),
    });
  }, [formData, isFormValid, onSaveAction]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="program-submit-error">
          {errorMessage}
        </div>
      )}

      {/* Program Name */}
      <div className="space-y-1.5">
        <Label htmlFor="program-name">
          {t('name_label')}
        </Label>
        <Input
          id="program-name"
          type="text"
          value={formData.name}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          placeholder={t('name_placeholder')}
          disabled={isLoading}
          error={isNameInvalid}
        />
        {isNameInvalid && (
          <p className="text-xs text-destructive">{t('name_error')}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="program-description">
          {t('description_label')}
        </Label>
        <Textarea
          id="program-description"
          value={formData.description}
          onChange={handleDescriptionChange}
          onBlur={handleDescriptionBlur}
          placeholder={t('description_placeholder')}
          disabled={isLoading}
          rows={4}
          error={isDescriptionInvalid}
        />
        {isDescriptionInvalid && (
          <p className="text-xs text-destructive">{t('description_error')}</p>
        )}
      </div>

      {/* Status Switch */}
      <div className="flex items-center gap-3">
        <Switch
          id="program-status"
          checked={formData.status === 'Active'}
          onCheckedChange={handleStatusChange}
          disabled={isLoading}
          aria-label={t('status_label')}
        />
        <Label htmlFor="program-status" className="cursor-pointer">
          {formData.status === 'Active' ? t('status_active') : t('status_inactive')}
        </Label>
      </div>

      {/* Footer with Actions */}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCloseAction}
          disabled={isLoading}
        >
          {t('cancel_button')}
        </Button>
        <Button type="submit" disabled={isLoading || !isFormValid}>
          {isLoading
            ? t('saving_button')
            : isEditMode
              ? t('save_changes_button')
              : t('add_button')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddEditProgramModal({
  isOpen,
  onCloseAction,
  onSaveAction,
  program,
  isLoading = false,
  errorMessage,
}: AddEditProgramModalProps) {
  const t = useTranslations('AddEditProgramModal');
  const isEditMode = !!program?.id;

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onCloseAction();
    }
  }, [onCloseAction]);

  // Use key to remount form when isOpen or program changes
  // This ensures fresh state when modal opens
  const formKey = isOpen ? `${program?.id ?? 'new'}-${isOpen}` : 'closed';

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? t('edit_title') : t('add_title')}
          </DialogTitle>
        </DialogHeader>

        {isOpen && (
          <AddEditProgramForm
            key={formKey}
            program={program}
            isLoading={isLoading}
            onSaveAction={onSaveAction}
            onCloseAction={onCloseAction}
            errorMessage={errorMessage}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
