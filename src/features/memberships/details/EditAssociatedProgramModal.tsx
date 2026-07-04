'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { client } from '@/libs/Orpc';

type WaiverOption = {
  id: string;
  name: string;
  version: number;
};

type ProgramOption = {
  id: string;
  name: string;
};

type EditAssociatedProgramModalProps = {
  isOpen: boolean;
  onClose: () => void;
  associatedProgramId: string | null;
  associatedWaiverId: string | null;
  membershipPlanId: string;
  onSave: (data: {
    associatedProgramId: string | null;
    associatedProgramName: string | null;
    associatedWaiverId: string | null;
    associatedWaiverName: string | null;
  }) => void;
};

export function EditAssociatedProgramModal({
  isOpen,
  onClose,
  associatedProgramId: initialProgramId,
  associatedWaiverId: initialWaiverId,
  membershipPlanId,
  onSave,
}: EditAssociatedProgramModalProps) {
  const t = useTranslations('MembershipDetailPage.EditAssociatedProgramModal');

  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(initialProgramId);
  const [selectedWaiverId, setSelectedWaiverId] = useState<string | null>(initialWaiverId);
  const [waiverOptions, setWaiverOptions] = useState<WaiverOption[]>([]);
  const [waiversLoading, setWaiversLoading] = useState(true);
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const fetchWaivers = async () => {
      try {
        setWaiversLoading(true);
        const result = await client.waivers.listActiveTemplates();
        const options: WaiverOption[] = (result.templates || []).map((template: { id: string; name: string; version: number }) => ({
          id: template.id,
          name: template.name,
          version: template.version,
        }));
        setWaiverOptions(options);
      } catch {
        setWaiverOptions([]);
      } finally {
        setWaiversLoading(false);
      }
    };

    const fetchPrograms = async () => {
      try {
        setProgramsLoading(true);
        const result = await client.programs.list();
        const options: ProgramOption[] = (result.programs || [])
          .filter(program => program.isActive)
          .map(program => ({ id: program.id, name: program.name }));
        setProgramOptions(options);
      } catch {
        setProgramOptions([]);
      } finally {
        setProgramsLoading(false);
      }
    };

    fetchWaivers();
    fetchPrograms();
  }, [isOpen]);

  const selectedProgram = programOptions.find(p => p.id === selectedProgramId);
  const selectedWaiver = waiverOptions.find(w => w.id === selectedWaiverId);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      // Persist waiver association to DB
      await client.waivers.setMembershipWaivers({
        membershipPlanId,
        waiverTemplateIds: selectedWaiverId ? [selectedWaiverId] : [],
      });

      onSave({
        associatedProgramId: selectedProgramId,
        associatedProgramName: selectedProgram?.name ?? null,
        associatedWaiverId: selectedWaiverId,
        associatedWaiverName: selectedWaiver ? `${selectedWaiver.name} (v${selectedWaiver.version})` : null,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedProgramId(initialProgramId);
    setSelectedWaiverId(initialWaiverId);
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setSelectedProgramId(initialProgramId);
      setSelectedWaiverId(initialWaiverId);
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
          {/* Program Selection */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('program_label')}</label>
            <Select
              value={selectedProgramId ?? ''}
              onValueChange={(value: string) => setSelectedProgramId(value || null)}
              disabled={programsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={programsLoading ? t('program_loading') : t('program_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {programOptions.map(program => (
                  <SelectItem key={program.id} value={program.id}>
                    {program.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('program_help')}</p>
          </div>

          {/* Waiver Selection */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('waiver_label')}</label>
            <Select
              value={selectedWaiverId ?? ''}
              onValueChange={(value: string) => setSelectedWaiverId(value || null)}
              disabled={waiversLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={waiversLoading ? t('waiver_loading') : t('waiver_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {waiverOptions.map(waiver => (
                  <SelectItem key={waiver.id} value={waiver.id}>
                    {waiver.name}
                    {' '}
                    (v
                    {waiver.version}
                    )
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('waiver_help')}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              {t('cancel_button')}
            </Button>
            <Button onClick={handleSubmit} disabled={!selectedProgramId || isLoading}>
              {isLoading ? t('saving_button') : t('save_button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
