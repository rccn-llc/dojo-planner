'use client';

import type { AutoRenewalOption, ContractLength } from '@/hooks/useAddMembershipWizard';
import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type MembershipContractTermsCardProps = {
  contractLength: ContractLength;
  autoRenewal: AutoRenewalOption;
  cancellationFee: number | null;
  holdLimitPerYear: number | null;
  onEdit?: () => void;
};

export function MembershipContractTermsCard({
  contractLength,
  autoRenewal,
  cancellationFee,
  holdLimitPerYear,
  onEdit,
}: MembershipContractTermsCardProps) {
  const t = useTranslations('MembershipDetailPage.ContractTermsCard');

  const contractLengthLabels: Record<ContractLength, string> = {
    'month-to-month': t('contract_month_to_month'),
    '3-months': t('contract_3_months'),
    '6-months': t('contract_6_months'),
    '12-months': t('contract_12_months'),
  };

  const autoRenewalLabels: Record<AutoRenewalOption, string> = {
    'none': t('renewal_none'),
    'month-to-month': t('renewal_month_to_month'),
    'same-term': t('renewal_same_term'),
  };

  const formatCurrency = (amount: number | null): string => {
    if (amount === null || amount === 0) {
      return t('no_fee');
    }
    return `$${amount.toFixed(2)}`;
  };

  return (
    <Card className="flex flex-col p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>

      <div className="mt-6 flex-1 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('contract_length_label')}</span>
            <p className="mt-1 text-foreground">{contractLengthLabels[contractLength]}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('auto_renewal_label')}</span>
            <p className="mt-1 text-foreground">{autoRenewalLabels[autoRenewal]}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('cancellation_fee_label')}</span>
            <p className="mt-1 text-foreground">{formatCurrency(cancellationFee)}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('hold_limit_label')}</span>
            <p className="mt-1 text-foreground">
              {holdLimitPerYear !== null && holdLimitPerYear > 0
                ? t('hold_limit_value', { count: holdLimitPerYear })
                : t('no_holds')}
            </p>
          </div>
        </div>
      </div>

      {onEdit && (
        <div className="mt-6 flex justify-end">
          <Button variant="outline" size="icon" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}
