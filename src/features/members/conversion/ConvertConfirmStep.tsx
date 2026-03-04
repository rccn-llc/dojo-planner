'use client';

import type { ConvertMemberWizardData } from '@/hooks/useConvertMemberWizard';
import { ArrowRight, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type ConvertConfirmStepProps = {
  data: ConvertMemberWizardData;
  onNext: () => void;
  onCancel: () => void;
};

function getMemberTypeLabel(memberType: string): string {
  switch (memberType) {
    case 'individual':
      return 'Individual';
    case 'head-of-household':
      return 'Head of Household';
    case 'family-member':
      return 'Family Member';
    default:
      return memberType;
  }
}

export const ConvertConfirmStep = ({ data, onNext, onCancel }: ConvertConfirmStepProps) => {
  const t = useTranslations('ConvertMember.ConfirmStep');

  const currentLabel = getMemberTypeLabel(data.currentMemberType);
  const targetLabel = getMemberTypeLabel(data.targetMemberType);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('subtitle', { name: data.memberName })}
        </p>
      </div>

      {/* Type transition visual */}
      <div className="flex items-center justify-center gap-4 rounded-lg border bg-muted/30 p-6">
        <div className="text-center">
          <p className="mb-1 text-xs text-muted-foreground">{t('current_type')}</p>
          <Badge variant="secondary" className="text-sm">{currentLabel}</Badge>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
        <div className="text-center">
          <p className="mb-1 text-xs text-muted-foreground">{t('new_type')}</p>
          <Badge className="text-sm">{targetLabel}</Badge>
        </div>
      </div>

      {/* Conversion-specific description */}
      <div className="rounded-lg border bg-blue-50 p-4 dark:bg-blue-950/30">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-900 dark:text-blue-200">
            {data.conversionType === 'hoh-to-individual' && t('hoh_to_individual_description')}
            {data.conversionType === 'individual-to-hoh' && t('individual_to_hoh_description')}
            {data.conversionType === 'family-to-individual' && t('family_to_individual_description', { hohName: data.currentHOHName ?? '' })}
          </p>
        </div>
      </div>

      {/* Additional notices */}
      {data.conversionType === 'hoh-to-individual' && !data.hasMembership && (
        <div className="rounded-lg border bg-yellow-50 p-4 dark:bg-yellow-950/30">
          <p className="text-sm text-yellow-900 dark:text-yellow-200">
            {t('needs_membership_notice')}
          </p>
        </div>
      )}

      {data.conversionType === 'hoh-to-individual' && !data.hasPaymentMethod && (
        <div className="rounded-lg border bg-yellow-50 p-4 dark:bg-yellow-950/30">
          <p className="text-sm text-yellow-900 dark:text-yellow-200">
            {t('needs_payment_notice')}
          </p>
        </div>
      )}

      {data.conversionType === 'family-to-individual' && (
        <div className="rounded-lg border bg-yellow-50 p-4 dark:bg-yellow-950/30">
          <p className="text-sm text-yellow-900 dark:text-yellow-200">
            {t('family_needs_membership_and_payment')}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onCancel}>
          {t('cancel_button')}
        </Button>
        <Button onClick={onNext}>
          {t('continue_button')}
        </Button>
      </div>
    </div>
  );
};
