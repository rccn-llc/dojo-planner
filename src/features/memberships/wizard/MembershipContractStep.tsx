'use client';

import type {
  AddMembershipWizardData,
  AutoRenewalOption,
  ContractLength,
  MembershipStartDateOption,
} from '@/hooks/useAddMembershipWizard';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type MembershipContractStepProps = {
  data: AddMembershipWizardData;
  onUpdate: (updates: Partial<AddMembershipWizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
};

export const MembershipContractStep = ({ data, onUpdate, onNext, onBack, onCancel, isLoading, error }: MembershipContractStepProps) => {
  const t = useTranslations('AddMembershipWizard.MembershipContractStep');

  // Contract step has all optional fields, so form is always valid
  const isFormValid = true;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Contract Length and Auto-Renewal */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('contract_length_label')}</label>
            <Select
              value={data.contractLength}
              onValueChange={(value: ContractLength) => onUpdate({ contractLength: value })}
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
              value={data.autoRenewal}
              onValueChange={(value: AutoRenewalOption) => onUpdate({ autoRenewal: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('auto_renewal_none')}</SelectItem>
                <SelectItem value="month-to-month">{t('auto_renewal_month_to_month')}</SelectItem>
                <SelectItem value="same-term">{t('auto_renewal_same_term')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Membership Start Date — moved here from Payments and Fees */}
        {data.membershipType !== 'punchcard' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('start_date_label')}</label>
              <Select
                value={data.membershipStartDate}
                onValueChange={(value: MembershipStartDateOption) => onUpdate({ membershipStartDate: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="same-as-registration">{t('start_date_same_as_registration')}</SelectItem>
                  <SelectItem value="custom">{t('start_date_custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {data.membershipStartDate === 'custom' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('custom_start_date_label')}</label>
                <Input
                  type="date"
                  value={data.customStartDate}
                  onChange={e => onUpdate({ customStartDate: e.target.value })}
                />
              </div>
            )}
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
        <Button onClick={onNext} disabled={!isFormValid || isLoading}>
          {isLoading ? t('creating_button') : t('create_button')}
        </Button>
      </div>
    </div>
  );
};
