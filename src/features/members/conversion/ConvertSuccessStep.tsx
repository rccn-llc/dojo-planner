'use client';

import type { ConvertMemberWizardData } from '@/hooks/useConvertMemberWizard';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

type ConvertSuccessStepProps = {
  data: ConvertMemberWizardData;
  onDone: () => void;
};

export const ConvertSuccessStep = ({ data, onDone }: ConvertSuccessStepProps) => {
  const t = useTranslations('ConvertMember.SuccessStep');

  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="rounded-full bg-green-100 p-4 dark:bg-green-950">
          <svg className="size-12 text-green-600 dark:text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {t('description', { name: data.memberName })}
        </p>
      </div>

      {data.membershipPlanName && (
        <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/30">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            {t('membership_added', { planName: data.membershipPlanName })}
          </p>
        </div>
      )}

      <div className="pt-6">
        <Button onClick={onDone} className="w-full">
          {t('done_button')}
        </Button>
      </div>
    </div>
  );
};
