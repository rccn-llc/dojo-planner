'use client';

import type { CompletedFamilyMember } from '@/hooks/useFamilyMemberWizard';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

type FamilyMemberSuccessStepProps = {
  memberName: string;
  completedMembers: CompletedFamilyMember[];
  onAddAnother: () => void;
  onDone: () => void;
};

export const FamilyMemberSuccessStep = ({
  memberName,
  completedMembers,
  onAddAnother,
  onDone,
}: FamilyMemberSuccessStepProps) => {
  const t = useTranslations('AddFamilyMembersModal');

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
          {t('member_success_title')}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {t('member_success_description', { name: memberName })}
        </p>
      </div>

      {completedMembers.length > 0 && (
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium text-muted-foreground">
            {t('members_added_count', { count: completedMembers.length })}
          </p>
          <ul className="mt-2 space-y-1">
            {completedMembers.map(member => (
              <li key={member.id} className="text-sm text-foreground">{member.name}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3 pt-6">
        <Button variant="outline" onClick={onAddAnother} className="flex-1">
          <UserPlus className="mr-2 size-4" />
          {t('add_another_button')}
        </Button>
        <Button onClick={onDone} className="flex-1">
          {t('done_button')}
        </Button>
      </div>
    </div>
  );
};
