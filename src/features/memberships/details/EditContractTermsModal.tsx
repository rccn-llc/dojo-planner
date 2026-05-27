'use client';

import type { AutoRenewalOption, ContractLength } from '@/hooks/useAddMembershipWizard';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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

type EditContractTermsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  contractLength: ContractLength;
  autoRenewal: AutoRenewalOption;
  onSave: (data: {
    contractLength: ContractLength;
    autoRenewal: AutoRenewalOption;
  }) => void;
};

export function EditContractTermsModal({
  isOpen,
  onClose,
  contractLength: initialContractLength,
  autoRenewal: initialAutoRenewal,
  onSave,
}: EditContractTermsModalProps) {
  const t = useTranslations('MembershipDetailPage.EditContractTermsModal');

  const [contractLength, setContractLength] = useState<ContractLength>(initialContractLength);
  const [autoRenewal, setAutoRenewal] = useState<AutoRenewalOption>(initialAutoRenewal);
  const [isLoading, setIsLoading] = useState(false);

  const resetState = () => {
    setContractLength(initialContractLength);
    setAutoRenewal(initialAutoRenewal);
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    onSave({
      contractLength,
      autoRenewal,
    });
    setIsLoading(false);
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Contract Length and Auto-Renewal */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('contract_length_label')}</label>
              <Select
                value={contractLength}
                onValueChange={(value: ContractLength) => setContractLength(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month-to-month">{t('contract_month_to_month')}</SelectItem>
                  <SelectItem value="3-months">{t('contract_3_months')}</SelectItem>
                  <SelectItem value="6-months">{t('contract_6_months')}</SelectItem>
                  <SelectItem value="12-months">{t('contract_12_months')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('auto_renewal_label')}</label>
              <Select
                value={autoRenewal}
                onValueChange={(value: AutoRenewalOption) => setAutoRenewal(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('renewal_none')}</SelectItem>
                  <SelectItem value="month-to-month">{t('renewal_month_to_month')}</SelectItem>
                  <SelectItem value="same-term">{t('renewal_same_term')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
